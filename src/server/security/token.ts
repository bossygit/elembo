/**
 * Vérification des jetons d'accès serveur (atelier, tâches planifiées).
 *
 * Deux règles, apprises à la dure :
 *  - le jeton ne voyage **jamais dans l'URL** : une query string finit dans les journaux du
 *    serveur, l'historique du navigateur et l'en-tête `Referer` d'un lien sortant ;
 *  - la comparaison est à **temps constant**. Un `===` sur une chaîne laisse fuir, par le temps
 *    de réponse, le nombre de caractères corrects.
 *
 * On compare des empreintes SHA-256 de longueur fixe : `timingSafeEqual` exige des buffers de
 * même taille, et hacher évite de révéler la longueur du secret.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

function empreinte(valeur: string): Buffer {
  return createHash('sha256').update(valeur, 'utf8').digest();
}

/** `true` seulement si les deux jetons sont non vides et identiques. */
export function jetonValide(fourni: string | null | undefined, attendu: string | null | undefined): boolean {
  const a = (attendu ?? '').trim();
  const b = (fourni ?? '').trim();
  if (!a || !b) return false;
  return timingSafeEqual(empreinte(a), empreinte(b));
}

/**
 * Lit le jeton atelier dans l'en-tête `x-atelier-token` **uniquement**.
 * Le paramètre `?token=` est refusé : il a existé pour les essais, mais il expose le secret.
 */
export function jetonAtelier(demande: Request): string {
  return (demande.headers.get('x-atelier-token') ?? '').trim();
}

export function atelierAutorise(demande: Request, attendu = process.env.ATELIER_TOKEN): boolean {
  return jetonValide(jetonAtelier(demande), attendu);
}
