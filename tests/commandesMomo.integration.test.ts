/**
 * Intégration du tunnel direct MTN → Supabase — projet de TEST uniquement.
 *
 * Ce test ne contacte pas MTN. Il vérifie la création de la commande directe, puis la
 * synchronisation d'une transaction PENDING → PAYE. Il prouve que la commande passe PAYEE
 * sans passer automatiquement en production.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';

const URL = (process.env.SUPABASE_TEST_URL ?? '').replace(/\/+$/, '');
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '';
const actif = Boolean(URL && SERVICE);

const runId = (process.env.SUPABASE_TEST_RUN_ID ?? randomBytes(4).toString('hex')).toUpperCase();
const reference = `ELB-MOMO-${runId}`;
const referenceId = `momo-test-${runId.toLowerCase()}-001`;
const email = `test-momo-${runId.toLowerCase()}@example.invalid`;

let commandeId = '';
let clientId = '';

type Json = Record<string, unknown>;

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

async function supprimer(chemin: string): Promise<void> {
  const r = await rest(chemin, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error(`Nettoyage ${chemin}: HTTP ${r.status}`);
}

async function commande(): Promise<Json> {
  const r = await rest(`commandes?select=*&id=eq.${commandeId}`);
  const lignes = (await r.json()) as Json[];
  if (!lignes[0]) throw new Error('Commande directe introuvable.');
  return lignes[0];
}

describe.skipIf(!actif)('Commandes directes MTN et Supabase', () => {
  afterAll(async () => {
    if (commandeId) {
      await supprimer(`paiements?commande_id=eq.${commandeId}`);
      await supprimer(`travaux_production?commande_id=eq.${commandeId}`);
      await supprimer(`historique_statuts_commande?commande_id=eq.${commandeId}`);
      await supprimer(`fichiers_commande?commande_id=eq.${commandeId}`);
      await supprimer(`lignes_commande?commande_id=eq.${commandeId}`);
      await supprimer(`commandes?id=eq.${commandeId}`);
    }
    if (clientId) await supprimer(`clients?id=eq.${clientId}`);
  }, 30_000);

  it('crée une commande directe avec client, lignes et total', async () => {
    const creee = await rpc<Json>('creer_commande_directe', {
      p_reference: reference,
      p_nom: 'Test MoMo',
      p_email: email,
      p_telephone: '+242060000321',
      p_telephone_normalise: `24206${runId.replace(/\D/g, '').padEnd(7, '3').slice(0, 7)}`,
      p_ville: 'Brazzaville',
      p_adresse: 'Rue MoMo',
      p_sous_total_fcfa: 120000,
      p_livraison_fcfa: 1000,
      p_total_fcfa: 121000,
      p_lignes: [
        {
          produit_id: 'tshirt-basic',
          designation: 'T-Shirt raglan — M',
          quantite: 2,
          prix_unitaire_fcfa: 60000,
          total_ligne_fcfa: 120000,
          options: { taille: 'M' },
        },
      ],
      p_design_snapshot: { source: 'CONFIGURATEUR' },
      p_mode_paiement: 'MTN_MOMO',
    });
    commandeId = String(creee.id ?? '');
    clientId = String(creee.client_id ?? '');
    expect(commandeId).toMatch(/^[0-9a-f-]{36}$/);

    const c = await commande();
    expect(c.reference).toBe(reference);
    expect(c.statut).toBe('EN_ATTENTE_DE_PAIEMENT');
    expect(c.statut_paiement).toBe('EN_ATTENTE');
    expect(c.statut_production).toBe('A_FAIRE');
    expect(c.statut_livraison).toBe('A_LIVRER');
    expect(c.mode_paiement).toBe('MTN_MOMO');
    expect(c.total_fcfa).toBe(121000);
    expect((c.contact_snapshot as Json).nom).toBe('Test MoMo');
  });

  it('synchronise PENDING puis PAYE sans lancer la production', async () => {
    await rpc('synchroniser_paiement_momo', {
      p_reference_commande: reference,
      p_reference_id: referenceId,
      p_statut: 'PENDING',
      p_montant_fcfa: 121000,
      p_msisdn: '+242060000321',
    });

    await rpc('synchroniser_paiement_momo', {
      p_reference_commande: reference,
      p_reference_id: referenceId,
      p_statut: 'PAYE',
      p_montant_fcfa: 121000,
      p_financial_tx_id: `FIN-${runId}`,
      p_msisdn: '+242060000321',
    });

    const c = await commande();
    expect(c.statut).toBe('PAYEE');
    expect(c.statut_paiement).toBe('PAYE');
    expect(c.statut_production).toBe('A_FAIRE');
    expect(c.paye_le).toBeTruthy();

    const paiements = (await (await rest(`paiements?select=*&commande_id=eq.${commandeId}`)).json()) as Json[];
    expect(paiements).toHaveLength(1);
    expect(paiements[0]?.statut).toBe('PAYE');
    expect(paiements[0]?.financial_tx_id).toBe(`FIN-${runId}`);

    const taches = (await (await rest(`travaux_production?select=*&commande_id=eq.${commandeId}`)).json()) as Json[];
    expect(taches).toHaveLength(1);
    expect(taches[0]?.etape).toBe('INITIALISATION');
  });

  it('ne rétrograde pas un paiement déjà confirmé', async () => {
    await rpc('synchroniser_paiement_momo', {
      p_reference_commande: reference,
      p_reference_id: referenceId,
      p_statut: 'PENDING',
      p_montant_fcfa: 121000,
    });

    const c = await commande();
    expect(c.statut).toBe('PAYEE');
    expect(c.statut_paiement).toBe('PAYE');
    const paiements = (await (await rest(`paiements?select=*&commande_id=eq.${commandeId}`)).json()) as Json[];
    expect(paiements).toHaveLength(1);
  });
});
