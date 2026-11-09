'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { PRODUITS_VITRINE, SERVICES_ENTREPRISE, SUPPORTS_IMPRESSION } from '@/lib/commerce/catalogue';

type Upload = { fichierId: string; nom: string; signedUrl: string };

type ReponseCreation = {
  reference: string;
  uploads: Upload[];
  csrfToken: string;
  dejaExistant: boolean;
  erreur?: string;
  details?: Record<string, string>;
};

type FamilleFormulaire = 'TEXTILE' | 'IMPRESSION' | 'SERVICES';

type Props = {
  initialFamille?: string;
  initialSupport?: string;
  initialService?: string;
  initialProduit?: string;
};

const FAMILLES: { id: FamilleFormulaire; label: string }[] = [
  { id: 'TEXTILE', label: 'Textile personnalisé' },
  { id: 'IMPRESSION', label: 'Impression graphique' },
  { id: 'SERVICES', label: 'Services créatifs' },
];

const PAPIERS = ['135 g', '170 g', '250 g', '300 g', 'Autre / à conseiller'];
const FINITIONS = ['Pelliculage mat', 'Pelliculage brillant', 'Vernis sélectif', 'Plastification', 'Reliure', 'Découpe spéciale'];

function familleInitiale(valeur?: string): FamilleFormulaire {
  return FAMILLES.some((f) => f.id === valeur) ? (valeur as FamilleFormulaire) : 'TEXTILE';
}

export default function DevisForm({
  initialFamille,
  initialSupport,
  initialService,
  initialProduit,
}: Props) {
  const router = useRouter();
  const [famille, setFamille] = useState<FamilleFormulaire>(() => familleInitiale(initialFamille));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [details, setDetails] = useState<Record<string, string>>({});
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const produitsTextile = PRODUITS_VITRINE.filter((p) => p.famille === 'textile');
  const supportDefaut =
    SUPPORTS_IMPRESSION.find((s) => s.id === initialSupport)?.id ?? SUPPORTS_IMPRESSION[0]?.id ?? '';
  const serviceDefaut =
    SERVICES_ENTREPRISE.find((s) => s.titre === initialService)?.titre ?? SERVICES_ENTREPRISE[0]?.titre ?? '';
  const produitDefaut =
    produitsTextile.find((p) => p.id === initialProduit)?.id ?? produitsTextile[0]?.id ?? '';

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

    const familleChoisie = String(formulaire.get('famille') ?? famille) as FamilleFormulaire;
    const produit = String(formulaire.get('produit') ?? '');
    const support = String(formulaire.get('support') ?? '');
    const service = String(formulaire.get('service') ?? '');
    const finitions = formulaire.getAll('finitions').map(String).filter(Boolean);

    const specifications: Record<string, unknown> = {};
    if (familleChoisie === 'TEXTILE') {
      const fiche = produitsTextile.find((p) => p.id === produit);
      specifications.produit = produit;
      specifications.produitNom = fiche?.nom ?? produit;
      specifications.tailles = String(formulaire.get('tailles') ?? '');
      specifications.faces = String(formulaire.get('faces') ?? '');
    }
    if (familleChoisie === 'IMPRESSION') {
      specifications.support = support;
      specifications.supportNom = SUPPORTS_IMPRESSION.find((s) => s.id === support)?.nom ?? support;
      specifications.papier = String(formulaire.get('papier') ?? '');
      specifications.rectoVerso = String(formulaire.get('rectoVerso') ?? '');
      specifications.finitions = finitions;
      specifications.fichierPret = formulaire.get('fichierPret') === 'on';
      specifications.creationGraphique = formulaire.get('creationGraphique') === 'on';
    }
    if (familleChoisie === 'SERVICES') {
      specifications.service = service;
      specifications.typeOrganisation = String(formulaire.get('typeOrganisation') ?? '');
      specifications.echeance = String(formulaire.get('echeance') ?? '');
    }

    const corps = {
      famille: familleChoisie,
      nom: String(formulaire.get('nom') ?? ''),
      societe: String(formulaire.get('societe') ?? ''),
      email: String(formulaire.get('email') ?? ''),
      telephone: String(formulaire.get('telephone') ?? ''),
      ville: String(formulaire.get('ville') ?? ''),
      besoin: String(formulaire.get('besoin') ?? ''),
      format: String(formulaire.get('format') ?? ''),
      quantite: formulaire.get('quantite') ? Number(formulaire.get('quantite')) : undefined,
      specifications,
      consentement: formulaire.get('consentement') === 'on',
      fichiers: fichiers.map((f) => ({
        nom: f.name,
        typeMime: f.type || 'application/octet-stream',
        tailleOctets: f.size,
      })),
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

      for (const upload of donnees.uploads) {
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

  const champ = 'mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5';

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
          <select
            name="famille"
            required
            value={famille}
            onChange={(e) => setFamille(e.target.value as FamilleFormulaire)}
            className={champ}
          >
            {FAMILLES.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          {details.famille ? <span className="text-xs text-red-700">{details.famille}</span> : null}
        </label>
        <label className="block text-sm font-medium">
          Quantité
          <input type="number" name="quantite" min="1" max="100000" className={champ} />
        </label>
      </div>

      {famille === 'TEXTILE' ? (
        <div className="grid gap-4 rounded-xl border border-filet bg-[#F3EFE6] p-4 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            Produit *
            <select name="produit" defaultValue={produitDefaut} className={champ}>
              {produitsTextile.map((p) => (
                <option key={p.id} value={p.id}>{p.nom}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Tailles / répartition
            <input name="tailles" placeholder="S: 5, M: 10, L: 5" className={champ} />
          </label>
          <label className="block text-sm font-medium">
            Faces
            <select name="faces" className={champ}>
              <option value="1 face">1 face</option>
              <option value="2 faces">2 faces</option>
              <option value="À conseiller">À conseiller</option>
            </select>
          </label>
          <p className="text-xs leading-relaxed text-attenue sm:col-span-3">
            Les T-shirts disposent du configurateur 3D. Les autres produits sont validés sur fiche
            technique et BAT : aucun modèle 3D n’est simulé.
          </p>
        </div>
      ) : null}

      {famille === 'IMPRESSION' ? (
        <div className="space-y-4 rounded-xl border border-filet bg-[#F3EFE6] p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Type de support *
              <select name="support" defaultValue={supportDefaut} className={champ}>
                {SUPPORTS_IMPRESSION.map((s) => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Type de papier
              <select name="papier" defaultValue="250 g" className={champ}>
                {PAPIERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Recto / recto-verso
              <select name="rectoVerso" defaultValue="Recto" className={champ}>
                <option value="Recto">Recto</option>
                <option value="Recto-verso">Recto-verso</option>
                <option value="À conseiller">À conseiller</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Format / dimensions
              <input name="format" placeholder="A4, A5, 85 × 55 mm…" className={champ} />
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Finitions souhaitées</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {FINITIONS.map((finition) => (
                <label key={finition} className="flex items-center gap-2 text-sm text-attenue">
                  <input type="checkbox" name="finitions" value={finition} />
                  {finition}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-start gap-2 text-sm text-attenue">
              <input type="checkbox" name="fichierPret" className="mt-1" />
              J’ai un fichier prêt à imprimer
            </label>
            <label className="flex items-start gap-2 text-sm text-attenue">
              <input type="checkbox" name="creationGraphique" className="mt-1" />
              J’ai besoin d’une création graphique
            </label>
          </div>
        </div>
      ) : null}

      {famille === 'SERVICES' ? (
        <div className="grid gap-4 rounded-xl border border-filet bg-[#F3EFE6] p-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Prestation *
            <select name="service" defaultValue={serviceDefaut} className={champ}>
              {SERVICES_ENTREPRISE.map((s) => (
                <option key={s.titre} value={s.titre}>{s.titre}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Type d’organisation
            <select name="typeOrganisation" defaultValue="Entreprise" className={champ}>
              <option value="Entreprise">Entreprise</option>
              <option value="Association">Association</option>
              <option value="Restaurant">Restaurant</option>
              <option value="École">École</option>
              <option value="Événement">Organisateur d’événement</option>
              <option value="Autre">Autre</option>
            </select>
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            Échéance souhaitée
            <input name="echeance" placeholder="Date de l’événement ou délai souhaité" className={champ} />
          </label>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Nom complet *
          <input name="nom" required maxLength={160} className={champ} />
          {details.nom ? <span className="text-xs text-red-700">{details.nom}</span> : null}
        </label>
        <label className="block text-sm font-medium">
          Société / organisation
          <input name="societe" maxLength={160} className={champ} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Téléphone *
          <input name="telephone" required placeholder="+242 06 000 00 00" className={champ} />
          {details.telephone ? <span className="text-xs text-red-700">{details.telephone}</span> : null}
        </label>
        <label className="block text-sm font-medium">
          Email
          <input type="email" name="email" className={champ} />
          {details.email ? <span className="text-xs text-red-700">{details.email}</span> : null}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Ville
          <input name="ville" maxLength={120} className={champ} />
        </label>
        {famille === 'IMPRESSION' ? null : (
          <label className="block text-sm font-medium">
            Format / dimensions
            <input name="format" maxLength={80} placeholder="A4, 60 × 80 cm…" className={champ} />
          </label>
        )}
      </div>

      <label className="block text-sm font-medium">
        Décrivez votre besoin *
        <textarea name="besoin" required minLength={10} maxLength={4000} className={`${champ} min-h-32`} />
        {details.besoin ? <span className="text-xs text-red-700">{details.besoin}</span> : null}
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
