'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Upload = { fichierId: string; nom: string; signedUrl: string };

type ReponseCreation = {
  reference: string;
  uploads: Upload[];
  csrfToken: string;
  dejaExistant: boolean;
  erreur?: string;
  details?: Record<string, string>;
};

export default function DevisForm() {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [details, setDetails] = useState<Record<string, string>>({});
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur('');
    setDetails({});

    const formulaire = new FormData(evenement.currentTarget);
    const fichiers = formulaire.getAll('fichiers').filter((f): f is File => f instanceof File && f.size > 0);
    if (fichiers.length > 5) {
      setErreur('Maximum 5 fichiers.');
      return;
    }
    const total = fichiers.reduce((somme, f) => somme + f.size, 0);
    if (total > 50 * 1024 * 1024) {
      setErreur('Le volume total des fichiers dépasse 50 Mo.');
      return;
    }

    const corps = {
      famille: String(formulaire.get('famille') ?? ''),
      nom: String(formulaire.get('nom') ?? ''),
      societe: String(formulaire.get('societe') ?? ''),
      email: String(formulaire.get('email') ?? ''),
      telephone: String(formulaire.get('telephone') ?? ''),
      ville: String(formulaire.get('ville') ?? ''),
      besoin: String(formulaire.get('besoin') ?? ''),
      format: String(formulaire.get('format') ?? ''),
      quantite: formulaire.get('quantite') ? Number(formulaire.get('quantite')) : undefined,
      specifications: {},
      consentement: formulaire.get('consentement') === 'on',
      fichiers: fichiers.map((f) => ({ nom: f.name, typeMime: f.type || 'application/octet-stream', tailleOctets: f.size })),
    };

    setEnvoi(true);
    try {
      const creation = await fetch('/api/devis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(corps),
      });
      const donnees = (await creation.json()) as ReponseCreation;
      if (!creation.ok) {
        setErreur(donnees.erreur ?? 'La demande n’a pas pu être enregistrée.');
        setDetails(donnees.details ?? {});
        return;
      }

      for (let i = 0; i < donnees.uploads.length; i += 1) {
        const upload = donnees.uploads[i];
        const fichier = fichiers.find((f) => f.name === upload.nom);
        if (!fichier) continue;
        const envoiFichier = await fetch(upload.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': fichier.type || 'application/octet-stream', 'x-upsert': 'false' },
          body: fichier,
        });
        if (!envoiFichier.ok) throw new Error(`Envoi impossible pour ${upload.nom}.`);
      }

      if (donnees.uploads.length > 0) {
        const finalisation = await fetch(`/api/devis/${donnees.reference}/fichiers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': donnees.csrfToken },
          body: JSON.stringify({ fichierIds: donnees.uploads.map((u) => u.fichierId) }),
        });
        if (!finalisation.ok) {
          const corpsErreur = (await finalisation.json()) as { erreur?: string };
          throw new Error(corpsErreur.erreur ?? 'Vérification des fichiers impossible.');
        }
      }

      router.push(`/devis/${donnees.reference}`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur pendant l’envoi.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="mt-8 space-y-5">
      {erreur ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {erreur}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Famille de prestation *
          <select name="famille" required className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5">
            <option value="">Choisir…</option>
            <option value="TEXTILE">Textile personnalisé</option>
            <option value="TABLEAUX">Tableaux canvas</option>
            <option value="IMPRESSION">Impression graphique</option>
            <option value="SERVICES">Service de création</option>
          </select>
          {details.famille ? <span className="text-xs text-red-700">{details.famille}</span> : null}
        </label>
        <label className="block text-sm font-medium">
          Quantité
          <input type="number" name="quantite" min="1" max="100000" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Nom complet *
          <input name="nom" required maxLength={160} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5" />
          {details.nom ? <span className="text-xs text-red-700">{details.nom}</span> : null}
        </label>
        <label className="block text-sm font-medium">
          Société / organisation
          <input name="societe" maxLength={160} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Téléphone *
          <input name="telephone" required placeholder="+242 06 000 00 00" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5" />
          {details.telephone ? <span className="text-xs text-red-700">{details.telephone}</span> : null}
        </label>
        <label className="block text-sm font-medium">
          Email
          <input type="email" name="email" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5" />
          {details.email ? <span className="text-xs text-red-700">{details.email}</span> : null}
        </label>
      </div>

      <label className="block text-sm font-medium">
        Ville
        <input name="ville" maxLength={120} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5" />
      </label>

      <label className="block text-sm font-medium">
        Décrivez votre besoin *
        <textarea name="besoin" required minLength={10} maxLength={4000} className="mt-1 min-h-32 w-full rounded-xl border border-neutral-300 px-3 py-2.5" />
        {details.besoin ? <span className="text-xs text-red-700">{details.besoin}</span> : null}
      </label>

      <label className="block text-sm font-medium">
        Format / dimensions souhaités
        <input name="format" maxLength={80} placeholder="A4, 60 × 80 cm, 50 t-shirts…" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5" />
      </label>

      <label className="block text-sm font-medium">
        Fichiers (PDF, PNG, JPEG, WEBP, ZIP — 5 max, 50 Mo cumulés)
        <input type="file" name="fichiers" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.zip" className="mt-1 block w-full text-sm" />
        {details.fichiers ? <span className="text-xs text-red-700">{details.fichiers}</span> : null}
      </label>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="consentement" required className="mt-1" />
        <span>J’accepte que Smart Vision utilise ces informations pour traiter ma demande de devis.</span>
      </label>
      {details.consentement ? <span className="text-xs text-red-700">{details.consentement}</span> : null}

      <button
        type="submit"
        disabled={envoi}
        className="w-full rounded-full bg-encre px-6 py-3.5 font-semibold text-creme disabled:opacity-60"
      >
        {envoi ? 'Envoi en cours…' : 'Envoyer ma demande de devis'}
      </button>
      <p className="text-center text-xs text-neutral-500">
        Aucun paiement n’est demandé à cette étape. Smart Vision vous répond avec un prix et un délai.
      </p>
    </form>
  );
}
