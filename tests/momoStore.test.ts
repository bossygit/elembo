// Journal des transactions : la pièce qui change de nature sur Vercel.
//
// Sur une fonction serverless il n'y a pas de disque : le journal doit vivre ailleurs. Ces tests
// vérifient le contrat commun (mémoire, fichier) ET le client Redis (protocole REST, HSETNX comme
// verrou de création, HGETALL tolérant), sans réseau : le `fetch` est remplacé.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StoreFichier, StoreMemoire, StoreRedis } from '../src/server/momo/store';

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
