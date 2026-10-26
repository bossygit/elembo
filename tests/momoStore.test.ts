// Journal des transactions : la pièce qui change de nature sur Vercel.
//
// Sur une fonction serverless il n'y a pas de disque : le journal doit vivre ailleurs. Ces tests
// vérifient le contrat commun (mémoire, fichier) ET le client Redis (protocole REST, HSETNX comme
// verrou de création, HGETALL tolérant), sans réseau : le `fetch` est remplacé.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  JournalRedis,
  StoreFichier,
  StoreMemoire,
  StoreRedis,
  type ExecuteurRedis,
} from '../src/server/momo/store';

const NOUVELLE = {
  referenceId: '11111111-2222-4333-8444-555555555555',
  commande: 'ELB-20261001-1200-AB',
  produitId: 'tshirt-basic',
  montantFcfa: 11_000,
  montantEnvoye: '11000',
  devise: 'XAF',
  msisdn: '242061234567',
};

describe('journal en mémoire (démonstration, tests)', () => {
  it('crée une transaction PENDING puis la fait évoluer', async () => {
    const store = new StoreMemoire();
    const t = await store.creer(NOUVELLE);
    expect(t.statut).toBe('PENDING');
    expect(t.historique).toHaveLength(1);

    const maj = await store.maj(t.referenceId, { statut: 'PAYE', financialTransactionId: 'FT-1' }, {
      le: new Date().toISOString(),
      quoi: 'paiement confirme',
    });
    expect(maj.statut).toBe('PAYE');
    expect(maj.historique).toHaveLength(2);
    expect((await store.parCommande(NOUVELLE.commande))[0]!.statut).toBe('PAYE');
  });

  it('refuse deux fois la même référence', async () => {
    const store = new StoreMemoire();
    await store.creer(NOUVELLE);
    await expect(store.creer(NOUVELLE)).rejects.toThrow(/déjà enregistrée/);
  });
});

describe('journal fichier (développement local)', () => {
  let dossier = '';

  beforeEach(async () => {
    dossier = await mkdtemp(join(tmpdir(), 'elembo-store-'));
  });
  afterEach(async () => {
    await rm(dossier, { recursive: true, force: true });
  });

  it('survit à un redémarrage : le fichier est relu', async () => {
    const fichier = join(dossier, 'transactions.json');
    const premier = await StoreFichier.ouvrir(fichier);
    const t = await premier.creer(NOUVELLE);
    await premier.maj(t.referenceId, { statut: 'PAYE' });

    const second = await StoreFichier.ouvrir(fichier);
    const relu = await second.parReferenceId(t.referenceId);
    expect(relu?.statut).toBe('PAYE');
    expect(relu?.commande).toBe(NOUVELLE.commande);

    const ecrit = JSON.parse(await readFile(fichier, 'utf8')) as { referenceId: string }[];
    expect(ecrit[0]!.referenceId).toBe(t.referenceId);
  });
});

describe('journal Redis (production Vercel)', () => {
  /** Faux Upstash : on observe les commandes REST réellement envoyées. */
  function fauxRedis(initial: Record<string, string> = {}) {
    const donnees = new Map(Object.entries(initial));
    const commandes: (string | number)[][] = [];
    const fetchFactice = (async (_url: string | URL | Request, init?: RequestInit) => {
      const corps = JSON.parse(String(init?.body)) as (string | number)[];
      commandes.push(corps);
      const [cmd, , champ, valeur] = corps;
      let resultat: unknown = null;

      if (cmd === 'HGET') resultat = donnees.get(String(champ)) ?? null;
      else if (cmd === 'HGETALL') resultat = Object.fromEntries(donnees);
      else if (cmd === 'HSETNX') {
        const existe = donnees.has(String(champ));
        if (!existe) donnees.set(String(champ), String(valeur));
        resultat = existe ? 0 : 1;
      } else if (cmd === 'HSET') {
        donnees.set(String(champ), String(valeur));
        resultat = 1;
      }

      return new Response(JSON.stringify({ result: resultat }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof globalThis.fetch;

    return { donnees, commandes, fetchFactice };
  }

  function storeRedis(fetchFactice: typeof globalThis.fetch): StoreRedis {
    return new StoreRedis('https://faux-redis.upstash.io', 'jeton', { fetch: fetchFactice });
  }

  it('écrit en HSETNX (verrou de création) puis relit la transaction', async () => {
    const { fetchFactice, commandes } = fauxRedis();
    const store = storeRedis(fetchFactice);

    const cree = await store.creer(NOUVELLE);
    expect(cree.statut).toBe('PENDING');
    expect(commandes[0]![0]).toBe('HSETNX');

    const relu = await store.parReferenceId(NOUVELLE.referenceId);
    expect(relu?.commande).toBe(NOUVELLE.commande);
  });

  it('refuse une référence déjà présente (pas de double débit)', async () => {
    const { fetchFactice } = fauxRedis();
    const store = storeRedis(fetchFactice);

    await store.creer(NOUVELLE);
    await expect(store.creer(NOUVELLE)).rejects.toThrow(/déjà enregistrée/);
  });

  it('met à jour par HSET et retrouve une commande par son externalId', async () => {
    const { fetchFactice } = fauxRedis();
    const store = storeRedis(fetchFactice);

    await store.creer(NOUVELLE);
    const maj = await store.maj(NOUVELLE.referenceId, { statut: 'PAYE', financialTransactionId: 'FT-9' });
    expect(maj.statut).toBe('PAYE');

    const parCommande = await store.parCommande(NOUVELLE.commande);
    expect(parCommande).toHaveLength(1);
    expect(parCommande[0]!.financialTransactionId).toBe('FT-9');
    expect((await store.toutes()).length).toBe(1);
  });

  it('tolère HGETALL renvoyé en paires (anciennes versions du protocole)', async () => {
    const transaction = { ...NOUVELLE, statut: 'PAYE', financialTransactionId: null, raison: null, creeLe: '', majLe: '', historique: [] };
    const fetchFactice = (async () =>
      new Response(JSON.stringify({ result: [NOUVELLE.referenceId, JSON.stringify(transaction)] }), {
        status: 200,
      })) as unknown as typeof globalThis.fetch;
    const store = storeRedis(fetchFactice);

    const toutes = await store.toutes();
    expect(toutes).toHaveLength(1);
    expect(toutes[0]!.referenceId).toBe(NOUVELLE.referenceId);
  });

  it('échoue bruyamment si le stockage est injoignable (jamais d’encaissement muet)', async () => {
    const fetchFactice = (async () => {
      throw new Error('ENOTFOUND');
    }) as unknown as typeof globalThis.fetch;
    const store = storeRedis(fetchFactice);

    await expect(store.parReferenceId('x')).rejects.toThrow(/injoignable/);
  });
});

describe('journal Redis par connexion TCP (REDIS_URL de l’intégration Vercel)', () => {
  /** Faux client Redis : un objet qui répond aux commandes comme ioredis. */
  function fauxClient() {
    const donnees = new Map<string, string>();
    const commandes: string[] = [];
    return {
      donnees,
      commandes,
      client: {
        async call(commande: string, ...args: (string | number)[]): Promise<unknown> {
          commandes.push(commande);
          const champ = args[1] === undefined ? undefined : String(args[1]);
          const valeur = args[2] === undefined ? undefined : String(args[2]);
          if (commande === 'HSETNX') {
            if (champ && donnees.has(champ)) return 0;
            if (champ && valeur) donnees.set(champ, valeur);
            return 1;
          }
          if (commande === 'HSET') {
            if (champ && valeur) donnees.set(champ, valeur);
            return 1;
          }
          if (commande === 'PING') return 'PONG';
          if (commande === 'HGET') return champ ? (donnees.get(champ) ?? null) : null;
          if (commande === 'HGETALL') return [...donnees.entries()].flat();
          return null;
        },
        async ping() {
          return 'PONG';
        },
      },
    };
  }

  function journal(client: ReturnType<typeof fauxClient>['client']): JournalRedis {
    // Le journal ne dépend que de l'interface d'exécution : peu importe le transport.
    const executeur: ExecuteurRedis = {
      executer: (...args) => client.call(String(args[0]), ...args.slice(1)),
    };
    return new JournalRedis(executeur);
  }

  it('écrit puis relit une transaction, et répond au PING de santé', async () => {
    const { client, donnees } = fauxClient();
    const store = journal(client);

    await store.verifier();
    const cree = await store.creer(NOUVELLE);
    expect(cree.statut).toBe('PENDING');
    expect(donnees.size).toBe(1);

    await store.maj(NOUVELLE.referenceId, { statut: 'PAYE' });
    expect((await store.parReferenceId(NOUVELLE.referenceId))?.statut).toBe('PAYE');
    expect((await store.parCommande(NOUVELLE.commande))[0]!.statut).toBe('PAYE');
  });

  it('décode HGETALL en paires (format ioredis)', async () => {
    const { client } = fauxClient();
    const store = journal(client);
    await store.creer(NOUVELLE);
    const toutes = await store.toutes();
    expect(toutes).toHaveLength(1);
    expect(toutes[0]!.referenceId).toBe(NOUVELLE.referenceId);
  });

  it('remonte une erreur de stockage explicite si la commande échoue', async () => {
    const executeur: ExecuteurRedis = {
      executer: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:6379');
      },
    };
    const store = new JournalRedis(executeur);
    await expect(store.parReferenceId('x')).rejects.toThrow(/ECONNREFUSED/);
  });
});
