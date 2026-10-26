// Le service de paiement, testé sans serveur HTTP : les routes Next ne sont qu'une enveloppe.
// Ce fichier est le portage des tests du service séparé (momo-service/tests/app.test.ts), avec
// un journal en mémoire et MTN simulé — aucune clé, aucun réseau, aucun franc dépensé.

import { describe, expect, it } from 'vitest';

import { produit, ville } from '../src/server/momo/catalogue';
import { lireConfig, type Config } from '../src/server/momo/config';
import { creerClientMock } from '../src/server/momo/mock-mtn';
import type { ClientMomo, StatutPaiement } from '../src/server/momo/mtn';
import { entetesCors, creerGestionnaire, type Gestionnaire } from '../src/server/momo/service';
import { StoreMemoire } from '../src/server/momo/store';

const ORIGINE = 'https://bossygit.github.io';
let horloge = 1_000_000;

type Options = {
  client?: ClientMomo;
  delaiMockMs?: number;
  maintenant?: () => Date;
};

function monter(options: Options = {}): { service: Gestionnaire; config: Config; store: StoreMemoire } {
  const config: Config = {
    ...lireConfig({ MOMO_MOCK: '1', APP_ORIGINS: ORIGINE }),
    delaiMockMs: options.delaiMockMs ?? 4000,
  };
  const client =
    options.client ?? creerClientMock({ delaiMs: config.delaiMockMs, maintenant: () => horloge });
  const store = new StoreMemoire(options.maintenant);
  const service = creerGestionnaire({
    config,
    client,
    store,
    maintenant: options.maintenant ?? (() => new Date()),
    journal: () => {},
  });
  return { service, config, store };
}

const COMMANDE = {
  commande: 'ELB-20261001-1200-AB',
  produitId: 'tshirt-basic',
  lignes: [{ taille: 'M', quantite: 2 }],
  villeId: 'brazzaville',
  telephone: '06 123 45 67',
};

/** Interroge le statut jusqu'à un état définitif (le client MTN simulé est temporisé). */
async function jusquauBout(service: Gestionnaire, referenceId: string): Promise<string> {
  let statut = 'PENDING';
  for (let i = 0; i < 40 && statut === 'PENDING'; i++) {
    await new Promise((r) => setTimeout(r, 25));
    const r = await service.statut(referenceId);
    statut = (r.corps as { statut: string }).statut;
  }
  return statut;
}

describe('santé et tarifs', () => {
  it('décrit le mode, l’environnement, la devise et le stockage', async () => {
    const { service } = monter();
    const r = await service.sante();
    expect(r.statut).toBe(200);
    expect(r.corps).toMatchObject({ ok: true, mode: 'mock', stockage: 'memoire' });
  });

  it('expose les tarifs que ce processus appliquera (lecture seule, aucun appel MTN)', async () => {
    const { service } = monter();
    const r = await service.tarifs();
    expect(r.statut).toBe(200);
    const corps = r.corps as {
      env: string;
      devise: string;
      chargeLe: string;
      produits: { id: string; prixFcfa: number }[];
      villes: { id: string; fraisFcfa: number | null }[];
      tableaux: { formats: { id: string }[] };
    };
    expect(corps.produits.find((p) => p.id === 'tshirt-basic')?.prixFcfa).toBe(produit('tshirt-basic')!.prixFcfa);
    expect(corps.villes.find((v) => v.id === 'brazzaville')?.fraisFcfa).toBe(ville('brazzaville')!.fraisFcfa);
    expect(corps.villes.find((v) => v.id === 'pointe-noire')?.fraisFcfa).toBe(ville('pointe-noire')!.fraisFcfa);
    expect(corps.tableaux.formats.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(corps.chargeLe))).toBe(false);
  });
});

describe('CORS de transition', () => {
  it('autorise les origines listées et rien d’autre', () => {
    expect(entetesCors(ORIGINE, [ORIGINE])['Access-Control-Allow-Origin']).toBe(ORIGINE);
    expect(entetesCors('https://exemple-malveillant.cg', [ORIGINE])).toEqual({});
    expect(entetesCors(null, [ORIGINE])).toEqual({});
    expect(entetesCors(ORIGINE, [ORIGINE])['Access-Control-Allow-Methods']).toContain('POST');
  });
});

describe('prévention des doubles commandes', () => {
  // Le navigateur peut réémettre la même commande (double clic, réponse perdue, rechargement).
  // Le service refuse le doublon : une commande payée ne se repaie jamais, et une demande en
  // cours ne se double pas — sinon le client serait débité deux fois.

  it('refuse un second paiement pour une commande DÉJÀ PAYÉE', async () => {
    const { service } = monter({ delaiMockMs: 0 });
    const premier = await service.payer(COMMANDE);
    expect(premier.statut).toBe(201);
    const { referenceId } = premier.corps as { referenceId: string };
    expect(await jusquauBout(service, referenceId)).toBe('PAYE');

    const second = await service.payer(COMMANDE);
    expect(second.statut).toBe(422);
    expect(String((second.corps as { erreur: string }).erreur)).toMatch(/déjà payée/);
  });

  it('refuse une seconde demande pendant qu’une demande est EN COURS', async () => {
    const { service } = monter({ delaiMockMs: 60_000 });
    expect((await service.payer(COMMANDE)).statut).toBe(201);

    const second = await service.payer(COMMANDE);
    expect(second.statut).toBe(422);
    expect(String((second.corps as { erreur: string }).erreur)).toMatch(/déjà en cours/);
  });

  it('autorise une nouvelle tentative une fois la fenêtre MTN dépassée', async () => {
    // Sans cette règle, une demande restée en attente bloquerait la commande pour toujours.
    let instant = Date.parse('2026-10-08T10:00:00Z');
    const { service } = monter({ delaiMockMs: 60_000, maintenant: () => new Date(instant) });

    expect((await service.payer(COMMANDE)).statut).toBe(201);

    instant += 6 * 60 * 1000; // six minutes plus tard : MTN a abandonné la demande
    expect((await service.payer(COMMANDE)).statut).toBe(201);

    // Une commande DIFFÉRENTE n'est jamais bloquée par la précédente.
    expect((await service.payer({ ...COMMANDE, commande: 'ELB-20261008-1005-ZZ' })).statut).toBe(201);
  });
});

describe('payer()', () => {
  it('recalcule le montant et renvoie la référence à suivre', async () => {
    const { service } = monter();
    const r = await service.payer(COMMANDE);
    expect(r.statut).toBe(201);
    const corps = r.corps as Record<string, unknown>;
    expect(corps.montantFcfa).toBe(2 * produit('tshirt-basic')!.prixFcfa! + ville('brazzaville')!.fraisFcfa!);
    expect(corps.statut).toBe('PENDING');
    expect(corps.quantiteTotale).toBe(2);
    expect(typeof corps.referenceId).toBe('string');
  });

  it('ignore tout montant envoyé par le navigateur', async () => {
    const { service } = monter();
    const r = await service.payer({ ...COMMANDE, montantFcfa: 1, total: 1 });
    expect((r.corps as { montantFcfa: number }).montantFcfa).toBe(
      2 * produit('tshirt-basic')!.prixFcfa! + ville('brazzaville')!.fraisFcfa!,
    );
  });

  it('refuse une commande non chiffrable (422) avec un motif lisible', async () => {
    const { service } = monter();

    const sansPieces = await service.payer({ ...COMMANDE, lignes: [] });
    expect(sansPieces.statut).toBe(422);
    expect(String((sansPieces.corps as { erreur: string }).erreur)).toMatch(/aucune pièce/);

    const pointeNoire = await service.payer({
      ...COMMANDE,
      commande: 'ELB-20261001-1201-PN',
      villeId: 'pointe-noire',
    });
    expect(pointeNoire.statut).toBe(201);
    expect((pointeNoire.corps as { montantFcfa: number }).montantFcfa).toBe(
      2 * produit('tshirt-basic')!.prixFcfa! + ville('pointe-noire')!.fraisFcfa!,
    );

    const horsZone = await service.payer({
      ...COMMANDE,
      commande: 'ELB-20261001-1202-HZ',
      villeId: 'dolisie',
    });
    expect(horsZone.statut).toBe(422);
    expect(String((horsZone.corps as { erreur: string }).erreur)).toMatch(/Ville inconnue/);

    const mauvaisTel = await service.payer({
      ...COMMANDE,
      commande: 'ELB-20261001-1203-TEL',
      telephone: '12',
    });
    expect(mauvaisTel.statut).toBe(422);
    expect(String((mauvaisTel.corps as { erreur: string }).erreur)).toMatch(/Numéro invalide/);
  });

  it('accepte une commande de tableaux et conserve le détail des formats', async () => {
    const { service } = monter();
    const r = await service.payer({
      commande: 'ELB-20261001-1300-TB',
      produitId: 'tableau',
      lignes: [],
      tableaux: [{ formatId: '40x60', support: 'chassis', quantite: 2 }],
      villeId: 'brazzaville',
      telephone: '06 123 45 67',
    });
    expect(r.statut).toBe(201);
    const corps = r.corps as { montantFcfa: number; lignesTableaux: unknown[] };
    expect(corps.lignesTableaux).toHaveLength(1);
    expect(corps.montantFcfa).toBeGreaterThan(0);
  });

  it('renvoie 502 quand MTN refuse la demande, et marque la transaction', async () => {
    const clientCasse: ClientMomo = {
      demarrerPaiement: async () => {
        const { ErreurMomo } = await import('../src/server/momo/mtn');
        throw new ErreurMomo('MTN a refusé la demande de paiement (500).', 500);
      },
      statut: async (): Promise<StatutPaiement> => ({
        statut: 'PENDING',
        montant: null,
        devise: null,
        financialTransactionId: null,
        raison: null,
      }),
    };
    const { service, store } = monter({ client: clientCasse });
    const r = await service.payer(COMMANDE);
    expect(r.statut).toBe(502);
    expect(String((r.corps as { detail: string }).detail)).toMatch(/MTN/);
    expect((await store.parCommande(COMMANDE.commande))[0]!.statut).toBe('ECHEC');
  });

  it('refuse un corps illisible sans casser', async () => {
    const { service } = monter();
    const r = await service.payer(null);
    expect(r.statut).toBe(422);
    expect(String((r.corps as { erreur: string }).erreur)).toMatch(/Référence de commande manquante/);
  });
});

describe('statut()', () => {
  it('reste PENDING tant que le client n’a pas validé, puis passe à PAYE', async () => {
    const { service } = monter({ delaiMockMs: 5000 });
    const creation = await service.payer(COMMANDE);
    const { referenceId } = creation.corps as { referenceId: string };

    expect(((await service.statut(referenceId)).corps as { statut: string }).statut).toBe('PENDING');

    horloge += 6000; // le client valide sur son téléphone
    const corps = (await service.statut(referenceId)).corps as {
      statut: string;
      montantFcfa: number;
      commande: string;
    };
    expect(corps.statut).toBe('PAYE');
    expect(corps.montantFcfa).toBe(2 * produit('tshirt-basic')!.prixFcfa! + ville('brazzaville')!.fraisFcfa!);
    expect(corps.commande).toBe(COMMANDE.commande);
  });

  it('passe à ECHEC selon le scénario officiel du sandbox (…51 = rejeté)', async () => {
    const { service } = monter();
    const creation = await service.payer({ ...COMMANDE, telephone: '46733123451' });
    const { referenceId } = creation.corps as { referenceId: string };
    const corps = (await service.statut(referenceId)).corps as { statut: string; raison: string };
    expect(corps.statut).toBe('ECHEC');
    expect(corps.raison).toBe('REJECTED');
  });

  it('suit la table MTN : …55 = payeur introuvable, …53 reste en attente', async () => {
    const { service } = monter();
    const creation = await service.payer({ ...COMMANDE, telephone: '46733123455' });
    const { referenceId } = creation.corps as { referenceId: string };
    expect((await service.statut(referenceId)).corps).toMatchObject({
      statut: 'ECHEC',
      raison: 'PAYER_NOT_FOUND',
    });

    const ongoing = await service.payer({ ...COMMANDE, telephone: '46733123453' });
    const ref2 = (ongoing.corps as { referenceId: string }).referenceId;
    horloge += 600_000; // même très longtemps après, « en cours » ne se dénoue pas
    expect(((await service.statut(ref2)).corps as { statut: string }).statut).toBe('PENDING');
  });

  it('répond 404 sur une référence inconnue et 422 sans paramètre', async () => {
    const { service } = monter();
    expect((await service.statut('zzz')).statut).toBe(404);
    expect((await service.statut('')).statut).toBe(422);
  });
});

describe('callback()', () => {
  it('confirme le paiement après revérification auprès de MTN', async () => {
    const { service } = monter({ delaiMockMs: 0 });
    const creation = await service.payer(COMMANDE);
    const { referenceId } = creation.corps as { referenceId: string };

    const r = await service.callback({ referenceId });
    expect(r.statut).toBe(200);
    expect(r.corps).toMatchObject({ recu: true, traite: true, statut: 'PAYE' });

    const corps = (await service.statut(referenceId)).corps as {
      statut: string;
      financialTransactionId: string;
    };
    expect(corps.statut).toBe('PAYE');
    expect(corps.financialTransactionId).toMatch(/^MOCK-/);
  });

  it('est idempotent : rejouer le callback ne change rien', async () => {
    const { service } = monter({ delaiMockMs: 0 });
    const creation = await service.payer(COMMANDE);
    const { referenceId } = creation.corps as { referenceId: string };

    await service.callback({ referenceId });
    expect((await service.callback({ referenceId })).corps).toMatchObject({
      recu: true,
      traite: false,
      statut: 'PAYE',
    });
  });

  it('répond 200 même pour une référence inconnue (MTN ne doit pas boucler)', async () => {
    const { service } = monter();
    const r = await service.callback({ referenceId: 'inconnue' });
    expect(r.statut).toBe(200);
    expect(r.corps).toMatchObject({ recu: true, traite: false });
  });

  it('refuse de valider si le montant encaissé ne correspond pas : ANOMALIE', async () => {
    const clientTruque: ClientMomo = {
      demarrerPaiement: async () => undefined,
      statut: async () => ({
        statut: 'SUCCESSFUL' as const,
        montant: '1000', // MTN annonce 1 000 alors que la commande vaut bien plus
        devise: 'XAF',
        financialTransactionId: 'FT-1',
        raison: null,
      }),
    };
    const { service } = monter({ client: clientTruque });
    const creation = await service.payer(COMMANDE);
    const { referenceId } = creation.corps as { referenceId: string };

    expect((await service.callback({ referenceId })).corps).toMatchObject({
      traite: true,
      statut: 'ANOMALIE',
    });
    expect((await service.statut(referenceId)).corps).toMatchObject({ statut: 'ANOMALIE' });
  });

  it('accepte la référence passée dans le chemin (les paramètres de requête sont proscrits)', async () => {
    const { service } = monter({ delaiMockMs: 0 });
    const creation = await service.payer(COMMANDE);
    const { referenceId } = creation.corps as { referenceId: string };
    expect((await service.callback({}, referenceId)).corps).toMatchObject({
      traite: true,
      statut: 'PAYE',
    });
  });
});
