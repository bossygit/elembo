'use client';

// Tarifs courants dans le navigateur : fournis par le serveur (page), lus par les composants de
// commande. Hors fournisseur (tests, aperçus isolés), la grille du dépôt sert de repli.

import { createContext, useContext, type ReactNode } from 'react';

import { tarifsDepuisGrille, type Tarifs } from '@/lib/tarifs/tarifs';

const TarifsContexte = createContext<Tarifs>(tarifsDepuisGrille());

export function TarifsProvider({ tarifs, children }: { tarifs: Tarifs; children: ReactNode }) {
  return <TarifsContexte.Provider value={tarifs}>{children}</TarifsContexte.Provider>;
}

export function useTarifs(): Tarifs {
  return useContext(TarifsContexte);
}
