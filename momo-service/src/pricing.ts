/**
 * Recalcul du montant à payer, côté serveur.
 *
 * Le montant envoyé par le navigateur n'est jamais utilisé : il pourrait être modifié. On
 * reprend le produit, les lignes de taille et la ville, et on refuse tout ce qui n'est pas
 * chiffré (prix unitaire absent, frais de livraison inconnus, quantité nulle).
 */

import { DELAI_MAX_JOURS, produit, ville } from './catalogue.ts';

export type Ligne = { taille: string; quantite: number };

export type Commande = {
  produitId: string;
  lignes: Ligne[];
  villeId: string;
};

export type Montant = {
  montantFcfa: number;
  sousTotalFcfa: number;
  fraisLivraisonFcfa: number;
  quantiteTotale: number;
  delaiJours: number;
  produitNom: string;
  villeNom: string;
};

export class ErreurCommande extends Error {}

const TAILLES = ['S', 'M', 'L', 'XL', '2XL', '3XL'] as const;

/** Délai de production/livraison : il s'allonge avec la quantité, sans jamais dépasser 3 jours. */
export function delaiJours(quantiteTotale: number): number {
  if (quantiteTotale <= 5) return 1;
  if (quantiteTotale <= 20) return 2;
  return DELAI_MAX_JOURS;
}

export function normaliserLignes(lignes: Ligne[]): Ligne[] {
  if (!Array.isArray(lignes)) throw new ErreurCommande('Lignes de commande illisibles.');
  const propres = lignes
    .map((l) => ({ taille: String(l?.taille ?? '').toUpperCase(), quantite: Number(l?.quantite) }))
    .filter((l) => Number.isFinite(l.quantite) && l.quantite > 0);
  for (const l of propres) {
    if (!(TAILLES as readonly string[]).includes(l.taille)) {
      throw new ErreurCommande(`Taille inconnue : « ${l.taille} » (attendu ${TAILLES.join(', ')}).`);
    }
    if (!Number.isInteger(l.quantite) || l.quantite > 500) {
      throw new ErreurCommande(`Quantité invalide pour la taille ${l.taille} : ${l.quantite}.`);
    }
  }
  if (!propres.length) throw new ErreurCommande('La commande ne contient aucune pièce.');
  return propres;
}

export function calculerMontant(commande: Commande): Montant {
  const p = produit(commande?.produitId ?? '');
  if (!p) throw new ErreurCommande(`Produit inconnu : « ${commande?.produitId} ».`);
  if (p.prixFcfa == null) {
    throw new ErreurCommande(`Le prix unitaire de « ${p.nom} » n'est pas défini : commande refusée.`);
  }

  const v = ville(commande?.villeId ?? '');
  if (!v) throw new ErreurCommande(`Ville inconnue : « ${commande?.villeId} ».`);
  if (v.fraisFcfa == null) {
    throw new ErreurCommande(`Les frais de livraison pour ${v.nom} ne sont pas définis : commande refusée.`);
  }

  const lignes = normaliserLignes(commande.lignes);
  const quantiteTotale = lignes.reduce((n, l) => n + l.quantite, 0);
  const sousTotalFcfa = quantiteTotale * p.prixFcfa;

  return {
    montantFcfa: sousTotalFcfa + v.fraisFcfa,
    sousTotalFcfa,
    fraisLivraisonFcfa: v.fraisFcfa,
    quantiteTotale,
    delaiJours: delaiJours(quantiteTotale),
    produitNom: p.nom,
    villeNom: v.nom,
  };
}
