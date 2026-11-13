/**
 * Cycle de vie et libellés des statuts, côté back-office.
 *
 * `TRANSITIONS_COMMANDE` reflète exactement `public.transition_commande_autorisee` (migration
 * 0003). La base reste l'arbitre : une transition absente ici serait de toute façon refusée.
 * Le test `adminStatuts.test.ts` vérifie l'alignement avec le SQL.
 */

import type { RoleStaff } from '@/server/auth/roles';

export type StatutCommande =
  | 'BROUILLON'
  | 'EN_ATTENTE_DE_VALIDATION'
  | 'EN_ATTENTE_DE_PAIEMENT'
  | 'PAYEE'
  | 'A_PRODUIRE'
  | 'EN_PRODUCTION'
  | 'CONTROLE_QUALITE'
  | 'PRETE'
  | 'EN_LIVRAISON'
  | 'LIVREE'
  | 'ANNULEE'
  | 'REMBOURSEMENT_A_TRAITER';

export type StatutPaiement = 'NON_REQUIS' | 'EN_ATTENTE' | 'PAYE' | 'ECHEC' | 'ANOMALIE' | 'REMBOURSE';
export type StatutProduction = 'A_FAIRE' | 'EN_COURS' | 'TERMINE' | 'BLOQUE' | 'ANNULE';
export type StatutDevis = 'NOUVEAU' | 'EN_ANALYSE' | 'PROPOSE' | 'ACCEPTE' | 'REFUSE' | 'EXPIRE';
export type TypeClient = 'PARTICULIER' | 'ENTREPRISE' | 'ASSOCIATION' | 'ECOLE' | 'AUTRE';

/** Ton visuel d'un badge. */
export type Ton = 'neutre' | 'info' | 'attente' | 'succes' | 'alerte' | 'danger' | 'production';

export const STATUTS_COMMANDE: { id: StatutCommande; label: string; ton: Ton }[] = [
  { id: 'BROUILLON', label: 'Brouillon', ton: 'neutre' },
  { id: 'EN_ATTENTE_DE_VALIDATION', label: 'À valider', ton: 'attente' },
  { id: 'EN_ATTENTE_DE_PAIEMENT', label: 'En attente de paiement', ton: 'attente' },
  { id: 'PAYEE', label: 'Payée', ton: 'succes' },
  { id: 'A_PRODUIRE', label: 'À produire', ton: 'production' },
  { id: 'EN_PRODUCTION', label: 'En production', ton: 'production' },
  { id: 'CONTROLE_QUALITE', label: 'Contrôle qualité', ton: 'production' },
  { id: 'PRETE', label: 'Prête', ton: 'info' },
  { id: 'EN_LIVRAISON', label: 'En livraison', ton: 'info' },
  { id: 'LIVREE', label: 'Livrée', ton: 'succes' },
  { id: 'ANNULEE', label: 'Annulée', ton: 'danger' },
  { id: 'REMBOURSEMENT_A_TRAITER', label: 'Remboursement à traiter', ton: 'alerte' },
];

export const TRANSITIONS_COMMANDE: Record<StatutCommande, StatutCommande[]> = {
  BROUILLON: ['EN_ATTENTE_DE_VALIDATION', 'EN_ATTENTE_DE_PAIEMENT', 'ANNULEE'],
  EN_ATTENTE_DE_VALIDATION: ['EN_ATTENTE_DE_PAIEMENT', 'BROUILLON', 'ANNULEE'],
  EN_ATTENTE_DE_PAIEMENT: ['PAYEE', 'ANNULEE', 'EN_ATTENTE_DE_VALIDATION'],
  PAYEE: ['A_PRODUIRE', 'REMBOURSEMENT_A_TRAITER'],
  A_PRODUIRE: ['EN_PRODUCTION', 'REMBOURSEMENT_A_TRAITER'],
  EN_PRODUCTION: ['CONTROLE_QUALITE', 'A_PRODUIRE'],
  CONTROLE_QUALITE: ['PRETE', 'EN_PRODUCTION'],
  PRETE: ['EN_LIVRAISON', 'CONTROLE_QUALITE'],
  EN_LIVRAISON: ['LIVREE', 'PRETE'],
  LIVREE: ['REMBOURSEMENT_A_TRAITER'],
  ANNULEE: [],
  REMBOURSEMENT_A_TRAITER: ['ANNULEE'],
};

/**
 * Statuts qu'un rôle peut poser à la main. `PAYEE` n'est jamais manuel : il découle d'un
 * paiement confirmé (trigger de synchronisation) ou de la confirmation d'encaissement.
 */
export const STATUTS_PAR_ROLE: Record<RoleStaff, readonly StatutCommande[]> = {
  admin: [
    'BROUILLON', 'EN_ATTENTE_DE_VALIDATION', 'EN_ATTENTE_DE_PAIEMENT', 'A_PRODUIRE',
    'EN_PRODUCTION', 'CONTROLE_QUALITE', 'PRETE', 'EN_LIVRAISON', 'LIVREE', 'ANNULEE',
    'REMBOURSEMENT_A_TRAITER',
  ],
  commercial: [
    'BROUILLON', 'EN_ATTENTE_DE_VALIDATION', 'EN_ATTENTE_DE_PAIEMENT', 'A_PRODUIRE',
    'EN_LIVRAISON', 'LIVREE', 'ANNULEE',
  ],
  atelier: ['A_PRODUIRE', 'EN_PRODUCTION', 'CONTROLE_QUALITE', 'PRETE', 'EN_LIVRAISON', 'LIVREE'],
  finance: ['ANNULEE', 'REMBOURSEMENT_A_TRAITER'],
};

export function transitionsPossibles(statut: StatutCommande, role: RoleStaff): StatutCommande[] {
  const permis = STATUTS_PAR_ROLE[role];
  return (TRANSITIONS_COMMANDE[statut] ?? []).filter((s) => permis.includes(s));
}

export function transitionPermise(de: StatutCommande, vers: StatutCommande, role: RoleStaff): boolean {
  return transitionsPossibles(de, role).includes(vers);
}

export function estStatutCommande(valeur: unknown): valeur is StatutCommande {
  return typeof valeur === 'string' && STATUTS_COMMANDE.some((s) => s.id === valeur);
}

/** Statuts que l'atelier traite (vue atelier). */
export const STATUTS_ATELIER: readonly StatutCommande[] = [
  'PAYEE', 'A_PRODUIRE', 'EN_PRODUCTION', 'CONTROLE_QUALITE', 'PRETE',
];

export const STATUTS_PAIEMENT: { id: StatutPaiement; label: string; ton: Ton }[] = [
  { id: 'NON_REQUIS', label: 'Non requis', ton: 'neutre' },
  { id: 'EN_ATTENTE', label: 'En attente', ton: 'attente' },
  { id: 'PAYE', label: 'Payé', ton: 'succes' },
  { id: 'ECHEC', label: 'Échec', ton: 'danger' },
  { id: 'ANOMALIE', label: 'Anomalie', ton: 'alerte' },
  { id: 'REMBOURSE', label: 'Remboursé', ton: 'neutre' },
];

export function estStatutPaiement(valeur: unknown): valeur is StatutPaiement {
  return typeof valeur === 'string' && STATUTS_PAIEMENT.some((s) => s.id === valeur);
}

export const STATUTS_PRODUCTION: { id: StatutProduction; label: string; ton: Ton }[] = [
  { id: 'A_FAIRE', label: 'À faire', ton: 'attente' },
  { id: 'EN_COURS', label: 'En cours', ton: 'production' },
  { id: 'TERMINE', label: 'Terminé', ton: 'succes' },
  { id: 'BLOQUE', label: 'Bloqué', ton: 'danger' },
  { id: 'ANNULE', label: 'Annulé', ton: 'neutre' },
];

export function estStatutProduction(valeur: unknown): valeur is StatutProduction {
  return typeof valeur === 'string' && STATUTS_PRODUCTION.some((s) => s.id === valeur);
}

export const STATUTS_DEVIS: { id: StatutDevis; label: string; ton: Ton }[] = [
  { id: 'NOUVEAU', label: 'Nouveau', ton: 'info' },
  { id: 'EN_ANALYSE', label: 'En analyse', ton: 'attente' },
  { id: 'PROPOSE', label: 'Proposé', ton: 'production' },
  { id: 'ACCEPTE', label: 'Accepté', ton: 'succes' },
  { id: 'REFUSE', label: 'Refusé', ton: 'danger' },
  { id: 'EXPIRE', label: 'Expiré', ton: 'neutre' },
];

export function estStatutDevis(valeur: unknown): valeur is StatutDevis {
  return typeof valeur === 'string' && STATUTS_DEVIS.some((s) => s.id === valeur);
}

export const TYPES_CLIENT: { id: TypeClient; label: string; professionnel: boolean }[] = [
  { id: 'PARTICULIER', label: 'Particulier', professionnel: false },
  { id: 'ENTREPRISE', label: 'Entreprise', professionnel: true },
  { id: 'ASSOCIATION', label: 'Association', professionnel: true },
  { id: 'ECOLE', label: 'École', professionnel: true },
  { id: 'AUTRE', label: 'Autre', professionnel: false },
];

export function estTypeClient(valeur: unknown): valeur is TypeClient {
  return typeof valeur === 'string' && TYPES_CLIENT.some((t) => t.id === valeur);
}

export function estProfessionnel(type: string): boolean {
  return TYPES_CLIENT.find((t) => t.id === type)?.professionnel ?? false;
}

type Libelle = { id: string; label: string; ton: Ton };

function chercher(liste: Libelle[], id: string): Libelle {
  return liste.find((s) => s.id === id) ?? { id, label: id, ton: 'neutre' };
}

export const libelleCommande = (id: string) => chercher(STATUTS_COMMANDE, id);
export const libellePaiement = (id: string) => chercher(STATUTS_PAIEMENT, id);
export const libelleProduction = (id: string) => chercher(STATUTS_PRODUCTION, id);
export const libelleDevis = (id: string) => chercher(STATUTS_DEVIS, id);
export const libelleTypeClient = (id: string) =>
  TYPES_CLIENT.find((t) => t.id === id)?.label ?? id;

export const MODES_PAIEMENT = [
  { id: 'MTN_MOMO', label: 'MTN Mobile Money' },
  { id: 'AIRTEL_MONEY', label: 'Airtel Money' },
  { id: 'ESPECES', label: 'Espèces' },
  { id: 'VIREMENT', label: 'Virement' },
  { id: 'A_CONFIRMER', label: 'À confirmer' },
] as const;

export type ModePaiement = (typeof MODES_PAIEMENT)[number]['id'];

export function libelleMode(id: string): string {
  return MODES_PAIEMENT.find((m) => m.id === id)?.label ?? id;
}

export function estModePaiement(valeur: unknown): valeur is ModePaiement {
  return typeof valeur === 'string' && MODES_PAIEMENT.some((m) => m.id === valeur);
}

export const FAMILLES = [
  { id: 'TEXTILE', label: 'Textile' },
  { id: 'TABLEAUX', label: 'Tableaux' },
  { id: 'IMPRESSION', label: 'Impression' },
  { id: 'SERVICES', label: 'Services' },
] as const;

export type Famille = (typeof FAMILLES)[number]['id'];

export function estFamille(valeur: unknown): valeur is Famille {
  return typeof valeur === 'string' && FAMILLES.some((f) => f.id === valeur);
}

export function libelleFamille(id: string): string {
  return FAMILLES.find((f) => f.id === id)?.label ?? id;
}
