import Redis from 'ioredis';

export class ErreurLimiteIndisponible extends Error {
  constructor(message = 'Limitation temporairement indisponible.') {
    super(message);
    this.name = 'ErreurLimiteIndisponible';
  }
}

let client: Redis | null = null;

function redis(): Redis {
  const url = process.env.REDIS_URL?.trim();
  if (!url) throw new ErreurLimiteIndisponible('REDIS_URL manquant.');
  if (!client) {
    client = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    client.on('error', () => {
      // La route traduit l'erreur en 503 ; on ne logge pas l'URL ni les identifiants.
    });
  }
  return client;
}

export async function clientRedis(): Promise<Redis> {
  const c = redis();
  if (c.status === 'wait') await c.connect();
  return c;
}

/**
 * Fail-closed : toute erreur Redis remonte et la route répond 503.
 * Aucun fallback mémoire en serverless.
 */
export async function limiter(cle: string, maximum: number, fenetreSecondes: number): Promise<boolean> {
  try {
    const c = redis();
    if (c.status === 'wait') await c.connect();
    const valeur = await c.incr(cle);
    if (valeur === 1) await c.expire(cle, fenetreSecondes);
    return valeur <= maximum;
  } catch (erreur) {
    if (erreur instanceof ErreurLimiteIndisponible) throw erreur;
    throw new ErreurLimiteIndisponible();
  }
}
