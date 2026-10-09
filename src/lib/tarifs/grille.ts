// Source unique des prix — chargement côté APPLICATION.
//
// Le fichier `tarifs/grille.json` à la racine du dépôt est LA source de vérité : le service de
// paiement lit le même fichier, au même endroit, au démarrage (`momo-service/src/catalogue.ts`).
// Aucun prix n'est écrit ailleurs dans le code : un montant affiché et un montant encaissé qui
// divergeraient supposent donc une modification du fichier, pas une erreur de recopie.
//
// Règle : un prix absent ou `null` ne devient JAMAIS un montant plausible — la commande est
// refusée avec le motif affiché (voir `orderTotals` et `calculerMontant`).

import brut from '../../../tarifs/grille.json';

export type ProduitTarife = { id: string; nom: string; prixFcfa: number | null };
export type VilleTarifee = { id: string; nom: string; fraisFcfa: number | null };
export type TarifsTableau = {
  impressionToileFcfaParM2: number;
  chassisFcfaParM2: number;
  forfaitPreparationFcfa: number;
  debordChassisCm: number;
  arrondiFcfa: number;
};
export type FormatTableauTarife = { id: string; libelle: string; largeurCm: number; hauteurCm: number };
export type PalierTarife = { aPartirDe: number; remisePct: number };

export type Grille = {
  version: number;
  statut: string;
  maj: string;
  devise: string;
  produits: ProduitTarife[];
  livraison: { delaiMaxJours: number; villes: VilleTarifee[] };
  tableaux: { tarifs: TarifsTableau; formats: FormatTableauTarife[]; paliers: PalierTarife[] };
};

export const GRILLE = brut as Grille;

/** Prix d'un produit du catalogue 3D, `null` si l'exploitant ne l'a pas encore arbitré. */
export function prixProduit(id: string): number | null {
  const p = GRILLE.produits.find((x) => x.id === id);
  return p ? p.prixFcfa : null;
}

/** Villes desservies : `fraisFcfa: null` = tarif non arbitré, la commande sera refusée. */
export function villesLivraison(): VilleTarifee[] {
  return GRILLE.livraison.villes;
}

export function tarifsTableaux(): TarifsTableau {
  return GRILLE.tableaux.tarifs;
}

export function formatsTableaux(): FormatTableauTarife[] {
  return GRILLE.tableaux.formats;
}

export function paliersTableaux(): PalierTarife[] {
  return GRILLE.tableaux.paliers;
}
