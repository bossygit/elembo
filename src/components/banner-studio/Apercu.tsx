'use client';

import { useEffect, useRef } from 'react';

import { dessinerDocument } from '@/lib/banner/peinture';

import { Bouton } from './champs';
import { useContexte } from './contexte';

const LARGEUR_APERCU = 1600;

/** Aperçu sans repères ; JPEG de 1 600 px sur le grand côté (décision 5). */
export function Apercu({ fermer }: { fermer: () => void }) {
  const { store, images } = useContexte();
  const ref = useRef<HTMLDialogElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const dialogue = ref.current;
    const canvas = toile.current;
    const c = canvas?.getContext('2d');
    if (!dialogue || !canvas || !c) return;
    if (!dialogue.open) dialogue.showModal();
    const doc = store.getState().document;
    const k = LARGEUR_APERCU / Math.max(doc.dimensions.largeurMm, doc.dimensions.hauteurMm);
    canvas.width = Math.round(doc.dimensions.largeurMm * k);
    canvas.height = Math.round(doc.dimensions.hauteurMm * k);
    dessinerDocument(c, doc, images, k);
  }, [store, images]);

  const telecharger = () => toile.current?.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = 'apercu-banderole.jpg';
    lien.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/jpeg', 0.82);

  return (
    <dialog ref={ref} onClose={fermer} aria-label="Aperçu de la banderole" className="m-auto max-h-[92dvh] w-[min(94vw,1100px)] rounded-2xl bg-creme p-4 backdrop:bg-encre/70">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Aperçu</h2>
        <div className="flex gap-2">
          <Bouton libelle="Télécharger l’aperçu" texte="Télécharger" onClick={telecharger} className="border border-bordure" />
          <Bouton icone="fermer" libelle="Fermer l’aperçu" onClick={() => ref.current?.close()} />
        </div>
      </div>
      <canvas ref={toile} className="mx-auto block max-h-[70dvh] max-w-full shadow" />
      <p className="mt-3 text-xs text-attenue">Aperçu à l’écran, en basse définition. Les couleurs imprimées peuvent différer ; ce fichier ne sert pas à l’impression.</p>
    </dialog>
  );
}
