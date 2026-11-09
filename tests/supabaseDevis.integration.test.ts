/**
 * Intégration des devis et des sessions — projet Supabase de TEST uniquement.
 *
 * Exigence : la limite de 5 sessions actives par devis est garantie par un verrou
 * consultatif transactionnel dans `creer_session_devis`, y compris sur des créations
 * concurrentes. Ce test le prouve avec 12 appels simultanés.
 *
 * Sans SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY,
 * la suite est ignorée : elle ne prétend pas avoir vérifié la base.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';

const URL = (process.env.SUPABASE_TEST_URL ?? '').replace(/\/+$/, '');
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '';
const actif = Boolean(URL && ANON && SERVICE);

const runId = (process.env.SUPABASE_TEST_RUN_ID ?? randomBytes(4).toString('hex')).toUpperCase();
const reference = `DEV-TEST-${runId}`;
const email = `test-devis-${runId.toLowerCase()}@example.invalid`;

type Json = Record<string, unknown>;
type DevisCree = { devis_id: string; client_id: string; reference: string; deja_existant: boolean };

let devisId = '';
let clientId = '';

async function rest(chemin: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${URL}/rest/v1/${chemin}`, {
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

async function rpc<T = Json>(nom: string, corps: Json): Promise<T> {
  const r = await rest(`rpc/${nom}`, { method: 'POST', body: JSON.stringify(corps) });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${nom}: HTTP ${r.status} ${texte.slice(0, 400)}`);
  return (texte ? JSON.parse(texte) : null) as T;
}

function donneesCreation(): Json {
  return {
    p_idempotency_key: `TEST-DEV-${runId}-A`,
    p_reference: reference,
    p_suivi_token_hash: `hash-${runId}`,
    p_suivi_token_expire_le: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    p_nom: 'Test Devis',
    p_societe: null,
    p_email: email,
    p_telephone: '060000001',
    p_telephone_normalise: `24206${runId.replace(/\D/g, '').padEnd(7, '1').slice(0, 7)}`,
    p_type_client: 'PARTICULIER',
    p_ville: 'Brazzaville',
    p_famille: 'SERVICES',
    p_besoin: 'Test d’intégration des sessions de devis.',
    p_format: null,
    p_quantite: 1,
    p_specifications: {},
    p_contact_snapshot: {},
    p_staff_email: null,
    p_staff_telegram: null,
    p_source: 'SITE',
  };
}

async function creerDevis(): Promise<DevisCree> {
  const resultat = await rpc<DevisCree[]>('creer_devis_atomique', donneesCreation());
  const ligne = resultat[0];
  if (!ligne) throw new Error('Création de devis sans réponse.');
  return ligne;
}

async function sessionsActives(): Promise<{ id: string; sid_hash: string }[]> {
  const r = await rest(
    `devis_sessions?select=id,sid_hash&devis_id=eq.${devisId}&revoque_le=is.null`,
  );
  if (!r.ok) throw new Error(`Lecture sessions: HTTP ${r.status}`);
  return (await r.json()) as { id: string; sid_hash: string }[];
}

async function supprimer(chemin: string): Promise<void> {
  const r = await rest(chemin, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error(`Nettoyage ${chemin}: HTTP ${r.status}`);
}

describe.skipIf(!actif)('Devis et sessions Supabase', () => {
  beforeAll(async () => {
    const devis = await creerDevis();
    devisId = devis.devis_id;
    clientId = devis.client_id;
  }, 30_000);

  afterAll(async () => {
    if (!devisId) return;
    await supprimer(`devis_sessions?devis_id=eq.${devisId}`);
    await supprimer(`notifications?entite_id=eq.${devisId}`);
    await supprimer(`journal_audit?entite_id=eq.${devisId}`);
    await supprimer(`devis?id=eq.${devisId}`);
    if (clientId) await supprimer(`clients?id=eq.${clientId}`);
  }, 30_000);

  it('crée un devis et des notifications dans la même transaction', async () => {
    expect(devisId).toMatch(/^[0-9a-f-]{36}$/);
    const r = await rest(`devis?select=id,statut,reference&id=eq.${devisId}`);
    expect(r.ok).toBe(true);
    const lignes = (await r.json()) as { statut: string }[];
    expect(lignes[0]?.statut).toBe('NOUVEAU');

    const notifications = await rest(`notifications?select=canal,statut&entite_id=eq.${devisId}`);
    const rows = (await notifications.json()) as { canal: string }[];
    expect(rows.length).toBeGreaterThan(0);
  });

  it('rejoue la même clé d’idempotence sans créer de doublon', async () => {
    const resultat = await rpc<DevisCree[]>('creer_devis_atomique', donneesCreation());
    expect(resultat[0]?.deja_existant).toBe(true);
    expect(resultat[0]?.devis_id).toBe(devisId);
    const r = await rest(`devis?select=id&reference=eq.${encodeURIComponent(reference)}`);
    expect((await r.json()) as unknown[]).toHaveLength(1);
  });

  it('garantit atomiquement 5 sessions actives sous 12 créations concurrentes', async () => {
    const expire = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const appels = Array.from({ length: 12 }, (_, i) =>
      rpc('creer_session_devis', {
        p_devis_id: devisId,
        p_sid_hash: `sid-${runId}-${i}`,
        p_expire_le: expire,
      }),
    );
    const resultats = await Promise.all(appels);
    expect(resultats).toHaveLength(12);

    const actives = await sessionsActives();
    expect(actives).toHaveLength(5);
    expect(new Set(actives.map((s) => s.sid_hash)).size).toBe(5);
  }, 30_000);

  it('refuse une session révoquée et une session expirée', async () => {
    const sid = `sid-revoque-${runId}`;
    await rpc('creer_session_devis', {
      p_devis_id: devisId,
      p_sid_hash: sid,
      p_expire_le: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const avant = await rpc<string | null>('session_devis_valide', {
      p_sid_hash: sid,
      p_reference: reference,
    });
    expect(avant).toBe(devisId);

    await rpc('revoquer_session_devis', { p_sid_hash: sid, p_motif: 'test' });
    const apres = await rpc<string | null>('session_devis_valide', {
      p_sid_hash: sid,
      p_reference: reference,
    });
    expect(apres).toBeNull();

    const sidExpire = `sid-expire-${runId}`;
    await expect(
      rpc('creer_session_devis', {
        p_devis_id: devisId,
        p_sid_hash: sidExpire,
        p_expire_le: new Date(Date.now() - 1000).toISOString(),
      }),
    ).rejects.toThrow(/Session déjà expirée|23514/);
  }, 30_000);
});
