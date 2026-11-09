/**
 * Cycle de vie réel sur un projet Supabase de TEST.
 *
 * Vérifie les invariants qui protègent l'argent et la production :
 *   - une commande doit exister et être en attente de paiement ;
 *   - le montant du paiement doit égaler le total de la commande ;
 *   - un seul paiement PAYE par commande ;
 *   - le passage PAYEE crée une tâche de production ;
 *   - une transition PAYEE → EN_PRODUCTION est refusée.
 *
 * Variables :
 *   SUPABASE_TEST_URL
 *   SUPABASE_TEST_SERVICE_ROLE_KEY  (secrète, jamais dans le dépôt)
 *   SUPABASE_TEST_ANON_KEY
 *
 * Sans ces variables, la suite est ignorée. Ne jamais la pointer vers la production.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

const URL = (process.env.SUPABASE_TEST_URL ?? '').replace(/\/+$/, '');
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '';
const actif = Boolean(URL && ANON && SERVICE);

type Json = Record<string, unknown>;

async function service(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
}

async function serviceJson<T = Json>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await service(path, init);
  const corps = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${corps}`);
  return (corps ? JSON.parse(corps) : null) as T;
}

async function serviceOne<T = Json>(path: string, init: RequestInit = {}): Promise<T> {
  const lignes = await serviceJson<T[]>(path, init);
  const ligne = Array.isArray(lignes) ? lignes[0] : undefined;
  if (!ligne) throw new Error(`Aucune ligne renvoyée par ${path}`);
  return ligne;
}

async function creerUtilisateur(role: string, email: string, runId: string): Promise<{ id: string; email: string; password: string }> {
  const password = `Test-${randomUUID()}`;
  const r = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { test: true, test_run_id: runId },
    }),
  });
  const corps = (await r.json()) as { id?: string; msg?: string };
  if (!r.ok || !corps.id) throw new Error(`Création utilisateur ${role} : ${r.status} ${JSON.stringify(corps)}`);
  return { id: corps.id, email, password };
}

async function jeton(email: string, password: string): Promise<string> {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const corps = (await r.json()) as { access_token?: string };
  if (!r.ok || !corps.access_token) throw new Error(`Connexion ${email} : ${r.status}`);
  return corps.access_token;
}

async function as(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

const suffixe = randomUUID().slice(0, 8).toUpperCase();
const ids = {
  users: [] as string[],
  clients: [] as string[],
  devis: [] as string[],
  commandes: [] as string[],
  produits: [] as string[],
};

let clientA: { id: string };
let clientB: { id: string };
let commandeA: { id: string; reference: string };
let commandeB: { id: string; reference: string };
let jetonA = '';
let jetonCommercial = '';
let jetonAtelier = '';
let jetonFinance = '';
let jetonAdmin = '';
let depenseTest: { id: string };
let adminId = '';

describe.skipIf(!actif)('cycle commande-paiement-production (Supabase de test)', () => {
  beforeAll(async () => {
    const userA = await creerUtilisateur('PARTICULIER', `client-a-${suffixe}@example.test`, suffixe);
    const userB = await creerUtilisateur('PARTICULIER', `client-b-${suffixe}@example.test`, suffixe);
    const commercial = await creerUtilisateur('commercial', `commercial-${suffixe}@example.test`, suffixe);
    const atelier = await creerUtilisateur('atelier', `atelier-${suffixe}@example.test`, suffixe);
    const finance = await creerUtilisateur('finance', `finance-${suffixe}@example.test`, suffixe);
    const admin = await creerUtilisateur('admin', `admin-${suffixe}@example.test`, suffixe);
    ids.users.push(userA.id, userB.id, commercial.id, atelier.id, finance.id, admin.id);
    adminId = admin.id;

    clientA = await serviceOne<{ id: string }>('clients', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userA.id,
        nom: `Client A ${suffixe}`,
        telephone: '060000001',
        email: `client-a-${suffixe}@example.test`,
        metadata: { test: true, test_run_id: suffixe },
      }),
    });
    clientB = await serviceOne<{ id: string }>('clients', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userB.id,
        nom: `Client B ${suffixe}`,
        telephone: '060000002',
        email: `client-b-${suffixe}@example.test`,
        metadata: { test: true, test_run_id: suffixe },
      }),
    });
    ids.clients.push(clientA.id, clientB.id);

    commandeA = await serviceOne<{ id: string; reference: string }>('commandes', {
      method: 'POST',
      body: JSON.stringify({
        reference: `ELB-${suffixe}-A`,
        client_id: clientA.id,
        idempotency_key: `TEST-${suffixe}-A`,
        notes: `TEST:${suffixe}`,
        statut: 'EN_ATTENTE_DE_PAIEMENT',
        statut_paiement: 'EN_ATTENTE',
        sous_total_fcfa: 1000,
        livraison_fcfa: 0,
        total_fcfa: 1000,
        design_snapshot: { version: 1, produit: 'tshirt-basic' },
      }),
    });
    commandeB = await serviceOne<{ id: string; reference: string }>('commandes', {
      method: 'POST',
      body: JSON.stringify({
        reference: `ELB-${suffixe}-B`,
        client_id: clientB.id,
        idempotency_key: `TEST-${suffixe}-B`,
        notes: `TEST:${suffixe}`,
        statut: 'EN_ATTENTE_DE_PAIEMENT',
        statut_paiement: 'EN_ATTENTE',
        sous_total_fcfa: 500,
        livraison_fcfa: 0,
        total_fcfa: 500,
      }),
    });
    ids.commandes.push(commandeA.id, commandeB.id);

    jetonA = await jeton(userA.email, userA.password);
    jetonCommercial = await jeton(commercial.email, commercial.password);
    jetonAtelier = await jeton(atelier.email, atelier.password);
    jetonFinance = await jeton(finance.email, finance.password);
    jetonAdmin = await jeton(admin.email, admin.password);

    depenseTest = await serviceOne<{ id: string }>('depenses', {
      method: 'POST',
      body: JSON.stringify({
        categorie: 'PUBLICITE',
        libelle: `Dépense test ${suffixe}`,
        notes: `TEST:${suffixe}`,
        montant_fcfa: 100,
        date_depense: '2026-11-09',
      }),
    });
  });

  afterAll(async () => {
    if (!actif) return;
    // Nettoyage : paiements → production → commandes → clients → utilisateurs.
    if (ids.commandes.length) {
      const inList = ids.commandes.join(',');
      await service(`paiements?commande_id=in.(${inList})`, { method: 'DELETE' });
      await service(`travaux_production?commande_id=in.(${inList})`, { method: 'DELETE' });
      await service(`commandes?id=in.(${inList})`, { method: 'DELETE' });
    }
    if (ids.clients.length) {
      const inList = ids.clients.join(',');
      await service(`clients?id=in.(${inList})`, { method: 'DELETE' });
    }
    if (depenseTest?.id) {
      await service(`depenses?id=eq.${depenseTest.id}`, { method: 'DELETE' });
    }
    if (ids.produits.length) {
      await service(`produits?id=in.(${ids.produits.join(',')})`, { method: 'DELETE' });
    }
    for (const id of ids.users) {
      await fetch(`${URL}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
    }
  });

  it('le client A ne lit que ses propres commandes', async () => {
    const r = await as(jetonA, `commandes?select=id,reference&reference=like.*${suffixe}*`);
    const corps = (await r.json()) as { id: string }[];
    expect(r.ok).toBe(true);
    expect(corps.map((c) => c.id)).toContain(commandeA.id);
    expect(corps.map((c) => c.id)).not.toContain(commandeB.id);
  });

  it('un commercial lit les commandes mais pas les paiements ni les dépenses', async () => {
    const commandes = await as(jetonCommercial, `commandes?select=id&reference=like.*${suffixe}*`);
    expect((await commandes.json()) as unknown[]).toHaveLength(2);

    const paiements = await as(jetonCommercial, 'paiements?select=reference_id');
    expect(await paiements.json()).toEqual([]);

    const depenses = await as(jetonCommercial, 'depenses?select=id');
    expect(await depenses.json()).toEqual([]);
  });

  it('un utilisateur authentifié ne peut pas écrire directement', async () => {
    const r = await as(jetonCommercial, 'clients', {
      method: 'POST',
      body: JSON.stringify({ nom: 'Tentative', telephone: '060000003' }),
    });
    expect([401, 403]).toContain(r.status);
  });

  it('le rôle app_metadata ne peut pas être élevé par l’utilisateur', async () => {
    const r = await fetch(`${URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${jetonCommercial}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { role: 'admin' },
        app_metadata: { role: 'admin' },
      }),
    });
    // GoTrue peut ignorer ou refuser app_metadata ; dans les deux cas le rôle doit rester commercial.
    expect([200, 400, 401, 403, 422]).toContain(r.status);

    const verif = await fetch(`${URL}/auth/v1/user`, {
      headers: { apikey: ANON, Authorization: `Bearer ${jetonCommercial}` },
    });
    const utilisateur = (await verif.json()) as { app_metadata?: { role?: string } };
    expect(utilisateur.app_metadata?.role).toBe('commercial');
  });

  it('refuse un prix VALIDE sans acteur et date de validation', async () => {
    const sansValidation = await service('produits', {
      method: 'POST',
      body: JSON.stringify({
        id: `test-prix-${suffixe.toLowerCase()}`,
        famille: 'TEXTILE',
        nom: 'Produit test prix',
        statut_prix: 'VALIDE',
        prix_fcfa: 1000,
      }),
    });
    expect(sansValidation.ok).toBe(false);

    const avecValidation = await serviceOne<{ id: string }>('produits', {
      method: 'POST',
      body: JSON.stringify({
        id: `test-prix-${suffixe.toLowerCase()}`,
        famille: 'TEXTILE',
        nom: 'Produit test prix',
        statut_prix: 'VALIDE',
        prix_fcfa: 1000,
        prix_valide_par: adminId,
        prix_valide_par_email: `admin-${suffixe}@example.test`,
        prix_valide_le: new Date().toISOString(),
        metadata: { test: true, test_run_id: suffixe },
      }),
    });
    ids.produits.push(avecValidation.id);
  });

  it('refuse un paiement dont le montant diffère du total de la commande', async () => {
    const r = await service('paiements', {
      method: 'POST',
      body: JSON.stringify({
        reference_id: randomUUID(),
        idempotency_key: `TEST-${suffixe}-${randomUUID().slice(0, 8)}`,
        commande_id: commandeA.id,
        montant_fcfa: 1,
        montant_envoye: '1',
        msisdn: '242060000001',
      }),
    });
    expect(r.ok).toBe(false);
    expect(await r.text()).toMatch(/montant/i);
  });

  it('refuse PAYEE sans paiement confirmé', async () => {
    const r = await service(`commandes?id=eq.${commandeA.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ statut: 'PAYEE' }),
    });
    expect(r.ok).toBe(false);
  });

  it('un paiement PAYE met à jour la commande et crée la tâche de production', async () => {
    const paiement = await serviceOne<{ reference_id: string }>('paiements', {
      method: 'POST',
      body: JSON.stringify({
        reference_id: randomUUID(),
        idempotency_key: `TEST-${suffixe}-${randomUUID().slice(0, 8)}`,
        commande_id: commandeA.id,
        montant_fcfa: 1000,
        montant_envoye: '1000',
        msisdn: '242060000001',
      }),
    });
    const maj = await service(`paiements?reference_id=eq.${paiement.reference_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ statut: 'PAYE' }),
    });
    expect(maj.ok).toBe(true);

    const commandes = await serviceJson<{ statut: string; statut_paiement: string }[]>(
      `commandes?id=eq.${commandeA.id}&select=statut,statut_paiement`,
    );
    expect(commandes[0]).toMatchObject({ statut: 'PAYEE', statut_paiement: 'PAYE' });

    const travaux = await serviceJson<{ etape: string; statut: string }[]>(
      `travaux_production?commande_id=eq.${commandeA.id}&select=etape,statut`,
    );
    expect(travaux).toEqual([{ etape: 'INITIALISATION', statut: 'A_FAIRE' }]);
  });

  it('un atelier lit les commandes et la production, pas les paiements ni les dépenses', async () => {
    const commandes = await as(jetonAtelier, `commandes?select=id&reference=like.*${suffixe}*`);
    expect((await commandes.json()) as unknown[]).toHaveLength(2);

    const production = await as(jetonAtelier, `travaux_production?select=etape&commande_id=eq.${commandeA.id}`);
    expect((await production.json()) as unknown[]).toHaveLength(1);

    expect(await (await as(jetonAtelier, 'paiements?select=reference_id')).json()).toEqual([]);
    expect(await (await as(jetonAtelier, 'depenses?select=id')).json()).toEqual([]);
  });

  it('la finance lit les paiements et les dépenses, pas les notifications', async () => {
    const paiements = await as(jetonFinance, 'paiements?select=reference_id');
    expect(((await paiements.json()) as unknown[]).length).toBeGreaterThanOrEqual(1);

    const depenses = await as(jetonFinance, `depenses?select=id&id=eq.${depenseTest.id}`);
    expect(await depenses.json()).toEqual([{ id: depenseTest.id }]);

    expect(await (await as(jetonFinance, 'notifications?select=id')).json()).toEqual([]);
  });

  it('l’administrateur lit les paiements, dépenses et le journal d’audit', async () => {
    for (const table of ['paiements?select=reference_id', 'depenses?select=id', 'journal_audit?select=id']) {
      const r = await as(jetonAdmin, table);
      expect(r.ok).toBe(true);
      expect(Array.isArray(await r.json())).toBe(true);
    }
  });

  it('refuse un second paiement PAYE pour la même commande', async () => {
    const p1 = await serviceOne<{ reference_id: string }>('paiements', {
      method: 'POST',
      body: JSON.stringify({
        reference_id: randomUUID(),
        idempotency_key: `TEST-${suffixe}-${randomUUID().slice(0, 8)}`,
        commande_id: commandeB.id,
        montant_fcfa: 500,
        montant_envoye: '500',
        msisdn: '242060000002',
      }),
    });
    const p2 = await serviceOne<{ reference_id: string }>('paiements', {
      method: 'POST',
      body: JSON.stringify({
        reference_id: randomUUID(),
        idempotency_key: `TEST-${suffixe}-${randomUUID().slice(0, 8)}`,
        commande_id: commandeB.id,
        montant_fcfa: 500,
        montant_envoye: '500',
        msisdn: '242060000002',
      }),
    });
    expect((await service(`paiements?reference_id=eq.${p1.reference_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ statut: 'PAYE' }),
    })).ok).toBe(true);
    const second = await service(`paiements?reference_id=eq.${p2.reference_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ statut: 'PAYE' }),
    });
    expect(second.ok).toBe(false);
  });

  it('refuse une transition PAYEE → EN_PRODUCTION', async () => {
    const r = await service(`commandes?id=eq.${commandeA.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ statut: 'EN_PRODUCTION' }),
    });
    expect(r.ok).toBe(false);
  });
});
