/**
 * Suivi commercial d'une demande grand format — fonctions pures.
 *
 * Aucun statut n'est ajouté à la base : l'état affiché est DÉRIVÉ des statuts existants du
 * devis (`statut_devis`) et de la commande (`statut_commande`). Une demande suit donc exactement
 * le même cycle que toute vente Elembo, avec un vocabulaire adapté à l'offre.
 *
 *   devis NOUVEAU                         → Nouvelle demande
 *   devis EN_ANALYSE                      → En attente de validation
 *   devis PROPOSE                         → Devis transmis
 *   devis ACCEPTE (sans commande)         → En attente de paiement (commande à créer)
 *   commande BROUILLON … EN_ATTENTE_DE_PAIEMENT → En attente de paiement
 *   commande PAYEE                        → Payée
 *   commande A_PRODUIRE / EN_PRODUCTION   → En production
 *   commande CONTROLE_QUALITE             → Contrôle qualité
 *   commande PRETE / EN_LIVRAISON         → Prête à livrer
 *   commande LIVREE                       → Livrée
 *   devis REFUSE / EXPIRE, commande ANNULEE / REMBOURSEMENT_A_TRAITER → Annulée
 */

import type { StatutCommande, StatutDevis, Ton } from '@/lib/admin/statuts';
import {
  formatDimensions,
  formatSurface,
  libelleFinition,
  libellePrestation,
  libelleSupport,
  libelleUsage,
  surfaceM2,
  type FinitionId,
  type PrestationId,
  type SupportId,
  type UsageId,
} from './catalogue';

export type EtatGrandFormat =
  | 'NOUVELLE'
  | 'EN_VALIDATION'
  | 'DEVIS_TRANSMIS'
  | 'ATTENTE_PAIEMENT'
  | 'PAYEE'
  | 'EN_PRODUCTION'
  | 'CONTROLE_QUALITE'
  | 'PRETE'
  | 'LIVREE'
  | 'ANNULEE';

export const ETATS: { id: EtatGrandFormat; label: string; ton: Ton }[] = [
  { id: 'NOUVELLE', label: 'Nouvelle demande', ton: 'info' },
  { id: 'EN_VALIDATION', label: 'En attente de validation', ton: 'attente' },
  { id: 'DEVIS_TRANSMIS', label: 'Devis transmis', ton: 'attente' },
  { id: 'ATTENTE_PAIEMENT', label: 'En attente de paiement', ton: 'alerte' },
  { id: 'PAYEE', label: 'Payée', ton: 'succes' },
  { id: 'EN_PRODUCTION', label: 'En production', ton: 'production' },
  { id: 'CONTROLE_QUALITE', label: 'Contrôle qualité', ton: 'production' },
  { id: 'PRETE', label: 'Prête à livrer', ton: 'succes' },
  { id: 'LIVREE', label: 'Livrée', ton: 'neutre' },
  { id: 'ANNULEE', label: 'Annulée', ton: 'danger' },
];

export function estEtat(valeur: unknown): valeur is EtatGrandFormat {
  return ETATS.some((e) => e.id === valeur);
}

export type EtatCalcule = { id: EtatGrandFormat; label: string; ton: Ton; detail: string | null };

function etat(id: EtatGrandFormat, detail: string | null = null): EtatCalcule {
  const e = ETATS.find((x) => x.id === id)!;
  return { id, label: e.label, ton: e.ton, detail };
}

export function etatGrandFormat(statutDevis: StatutDevis, statutCommande?: StatutCommande | null): EtatCalcule {
  if (statutCommande) {
    switch (statutCommande) {
      case 'BROUILLON':
        return etat('ATTENTE_PAIEMENT', 'Commande à confirmer');
      case 'EN_ATTENTE_DE_VALIDATION':
        return etat('ATTENTE_PAIEMENT', 'Validation du client');
      case 'EN_ATTENTE_DE_PAIEMENT':
        return etat('ATTENTE_PAIEMENT');
      case 'PAYEE':
        return etat('PAYEE', 'Production à lancer');
      case 'A_PRODUIRE':
        return etat('EN_PRODUCTION', 'À lancer chez l’imprimeur');
      case 'EN_PRODUCTION':
        return etat('EN_PRODUCTION');
      case 'CONTROLE_QUALITE':
        return etat('CONTROLE_QUALITE');
      case 'PRETE':
        return etat('PRETE');
      case 'EN_LIVRAISON':
        return etat('PRETE', 'En cours de livraison');
      case 'LIVREE':
        return etat('LIVREE');
      case 'ANNULEE':
        return etat('ANNULEE', 'Commande annulée');
      case 'REMBOURSEMENT_A_TRAITER':
        return etat('ANNULEE', 'Remboursement à traiter');
    }
  }
  switch (statutDevis) {
    case 'NOUVEAU':
      return etat('NOUVELLE');
    case 'EN_ANALYSE':
      return etat('EN_VALIDATION');
    case 'PROPOSE':
      return etat('DEVIS_TRANSMIS');
    case 'ACCEPTE':
      return etat('ATTENTE_PAIEMENT', 'Devis accepté — commande à créer');
    case 'REFUSE':
      return etat('ANNULEE', 'Devis refusé');
    case 'EXPIRE':
      return etat('ANNULEE', 'Devis expiré');
  }
}

/* ---------------------------------------------------------- rentabilité ---- */

/** Étapes d'atelier créées pour une commande grand format (noms stables, uniques par commande). */
export const ETAPES_GRAND_FORMAT = {
  impression: 'Impression grand format',
  creation: 'Création graphique',
  livraison: 'Livraison',
  autres: 'Autres frais',
} as const;

export type PosteCout = keyof typeof ETAPES_GRAND_FORMAT;

export type Couts = Record<PosteCout, number | null>;

export const POSTES: { id: PosteCout; label: string }[] = [
  { id: 'impression', label: 'Coût imprimeur' },
  { id: 'creation', label: 'Création graphique' },
  { id: 'livraison', label: 'Livraison' },
  { id: 'autres', label: 'Autres dépenses' },
];

export type Rentabilite = {
  prixFcfa: number | null;
  coutsFcfa: number | null;
  margeFcfa: number | null;
  /** Marge / prix facturé ; `null` si le prix est nul ou inconnu. */
  taux: number | null;
  /** Postes de coût non renseignés : tant qu'il en manque, la marge est surestimée. */
  postesManquants: PosteCout[];
};

/** Somme des coûts renseignés ; `null` si aucun ne l'est. */
export function totalCouts(couts: Partial<Couts>): number | null {
  const valeurs = Object.values(couts).filter((v): v is number => typeof v === 'number');
  return valeurs.length ? valeurs.reduce((a, b) => a + b, 0) : null;
}

/** Marge brute = prix facturé − coûts directs de la commande. */
export function rentabilite(
  prixFcfa: number | null,
  couts: Partial<Couts>,
  postesAttendus: PosteCout[] = ['impression'],
): Rentabilite {
  const coutsFcfa = totalCouts(couts);
  const margeFcfa = prixFcfa !== null && coutsFcfa !== null ? prixFcfa - coutsFcfa : null;
  return {
    prixFcfa,
    coutsFcfa,
    margeFcfa,
    taux: margeFcfa !== null && prixFcfa ? margeFcfa / prixFcfa : null,
    postesManquants: postesAttendus.filter((p) => typeof couts[p] !== 'number'),
  };
}

/** Postes dont on attend un coût selon la prestation (la création n'existe que si demandée). */
export function postesAttendus(prestation: PrestationId): PosteCout[] {
  return prestation === 'CREATION' ? ['impression', 'creation'] : ['impression'];
}

type TacheCout = { etape: string; cout_fcfa: number | null };

/**
 * Coûts réels d'une commande, ventilés par poste depuis ses tâches d'atelier. Toute autre
 * tâche chiffrée (reprise, étape ajoutée par l'atelier) est comptée en « autres dépenses » :
 * le total reste égal au coût de la commande calculé par la base.
 */
export function coutsDepuisTaches(taches: TacheCout[]): Couts {
  const couts: Couts = { impression: null, creation: null, livraison: null, autres: null };
  for (const t of taches) {
    if (typeof t.cout_fcfa !== 'number') continue;
    const poste = (Object.entries(ETAPES_GRAND_FORMAT).find(([, nom]) => nom === t.etape)?.[0] ?? 'autres') as PosteCout;
    couts[poste] = (couts[poste] ?? 0) + t.cout_fcfa;
  }
  return couts;
}

/* --------------------------------------------------- proposition commerciale ---- */

export type ElementsProposition = {
  usage: UsageId;
  support: SupportId;
  supportPrecision?: string | null;
  largeurM: number;
  hauteurM: number;
  quantite: number;
  finition: FinitionId;
  finitionPrecision?: string | null;
  prestation: PrestationId;
  prixImpressionFcfa: number;
  fraisCreationFcfa: number | null;
  productionPrevueLe: string | null;
  livraisonPrevueLe: string | null;
  validiteJours?: number;
};

function montant(n: number): string {
  return `${n.toLocaleString('fr-FR').replace(/ | /g, ' ')} FCFA`;
}

function jour(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
}

/** Prix de vente = impression + création facturée. */
export function prixVente(prixImpressionFcfa: number | null, fraisCreationFcfa: number | null): number | null {
  if (prixImpressionFcfa === null && fraisCreationFcfa === null) return null;
  return (prixImpressionFcfa ?? 0) + (fraisCreationFcfa ?? 0);
}

/**
 * Texte de la proposition envoyée au client. Il ne contient QUE des éléments publics : jamais
 * le nom de l'imprimeur, jamais un coût, jamais une marge.
 */
export function genererProposition(e: ElementsProposition): string {
  const support = e.support === 'AUTRE' && e.supportPrecision ? e.supportPrecision : libelleSupport(e.support);
  const finition = e.finition === 'AUTRE' && e.finitionPrecision ? e.finitionPrecision : libelleFinition(e.finition);
  const total = prixVente(e.prixImpressionFcfa, e.fraisCreationFcfa) ?? 0;
  const lignes = [
    `${support} — ${libelleUsage(e.usage)}`,
    '',
    `• Format : ${formatDimensions(e.largeurM, e.hauteurM)} (${formatSurface(surfaceM2(e.largeurM, e.hauteurM))} par pièce)`,
    `• Quantité : ${e.quantite}`,
    `• Finition : ${finition}`,
    `• Prestation : ${libellePrestation(e.prestation)}`,
    '',
    `Impression : ${montant(e.prixImpressionFcfa)}`,
  ];
  if (e.fraisCreationFcfa) lignes.push(`Création graphique : ${montant(e.fraisCreationFcfa)}`);
  lignes.push(`Total : ${montant(total)}, hors livraison.`);
  const dates = [
    e.productionPrevueLe ? `production prévue le ${jour(e.productionPrevueLe)}` : null,
    e.livraisonPrevueLe ? `livraison prévue le ${jour(e.livraisonPrevueLe)}` : null,
  ].filter(Boolean);
  if (dates.length) lignes.push('', `Planning : ${dates.join(', ')}.`);
  lignes.push(
    '',
    e.prestation === 'FICHIER_PRET'
      ? 'Votre fichier est contrôlé avant impression ; nous vous prévenons si une correction est nécessaire.'
      : 'Une maquette vous est soumise pour validation avant toute impression.',
    `Proposition valable ${e.validiteJours ?? 15} jours.`,
  );
  return lignes.join('\n');
}
