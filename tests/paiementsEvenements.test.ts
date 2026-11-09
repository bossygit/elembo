import { describe, expect, it } from 'vitest';

import {
  BACKOFF_MINUTES,
  cleEvenement,
  doitAlerter,
  evenementDejaTraite,
  prochaineTentative,
} from '../src/server/paiements/evenements';

describe('événements de paiement', () => {
  it('produit une clé stable et sensible aux champs', () => {
    const base = {
      referenceId: '11111111-1111-1111-1111-111111111111',
      statut: 'SUCCESSFUL',
      financialTxId: 'MTN-123',
      montantFcfa: 1000,
    };
    expect(cleEvenement(base)).toBe(cleEvenement({ ...base, statut: 'successful' }));
    expect(cleEvenement(base)).toHaveLength(64);
    expect(cleEvenement(base)).not.toBe(cleEvenement({ ...base, montantFcfa: 1001 }));
    expect(cleEvenement(base)).not.toBe(cleEvenement({ ...base, financialTxId: 'MTN-124' }));
  });

  it('applique un backoff progressif puis plafonné', () => {
    const depart = new Date('2026-11-09T12:00:00.000Z');
    expect(prochaineTentative(0, depart).toISOString()).toBe('2026-11-09T12:01:00.000Z');
    expect(prochaineTentative(1, depart).toISOString()).toBe('2026-11-09T12:05:00.000Z');
    expect(prochaineTentative(5, depart).toISOString()).toBe('2026-11-10T12:00:00.000Z');
    expect(prochaineTentative(99, depart).toISOString()).toBe('2026-11-10T12:00:00.000Z');
    expect(BACKOFF_MINUTES).toHaveLength(6);
  });

  it('alerte après trois tentatives et détecte un événement déjà traité', () => {
    expect(doitAlerter(2)).toBe(false);
    expect(doitAlerter(3)).toBe(true);
    expect(evenementDejaTraite({ traite: true })).toBe(true);
    expect(evenementDejaTraite({ traite: false })).toBe(false);
    expect(evenementDejaTraite(null)).toBe(false);
  });
});
