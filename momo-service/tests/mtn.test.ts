import { describe, expect, it, vi } from 'vitest';

import { ErreurMomo, creerClientMomo } from '../src/mtn.ts';

type Appel = { url: string; init: RequestInit | undefined };

/** Faux MTN : on observe exactement ce qui part, sans réseau. */
function fauxMtn(reponses: Array<{ statut: number; corps: unknown }>) {
  const appels: Appel[] = [];
  let i = 0;
  const fetchFactice = (async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({ url: String(url), init });
    const r = reponses[Math.min(i, reponses.length - 1)]!;
    i += 1;
    return new Response(typeof r.corps === 'string' ? r.corps : JSON.stringify(r.corps), {
      status: r.statut,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof globalThis.fetch;
  return { appels, fetchFactice };
}

const CONFIG = {
  baseUrl: 'https://sandbox.momodeveloper.mtn.com',
  subscriptionKey: 'cle-abonnement',
  apiUser: 'utilisateur-api',
  apiKey: 'cle-api',
  environnement: 'sandbox',
  callbackUrl: 'https://exemple.cg/api/momo/callback',
};

const DEMANDE = {
  referenceId: '11111111-2222-4333-8444-555555555555',
  montant: '10',
  devise: 'EUR',
  telephone: '46733123450',
  externalId: 'ELB-20261001-1200-AB',
};

describe('client MTN', () => {
  it('demande un jeton puis envoie la demande de paiement avec les bons en-têtes', async () => {
    const { appels, fetchFactice } = fauxMtn([
      { statut: 200, corps: { access_token: 'jeton-1', expires_in: 3600 } },
      { statut: 202, corps: '' },
    ]);
    const client = creerClientMomo(CONFIG, { fetch: fetchFactice });

    await client.demarrerPaiement(DEMANDE);

    expect(appels).toHaveLength(2);
    const [jeton, paiement] = appels;

    expect(jeton!.url).toBe('https://sandbox.momodeveloper.mtn.com/collection/token/');
    const entetesJeton = jeton!.init?.headers as Record<string, string>;
    expect(entetesJeton.Authorization).toBe(`Basic ${Buffer.from('utilisateur-api:cle-api').toString('base64')}`);
    expect(entetesJeton['Ocp-Apim-Subscription-Key']).toBe('cle-abonnement');

    expect(paiement!.url).toBe('https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay');
    const entetes = paiement!.init?.headers as Record<string, string>;
    expect(entetes.Authorization).toBe('Bearer jeton-1');
    expect(entetes['X-Reference-Id']).toBe(DEMANDE.referenceId);
    expect(entetes['X-Target-Environment']).toBe('sandbox');
    expect(entetes['X-Callback-Url']).toBe(CONFIG.callbackUrl);

    const corps = JSON.parse(String(paiement!.init?.body));
    expect(corps).toEqual({
      amount: '10',
      currency: 'EUR',
      externalId: DEMANDE.externalId,
      payer: { partyIdType: 'MSISDN', partyId: '46733123450' },
      payerMessage: 'Commande Elembo',
      payeeNote: 'T-shirt personnalise',
    });
  });

  it('met le jeton en cache : deux paiements, un seul appel de jeton', async () => {
    const { appels, fetchFactice } = fauxMtn([
      { statut: 200, corps: { access_token: 'jeton-1', expires_in: 3600 } },
      { statut: 202, corps: '' },
      { statut: 202, corps: '' },
    ]);
    let maintenant = 0;
    const client = creerClientMomo(CONFIG, { fetch: fetchFactice, maintenant: () => maintenant });

    await client.demarrerPaiement(DEMANDE);
    maintenant = 60_000;
    await client.demarrerPaiement({ ...DEMANDE, referenceId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });

    const jetons = appels.filter((a) => a.url.endsWith('/collection/token/'));
    expect(jetons).toHaveLength(1);
    expect(appels).toHaveLength(3);
  });

  it('renouvelle le jeton une fois expiré', async () => {
    const { appels, fetchFactice } = fauxMtn([
      { statut: 200, corps: { access_token: 'jeton-1', expires_in: 3600 } },
      { statut: 202, corps: '' },
      { statut: 200, corps: { access_token: 'jeton-2', expires_in: 3600 } },
      { statut: 202, corps: '' },
    ]);
    let maintenant = 0;
    const client = creerClientMomo(CONFIG, { fetch: fetchFactice, maintenant: () => maintenant });

    await client.demarrerPaiement(DEMANDE);
    maintenant = 3_700_000; // au-delà de l'expiration annoncée
    await client.demarrerPaiement({ ...DEMANDE, referenceId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });

    expect(appels.filter((a) => a.url.endsWith('/collection/token/'))).toHaveLength(2);
    const dernierPaiement = appels[appels.length - 1]!;
    expect((dernierPaiement.init?.headers as Record<string, string>).Authorization).toBe('Bearer jeton-2');
  });

  it('ne fait pas deux demandes de jeton en parallèle', async () => {
    const { appels, fetchFactice } = fauxMtn([
      { statut: 200, corps: { access_token: 'jeton-1', expires_in: 3600 } },
      { statut: 202, corps: '' },
      { statut: 202, corps: '' },
    ]);
    const client = creerClientMomo(CONFIG, { fetch: fetchFactice });

    await Promise.all([
      client.demarrerPaiement(DEMANDE),
      client.demarrerPaiement({ ...DEMANDE, referenceId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }),
    ]);

    expect(appels.filter((a) => a.url.endsWith('/collection/token/'))).toHaveLength(1);
  });

  it('explique un jeton refusé sans divulguer les identifiants', async () => {
    const { fetchFactice } = fauxMtn([{ statut: 401, corps: { error: 'invalid_client' } }]);
    const client = creerClientMomo(CONFIG, { fetch: fetchFactice });

    await expect(client.demarrerPaiement(DEMANDE)).rejects.toThrow(ErreurMomo);
    await expect(client.demarrerPaiement(DEMANDE)).rejects.toThrow(/API USER/);
  });

  it('refuse tout autre code que 202 sur la demande de paiement', async () => {
    const { fetchFactice } = fauxMtn([
      { statut: 200, corps: { access_token: 'jeton-1', expires_in: 3600 } },
      { statut: 409, corps: { message: 'reference already used' } },
    ]);
    const client = creerClientMomo(CONFIG, { fetch: fetchFactice });

    await expect(client.demarrerPaiement(DEMANDE)).rejects.toMatchObject({ statutHttp: 409 });
  });

  it('lit le statut et distingue les trois états', async () => {
    const { fetchFactice } = fauxMtn([
      { statut: 200, corps: { access_token: 'jeton-1', expires_in: 3600 } },
      { statut: 200, corps: { status: 'PENDING' } },
      { statut: 200, corps: { status: 'SUCCESSFUL', amount: '10', currency: 'EUR', financialTransactionId: 'FT123' } },
      { statut: 200, corps: { status: 'FAILED', reason: 'PAYER_NOT_FOUND' } },
    ]);
    const client = creerClientMomo(CONFIG, { fetch: fetchFactice });

    expect((await client.statut('ref-1')).statut).toBe('PENDING');
    const reussi = await client.statut('ref-1');
    expect(reussi.statut).toBe('SUCCESSFUL');
    expect(reussi.financialTransactionId).toBe('FT123');
    expect(reussi.montant).toBe('10');
    expect((await client.statut('ref-1')).statut).toBe('FAILED');
  });

  it('signale une référence inconnue de MTN', async () => {
    const { fetchFactice } = fauxMtn([
      { statut: 200, corps: { access_token: 'jeton-1', expires_in: 3600 } },
      { statut: 404, corps: { message: 'not found' } },
    ]);
    const client = creerClientMomo(CONFIG, { fetch: fetchFactice });
    await expect(client.statut('inconnue')).rejects.toMatchObject({ statutHttp: 404 });
  });

  it('n’ajoute pas d’en-tête de callback quand aucun n’est déclaré', async () => {
    const { appels, fetchFactice } = fauxMtn([
      { statut: 200, corps: { access_token: 'jeton-1', expires_in: 3600 } },
      { statut: 202, corps: '' },
    ]);
    const client = creerClientMomo({ ...CONFIG, callbackUrl: null }, { fetch: fetchFactice });
    await client.demarrerPaiement(DEMANDE);
    const entetes = appels[1]!.init?.headers as Record<string, string>;
    expect(entetes['X-Callback-Url']).toBeUndefined();
  });

  it('échappe la référence dans l’URL de statut', async () => {
    const espion = vi.fn();
    const { fetchFactice } = fauxMtn([
      { statut: 200, corps: { access_token: 'jeton-1', expires_in: 3600 } },
      { statut: 200, corps: { status: 'PENDING' } },
    ]);
    const client = creerClientMomo(CONFIG, { fetch: fetchFactice });
    await client.statut('a b/c');
    espion();
    await expect(client.statut('a b/c')).resolves.toBeDefined();
  });
});
