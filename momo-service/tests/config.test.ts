import { describe, expect, it } from 'vitest';

import { ErreurConfig, lireConfig } from '../src/config.ts';

const CLES = {
  MOMO_SUBSCRIPTION_KEY: 'sub',
  MOMO_API_USER: 'user',
  MOMO_API_KEY: 'key',
};

describe('configuration du service', () => {
  it('mode démonstration : aucune clé requise', () => {
    const c = lireConfig({ MOMO_MOCK: '1' });
    expect(c.mode).toBe('mock');
    expect(c.devise).toBe('XAF');
  });

  it('refuse de simuler la production', () => {
    expect(() => lireConfig({ MOMO_MOCK: '1', MOMO_ENV: 'mtncongo' })).toThrow(ErreurConfig);
  });

  it('sandbox : URL de test et devise EUR (imposée par MTN)', () => {
    const c = lireConfig({ ...CLES, MOMO_ENV: 'sandbox' });
    expect(c.mode).toBe('reel');
    expect(c.baseUrl).toBe('https://sandbox.momodeveloper.mtn.com');
    expect(c.devise).toBe('EUR');
  });

  it('production Congo : URL proxy, XAF, environnement mtncongo', () => {
    const c = lireConfig({ ...CLES, MOMO_ENV: 'mtncongo' });
    expect(c.baseUrl).toBe('https://proxy.momoapi.mtn.com');
    expect(c.devise).toBe('XAF');
    expect(c.env).toBe('mtncongo');
  });

  it('nomme précisément la variable manquante', () => {
    expect(() => lireConfig({ MOMO_ENV: 'sandbox', MOMO_API_USER: 'u', MOMO_API_KEY: 'k' })).toThrow(
      /MOMO_SUBSCRIPTION_KEY/,
    );
    expect(() => lireConfig({ MOMO_ENV: 'sandbox', MOMO_SUBSCRIPTION_KEY: 's', MOMO_API_KEY: 'k' })).toThrow(
      /MOMO_API_USER/,
    );
  });

  it('refuse un environnement inconnu', () => {
    expect(() => lireConfig({ ...CLES, MOMO_ENV: 'congo' })).toThrow(/sandbox/);
  });

  it('déduit l’origine autorisée par défaut (boutique + développement local)', () => {
    const c = lireConfig({ MOMO_MOCK: '1' });
    expect(c.origines).toContain('https://bossygit.github.io');
    expect(c.origines).toContain('http://localhost:3000');
  });
});
