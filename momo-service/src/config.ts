/**
 * Configuration du service, lue depuis l'environnement.
 *
 * Trois modes, et un seul jeu de règles de sécurité : les clés MTN ne vivent QUE ici, côté
 * serveur. Aucune n'est jamais renvoyée au navigateur ni écrite dans les journaux.
 *
 *   MOMO_MOCK=1            → mode démonstration : aucun appel à MTN, paiement simulé.
 *                            Refusé si MOMO_ENV=mtncongo (on n'imite pas la production).
 *   MOMO_ENV=sandbox       → https://sandbox.momodeveloper.mtn.com, devise EUR (imposée par MTN).
 *   MOMO_ENV=mtncongo      → https://proxy.momoapi.mtn.com, devise XAF, en-tête mtncongo.
 */

export type EnvironnementMomo = 'sandbox' | 'mtncongo';

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
  port: number;
  fichierDonnees: string;
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

function requis(env: NodeJS.ProcessEnv, nom: string): string {
  const valeur = (env[nom] ?? '').trim();
  if (!valeur) {
    throw new ErreurConfig(
      `${nom} est absent. Renseignez-le dans l'environnement du serveur (jamais dans le dépôt, jamais dans le navigateur).`,
    );
  }
  return valeur;
}

export function lireConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const voulu = (env.MOMO_ENV ?? 'sandbox').trim();
  if (voulu !== 'sandbox' && voulu !== 'mtncongo') {
    throw new ErreurConfig(`MOMO_ENV doit valoir « sandbox » ou « mtncongo » (reçu : « ${voulu} »).`);
  }
  const envMtn: EnvironnementMomo = voulu;

  const demandeMock = (env.MOMO_MOCK ?? '').trim() === '1';
  if (demandeMock && envMtn === 'mtncongo') {
    throw new ErreurConfig('MOMO_MOCK=1 est refusé avec MOMO_ENV=mtncongo : on ne simule pas la production.');
  }

  const base = {
    env: envMtn,
    callbackUrl: (env.MOMO_CALLBACK_URL ?? '').trim() || null,
    montantSandbox: (env.MOMO_SANDBOX_AMOUNT ?? '10').trim(),
    origines: (env.APP_ORIGINS ?? 'https://bossygit.github.io,http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    port: Number(env.PORT ?? 8787),
    fichierDonnees: (env.MOMO_DATA_FILE ?? 'data/transactions.json').trim(),
    delaiMockMs: Number(env.MOMO_MOCK_DELAY_MS ?? 4000),
  };

  if (demandeMock) {
    return {
      mode: 'mock',
      baseUrl: BASE_SANDBOX,
      subscriptionKey: 'mock',
      apiUser: 'mock',
      apiKey: 'mock',
      devise: 'XAF',
      ...base,
    };
  }

  return {
    mode: 'reel',
    baseUrl: envMtn === 'sandbox' ? BASE_SANDBOX : BASE_PRODUCTION,
    subscriptionKey: requis(env, 'MOMO_SUBSCRIPTION_KEY'),
    apiUser: requis(env, 'MOMO_API_USER'),
    apiKey: requis(env, 'MOMO_API_KEY'),
    // MTN sandbox n'accepte que l'EUR ; la production congolaise est en XAF.
    devise: envMtn === 'sandbox' ? 'EUR' : 'XAF',
    ...base,
  };
}
