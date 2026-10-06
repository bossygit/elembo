/**
 * Catalogue côté SERVEUR : c'est la seule source qui fait foi pour le montant.
 *
 * Le navigateur envoie ce que le client a choisi (produit, tailles, quantités, ville), jamais
 * un montant. Le service recalcule, et si un prix n'est pas arbitré il refuse la commande au
 * lieu de facturer un montant inventé.
 *
 * Ces valeurs doivent correspondre à celles de l'application (`src/lib/products/catalog.ts` et
 * `src/lib/order/order.ts`) ; le test `tests/coherenceCatalogues.test.ts` importe les deux
 * sources et échoue à la moindre divergence de prix ou de frais de livraison.
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
  { id: 'pointe-noire', nom: 'Pointe-Noire', fraisFcfa: 2000, delaiMaxJours: 3 },
  // Une ville dont le tarif n'est pas arbitré porterait fraisFcfa: null et serait refusée.
];

/** Aucune livraison n'est annoncée au-delà de trois jours, quelle que soit la quantité. */
export const DELAI_MAX_JOURS = 3;

export function produit(id: string): ProduitServeur | undefined {
  return CATALOGUE.find((p) => p.id === id);
}

export function ville(id: string): VilleServeur | undefined {
  return VILLES.find((v) => v.id === id);
}
