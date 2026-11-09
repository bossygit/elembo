/**
 * Référence de commande : ce qui identifie une commande dans le journal, dans l'archive des
 * dossiers (`dossiers/<commande>/…`) et dans les échanges avec le client.
 *
 * Elle vient du navigateur, donc elle n'est jamais crue sur parole. Le motif est volontairement
 * strict :
 *  - pas de `/` ni de `..` : la référence sert de segment de chemin dans l'archive ;
 *  - pas d'espaces ni de caractères de contrôle : elle finit dans des journaux et des fiches ;
 *  - 6 à 40 caractères : assez pour `ELB-20261109-1234-AB`, assez court pour rester lisible.
 *
 * Le format produit par `makeReference()` (`ELB-AAAAMMJJ-HHMM-XX`) est accepté, comme les
 * références de devis (`DEV-…`) et les références historiques en majuscules.
 */

const MOTIF = /^[A-Za-z0-9][A-Za-z0-9_-]{5,39}$/;

export function referenceValide(reference: unknown): boolean {
  return typeof reference === 'string' && MOTIF.test(reference.trim());
}

/** Motif lisible pour les messages d'erreur — sans révéler la regex exacte au client. */
export const MOTIF_REFERENCE = '6 à 40 caractères : lettres, chiffres, tiret ou souligné';
