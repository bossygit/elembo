/**
 * Idempotence et reprise des événements de paiement.
 *
 * Un événement est identifié par la référence MTN, le statut, l'identifiant financier et le
 * montant. Deux callbacks identiques produisent la même clé : la base incrémente `occurrences`
 * sans retraiter. La fonction de backoff est utilisée par le worker de réconciliation.
 */

import { createHash } from 'node:crypto';

export const BACKOFF_MINUTES = [1, 5, 15, 60, 360, 1440] as const;

export type EntreeEvenement = {
  referenceId: string;
  statut: string;
  financialTxId?: string | null;
  montantFcfa: number;
};

export function cleEvenement(entree: EntreeEvenement): string {
  const brut = [
    entree.referenceId.trim().toLowerCase(),
    entree.statut.trim().toUpperCase(),
    (entree.financialTxId ?? '').trim(),
    String(entree.montantFcfa),
  ].join('|');
  return createHash('sha256').update(brut, 'utf8').digest('hex');
}

export function prochaineTentative(tentatives: number, depuis: Date = new Date()): Date {
  const index = Math.min(Math.max(0, Math.trunc(tentatives)), BACKOFF_MINUTES.length - 1);
  return new Date(depuis.getTime() + BACKOFF_MINUTES[index] * 60_000);
}

export function doitAlerter(tentatives: number): boolean {
  return tentatives >= 3;
}

export function evenementDejaTraite(existant?: { traite: boolean } | null): boolean {
  return Boolean(existant?.traite);
}
