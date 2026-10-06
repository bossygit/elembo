import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { creerServeur } from '../src/app.ts';
import { produit, ville } from '../src/catalogue.ts';
import { lireConfig, type Config } from '../src/config.ts';
import { creerClientMock } from '../src/mock-mtn.ts';
import type { ClientMomo, StatutPaiement } from '../src/mtn.ts';
import { StoreTransactions } from '../src/store.ts';

const ORIGINE = 'https://bossygit.github.io';

let dossier = '';
let serveur: Server | null = null;
let base = '';
let horloge = 0;

async function demarrer(options: { client?: ClientMomo; delaiMockMs?: number } = {}) {
  const config: Config = {
    ...lireConfig({ MOMO_MOCK: '1', PORT: '0', APP_ORIGINS: ORIGINE }),
    fichierDonnees: join(dossier, 'transactions.json'),
    delaiMockMs: options.delaiMockMs ?? 4000,
  };
  const client = options.client ?? creerClientMock({ delaiMs: config.delaiMockMs, maintenant: () => horloge });
  const store = await StoreTransactions.ouvrir(config.fichierDonnees);
  const gerer = creerServeur({ config, client, store, maintenant: () => new Date(), journal: () => {} });

  serveur = createServer((req, res) => {
    void gerer(req, res);
  });
  await new Promise<void>((resoudre) => serveur!.listen(0, '127.0.0.1', resoudre));
  const adresse = serveur.address();
  if (adresse == null || typeof adresse === 'string') throw new Error('port introuvable');
  base = `http://127.0.0.1:${adresse.port}`;
}

function poster(chemin: string, corps: unknown, entetes: Record<string, string> = {}) {
  return fetch(`${base}${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...entetes },
    body: JSON.stringify(corps),
  });
}

const COMMANDE = {
  commande: 'ELB-20261001-1200-AB',
  produitId: 'tshirt-basic',
  lignes: [{ taille: 'M', quantite: 2 }],
  villeId: 'brazzaville',
  telephone: '06 123 45 67',
};

beforeEach(async () => {
  dossier = await mkdtemp(join(tmpdir(), 'momo-'));
  horloge = 1_000_000;
});
afterEach(async () => {
  if (serveur) await new Promise<void>((r) => serveur!.close(() => r()));
  serveur = null;
  await rm(dossier, { recursive: true, force: true });
});

describe('santé et CORS', () => {
  it('répond à /sante', async () => {
    await demarrer();
    const r = await fetch(`${base}/sante`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, mode: 'mock' });
  });

  it('autorise l’origine de la boutique et refuse les autres', async () => {
    await demarrer();
    const ok = await fetch(`${base}/sante`, { headers: { Origin: ORIGINE } });
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGINE);

    const autre = await fetch(`${base}/sante`, { headers: { Origin: 'https://exemple-malveillant.cg' } });
    expect(autre.headers.get('access-control-allow-origin')).toBeNull();

    const preflight = await fetch(`${base}/api/momo/payer`, { method: 'OPTIONS', headers: { Origin: ORIGINE } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('POST /api/momo/payer', () => {
  it('recalcule le montant et renvoie la référence à suivre', async () => {
    await demarrer();
    const r = await poster('/api/momo/payer', COMMANDE, { Origin: ORIGINE });
    expect(r.status).toBe(201);
    const corps = (await r.json()) as Record<string, unknown>;
    expect(corps.montantFcfa).toBe(2 * produit('tshirt-basic')!.prixFcfa + ville('brazzaville')!.fraisFcfa!);
    expect(corps.statut).toBe('PENDING');
    expect(corps.quantiteTotale).toBe(2);
    expect(typeof corps.referenceId).toBe('string');
    expect(r.headers.get('access-control-allow-origin')).toBe(ORIGINE);
  });

  it('ignore tout montant envoyé par le navigateur', async () => {
    await demarrer();
    const r = await poster('/api/momo/payer', { ...COMMANDE, montantFcfa: 1, total: 1 }, {});
    const corps = (await r.json()) as Record<string, unknown>;
    expect(corps.montantFcfa).toBe(2 * produit('tshirt-basic')!.prixFcfa + ville('brazzaville')!.fraisFcfa!);
  });

  it('refuse une commande non chiffrable (422) avec un motif lisible', async () => {
    await demarrer();

    const sansPieces = await poster('/api/momo/payer', { ...COMMANDE, lignes: [] });
    expect(sansPieces.status).toBe(422);
    expect(String(((await sansPieces.json()) as { erreur: string }).erreur)).toMatch(/aucune pièce/);

    // Pointe-Noire est livrable comme Brazzaville (frais de test) : la même commande passe.
    const pointeNoire = await poster('/api/momo/payer', { ...COMMANDE, villeId: 'pointe-noire' });
    expect(pointeNoire.status).toBe(201);
    expect(((await pointeNoire.json()) as { montantFcfa: number }).montantFcfa).toBe(
      2 * produit('tshirt-basic')!.prixFcfa + ville('pointe-noire')!.fraisFcfa!,
    );

    // Une ville hors zone de livraison reste refusée.
    const horsZone = await poster('/api/momo/payer', { ...COMMANDE, villeId: 'dolisie' });
    expect(horsZone.status).toBe(422);
    expect(String(((await horsZone.json()) as { erreur: string }).erreur)).toMatch(/Ville inconnue/);

    // En sandbox, un numéro ordinaire est accepté (tout numéro réussit chez MTN) : pour obtenir un
    // 422 il faut un numéro manifestement inexploitable. La règle congolaise stricte, elle, est
    // testée sur normaliserMsisdn en environnement de production.
    const mauvaisTel = await poster('/api/momo/payer', { ...COMMANDE, telephone: '12' });
    expect(mauvaisTel.status).toBe(422);
    expect(String(((await mauvaisTel.json()) as { erreur: string }).erreur)).toMatch(/Numéro invalide/);
  });

  it('renvoie 502 quand MTN refuse la demande, et marque la transaction', async () => {
    const clientCasse: ClientMomo = {
      demarrerPaiement: async () => {
        const { ErreurMomo } = await import('../src/mtn.ts');
        throw new ErreurMomo('MTN a refusé la demande de paiement (500).', 500);
      },
      statut: async (): Promise<StatutPaiement> => ({ statut: 'PENDING', montant: null, devise: null, financialTransactionId: null, raison: null }),
    };
    await demarrer({ client: clientCasse });
    const r = await poster('/api/momo/payer', COMMANDE);
    expect(r.status).toBe(502);
    expect(String(((await r.json()) as { detail: string }).detail)).toMatch(/MTN/);
  });
});

describe('GET /api/momo/statut', () => {
  it('reste PENDING tant que le client n’a pas validé, puis passe à PAYE', async () => {
    await demarrer({ delaiMockMs: 5000 });
    const creation = await poster('/api/momo/payer', COMMANDE);
    const { referenceId } = (await creation.json()) as { referenceId: string };

    const premiere = await fetch(`${base}/api/momo/statut?referenceId=${referenceId}`);
    expect(((await premiere.json()) as { statut: string }).statut).toBe('PENDING');

    horloge += 6000; // le client valide sur son téléphone
    const seconde = await fetch(`${base}/api/momo/statut?referenceId=${referenceId}`);
    const corps = (await seconde.json()) as { statut: string; montantFcfa: number; commande: string };
    expect(corps.statut).toBe('PAYE');
    expect(corps.montantFcfa).toBe(
      2 * produit('tshirt-basic')!.prixFcfa + ville('brazzaville')!.fraisFcfa!,
    );
    expect(corps.commande).toBe(COMMANDE.commande);
  });

  it('passe à ECHEC selon le scénario officiel du sandbox (…51 = rejeté)', async () => {
    await demarrer();
    const creation = await poster('/api/momo/payer', { ...COMMANDE, telephone: '46733123451' });
    const { referenceId } = (await creation.json()) as { referenceId: string };
    const r = await fetch(`${base}/api/momo/statut?referenceId=${referenceId}`);
    const corps = (await r.json()) as { statut: string; raison: string };
    expect(corps.statut).toBe('ECHEC');
    expect(corps.raison).toBe('REJECTED');
  });

  it('suit la table MTN : …55 = payeur introuvable, …53 reste en attente', async () => {
    await demarrer();
    for (const [numero, raison] of [['46733123455', 'PAYER_NOT_FOUND']] as const) {
      const creation = await poster('/api/momo/payer', { ...COMMANDE, telephone: numero });
      const { referenceId } = (await creation.json()) as { referenceId: string };
      const r = await fetch(`${base}/api/momo/statut?referenceId=${referenceId}`);
      expect(await r.json()).toMatchObject({ statut: 'ECHEC', raison });
    }

    const ongoing = await poster('/api/momo/payer', { ...COMMANDE, telephone: '46733123453' });
    const { referenceId } = (await ongoing.json()) as { referenceId: string };
    horloge += 600_000; // même très longtemps après, « en cours » ne se dénoue pas
    const r = await fetch(`${base}/api/momo/statut?referenceId=${referenceId}`);
    expect(((await r.json()) as { statut: string }).statut).toBe('PENDING');
  });

  it('répond 404 sur une référence inconnue et 422 sans paramètre', async () => {
    await demarrer();
    expect((await fetch(`${base}/api/momo/statut?referenceId=zzz`)).status).toBe(404);
    expect((await fetch(`${base}/api/momo/statut`)).status).toBe(422);
  });
});

describe('POST /api/momo/callback', () => {
  it('confirme le paiement après revérification auprès de MTN', async () => {
    await demarrer({ delaiMockMs: 0 });
    const creation = await poster('/api/momo/payer', COMMANDE);
    const { referenceId } = (await creation.json()) as { referenceId: string };

    const r = await poster('/api/momo/callback', { referenceId });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ recu: true, traite: true, statut: 'PAYE' });

    const statut = await fetch(`${base}/api/momo/statut?referenceId=${referenceId}`);
    const corps = (await statut.json()) as { statut: string; financialTransactionId: string };
    expect(corps.statut).toBe('PAYE');
    expect(corps.financialTransactionId).toMatch(/^MOCK-/);
  });

  it('est idempotent : rejouer le callback ne change rien', async () => {
    await demarrer({ delaiMockMs: 0 });
    const creation = await poster('/api/momo/payer', COMMANDE);
    const { referenceId } = (await creation.json()) as { referenceId: string };

    await poster('/api/momo/callback', { referenceId });
    const rejoue = await poster('/api/momo/callback', { referenceId });
    expect(await rejoue.json()).toMatchObject({ recu: true, traite: false, statut: 'PAYE' });
  });

  it('répond 200 même pour une référence inconnue (MTN ne doit pas boucler)', async () => {
    await demarrer();
    const r = await poster('/api/momo/callback', { referenceId: 'inconnue' });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ recu: true, traite: false });
  });

  it('refuse de valider si le montant encaissé ne correspond pas : ANOMALIE', async () => {
    const clientTruque: ClientMomo = {
      demarrerPaiement: async () => undefined,
      statut: async (): Promise<StatutPaiement> => ({
        statut: 'SUCCESSFUL',
        montant: '1000', // MTN annonce 1 000 alors que la commande vaut 11 000
        devise: 'XAF',
        financialTransactionId: 'FT-1',
        raison: null,
      }),
    };
    await demarrer({ client: clientTruque });
    const creation = await poster('/api/momo/payer', COMMANDE);
    const { referenceId } = (await creation.json()) as { referenceId: string };

    const r = await poster('/api/momo/callback', { referenceId });
    expect(await r.json()).toMatchObject({ traite: true, statut: 'ANOMALIE' });

    const statut = await fetch(`${base}/api/momo/statut?referenceId=${referenceId}`);
    expect(await statut.json()).toMatchObject({ statut: 'ANOMALIE' });
  });

  it('accepte la référence passée dans le chemin (les paramètres de requête sont proscrits)', async () => {
    await demarrer({ delaiMockMs: 0 });
    const creation = await poster('/api/momo/payer', COMMANDE);
    const { referenceId } = (await creation.json()) as { referenceId: string };
    const r = await poster(`/api/momo/callback/${referenceId}`, {});
    expect(await r.json()).toMatchObject({ traite: true, statut: 'PAYE' });
  });

  it('accepte aussi un callback en PUT (MTN demande PUT et POST)', async () => {
    await demarrer({ delaiMockMs: 0 });
    const creation = await poster('/api/momo/payer', COMMANDE);
    const { referenceId } = (await creation.json()) as { referenceId: string };

    const r = await fetch(`${base}/api/momo/callback`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceId }),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ recu: true, traite: true, statut: 'PAYE' });
  });
});

describe('robustesse', () => {
  it('rejette un corps illisible', async () => {
    await demarrer();
    const r = await fetch(`${base}/api/momo/payer`, { method: 'POST', body: '{pas du json' });
    expect(r.status).toBe(422);
  });

  it('répond 404 sur une route inconnue', async () => {
    await demarrer();
    expect((await fetch(`${base}/nimportequoi`)).status).toBe(404);
  });
});
