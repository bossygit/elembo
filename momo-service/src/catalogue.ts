/**
 * Catalogue côté SERVEUR : c'est la seule source qui fait foi pour le montant.
 *
 * Le navigateur envoie ce que le client a choisi (produit, tailles, quantités, version du
 * tableau, ville), jamais un montant. Le service recalcule, et si un prix n'est pas arbitré il
 * refuse la commande au lieu de facturer un montant inventé.
 *
 * Ces valeurs doivent correspondre à celles de l'application (`src/lib/products/catalog.ts`,
 * `src/lib/order/order.ts` et `src/lib/products/tableaux.ts`) ; le test
 * `tests/coherenceCatalogues.test.ts` importe les deux sources et échoue à la moindre
 * divergence de prix ou de frais de livraison.
 */

export type ProduitServeur = {
  id: string;
  nom: string;
  prixFcfa: number;
};

export const CATALOGUE: readonly ProduitServeur[] = [
  // PRIX DE TEST — 100 FCFA pour les essais de paiement réel (05/10/2026). Toute
  // modification ici doit être répercutée dans `src/lib/products/catalog.ts` : le test
  // `tests/coherenceCatalogues.test.ts` compare les deux et échoue sinon.
  { id: 'tshirt-basic', nom: 'T-Shirt raglan', prixFcfa: 100 },
  { id: 'tshirt-alt', nom: 'T-Shirt col rond', prixFcfa: 100 },
];

export type VilleServeur = {
  id: string;
  nom: string;
  fraisFcfa: number | null;
  delaiMaxJours: number;
};

export const VILLES: readonly VilleServeur[] = [
  // PRIX DE TEST : 100 FCFA de livraison pour les deux villes (essais de paiement réel,
  // 06/10/2026). Tarifs arbitrés à rétablir ensuite : Brazzaville 1 000, Pointe-Noire 2 000.
  { id: 'brazzaville', nom: 'Brazzaville', fraisFcfa: 100, delaiMaxJours: 3 },
  { id: 'pointe-noire', nom: 'Pointe-Noire', fraisFcfa: 100, delaiMaxJours: 3 },
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

/* ---------------------------------------------------------------- tableaux -------- */

/** Identifiant du produit « tableau » : il ne se vend pas à la pièce mais au format. */
export const PRODUIT_TABLEAU = 'tableau';

export type SupportTableauServeur = 'chassis' | 'toile-seule';

export type FormatTableauServeur = {
  id: string;
  libelle: string;
  largeurCm: number;
  hauteurCm: number;
  /** Prix public TTC d'une toile seule (encadrée par le client). */
  prixToileSeuleFcfa: number;
  /** Prix public TTC d'une toile montée sur châssis bois. */
  prixChassisFcfa: number;
};

/**
 * ⚠️ BARÈME PROVISOIRE — à arbitrer par l'exploitant.
 * Recalculé depuis `src/lib/products/tableaux.ts` (mêmes tarifs) :
 *   toile seule = surface × 30 000 FCFA/m² + 3 000 de préparation
 *   châssis     = (format + 8 cm par côté) × 30 000 + format × 18 000 + 3 000
 * le tout arrondi au multiple de 500 FCFA supérieur.
 */
export const FORMATS_TABLEAU: readonly FormatTableauServeur[] = [
  { id: '20x30', libelle: '20 × 30 cm', largeurCm: 20, hauteurCm: 30, prixToileSeuleFcfa: 5_000, prixChassisFcfa: 7_500 },
  { id: '30x40', libelle: '30 × 40 cm', largeurCm: 30, hauteurCm: 40, prixToileSeuleFcfa: 7_000, prixChassisFcfa: 11_000 },
  { id: '40x60', libelle: '40 × 60 cm', largeurCm: 40, hauteurCm: 60, prixToileSeuleFcfa: 10_500, prixChassisFcfa: 17_500 },
  { id: '50x70', libelle: '50 × 70 cm', largeurCm: 50, hauteurCm: 70, prixToileSeuleFcfa: 13_500, prixChassisFcfa: 23_000 },
  { id: '60x90', libelle: '60 × 90 cm', largeurCm: 60, hauteurCm: 90, prixToileSeuleFcfa: 19_500, prixChassisFcfa: 33_000 },
];

/** Paliers de remise sur la quantité — identiques à ceux de l'application. */
export type PalierTableau = { aPartirDe: number; remisePct: number };

export const PALIERS_TABLEAU: readonly PalierTableau[] = [
  { aPartirDe: 1, remisePct: 0 },
  { aPartirDe: 2, remisePct: 5 },
  { aPartirDe: 5, remisePct: 10 },
  { aPartirDe: 10, remisePct: 15 },
];

/** Arrondi des prix publics : multiple de 500 FCFA supérieur. */
export const ARRONDI_TABLEAU_FCfa = 500;

export function formatTableau(id: string): FormatTableauServeur | undefined {
  return FORMATS_TABLEAU.find((f) => f.id === id);
}

export function palierTableau(quantite: number): PalierTableau {
  const q = Math.max(1, Math.floor(quantite));
  let retenu: PalierTableau = { aPartirDe: 1, remisePct: 0 };
  for (const p of PALIERS_TABLEAU) if (q >= p.aPartirDe) retenu = p;
  return retenu;
}

export function prixUnitaireTableau(
  format: FormatTableauServeur,
  support: SupportTableauServeur,
): number {
  return support === 'chassis' ? format.prixChassisFcfa : format.prixToileSeuleFcfa;
}
