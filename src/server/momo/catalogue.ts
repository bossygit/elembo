/**
 * Catalogue côté SERVEUR : c'est la seule source qui fait foi pour le montant.
 *
 * Les valeurs ne sont pas recopiées : elles viennent de `tarifs/grille.json` par le même module
 * que celui importé par l'application (`src/lib/tarifs/grille.ts`). Corriger un prix se fait donc
 * à UN seul endroit, et il ne peut plus exister de dérive entre le prix affiché et le prix
 * encaissé. Les prix « dérivés » (formats de tableaux) sont recalculés ici par la même formule
 * que côté navigateur : `tests/coherenceCatalogues.test.ts` compare les deux résultats.
 *
 * Différence avec l'ancien service séparé (momo-service) : la grille est IMPORTÉE et non lue par
 * `fs`. Sur Vercel, un fichier lu à l'exécution ne fait pas partie du bundle de la fonction ; un
 * import, si. C'est ce qui permet au paiement de tourner en serverless.
 */

import { GRILLE } from '@/lib/tarifs/grille';

/** La grille brute est réexportée : les tests comparent le catalogue serveur à sa source. */
export { GRILLE };

/* ------------------------------------------------------------------ grille ------- */

export type ProduitGrille = { id: string; nom: string; prixFcfa: number | null };
export type VilleGrille = { id: string; nom: string; fraisFcfa: number | null };
export type TarifsTableauGrille = {
  impressionToileFcfaParM2: number;
  chassisFcfaParM2: number;
  forfaitPreparationFcfa: number;
  debordChassisCm: number;
  arrondiFcfa: number;
};
export type FormatGrille = { id: string; libelle: string; largeurCm: number; hauteurCm: number };
export type PalierTableau = { aPartirDe: number; remisePct: number };

/* --------------------------------------------------------------- catalogue ------- */

export type ProduitServeur = {
  id: string;
  nom: string;
  prixFcfa: number | null;
};

export const CATALOGUE: readonly ProduitServeur[] = GRILLE.produits.map((p) => ({
  id: p.id,
  nom: p.nom,
  prixFcfa: p.prixFcfa,
}));

export type VilleServeur = {
  id: string;
  nom: string;
  fraisFcfa: number | null;
  delaiMaxJours: number;
};

export const VILLES: readonly VilleServeur[] = GRILLE.livraison.villes.map((v) => ({
  id: v.id,
  nom: v.nom,
  fraisFcfa: v.fraisFcfa,
  delaiMaxJours: GRILLE.livraison.delaiMaxJours,
}));

/** Aucune livraison n'est annoncée au-delà de ce délai, quelle que soit la quantité. */
export const DELAI_MAX_JOURS = GRILLE.livraison.delaiMaxJours;

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
  /** Prix public TTC d'une toile seule (encadrée par le client), recalculé à partir de la grille. */
  prixToileSeuleFcfa: number;
  /** Prix public TTC d'une toile montée sur châssis bois, recalculé à partir de la grille. */
  prixChassisFcfa: number;
};

/** Arrondi des prix publics : multiple supérieur (jamais de centimes). */
export const ARRONDI_TABLEAU_FCfa = GRILLE.tableaux.tarifs.arrondiFcfa;

function arrondirSuperieur(montant: number): number {
  return Math.ceil(montant / ARRONDI_TABLEAU_FCfa) * ARRONDI_TABLEAU_FCfa;
}

/**
 * Prix public d'un tableau — MÊME FORMULE que l'application (`prixUnitaireFcfa` dans
 * `src/lib/products/tableaux.ts`) :
 *   toile seule = surface × tarif au m² + préparation
 *   châssis     = (format + 2 × débord) × tarif au m² + format × tarif châssis + préparation
 * le tout arrondi au multiple supérieur. Le test de cohérence compare les deux calculs format
 * par format.
 */
export function prixUnitaireFcfa(format: FormatGrille, support: SupportTableauServeur): number {
  const { impressionToileFcfaParM2, chassisFcfaParM2, forfaitPreparationFcfa, debordChassisCm } =
    GRILLE.tableaux.tarifs;
  const debord = support === 'chassis' ? debordChassisCm : 0;
  const surfaceImprimeeM2 = ((format.largeurCm + 2 * debord) * (format.hauteurCm + 2 * debord)) / 10_000;
  const chassisM2 = (format.largeurCm * format.hauteurCm) / 10_000;
  const toile = surfaceImprimeeM2 * impressionToileFcfaParM2;
  const chassis = support === 'chassis' ? chassisM2 * chassisFcfaParM2 : 0;
  return arrondirSuperieur(toile + chassis + forfaitPreparationFcfa);
}

export const FORMATS_TABLEAU: readonly FormatTableauServeur[] = GRILLE.tableaux.formats.map((f) => ({
  id: f.id,
  libelle: f.libelle,
  largeurCm: f.largeurCm,
  hauteurCm: f.hauteurCm,
  prixToileSeuleFcfa: prixUnitaireFcfa(f, 'toile-seule'),
  prixChassisFcfa: prixUnitaireFcfa(f, 'chassis'),
}));

/** Paliers de remise sur la quantité (source : `tarifs/grille.json`). */
export const PALIERS_TABLEAU: readonly PalierTableau[] = GRILLE.tableaux.paliers;

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

/** Dimensions physiques réellement imprimées (débord compris) — sert au fichier d'impression. */
export function surfaceImprimeeCm(
  format: FormatGrille,
  support: SupportTableauServeur,
): { largeurCm: number; hauteurCm: number } {
  const debord = support === 'chassis' ? GRILLE.tableaux.tarifs.debordChassisCm : 0;
  return {
    largeurCm: format.largeurCm + 2 * debord,
    hauteurCm: format.hauteurCm + 2 * debord,
  };
}
