// Configuration du service de paiement : clés MTN, environnement, stockage des transactions.
// Le stockage est le point qui change avec Vercel (pas de disque en serverless).

import { describe, expect, it } from 'vitest';

import { ErreurConfig, lireConfig } from '../src/server/momo/config';

/** Jeu de clés MTN + stockage local : le minimum pour un démarrage « réel ». */
const CLES = {
  MOMO_SUBSCRIPTION_KEY: 'sub',
  MOMO_API_USER: 'user',
  MOMO_API_KEY: 'key',
  MOMO_DATA_FILE: '/tmp/elembo-transactions.json',
};

const REDIS = {
  UPSTASH_REDIS_REST_URL: 'https://exemple.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'jeton',
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
    const c = lireConfig({ ...CLES, ...REDIS, MOMO_ENV: 'mtncongo' });
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

  it('lit l’URL de callback déclarée — c’est elle que MTN appellera', () => {
    const c = lireConfig({
      ...CLES,
      ...REDIS,
      MOMO_ENV: 'mtncongo',
      MOMO_CALLBACK_URL: 'https://elembo.vercel.app/api/momo/callback',
    });
    expect(c.callbackUrl).toBe('https://elembo.vercel.app/api/momo/callback');
  });

  it('sans URL de callback, l’en-tête n’est simplement pas envoyé', () => {
    const c = lireConfig({ MOMO_MOCK: '1' });
    expect(c.callbackUrl).toBeNull();
  });
});

describe('stockage des transactions (le point qui change avec Vercel)', () => {
  it('accepte REDIS_URL — l’intégration Redis de Vercel fournit une connexion TCP', () => {
    const c = lireConfig({
      ...CLES,
      MOMO_ENV: 'mtncongo',
      REDIS_URL: 'rediss://default:motdepasse@redis-1234.cdg1.redislabs.com:12345',
    });
    expect(c.stockage).toEqual({
      genre: 'redis-tcp',
      url: 'rediss://default:motdepasse@redis-1234.cdg1.redislabs.com:12345',
    });
  });

  it('refuse une REDIS_URL de provisionnement (pas encore une URL)', () => {
    expect(() =>
      lireConfig({ ...CLES, MOMO_ENV: 'mtncongo', REDIS_URL: 'database_provisioning_in_progress' }),
    ).toThrow(/provisionnement|exploitable/);
  });

  // Une fonction serverless n'a pas de disque : en mode réel il FAUT un stockage externe.
  // Le refus doit être explicite, jamais un repli silencieux qui ferait perdre un encaissement.

  it('exige Redis en production, et nomme les variables manquantes', () => {
    expect(() => lireConfig({ ...CLES, MOMO_ENV: 'mtncongo', MOMO_DATA_FILE: '' })).toThrow(
      /UPSTASH_REDIS_REST_URL/,
    );
  });

  it('accepte l’intégration Upstash', () => {
    const c = lireConfig({ ...CLES, ...REDIS, MOMO_ENV: 'mtncongo' });
    expect(c.stockage).toEqual({
      genre: 'redis',
      url: 'https://exemple.upstash.io',
      token: 'jeton',
    });
  });

  it('accepte aussi les variables Vercel KV (Marketplace)', () => {
    const c = lireConfig({
      ...CLES,
      MOMO_ENV: 'mtncongo',
      KV_REST_API_URL: 'https://kv.vercel-storage.com',
      KV_REST_API_TOKEN: 'jeton-kv',
    });
    expect(c.stockage.genre).toBe('redis');
  });

  it('refuse un stockage Redis à moitié configuré', () => {
    expect(() =>
      lireConfig({ ...CLES, MOMO_ENV: 'mtncongo', UPSTASH_REDIS_REST_URL: 'https://exemple.upstash.io' }),
    ).toThrow(/à moitié configuré/);
  });

  it('accepte un fichier en développement local', () => {
    const c = lireConfig({ ...CLES, MOMO_ENV: 'sandbox', MOMO_DATA_FILE: '/tmp/transactions.json' });
    expect(c.stockage).toEqual({ genre: 'fichier', fichier: '/tmp/transactions.json' });
  });

  it('en démonstration sans stockage : mémoire (état perdu au redémarrage, c’est voulu)', () => {
    expect(lireConfig({ MOMO_MOCK: '1' }).stockage).toEqual({ genre: 'memoire' });
  });
});
