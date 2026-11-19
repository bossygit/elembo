/**
 * Droits du portail partenaire, par rôle au sein de l'entreprise.
 *
 * Même principe que `src/lib/admin/permissions.ts` : une matrice pure, utilisée à la fois par
 * le contrôle serveur (`exigerPartenaire`) et par l'affichage. Masquer un bouton ne protège
 * rien : chaque page et chaque action revérifient le droit.
 *
 * Le rôle vient de `partenaire_utilisateurs.role_partenaire` (écrit par le serveur), jamais de
 * `user_metadata` ni d'un champ de formulaire.
 */

import { accesPortail, type StatutPartenaire } from './statuts';

export type RolePartenaire = 'RESPONSABLE' | 'PRODUCTION' | 'LECTURE';

export const ROLES_PARTENAIRE: { id: RolePartenaire; label: string; description: string }[] = [
  { id: 'RESPONSABLE', label: 'Responsable', description: 'Gère l’entreprise, les utilisateurs, les tarifs et la validation.' },
  { id: 'PRODUCTION', label: 'Production', description: 'Déclare l’état des machines et les disponibilités.' },
  { id: 'LECTURE', label: 'Lecture', description: 'Consulte le dossier de l’entreprise, sans rien modifier.' },
];

const TOUS = ['RESPONSABLE', 'PRODUCTION', 'LECTURE'] as const satisfies readonly RolePartenaire[];

export const DROITS = {
  'entreprise.voir': TOUS,
  'entreprise.modifier': ['RESPONSABLE'],
  'utilisateurs.gerer': ['RESPONSABLE'],
  'machines.voir': TOUS,
  'machines.modifier': ['RESPONSABLE'],
  /** État de fonctionnement et dates de maintenance seulement (pas les valeurs techniques). */
  'machines.etat': ['RESPONSABLE', 'PRODUCTION'],
  'capacites.voir': TOUS,
  'capacites.modifier': ['RESPONSABLE'],
  'services.voir': TOUS,
  'services.modifier': ['RESPONSABLE'],
  /** Tarifs négociés : confidentiels, même au sein de l'entreprise (aligné sur la RLS). */
  'tarifs.voir': ['RESPONSABLE'],
  'tarifs.proposer': ['RESPONSABLE'],
  'disponibilites.voir': TOUS,
  'disponibilites.declarer': ['RESPONSABLE', 'PRODUCTION'],
  'fichiers.envoyer': ['RESPONSABLE', 'PRODUCTION'],
  'validation.soumettre': ['RESPONSABLE'],
  /* Travaux affectés (Lot 2) : jamais accordés à un dossier non validé (voir DROITS_DOSSIER). */
  'travaux.voir': TOUS,
  'travaux.decider': ['RESPONSABLE'],
  'travaux.executer': ['RESPONSABLE', 'PRODUCTION'],
  'travaux.montant': ['RESPONSABLE'],
} as const satisfies Record<string, readonly RolePartenaire[]>;

export type DroitPartenaire = keyof typeof DROITS;

/**
 * Droits ouverts tant que le dossier n'est pas validé (compléter, corriger).
 *
 * Liste explicite, jamais `Object.keys(DROITS)` : les droits des travaux affectés (`travaux.*`,
 * Lot 2) n'en font pas partie, un partenaire non validé ne reçoit aucun travail. Un test vérifie
 * qu'aucun droit `travaux.*` ne fuit dans cette liste.
 */
const DROITS_DOSSIER: readonly DroitPartenaire[] = [
  'entreprise.voir',
  'entreprise.modifier',
  'utilisateurs.gerer',
  'machines.voir',
  'machines.modifier',
  'machines.etat',
  'capacites.voir',
  'capacites.modifier',
  'services.voir',
  'services.modifier',
  'tarifs.voir',
  'tarifs.proposer',
  'disponibilites.voir',
  'disponibilites.declarer',
  'fichiers.envoyer',
  'validation.soumettre',
];

export function estRolePartenaire(v: unknown): v is RolePartenaire {
  return typeof v === 'string' && (TOUS as readonly string[]).includes(v);
}

/**
 * Le rôle a-t-il ce droit, compte tenu du statut de l'entreprise ? Une entreprise suspendue ou
 * archivée n'a plus aucun droit.
 */
export function peutPartenaire(
  role: RolePartenaire | null | undefined,
  droit: DroitPartenaire,
  statut: StatutPartenaire,
): boolean {
  if (!role) return false;
  const acces = accesPortail(statut);
  if (acces === 'aucun') return false;
  if (acces === 'dossier' && !DROITS_DOSSIER.includes(droit)) return false;
  return (DROITS[droit] as readonly RolePartenaire[]).includes(role);
}

export function droitsDu(role: RolePartenaire, statut: StatutPartenaire): DroitPartenaire[] {
  return (Object.keys(DROITS) as DroitPartenaire[]).filter((d) => peutPartenaire(role, d, statut));
}
