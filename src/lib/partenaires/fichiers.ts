/**
 * Fichiers du dossier partenaire (logo, photos d'atelier et de machines, réalisations,
 * documents) — règles pures, testées par `partenairesFichiers.test.ts`.
 *
 * Le chemin d'un objet dans le bucket privé `partenaires` est TOUJOURS fabriqué par le serveur :
 * `{partenaire_id}/{TYPE}/{uuid}.{ext}`. Le préfixe d'entreprise est imposé par la base
 * (contrainte `partenaire_fichiers_chemin`) et revérifié avant toute écriture.
 */

import type { TypeFichierPartenaire } from './catalogue';
import type { DroitPartenaire } from './droits';

export const TYPES_MIME_FICHIER = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
} as const;

export type MimeFichier = keyof typeof TYPES_MIME_FICHIER;

/** Nombre maximal de fichiers conservés, par type (machines : par machine). */
export const QUOTAS: Record<TypeFichierPartenaire, number> = {
  LOGO: 1,
  ATELIER: 12,
  MACHINE: 6,
  PORTFOLIO: 20,
  DOCUMENT: 10,
};

/** Types acceptés pour chaque catégorie (les documents peuvent être des PDF). */
export const MIMES_PAR_TYPE: Record<TypeFichierPartenaire, readonly MimeFichier[]> = {
  LOGO: ['image/jpeg', 'image/png', 'image/webp'],
  ATELIER: ['image/jpeg', 'image/png', 'image/webp'],
  MACHINE: ['image/jpeg', 'image/png', 'image/webp'],
  PORTFOLIO: ['image/jpeg', 'image/png', 'image/webp'],
  DOCUMENT: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
};

/**
 * Droit requis pour envoyer ou retirer un fichier : les photos de machines suivent l'état des
 * machines (opérateur compris) ; le reste fait partie de la fiche de l'entreprise.
 */
export function droitPourType(type: TypeFichierPartenaire): DroitPartenaire {
  return type === 'MACHINE' ? 'machines.etat' : 'entreprise.modifier';
}

export function estTypeFichier(v: unknown): v is TypeFichierPartenaire {
  return typeof v === 'string' && v in QUOTAS;
}

export function estMimeFichier(v: unknown): v is MimeFichier {
  return typeof v === 'string' && v in TYPES_MIME_FICHIER;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export function cheminFichier(partenaireId: string, type: TypeFichierPartenaire, id: string, mime: MimeFichier): string {
  return `${partenaireId}/${type}/${id}.${TYPES_MIME_FICHIER[mime]}`;
}

/**
 * Le chemin annoncé par le navigateur à la confirmation est-il bien un chemin que le serveur a pu
 * fabriquer pour CETTE entreprise et CE type ? (Rien d'autre n'est accepté.)
 */
export function cheminAutorise(chemin: unknown, partenaireId: string, type: TypeFichierPartenaire): chemin is string {
  if (typeof chemin !== 'string' || !new RegExp(`^${UUID}$`, 'i').test(partenaireId)) return false;
  return new RegExp(`^${partenaireId}/${type}/${UUID}\\.(jpg|png|webp|pdf)$`, 'i').test(chemin);
}

/** Nom d'origine affichable (sans chemin ni caractère de contrôle). */
export function nomAffichable(nom: unknown): string | null {
  if (typeof nom !== 'string') return null;
  const base = nom.split(/[\\/]/).pop() ?? '';
  const propre = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
  return propre || null;
}
