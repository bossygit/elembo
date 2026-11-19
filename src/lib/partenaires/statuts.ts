/**
 * Cycles de vie d'Elembo Partners : entreprise partenaire, éléments validés (machine, capacité,
 * service) et tarifs.
 *
 * `TRANSITIONS_PARTENAIRE` et `TRANSITIONS_TARIF` reflètent exactement
 * `public.transition_partenaire_autorisee` et `public.transition_tarif_autorisee` (migration
 * 0012). La base reste l'arbitre ; `partenairesDomaine.test.ts` vérifie l'alignement.
 */

import type { Ton } from '@/lib/admin/statuts';

/* -------------------------------------------------------------- entreprise -- */

export type StatutPartenaire =
  | 'BROUILLON'
  | 'EN_ATTENTE_VALIDATION'
  | 'VALIDE'
  | 'SUSPENDU'
  | 'REFUSE'
  | 'ARCHIVE';

export const STATUTS_PARTENAIRE: { id: StatutPartenaire; label: string; ton: Ton }[] = [
  { id: 'BROUILLON', label: 'Dossier à compléter', ton: 'neutre' },
  { id: 'EN_ATTENTE_VALIDATION', label: 'En attente de validation', ton: 'attente' },
  { id: 'VALIDE', label: 'Validé', ton: 'succes' },
  { id: 'SUSPENDU', label: 'Suspendu', ton: 'danger' },
  { id: 'REFUSE', label: 'Refusé', ton: 'alerte' },
  { id: 'ARCHIVE', label: 'Archivé', ton: 'neutre' },
];

export const TRANSITIONS_PARTENAIRE: Record<StatutPartenaire, StatutPartenaire[]> = {
  BROUILLON: ['EN_ATTENTE_VALIDATION', 'VALIDE', 'ARCHIVE'],
  EN_ATTENTE_VALIDATION: ['VALIDE', 'REFUSE', 'BROUILLON', 'ARCHIVE'],
  REFUSE: ['EN_ATTENTE_VALIDATION', 'ARCHIVE'],
  VALIDE: ['SUSPENDU', 'ARCHIVE'],
  SUSPENDU: ['VALIDE', 'ARCHIVE'],
  ARCHIVE: ['VALIDE'],
};

/** Décisions que Smart Vision peut prendre (la soumission est l'acte du partenaire). */
export type DecisionPartenaire = 'VALIDE' | 'REFUSE' | 'BROUILLON' | 'SUSPENDU' | 'ARCHIVE';

/** Décisions qui exigent un motif, communiqué au partenaire. */
export const DECISIONS_AVEC_MOTIF: readonly DecisionPartenaire[] = ['REFUSE', 'BROUILLON', 'SUSPENDU'];

export function estStatutPartenaire(v: unknown): v is StatutPartenaire {
  return typeof v === 'string' && STATUTS_PARTENAIRE.some((s) => s.id === v);
}

export function transitionPartenairePermise(de: StatutPartenaire, vers: StatutPartenaire): boolean {
  return TRANSITIONS_PARTENAIRE[de].includes(vers);
}

/** Décisions proposées au staff depuis un statut donné. */
export function decisionsPossibles(de: StatutPartenaire): DecisionPartenaire[] {
  return TRANSITIONS_PARTENAIRE[de].filter((s): s is DecisionPartenaire => s !== 'EN_ATTENTE_VALIDATION');
}

/** Le partenaire peut-il (re)soumettre son dossier ? */
export function soumissionPossible(statut: StatutPartenaire): boolean {
  return statut === 'BROUILLON' || statut === 'REFUSE';
}

/** Règle d'affectation : seule une entreprise validée ET active reçoit des travaux. */
export function partenaireAffectable(p: { statut: StatutPartenaire; actif: boolean }): boolean {
  return p.statut === 'VALIDE' && p.actif;
}

/**
 * Étendue de l'accès au portail selon le statut de l'entreprise (docs/elembo-partners.md §3.2) :
 *  - `complet` : tout le portail ;
 *  - `dossier` : compléter ou corriger son dossier (profil, machines, capacités, tarifs…) ;
 *  - `aucun`   : entreprise suspendue ou archivée — plus rien n'est lisible.
 */
export type AccesPortail = 'complet' | 'dossier' | 'aucun';

export function accesPortail(statut: StatutPartenaire): AccesPortail {
  if (statut === 'VALIDE') return 'complet';
  if (statut === 'SUSPENDU' || statut === 'ARCHIVE') return 'aucun';
  return 'dossier';
}

/* ------------------------------------------- machines, capacités, services -- */

export type StatutValidation = 'A_VALIDER' | 'VALIDEE' | 'REFUSEE';

export const STATUTS_VALIDATION: { id: StatutValidation; label: string; ton: Ton }[] = [
  { id: 'A_VALIDER', label: 'À valider', ton: 'attente' },
  { id: 'VALIDEE', label: 'Validée', ton: 'succes' },
  { id: 'REFUSEE', label: 'Refusée', ton: 'alerte' },
];

/* ------------------------------------------------------------------ tarifs -- */

export type StatutTarif = 'PROPOSE' | 'MODIFICATION_DEMANDEE' | 'VALIDE' | 'REFUSE' | 'REMPLACE' | 'RETIRE';

export const STATUTS_TARIF: { id: StatutTarif; label: string; ton: Ton }[] = [
  { id: 'PROPOSE', label: 'Proposé', ton: 'attente' },
  { id: 'MODIFICATION_DEMANDEE', label: 'Modification demandée', ton: 'alerte' },
  { id: 'VALIDE', label: 'Validé', ton: 'succes' },
  { id: 'REFUSE', label: 'Refusé', ton: 'danger' },
  { id: 'REMPLACE', label: 'Remplacé', ton: 'neutre' },
  { id: 'RETIRE', label: 'Retiré', ton: 'neutre' },
];

export const TRANSITIONS_TARIF: Record<StatutTarif, StatutTarif[]> = {
  PROPOSE: ['VALIDE', 'REFUSE', 'MODIFICATION_DEMANDEE', 'RETIRE'],
  MODIFICATION_DEMANDEE: ['PROPOSE', 'RETIRE'],
  VALIDE: ['REMPLACE', 'RETIRE'],
  REFUSE: [],
  REMPLACE: [],
  RETIRE: [],
};

/** Un tarif encore en discussion peut être modifié ; au-delà, il faut une nouvelle version. */
export function tarifModifiable(statut: StatutTarif): boolean {
  return statut === 'PROPOSE' || statut === 'MODIFICATION_DEMANDEE';
}

export function transitionTarifPermise(de: StatutTarif, vers: StatutTarif): boolean {
  return TRANSITIONS_TARIF[de].includes(vers);
}

/* ---------------------------------------------------------------- libellés -- */

const libelle = <T extends string>(liste: { id: T; label: string; ton: Ton }[]) => {
  const m = new Map(liste.map((s) => [s.id, s]));
  return (id: T) => m.get(id) ?? { id, label: id, ton: 'neutre' as Ton };
};

export const statutPartenaire = libelle(STATUTS_PARTENAIRE);
export const statutValidation = libelle(STATUTS_VALIDATION);
export const statutTarif = libelle(STATUTS_TARIF);
