import { describe, expect, it } from 'vitest';

import { ErreurTelephone, masquerMsisdn, normaliserMsisdn } from '../src/msisdn.ts';

describe('normalisation des numéros congolais', () => {
  it('accepte les écritures courantes d’un même numéro', () => {
    const attendu = '242061234567';
    for (const ecriture of [
      '061234567',
      '06 12 34 567',
      '06-12-34-567',
      '+242 06 12 34 567',
      '+242061234567',
      '00242061234567',
      '242061234567',
      '06.12.34.567',
    ]) {
      expect(normaliserMsisdn(ecriture), ecriture).toBe(attendu);
    }
  });

  it('accepte les préfixes MTN (06, 05) et Airtel (04)', () => {
    expect(normaliserMsisdn('051234567')).toBe('242051234567');
    expect(normaliserMsisdn('041234567')).toBe('242041234567');
  });

  it('accepte un numéro sans zéro initial', () => {
    expect(normaliserMsisdn('61234567')).toBe('242061234567');
  });

  it('refuse ce qui n’est pas un mobile congolais, avec un message clair', () => {
    for (const mauvais of ['', '   ', '12345', '0612345', '0612345678', '071234567', 'abcdefghi']) {
      expect(() => normaliserMsisdn(mauvais), mauvais).toThrow(ErreurTelephone);
    }
    expect(() => normaliserMsisdn('071234567')).toThrow(/9 chiffres/);
  });

  it('laisse passer les numéros de test du sandbox, et seulement là', () => {
    expect(normaliserMsisdn('46733123450', 'sandbox')).toBe('46733123450');
    // En production, ce n'est pas un numéro congolais : on refuse plutôt que d'envoyer n'importe quoi à MTN.
    expect(() => normaliserMsisdn('46733123450', 'mtncongo')).toThrow(ErreurTelephone);
  });

  it('masque les numéros destinés aux journaux', () => {
    expect(masquerMsisdn('242061234567')).toBe('24206••••67');
    expect(masquerMsisdn('')).toBe('••••');
  });
});
