// Tarifs pour l'AFFICHAGE (boutique, fiches, atelier) — mis en cache, étiquette `tarifs`.
//
// L'admin appelle `updateTag(TAG_TARIFS)` après chaque modification de prix : les pages qui
// affichent un prix sont régénérées à la visite suivante, sans redéploiement. La revalidation
// périodique (5 min) n'est qu'un filet de sécurité.
//
// Le paiement NE lit PAS ce cache (voir ./base.ts) : il relit l'admin et refuse la commande si
// le montant affiché au client ne correspond plus (`montantAttenduFcfa`).

import { unstable_cache } from 'next/cache';

import { tarifsIndisponibles, type Tarifs } from '@/lib/tarifs/tarifs';
import { tarifsServeur } from './base';

export const TAG_TARIFS = 'tarifs';

const lire = unstable_cache(
  async (): Promise<Tarifs> => {
    try {
      return await tarifsServeur();
    } catch (erreur) {
      console.error('Tarifs (affichage) :', (erreur as Error).message);
      return tarifsIndisponibles();
    }
  },
  ['tarifs-affichage'],
  { tags: [TAG_TARIFS], revalidate: 300 },
);

export async function tarifsAffichage(): Promise<Tarifs> {
  return lire();
}
