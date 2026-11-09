import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET as fichiersGet } from '../src/app/api/commandes/[commande]/fichiers/route';
import { GET as reconcilierGet } from '../src/app/api/momo/reconcilier/route';
import { avecGardeRole } from '../src/server/auth/route';

const envInitial = {
  atelier: process.env.ATELIER_TOKEN,
  cron: process.env.CRON_SECRET,
};

afterEach(() => {
  if (envInitial.atelier === undefined) delete process.env.ATELIER_TOKEN;
  else process.env.ATELIER_TOKEN = envInitial.atelier;
  if (envInitial.cron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = envInitial.cron;
});

function contexte(commande: string) {
  return { params: Promise.resolve({ commande }) };
}

describe('routes API — contrôles d’accès', () => {
  it('la route atelier refuse une requête sans jeton', async () => {
    const r = await fichiersGet(
      new Request('https://elembo.test/api/commandes/ELB-ABC123/fichiers'),
      contexte('ELB-ABC123'),
    );
    expect(r.status).toBe(401);
  });

  it('la route atelier refuse un jeton en query string et un mauvais jeton', async () => {
    process.env.ATELIER_TOKEN = 'secret-route-test';

    const query = await fichiersGet(
      new Request('https://elembo.test/api/commandes/ELB-ABC123/fichiers?token=secret-route-test'),
      contexte('ELB-ABC123'),
    );
    expect(query.status).toBe(401);

    const mauvais = await fichiersGet(
      new Request('https://elembo.test/api/commandes/ELB-ABC123/fichiers', {
        headers: { 'x-atelier-token': 'mauvais' },
      }),
      contexte('ELB-ABC123'),
    );
    expect(mauvais.status).toBe(401);
  });

  it('la route atelier refuse une référence invalide après authentification', async () => {
    process.env.ATELIER_TOKEN = 'secret-route-test';
    const r = await fichiersGet(
      new Request('https://elembo.test/api/commandes/ELB-X/fichiers', {
        headers: { 'x-atelier-token': 'secret-route-test' },
      }),
      contexte('ELB-X'),
    );
    expect(r.status).toBe(400);
  });

  it('la route de réconciliation refuse sans CRON_SECRET ou avec un mauvais secret', async () => {
    delete process.env.CRON_SECRET;
    const sansSecret = await reconcilierGet(new Request('https://elembo.test/api/momo/reconcilier'));
    expect(sansSecret.status).toBe(401);

    process.env.CRON_SECRET = 'cron-test';
    const mauvais = await reconcilierGet(
      new Request('https://elembo.test/api/momo/reconcilier', {
        headers: { authorization: 'Bearer mauvais' },
      }),
    );
    expect(mauvais.status).toBe(401);
  });
});

describe('avecGardeRole — modèle des futures routes service_role', () => {
  const handler = vi.fn(async () => Response.json({ ok: true }));

  it('refuse sans claims (401) et si la lecture échoue (401)', async () => {
    const sansClaims = avecGardeRole(['admin'], () => null, handler);
    expect((await sansClaims(new Request('https://elembo.test/api/admin/test'))).status).toBe(401);

    const erreur = avecGardeRole(
      ['admin'],
      () => {
        throw new Error('JWT illisible');
      },
      handler,
    );
    expect((await erreur(new Request('https://elembo.test/api/admin/test'))).status).toBe(401);
  });

  it('refuse un rôle insuffisant ou un rôle placé dans user_metadata (403)', async () => {
    const commercial = avecGardeRole(
      ['admin'],
      () => ({ app_metadata: { role: 'commercial' } }),
      handler,
    );
    expect((await commercial(new Request('https://elembo.test/api/admin/test'))).status).toBe(403);

    const userMetadata = avecGardeRole(
      ['admin'],
      () => ({ user_metadata: { role: 'admin' } }),
      handler,
    );
    expect((await userMetadata(new Request('https://elembo.test/api/admin/test'))).status).toBe(403);
  });

  it('autorise le rôle attendu et transmet les claims au handler', async () => {
    const claims = { sub: 'user-1', app_metadata: { role: 'admin' } };
    const route = avecGardeRole(['admin'], () => claims, handler);
    const r = await route(new Request('https://elembo.test/api/admin/test'));
    expect(r.status).toBe(200);
    await expect(r.json()).resolves.toEqual({ ok: true });
    expect(handler).toHaveBeenCalledWith(expect.any(Request), claims);
  });
});
