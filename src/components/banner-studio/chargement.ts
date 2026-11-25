'use client';

import { chargerPolice, chargerPolices, copieTravail } from '@/lib/banner/navigateur';
import type { ResultatLecture } from '@/lib/banner/schema';
import { lireAsset } from '@/lib/banner/stockage';
import type { StudioStore } from '@/stores/banner-studio-store';

import type { Images } from './contexte';

/** Ouvre un projet lu : document, polices, puis images de l'appareil. */
export async function chargerProjet(store: StudioStore, images: Images, lecture: ResultatLecture | null, actif: () => boolean = () => true): Promise<void> {
  store.getState().chargementCommence();
  store.getState().ouvrir(lecture);
  const doc = store.getState().document;
  const courant = () => actif() && store.getState().document.id === doc.id;
  await Promise.all([
    // Police du prochain texte ajouté : prête avant sa première mesure.
    chargerPolice({ policeId: 'montserrat', graisse: 700, contenu: '' }).then((ok) => store.getState().declarerPolice('montserrat', ok)),
    chargerPolices(doc).then((echecs) => {
      for (const p of echecs) store.getState().declarerPolice(p, false);
      images.notifier();
    }),
    ...doc.assets.filter((a) => !a.placeholder && !images.image(a.id)).map(async (a) => {
      const blob = await lireAsset(a.id);
      const copie = blob ? await copieTravail(blob).catch(() => null) : null;
      if (!copie || !actif()) return;
      images.poser(a.id, copie.travail);
      store.getState().declarerImage(a.id);
    }),
  ]);
  if (courant()) store.getState().chargementFini();
}
