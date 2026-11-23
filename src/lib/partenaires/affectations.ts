/**
 * Lot 2 — affectations : statuts, transitions, sources de tarif et calcul du montant.
 *
 * La base reste l'arbitre (`transition_affectation_autorisee`, contraintes, triggers) ; ce
 * module aligne l'affichage du back-office et les actions serveur, et calcule le montant à
 * partir du tarif validé. Il est testé par `tests/partenairesAffectations.test.ts`, qui vérifie
 * aussi l'alignement avec la migration `20261119120000_affectations.sql`.
 */

import type { Ton } from '@/lib/admin/statuts';

import { prixPourQuantite, type Palier, type VersionTarif } from './paliers';

export type ObjetAffectation = 'TACHE_PRODUCTION' | 'BANDEROLE';

export const OBJETS_AFFECTATION: { id: ObjetAffectation; label: string }[] = [
  { id: 'TACHE_PRODUCTION', label: 'Tâche de production' },
  { id: 'BANDEROLE', label: 'Banderole' },
];

export type StatutAffectation = 'PROPOSEE' | 'ACCEPTEE' | 'REFUSEE' | 'ANNULEE' | 'EXPIREE' | 'TERMINEE';

export const STATUTS_AFFECTATION: { id: StatutAffectation; label: string; ton: Ton }[] = [
  { id: 'PROPOSEE', label: 'En attente de réponse', ton: 'attente' },
  { id: 'ACCEPTEE', label: 'Acceptée', ton: 'succes' },
  { id: 'REFUSEE', label: 'Refusée', ton: 'alerte' },
  { id: 'ANNULEE', label: 'Annulée', ton: 'neutre' },
  { id: 'EXPIREE', label: 'Expirée', ton: 'danger' },
  { id: 'TERMINEE', label: 'Terminée', ton: 'production' },
];

/** Reflète `public.transition_affectation_autorisee` (migration 0013). */
export const TRANSITIONS_AFFECTATION: Record<StatutAffectation, StatutAffectation[]> = {
  PROPOSEE: ['ACCEPTEE', 'REFUSEE', 'ANNULEE', 'EXPIREE'],
  ACCEPTEE: ['ANNULEE', 'TERMINEE'],
  REFUSEE: [],
  ANNULEE: [],
  EXPIREE: [],
  TERMINEE: [],
};

export function estStatutAffectation(v: unknown): v is StatutAffectation {
  return typeof v === 'string' && STATUTS_AFFECTATION.some((s) => s.id === v);
}

export function statutAffectation(v: StatutAffectation) {
  return STATUTS_AFFECTATION.find((s) => s.id === v) ?? STATUTS_AFFECTATION[0];
}

export function transitionAffectationPermise(de: StatutAffectation, vers: StatutAffectation): boolean {
  return TRANSITIONS_AFFECTATION[de].includes(vers);
}

/** Une affectation qui occupe encore le travail (index unique partiel de la base). */
export function affectationActive(statut: StatutAffectation): boolean {
  return statut === 'PROPOSEE' || statut === 'ACCEPTEE';
}

/**
 * Suivi d'un travail (tâche ou banderole) à partir de toutes ses affectations : celle qui
 * l'occupe encore, et la plus récente — pour montrer au staff un refus, une expiration, une
 * annulation ou une fin signalée au lieu de les faire disparaître.
 */
export function suiviAffectations<T extends { statut: string; cree_le: string }>(
  affectations: readonly T[],
): { active: T | null; derniere: T | null } {
  const triees = [...affectations].sort((a, b) => b.cree_le.localeCompare(a.cree_le));
  const active = triees.find((a) => estStatutAffectation(a.statut) && affectationActive(a.statut)) ?? null;
  return { active, derniere: active ?? triees[0] ?? null };
}

/* ------------------------------------------------------------- priorité -- */

export type PrioriteAffectation = 'NORMALE' | 'URGENTE';

export const PRIORITES_AFFECTATION: { id: PrioriteAffectation; label: string; ton: Ton }[] = [
  { id: 'NORMALE', label: 'Normale', ton: 'neutre' },
  { id: 'URGENTE', label: 'Urgente', ton: 'alerte' },
];

export function estPrioriteAffectation(v: unknown): v is PrioriteAffectation {
  return v === 'NORMALE' || v === 'URGENTE';
}

/* ---------------------------------------------------------- source tarif -- */

export type SourceTarif = 'TARIF_VALIDE' | 'ANCIEN_PRIX' | 'MANUEL' | 'SUR_DEVIS';

export const SOURCES_TARIF: { id: SourceTarif; label: string; description: string }[] = [
  { id: 'TARIF_VALIDE', label: 'Tarif validé', description: 'Tarif négocié validé et en vigueur.' },
  { id: 'ANCIEN_PRIX', label: 'Ancien prix', description: 'Ancien prix au m² de la fiche, non validé.' },
  { id: 'MANUEL', label: 'Montant négocié', description: 'Négociation ponctuelle ; motif obligatoire.' },
  { id: 'SUR_DEVIS', label: 'Prix provisoire', description: 'Prix non arrêté, strictement positif ; motif obligatoire.' },
];

export function libelleSourceTarif(source: SourceTarif): string {
  return SOURCES_TARIF.find((s) => s.id === source)?.label ?? source;
}

/* ------------------------------------------------------------- montants -- */

export type TarifAffectation = {
  id: string;
  ligneeId: string;
  version: number;
  nom: string;
  modeCalcul: string;
  nature: string;
  prixFcfa: number | null;
  conditions: string | null;
  capaciteId: string | null;
  serviceId: string | null;
  paliers: Palier[];
};

export function depuisVersionTarif(v: VersionTarif): TarifAffectation {
  return {
    id: v.id,
    ligneeId: v.lignee_id,
    version: v.version,
    nom: v.nom,
    modeCalcul: v.mode_calcul,
    nature: v.nature,
    prixFcfa: v.prix_fcfa,
    conditions: v.conditions,
    capaciteId: v.capacite_id,
    serviceId: v.service_id,
    paliers: v.paliers,
  };
}

/** Un tarif est utilisable s'il est validé et en vigueur à la date donnée (`YYYY-MM-DD`). */
export function tarifEnVigueur(v: Pick<VersionTarif, 'valide_du' | 'valide_jusquau'>, aujourdhui: string): boolean {
  return (v.valide_du === null || v.valide_du <= aujourdhui) && (v.valide_jusquau === null || v.valide_jusquau >= aujourdhui);
}

/** Versions validées en vigueur d'un atelier, une par lignée. */
export function tarifsAffectables(
  lignees: readonly { enVigueur: VersionTarif | null }[],
  aujourdhui: string,
): TarifAffectation[] {
  return lignees.flatMap((l) => {
    const v = l.enVigueur;
    if (!v || !tarifEnVigueur(v, aujourdhui)) return [];
    return [depuisVersionTarif(v)];
  });
}

export type ResultatMontant =
  | { type: 'MONTANT'; montantFcfa: number; prixUnitaireFcfa: number; quantitePalier: number }
  | { type: 'ERREUR'; motif: string };

const arrondiCent = (n: number) => Math.ceil(n / 100) * 100;

/**
 * Montant d'une affectation à partir d'un tarif validé. La quantité de base est la surface (m²)
 * pour `AU_M2`, la quantité de pièces pour `A_LA_PIECE`, etc. Les paliers s'appliquent à la
 * quantité entière arrondie au supérieur ; le montant est arrondi à la centaine supérieure,
 * comme le calcul du coût banderole.
 */
export function calculerMontant(
  tarif: Pick<TarifAffectation, 'prixFcfa' | 'paliers'>,
  quantiteBase: number,
): ResultatMontant {
  if (!(quantiteBase > 0)) return { type: 'ERREUR', motif: 'La quantité de base doit être strictement positive.' };
  const quantitePalier = Math.max(1, Math.ceil(quantiteBase));
  const prix = prixPourQuantite(tarif.prixFcfa, tarif.paliers, quantitePalier);
  if (prix.type === 'PRIX') {
    const montant = arrondiCent(prix.prixUnitaireFcfa * quantiteBase);
    if (!(montant > 0)) return { type: 'ERREUR', motif: 'Le montant calculé est nul.' };
    return { type: 'MONTANT', montantFcfa: montant, prixUnitaireFcfa: prix.prixUnitaireFcfa, quantitePalier };
  }
  if (prix.type === 'NEGOCIATION') return { type: 'ERREUR', motif: 'Ce tarif se négocie à partir de cette quantité : saisissez un montant.' };
  if (prix.type === 'SOUS_MINIMUM') return { type: 'ERREUR', motif: `Quantité inférieure au minimum du tarif (${prix.quantiteMin}).` };
  return { type: 'ERREUR', motif: 'Aucun prix applicable pour cette quantité.' };
}

/** La date limite de réponse doit rester au moins une heure dans le futur (règle SQL). */
export function dateLimiteValide(valeur: string | null | undefined, maintenant: Date = new Date()): boolean {
  if (!valeur) return true;
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() > maintenant.getTime() + 60 * 60 * 1000;
}
