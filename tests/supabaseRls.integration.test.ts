/**
 * Tests d'accès Supabase — à exécuter uniquement contre un projet de TEST.
 *
 * Variables :
 *   SUPABASE_TEST_URL       https://<projet-test>.supabase.co
 *   SUPABASE_TEST_ANON_KEY  clé anon du projet de test (publique, sans danger)
 *
 * Sans ces variables, la suite est ignorée : elle ne prétend pas avoir vérifié la RLS.
 * Ne jamais pointer ces tests vers la production : ils tentent des lectures et une insertion.
 */

import { describe, expect, it } from 'vitest';

const URL = (process.env.SUPABASE_TEST_URL ?? '').replace(/\/+$/, '');
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? '';
const actif = Boolean(URL && ANON);

async function rest(chemin: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${URL}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function lignes(chemin: string): Promise<unknown[]> {
  const r = await rest(chemin);
  if (r.status === 401 || r.status === 403 || r.status === 404) return [];
  const corps = (await r.json()) as unknown;
  return Array.isArray(corps) ? corps : [];
}

describe.skipIf(!actif)('RLS Supabase (projet de test)', () => {
  it('le projet répond et l’API REST est joignable', async () => {
    const r = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON } });
    expect([200, 204]).toContain(r.status);
  });

  it('anon ne lit aucune table commerciale', async () => {
    for (const table of ['clients', 'commandes', 'devis', 'paiements', 'fichiers_commande']) {
      expect(await lignes(`${table}?select=*&limit=1`), table).toHaveLength(0);
    }
  });

  it('anon ne peut pas insérer un client', async () => {
    const r = await rest('clients', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ nom: 'Test RLS', telephone: '060000000' }),
    });
    expect([401, 403]).toContain(r.status);
  });

  it('anon ne lit que les produits validés (le seed est en TEST/PROVISOIRE)', async () => {
    const produits = await lignes('produits?select=id,statut_prix&limit=20');
    expect(produits.every((p) => (p as { statut_prix?: string }).statut_prix === 'VALIDE')).toBe(true);
  });

  it('anon ne lit que les paramètres publics', async () => {
    const parametres = await lignes('parametres?select=cle,est_public&limit=50');
    expect(parametres.every((p) => (p as { est_public?: boolean }).est_public === true)).toBe(true);
  });
});
