'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { categorieParId } from '@/lib/banner/categories';
import { assemblerPaquet, LIMITES_PAQUET } from '@/lib/banner/paquet';
import { dessinerDocument } from '@/lib/banner/peinture';
import { enregistrerPaquet, lireAsset, lireEnvoi, marquerEnvoye } from '@/lib/banner/stockage';
import { envoyerFichiersDevis } from '@/lib/devis/envoiFichiers';
import type { Estimation } from '@/lib/grand-format/estimation';
import { LIMITES, libelleFinition, libelleSupport, supportParId, usageParId } from '@/lib/grand-format/catalogue';

import { LARGEUR_APERCU } from './Apercu';
import { Bouton, ChampCase } from './champs';
import { useActions, useContexte, useStudio } from './contexte';
import { Fenetre, PRIMAIRE } from './Fenetre';

/** Contrôle final, puis passage au parcours de commande existant (audit §4.7). */
export function Finaliser() {
  const a = useActions();
  const router = useRouter();
  const { store, images } = useContexte();
  const document = useStudio((s) => s.document);
  const alertes = useStudio((s) => s.alertes);
  const [vu, setVu] = useState(false);
  const [etat, setEtat] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const critiques = alertes.filter((x) => x.severite === 'critique');
  const avertissements = alertes.filter((x) => x.severite === 'avertissement');
  const vide = document.elements.length === 0 && document.fond.type === 'couleur';
  const usage = document.categorie ? usageParId(categorieParId(document.categorie)!.usage) : undefined;
  const fermer = () => a.ouvrirFenetre(null);
  const [quantite, setQuantite] = useState(1);
  const [prix, setPrix] = useState<string | null>(null);
  /** Demande déjà envoyée depuis cet appareil, encore modifiable : le visuel peut la mettre à jour. */
  const [demande, setDemande] = useState<string | null>(null);

  // Prix indicatif : calculé par le serveur sur la grille validée, jamais dans le navigateur.
  useEffect(() => {
    let actif = true;
    const t = setTimeout(() => {
      fetch('/api/banderoles/estimation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usage: usage?.id ?? 'AUTRE', support: document.support, largeurM: String(document.dimensions.largeurMm / 1000), hauteurM: String(document.dimensions.hauteurMm / 1000),
          quantite, finition: document.finition, delai: 'STANDARD', prestation: 'FICHIER_PRET',
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { estimation?: Estimation } | null) => {
          if (!actif) return;
          const e = j?.estimation;
          setPrix(e?.disponible ? `${e.montantFcfa.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} FCFA, indicatif, hors livraison` : 'Sur devis : Smart Vision vous adresse un prix.');
        }, () => actif && setPrix(null));
    }, 300);
    return () => { actif = false; clearTimeout(t); };
  }, [usage?.id, document.support, document.dimensions.largeurMm, document.dimensions.hauteurMm, document.finition, quantite]);

  useEffect(() => {
    let actif = true;
    void lireEnvoi(document.id).then(async (envoi) => {
      if (!envoi) return;
      const r = await fetch(`/api/devis/${encodeURIComponent(envoi.reference)}`, { cache: 'no-store' }).catch(() => null);
      const j = r?.ok ? ((await r.json()) as { visuel?: { modifiable?: boolean } | null }) : null;
      if (actif && j?.visuel?.modifiable) setDemande(envoi.reference);
    });
    return () => { actif = false; };
  }, [document.id]);

  /** Aperçu et paquet du document enregistré ; lève une erreur au message affichable. */
  const preparer = async () => {
    await a.enregistrerMaintenant();
      const doc = store.getState().document;
      const k = LARGEUR_APERCU / Math.max(doc.dimensions.largeurMm, doc.dimensions.hauteurMm);
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.round(doc.dimensions.largeurMm * k);
      canvas.height = Math.round(doc.dimensions.hauteurMm * k);
      const c = canvas.getContext('2d');
      if (!c) throw new Error('Aperçu impossible sur ce navigateur.');
      dessinerDocument(c, doc, images, k);
      const apercu = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82));
      if (!apercu) throw new Error('Aperçu impossible sur ce navigateur.');
      const blobs = new Map<string, Blob>();
      for (const x of doc.assets) {
        const b = await lireAsset(x.id);
        if (b) blobs.set(x.id, b);
      }
      const paquet = assemblerPaquet({ document: doc, apercu, images: blobs });
      if (!paquet.ok) throw new Error(paquet.erreur);
      return { doc, apercu, fichiers: paquet.fichiers };
  };

  const continuer = async () => {
    setErreur(null);
    setEtat('Préparation de votre visuel…');
    try {
      const { doc, apercu } = await preparer();
      await enregistrerPaquet(doc.id, { modifieLe: doc.modifieLe, apercu });
      const p = new URLSearchParams({ studio: doc.id, support: doc.support, quantite: String(quantite), ...(usage ? { usage: usage.slug } : {}) });
      router.push(`/banderoles/commander?${p}`);
    } catch (e) {
      setEtat(null);
      setErreur(e instanceof Error ? e.message : 'Votre visuel n’a pas pu être préparé.');
    }
  };

  /** Reprise : le visuel modifié remplace celui de la demande déjà envoyée (même format, même prix). */
  const mettreAJour = async (reference: string) => {
    setErreur(null);
    setEtat('Préparation de votre visuel…');
    try {
      const { doc, fichiers } = await preparer();
      const csrf = decodeURIComponent(window.document.cookie.match(/(?:^|; )elembo_devis_csrf=([^;]+)/)?.[1] ?? '');
      const entetes = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
      const r = await fetch(`/api/banderoles/${encodeURIComponent(reference)}/reprise`, {
        method: 'POST',
        headers: entetes,
        body: JSON.stringify({
          format: { largeurMm: doc.dimensions.largeurMm, hauteurMm: doc.dimensions.hauteurMm, support: doc.support, finition: doc.finition },
          fichiers: fichiers.map((f) => ({ nom: f.name, typeMime: f.type, tailleOctets: f.size })),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { uploads?: { fichierId: string; nom: string; nomOrigine: string; signedUrl: string }[]; erreur?: string };
      if (!r.ok || !j.uploads) throw new Error(j.erreur ?? 'La modification n’a pas pu être préparée.');
      setEtat('Envoi de votre visuel…');
      const renommes = j.uploads.map((u) => new File([fichiers.find((f) => f.name === u.nomOrigine)!], u.nom, { type: fichiers.find((f) => f.name === u.nomOrigine)!.type }));
      await envoyerFichiersDevis({ reference, csrfToken: csrf, uploads: j.uploads, fichiers: renommes });
      setEtat('Préparation du fichier d’impression…');
      await fetch(`/api/banderoles/${encodeURIComponent(reference)}/visuel`, { method: 'POST', headers: entetes, body: '{}' }).catch(() => undefined);
      await marquerEnvoye(doc.id, reference);
      router.push(`/devis/${encodeURIComponent(reference)}`);
    } catch (e) {
      setEtat(null);
      setErreur(e instanceof Error ? e.message : 'Votre visuel n’a pas pu être envoyé.');
    }
  };

  const liste = (titre: string, items: typeof alertes, classe: string) => (
    <section className="mt-4">
      <h3 className={`text-sm font-semibold ${classe}`}>{titre}</h3>
      <ul className="mt-1 space-y-1">
        {items.map((x) => (
          <li key={`${x.code}:${x.elementId}`} className="text-sm">
            {x.elementId ? <button type="button" className="min-h-11 w-full rounded-md px-1 text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-orange-action lg:min-h-8" onClick={() => { a.selectionner(x.elementId); fermer(); }}>{x.message}</button> : <span className="block px-1 py-1">{x.message}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
  const bloque = vide || critiques.length > 0;

  return (
    <Fenetre
      titre="Finaliser ma demande"
      fermer={fermer}
      pied={
        <>
          {demande ? <Bouton libelle="Faire une nouvelle demande" texte="Nouvelle demande" className="border border-bordure" disabled={bloque || etat !== null || (avertissements.length > 0 && !vu)} onClick={() => void continuer()} /> : null}
          <Bouton
            libelle={demande ? `Mettre à jour la demande ${demande}` : 'Continuer vers ma demande'}
            texte={etat ?? (demande ? `Mettre à jour ${demande}` : 'Continuer vers ma demande')}
            className={PRIMAIRE}
            disabled={bloque || etat !== null || (avertissements.length > 0 && !vu)}
            onClick={() => void (demande ? mettreAJour(demande) : continuer())}
          />
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-attenue">Support</dt><dd className="font-medium">{libelleSupport(document.support)}</dd></div>
        <div><dt className="text-xs text-attenue">Format</dt><dd className="font-medium tabular-nums">{document.dimensions.largeurMm / 10} × {document.dimensions.hauteurMm / 10} cm</dd></div>
        <div><dt className="text-xs text-attenue">Finition</dt><dd className="font-medium">{supportParId(document.support)?.finitionsApplicables ? libelleFinition(document.finition) : 'Sans objet'}</dd></div>
        <div><dt className="text-xs text-attenue">Images</dt><dd className="font-medium">{document.assets.length} sur {LIMITES_PAQUET.fichiers - 2}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-filet pt-4">
        <label className="text-xs text-attenue">
          Quantité
          <input type="number" min={1} max={LIMITES.quantiteMax} value={quantite} onChange={(e) => setQuantite(Math.min(LIMITES.quantiteMax, Math.max(1, Math.floor(Number(e.target.value) || 1))))} className="mt-1 block min-h-11 w-24 rounded-lg border border-bordure bg-white px-2.5 text-base text-encre lg:min-h-9 lg:text-sm" />
        </label>
        <p className="min-w-0 flex-1 text-sm" aria-live="polite" data-testid="prix-indicatif"><span className="block text-xs text-attenue">Prix</span>{prix ?? '…'}</p>
      </div>
      {demande ? <p className="mt-3 rounded-lg bg-sable p-2 text-sm">Ce visuel accompagne déjà la demande <strong>{demande}</strong>. Vous pouvez la mettre à jour (même format, même prix), ou faire une nouvelle demande.</p> : null}
      {vide ? <p className="mt-4 text-sm">Votre banderole est vide : ajoutez un texte, une image, ou choisissez un modèle.</p> : null}
      {critiques.length ? liste('À corriger avant d’envoyer', critiques, 'text-red-800') : null}
      {avertissements.length ? (
        <>
          {liste('À vérifier', avertissements, 'text-alerte')}
          {bloque ? null : <ChampCase libelle="J’ai vérifié ces points, je continue quand même." valeur={vu} onValeur={setVu} />}
        </>
      ) : null}
      {!bloque && !avertissements.length ? <p className="mt-4 text-sm text-succes">Rien à signaler.</p> : null}
      {erreur ? <p role="alert" className="mt-4 rounded-lg border border-red-700 p-2 text-sm text-red-800">{erreur}</p> : null}
      <p className="mt-4 text-xs text-attenue">
        Étape suivante : quantité, délai et coordonnées. Aucun paiement à ce stade, Smart Vision vous adresse un devis. Les couleurs imprimées peuvent différer de l’écran.
      </p>
      <p className="mt-2 text-xs"><Link className="underline" href={`/banderoles/commander${usage ? `?usage=${usage.slug}` : ''}`}>Décrire ma demande sans ce visuel</Link></p>
    </Fenetre>
  );
}
