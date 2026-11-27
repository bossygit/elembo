/**
 * Recalcul du montant à payer, côté serveur.
 *
 * Le montant envoyé par le navigateur n'est jamais utilisé : il pourrait être modifié. On
 * reprend le produit, les lignes de taille (ou le format de tableau) et la ville, et on refuse
 * tout ce qui n'est pas chiffré (prix unitaire absent, frais de livraison inconnus, quantité
 * nulle, format inconnu).
 *
 * Les prix des produits et les frais de livraison viennent des TARIFS COURANTS (l'admin, relu à
 * chaque paiement : src/server/tarifs/base.ts). Sans tarifs fournis, la grille du dépôt sert de
 * repli (tests, développement local). Le barème des tableaux reste dans la grille.
 */

import {
  ARRONDI_TABLEAU_FCfa,
  PRODUIT_TABLEAU,
  formatTableau,
  palierTableau,
  prixUnitaireTableau,
  type SupportTableauServeur,
} from './catalogue';
import { tarifProduit, tarifVille, tarifsDepuisGrille, type TarifVille, type Tarifs } from '@/lib/tarifs/tarifs';

export type Ligne = { taille: string; quantite: number };
export type LigneTableau = { formatId: string; support: string; quantite: number };

export type Commande = {
  produitId: string;
  lignes: Ligne[];
  /** Renseigné pour le produit « tableau » : une ligne par format commandé. */
  tableaux?: LigneTableau[];
  villeId: string;
};

export type LigneTableauChiffree = {
  formatId: string;
  formatLibelle: string;
  support: SupportTableauServeur;
  quantite: number;
  prixUnitaireFcfa: number;
  remisePct: number;
  sousTotalFcfa: number;
};

export type Montant = {
  montantFcfa: number;
  sousTotalFcfa: number;
  fraisLivraisonFcfa: number;
  quantiteTotale: number;
  delaiJours: number;
  produitNom: string;
  villeNom: string;
  /** Détail des lignes de tableaux, pour la fiche de production et les relevés. */
  lignesTableaux?: LigneTableauChiffree[];
};

export class ErreurCommande extends Error {}

// `XXL` est la taille envoyée par le formulaire du configurateur (`2XL` reste accepté pour les
// anciens clients) ; `TU` = taille unique (casquette réglable, mug, objet).
const TAILLES = ['S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', 'TU'] as const;
const SUPPORTS_TABLEAU: readonly SupportTableauServeur[] = ['chassis', 'toile-seule'];
/** Un même format ne peut pas être commandé en plus de 50 exemplaires (garde-fou). */
const QUANTITE_MAX_TABLEAU = 50;

/** Délai de production/livraison : il s'allonge avec la quantité, sans dépasser le maximum annoncé. */
export function delaiJours(quantiteTotale: number, delaiMax = tarifsDepuisGrille().livraison.delaiMaxJours): number {
  const jours = quantiteTotale <= 5 ? 1 : quantiteTotale <= 20 ? 2 : 3;
  return Math.min(jours, delaiMax);
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

/** Arrondi des prix publics : multiple de 500 FCFA supérieur (jamais de centimes). */
function arrondirSuperieur(montant: number): number {
  return Math.ceil(montant / ARRONDI_TABLEAU_FCfa) * ARRONDI_TABLEAU_FCfa;
}

export function normaliserLignesTableau(lignes: LigneTableau[]): LigneTableauChiffree[] {
  if (!Array.isArray(lignes) || !lignes.length) {
    throw new ErreurCommande('Commande de tableau sans format : précisez au moins un format.');
  }
  return lignes.map((l) => {
    const format = formatTableau(String(l?.formatId ?? ''));
    if (!format) throw new ErreurCommande(`Format de tableau inconnu : « ${l?.formatId} ».`);
    const support = String(l?.support ?? '') as SupportTableauServeur;
    if (!SUPPORTS_TABLEAU.includes(support)) {
      throw new ErreurCommande(
        `Support inconnu : « ${l?.support} » (attendu ${SUPPORTS_TABLEAU.join(' ou ')}).`,
      );
    }
    const quantite = Number(l?.quantite);
    if (!Number.isInteger(quantite) || quantite <= 0 || quantite > QUANTITE_MAX_TABLEAU) {
      throw new ErreurCommande(
        `Quantité invalide pour le format ${format.libelle} : ${l?.quantite} (1 à ${QUANTITE_MAX_TABLEAU}).`,
      );
    }
    const prixUnitaireFcfa = prixUnitaireTableau(format, support);
    const { remisePct } = palierTableau(quantite);
    return {
      formatId: format.id,
      formatLibelle: format.libelle,
      support,
      quantite,
      prixUnitaireFcfa,
      remisePct,
      sousTotalFcfa: arrondirSuperieur(prixUnitaireFcfa * quantite * (1 - remisePct / 100)),
    };
  });
}

/** Ville contrôlée : ses frais de livraison sont garantis chiffrés après ce passage. */
function controlerVille(villeId: string, tarifs: Tarifs): TarifVille & { fraisFcfa: number } {
  const v = tarifVille(tarifs, villeId ?? '');
  if (!v) throw new ErreurCommande(`Ville inconnue : « ${villeId} ».`);
  if (v.fraisFcfa == null) {
    throw new ErreurCommande(`Les frais de livraison pour ${v.nom} ne sont pas définis : commande refusée.`);
  }
  return { ...v, fraisFcfa: v.fraisFcfa };
}

export function calculerMontant(commande: Commande, tarifs: Tarifs = tarifsDepuisGrille()): Montant {
  const v = controlerVille(commande?.villeId ?? '', tarifs);
  const delaiMax = tarifs.livraison.delaiMaxJours;

  // ---- Tableaux : facturés au format, avec remise de palier sur la quantité ----
  if (commande?.produitId === PRODUIT_TABLEAU) {
    const lignes = normaliserLignesTableau(commande.tableaux ?? []);
    const quantiteTotale = lignes.reduce((n, l) => n + l.quantite, 0);
    const sousTotalFcfa = lignes.reduce((n, l) => n + l.sousTotalFcfa, 0);
    return {
      montantFcfa: sousTotalFcfa + v.fraisFcfa,
      sousTotalFcfa,
      fraisLivraisonFcfa: v.fraisFcfa,
      quantiteTotale,
      // Un tableau sur châssis demande impression PUIS montage : au moins 2 jours.
      delaiJours: Math.min(
        delaiMax,
        Math.max(...lignes.map((l) => (l.support === 'toile-seule' ? (l.quantite <= 2 ? 1 : 2) : l.quantite <= 2 ? 2 : 3))),
      ),
      produitNom: 'Tableau canvas',
      villeNom: v.nom,
      lignesTableaux: lignes,
    };
  }

  // ---- Textile : prix unitaire du catalogue × quantité ----
  const p = tarifProduit(tarifs, commande?.produitId ?? '');
  if (!p) throw new ErreurCommande(`Produit inconnu : « ${commande?.produitId} ».`);
  if (p.prixFcfa == null) {
    throw new ErreurCommande(`Le prix unitaire de « ${p.nom} » n'est pas défini : commande refusée.`);
  }

  const lignes = normaliserLignes(commande.lignes);
  const quantiteTotale = lignes.reduce((n, l) => n + l.quantite, 0);
  const sousTotalFcfa = quantiteTotale * p.prixFcfa;

  return {
    montantFcfa: sousTotalFcfa + v.fraisFcfa,
    sousTotalFcfa,
    fraisLivraisonFcfa: v.fraisFcfa,
    quantiteTotale,
    delaiJours: delaiJours(quantiteTotale, delaiMax),
    produitNom: p.nom,
    villeNom: v.nom,
  };
}

/**
 * Le produit peut-il être payé en ligne ? Prix chiffré ET validé, produit actif ET disponible
 * dans l'admin. Le barème des tableaux garde son propre statut (grille). `autoriserPrixTest`
 * est la dérogation explicite des essais encadrés (MOMO_ALLOW_TEST_PRICES / mode simulé).
 */
export function verifierFacturable(
  produitId: string,
  tarifs: Tarifs,
  options: { autoriserPrixTest: boolean; statutTableaux: string },
): void {
  if (options.autoriserPrixTest) return;
  if (produitId === PRODUIT_TABLEAU) {
    if (options.statutTableaux !== 'valide') {
      throw new ErreurCommande(
        'Le barème des tableaux n’est pas encore validé commercialement : paiement en ligne fermé, demandez un devis.',
      );
    }
    return;
  }
  const p = tarifProduit(tarifs, produitId);
  if (!p) return; // produit inconnu : calculerMontant le refuse avec son motif
  if (!p.vendable) {
    throw new ErreurCommande(`« ${p.nom} » n’est pas ouvert à la vente en ligne : demandez un devis.`);
  }
  if (p.statutPrix !== 'valide') {
    throw new ErreurCommande(
      `Le prix de « ${p.nom} » n’est pas validé commercialement : paiement en ligne fermé, demandez un devis.`,
    );
  }
}

/**
 * Le navigateur annonce le total qu'il a AFFICHÉ. Ce montant n'est jamais facturé : il sert à
 * refuser la commande si le prix a changé dans l'admin depuis l'affichage, pour que le client ne
 * soit jamais débité d'un autre montant que celui qu'il a vu. Absent (anciens clients) : ignoré.
 */
export function verifierMontantAttendu(attendu: unknown, montant: Montant): void {
  if (attendu === undefined || attendu === null || attendu === '') return;
  const vu = Number(attendu);
  if (!Number.isFinite(vu) || vu !== montant.montantFcfa) {
    throw new ErreurCommande(
      `Les prix ont été mis à jour : le total est désormais de ${montant.montantFcfa.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} FCFA. Rechargez la page pour vérifier votre commande avant de payer.`,
    );
  }
}
