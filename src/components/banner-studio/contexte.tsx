'use client';

import { createContext, useContext, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';

import { lireImage, mesureurNavigateur } from '@/lib/banner/navigateur';
import type { Ressources } from '@/lib/banner/peinture';
import { enregistrerAsset } from '@/lib/banner/stockage';
import type { EtatStudio, StudioStore } from '@/stores/banner-studio-store';

/** Copies de travail des images, hors du store : ce sont des objets du navigateur, pas des données. */
export class Images implements Ressources {
  private sources = new Map<string, CanvasImageSource>();
  private abonnes = new Set<() => void>();
  mesurer = mesureurNavigateur;
  image = (id: string) => this.sources.get(id) ?? null;
  poser(id: string, source: CanvasImageSource) {
    this.sources.set(id, source);
    this.notifier();
  }
  notifier() {
    for (const f of this.abonnes) f();
  }
  abonner(f: () => void) {
    this.abonnes.add(f);
    return () => void this.abonnes.delete(f);
  }
}

type Contexte = { store: StudioStore; images: Images };
const ContexteStudio = createContext<Contexte | null>(null);
export const FournisseurStudio = ContexteStudio.Provider;

export function useContexte(): Contexte {
  const c = useContext(ContexteStudio);
  if (!c) throw new Error('Composant du Studio hors de son contexte');
  return c;
}

export const useStudio = <T,>(lecture: (e: EtatStudio) => T): T => useStore(useContexte().store, lecture);
export const useActions = () => useContexte().store.getState();

export function useSelection() {
  const id = useStudio((e) => e.selection);
  return useStudio((e) => e.document.elements.find((x) => x.id === id) ?? null);
}

export function useMedia(requete: string): boolean {
  return useSyncExternalStore(
    (f) => {
      const m = window.matchMedia(requete);
      m.addEventListener('change', f);
      return () => m.removeEventListener('change', f);
    },
    () => window.matchMedia(requete).matches,
    () => false,
  );
}

/** Importe un fichier image : contrôle, conservation de l'original, puis ajout au document. */
export function useImportImage() {
  const { store, images } = useContexte();
  return async (fichier: File) => {
    const { annoncer } = store.getState();
    try {
      const lue = await lireImage(fichier);
      const id = crypto.randomUUID();
      const conserve = await enregistrerAsset(id, fichier);
      images.poser(id, lue.travail);
      store.getState().declarerImage(id);
      const ajoute = store.getState().ajouterImage({ id, nom: lue.nom, mime: lue.mime, largeurPx: lue.largeurPx, hauteurPx: lue.hauteurPx });
      annoncer(!ajoute ? 'Nombre maximal d’images ou d’éléments atteint.' : conserve ? null : 'Image ajoutée, mais cet appareil ne peut pas la conserver : elle sera perdue à la fermeture.');
    } catch (e) {
      annoncer(e instanceof Error ? e.message : 'Cette image ne peut pas être importée.');
    }
  };
}
