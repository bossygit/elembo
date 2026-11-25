'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { categorieParId } from '@/lib/banner/categories';
import { assemblerPaquet, LIMITES_PAQUET } from '@/lib/banner/paquet';
import { dessinerDocument } from '@/lib/banner/peinture';
import { enregistrerPaquet, lireAsset } from '@/lib/banner/stockage';
import { libelleFinition, libelleSupport, supportParId, usageParId } from '@/lib/grand-format/catalogue';

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

  const continuer = async () => {
    setErreur(null);
    setEtat('Préparation de votre visuel…');
    try {
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
      await enregistrerPaquet(doc.id, { modifieLe: doc.modifieLe, apercu });
      const p = new URLSearchParams({ studio: doc.id, support: doc.support, ...(usage ? { usage: usage.slug } : {}) });
      router.push(`/banderoles/commander?${p}`);
    } catch (e) {
      setEtat(null);
      setErreur(e instanceof Error ? e.message : 'Votre visuel n’a pas pu être préparé.');
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
      pied={<Bouton libelle="Continuer vers ma demande" texte={etat ?? 'Continuer vers ma demande'} className={PRIMAIRE} disabled={bloque || etat !== null || (avertissements.length > 0 && !vu)} onClick={() => void continuer()} />}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-attenue">Support</dt><dd className="font-medium">{libelleSupport(document.support)}</dd></div>
        <div><dt className="text-xs text-attenue">Format</dt><dd className="font-medium tabular-nums">{document.dimensions.largeurMm / 10} × {document.dimensions.hauteurMm / 10} cm</dd></div>
        <div><dt className="text-xs text-attenue">Finition</dt><dd className="font-medium">{supportParId(document.support)?.finitionsApplicables ? libelleFinition(document.finition) : 'Sans objet'}</dd></div>
        <div><dt className="text-xs text-attenue">Images</dt><dd className="font-medium">{document.assets.length} sur {LIMITES_PAQUET.fichiers - 2}</dd></div>
      </dl>
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
