/**
 * Configuration du service de paiement, lue dans l'environnement (Vercel → Project Settings →
 * Environment Variables).
 *
 * Trois modes, un seul jeu de règles de sécurité : les clés MTN ne vivent QUE ici, côté serveur.
 * Aucune n'est jamais renvoyée au navigateur ni écrite dans les journaux.
 *
 *   MOMO_MOCK=1        → démonstration : aucun appel à MTN, paiement simulé.
 *                        Refusé si MOMO_ENV=mtncongo (on n'imite pas la production).
 *   MOMO_ENV=sandbox   → https://sandbox.momodeveloper.mtn.com, devise EUR (imposée par MTN).
 *   MOMO_ENV=mtncongo  → https://proxy.momoapi.mtn.com, devise XAF, en-tête mtncongo.
 *
 * Stockage des transactions — le point qui change avec Vercel : une fonction serverless n'a pas
 * de disque. En production il FAUT un stockage externe :
 *
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (ou KV_REST_API_URL / KV_REST_API_TOKEN)
 *   MOMO_DATA_FILE=/chemin/transactions.json            (développement local uniquement)
 *   ni l'un ni l'autre + MOMO_MOCK=1                    (mémoire : démonstration, perdu au redémarrage)
 *
 * Aucun repli silencieux : en mode réel sans stockage configuré, le service refuse de démarrer
 * plutôt que d'encaisser des paiements qu'il ne pourrait pas tracer.
 */

export type EnvironnementMomo = 'sandbox' | 'mtncongo';

export type ConfigStockage =
  /** API HTTP Upstash / Vercel KV. */
  | { genre: 'redis'; url: string; token: string }
  /** Connexion Redis classique — ce que fournit l'intégration « redis » de Vercel (REDIS_URL). */
  | { genre: 'redis-tcp'; url: string }
  | { genre: 'fichier'; fichier: string }
  | { genre: 'memoire' };

export type Config = {
  mode: 'mock' | 'reel';
  env: EnvironnementMomo;
  baseUrl: string;
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
  callbackUrl: string | null;
  devise: 'EUR' | 'XAF';
  /** Montant envoyé à MTN en sandbox : MTN n'accepte que de l'EUR, la commande reste en FCFA. */
  montantSandbox: string;
  origines: string[];
  stockage: ConfigStockage;
  /** Délai avant qu'un paiement simulé passe à SUCCESSFUL (mode démonstration). */
  delaiMockMs: number;
};

const BASE_SANDBOX = 'https://sandbox.momodeveloper.mtn.com';
const BASE_PRODUCTION = 'https://proxy.momoapi.mtn.com';

/** Numéros de test du sandbox MTN — ils ne ressemblent pas à des numéros congolais. */
export const MSISDN_SANDBOX_TEST = [
  '46733123450',
  '46733123451',
  '46733123452',
  '46733123453',
  '46733123454',
  '46733123455',
  '46733123456',
  '46733123457',
  '46733123458',
  '46733123459',
  '46733123460',
  '46733123461',
  '46733123462',
  '46733123463',
  '46733123464',
  '46733123469',
] as const;

export class ErreurConfig extends Error {}

function valeur(env: Record<string, string | undefined>, nom: string): string {
  return (env[nom] ?? '').trim();
}

function requis(env: Record<string, string | undefined>, nom: string): string {
  const v = valeur(env, nom);
  if (!v) {
    throw new ErreurConfig(
      `${nom} est absent. Renseignez-le dans l'environnement du serveur (jamais dans le dépôt, jamais dans le navigateur).`,
    );
  }
  return v;
}

/** Upstash (intégration directe) ou Vercel KV (Marketplace) : mêmes variables, deux noms. */
function lireStockage(env: Record<string, string | undefined>, mode: 'mock' | 'reel'): ConfigStockage {
  // 1) REDIS_URL : intégration Redis de Vercel (marketplace « redis »). Pendant le provisionnement,
  //    la valeur vaut « database_provisioning_in_progress » : ce n'est pas une URL, on refuse.
  const redisUrl = valeur(env, 'REDIS_URL');
  if (redisUrl) {
    if (!/^rediss?:\/\//.test(redisUrl)) {
      throw new ErreurConfig(
        `REDIS_URL n'est pas une URL Redis exploitable (« ${redisUrl.slice(0, 40)} »). Si la base est en cours de création, attendez la fin du provisionnement puis redéployez.`,
      );
    }
    return { genre: 'redis-tcp', url: redisUrl };
  }

  // 2) API REST (Upstash direct ou Vercel KV).
  const url = valeur(env, 'UPSTASH_REDIS_REST_URL') || valeur(env, 'KV_REST_API_URL');
  const token = valeur(env, 'UPSTASH_REDIS_REST_TOKEN') || valeur(env, 'KV_REST_API_TOKEN');
  if (url && token) return { genre: 'redis', url, token };
  if (url || token) {
    throw new ErreurConfig(
      'Stockage Redis à moitié configuré : il faut à la fois UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN (ou KV_REST_API_URL / KV_REST_API_TOKEN), ou simplement REDIS_URL.',
    );
  }

  const fichier = valeur(env, 'MOMO_DATA_FILE');
  if (fichier) return { genre: 'fichier', fichier };

  if (mode === 'mock') return { genre: 'memoire' };

  throw new ErreurConfig(
    'Aucun stockage des transactions configuré en mode réel : connectez une base Redis au projet (Vercel → Storage, variable REDIS_URL) ou renseignez UPSTASH_REDIS_REST_URL / KV_REST_API_URL. En local, MOMO_DATA_FILE suffit. Sans journal, un paiement accepté par MTN serait perdu.',
  );
}

export function lireConfig(env: Record<string, string | undefined> = process.env): Config {
  const voulu = (env.MOMO_ENV ?? 'sandbox').trim();
  if (voulu !== 'sandbox' && voulu !== 'mtncongo') {
    throw new ErreurConfig(`MOMO_ENV doit valoir « sandbox » ou « mtncongo » (reçu : « ${voulu} »).`);
  }
  const envMtn: EnvironnementMomo = voulu;

  const demandeMock = (env.MOMO_MOCK ?? '').trim() === '1';
  if (demandeMock && envMtn === 'mtncongo') {
    throw new ErreurConfig('MOMO_MOCK=1 est refusé avec MOMO_ENV=mtncongo : on ne simule pas la production.');
  }
  const mode: 'mock' | 'reel' = demandeMock ? 'mock' : 'reel';

  const base = {
    env: envMtn,
    callbackUrl: valeur(env, 'MOMO_CALLBACK_URL') || null,
    montantSandbox: valeur(env, 'MOMO_SANDBOX_AMOUNT') || '10',
    origines: (valeur(env, 'APP_ORIGINS') || 'https://bossygit.github.io,http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    delaiMockMs: Number(valeur(env, 'MOMO_MOCK_DELAY_MS') || 4000),
  };

  if (mode === 'mock') {
    return {
      mode,
      baseUrl: BASE_SANDBOX,
      subscriptionKey: 'mock',
      apiUser: 'mock',
      apiKey: 'mock',
      devise: 'XAF',
      stockage: lireStockage(env, 'mock'),
      ...base,
    };
  }

  return {
    mode,
    baseUrl: envMtn === 'sandbox' ? BASE_SANDBOX : BASE_PRODUCTION,
    subscriptionKey: requis(env, 'MOMO_SUBSCRIPTION_KEY'),
    apiUser: requis(env, 'MOMO_API_USER'),
    apiKey: requis(env, 'MOMO_API_KEY'),
    // MTN sandbox n'accepte que l'EUR ; la production congolaise est en XAF.
    devise: envMtn === 'sandbox' ? 'EUR' : 'XAF',
    // Le stockage est contrôlé APRÈS les clés : si les deux manquent, c'est la clé MTN — plus
    // rare, plus grave — que le message doit nommer en premier.
    stockage: lireStockage(env, 'reel'),
    ...base,
  };
}
