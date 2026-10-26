// Les motifs de refus MTN doivent déboucher sur une action, pas sur un code.

import { describe, expect, it } from 'vitest';

import { expliquerMotif, phraseMotif } from '../src/lib/payment/motifs';

describe('explication des motifs MTN', () => {
  it('traduit le motif cumulé rencontré en production', () => {
    const e = expliquerMotif('LOW_BALANCE_OR_PAYEE_LIMIT_REACHED_OR_NOT_ALLOWED');
    expect(e).not.toBeNull();
    expect(e!.constat).toMatch(/solde insuffisant|plafond|non autorisé/i);
    expect(e!.action).toMatch(/\*126#|plafond|autre numéro/i);
  });

  it('couvre les refus classiques', () => {
    for (const code of ['NOT_ENOUGH_FUNDS', 'PAYER_NOT_FOUND', 'APPROVAL_REJECTED', 'EXPIRED', 'NOT_ALLOWED']) {
      expect(expliquerMotif(code), code).not.toBeNull();
    }
  });

  it('accepte la casse et les espaces', () => {
    expect(expliquerMotif('  expired ')).not.toBeNull();
  });

  it('ne fabrique pas de conseil pour un code inconnu', () => {
    expect(expliquerMotif('SOMETHING_NEW_FROM_MTN')).toBeNull();
    expect(phraseMotif('SOMETHING_NEW_FROM_MTN')).toBeNull();
    expect(expliquerMotif(null)).toBeNull();
  });

  it('assemble constat et action en une phrase', () => {
    expect(phraseMotif('NOT_ENOUGH_FUNDS')).toMatch(/Solde MoMo insuffisant\. Rechargez/);
  });
});
