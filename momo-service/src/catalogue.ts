/**
 * Catalogue côté SERVEUR : c'est la seule source qui fait foi pour le montant.
 *
 * Le navigateur envoie ce que le client a choisi (produit, tailles, quantités, ville), jamais
 * un montant. Le service recalcule, et si un prix n'est pas arbitré il refuse la commande au
 * lieu de facturer un montant inventé.
 *
 * Ces valeurs doivent correspondre à celles de l'application (`src/lib/products/catalog.ts` et
 * `src/lib/order/order.ts`) ; le test `tests/catalogue.test.ts` compare les deux fichiers et
 * échoue à la moindre divergence.
 */

export type ProduitServeur = {
  id: string;
  nom: string;
  prixFcfa: number;
};

export const CATALOGUE: readonly ProduitServeur[] = [
  { id: 'tshirt-basic', nom: 'T-Shirt raglan', prixFcfa: 5000 },
  { id: 'tshirt-alt', nom: 'T-Shirt col rond', prixFcfa: 5000 },
];

export type VilleServeur = {
  id: string;
  nom: string;
  fraisFcfa: number | null;
  delaiMaxJours: number;
};

export const VILLES: readonly VilleServeur[] = [
  { id: 'brazzaville', nom: 'Brazzaville', fraisFcfa: 1000, delaiMaxJours: 3 },
  // Tarif non arbitré : la commune refusera la commande (fraisFcfa === null).
  { id: 'pointe-noire', nom: 'Pointe-Noire', fraisFcfa: null, delaiMaxJours: 3 },
];

/** Aucune livraison n'est annoncée au-delà de trois jours, quelle que soit la quantité. */
export const DELAI_MAX_JOURS = 3;

export function produit(id: string): ProduitServeur | undefined {
  return CATALOGUE.find((p) => p.id === id);
}

export function ville(id: string): VilleServeur | undefined {
  return VILLES.find((v) => v.id === id);
}
