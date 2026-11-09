/**
 * Cycle commercial des commandes — projet Supabase de TEST uniquement.
 *
 * Ce test crée un devis réel, l'accepte, crée la commande par RPC, confirme un
 * paiement manuel (sans appel MTN), puis parcourt tous les jalons jusqu'à la
 * livraison. Il vérifie surtout que paiement et production restent deux états
 * distincts et que les transitions invalides sont refusées par la base.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';

const URL = (process.env.SUPABASE_TEST_URL ?? '').replace(/\/+$/, '');
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '';
const actif = Boolean(URL && SERVICE);

const runId = (process.env.SUPABASE_TEST_RUN_ID ?? randomBytes(4).toString('hex')).toUpperCase();
const referenceDevis = `DEV-CMD-${runId}`;
const referenceCommande = `ELB-CMD-${runId}`;
const email = `test-commande-${runId.toLowerCase()}@example.invalid`;
const idempotencyDevis = `TEST-DEV-CMD-${runId}`;
const idempotencyCommande = `TEST-CMD-${runId}`;

type Json = Record<string, unknown>;
type DevisCree = { devis_id: string; client_id: string; reference: string; deja_existant: boolean };

let devisId = '';
let clientId = '';
let commandeId = '';

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

async function lireCommande(): Promise<Json> {
  const r = await rest(`commandes?select=*&id=eq.${commandeId}`);
  const lignes = (await r.json()) as Json[];
  if (!lignes[0]) throw new Error('Commande introuvable après création.');
  return lignes[0];
}

function donneesDevis(): Json {
  return {
    p_idempotency_key: idempotencyDevis,
    p_reference: referenceDevis,
    p_suivi_token_hash: `hash-cmd-${runId}`,
    p_suivi_token_expire_le: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    p_nom: 'Test Commande',
    p_societe: null,
    p_email: email,
    p_telephone: '060000002',
    p_telephone_normalise: `24206${runId.replace(/\D/g, '').padEnd(7, '2').slice(0, 7)}`,
    p_type_client: 'PARTICULIER',
    p_ville: 'Brazzaville',
    p_famille: 'TEXTILE',
    p_besoin: 'Test d’intégration du cycle commercial des commandes.',
    p_format: 'A4',
    p_quantite: 12,
    p_specifications: { produit: 'tshirt-basic', couleur: 'creme' },
    p_contact_snapshot: {},
    p_staff_email: null,
    p_staff_telegram: null,
    p_source: 'SITE',
  };
}

describe.skipIf(!actif)('Cycle commercial des commandes', () => {
  beforeAll(async () => {
    const devis = await rpc<DevisCree[]>('creer_devis_atomique', donneesDevis());
    const ligne = devis[0];
    if (!ligne) throw new Error('Création du devis sans réponse.');
    devisId = ligne.devis_id;
    clientId = ligne.client_id;

    await rpc('transitionner_devis', {
      p_devis_id: devisId,
      p_nouveau_statut: 'EN_ANALYSE',
      p_montant: null,
      p_note: 'test cycle',
      p_acteur: null,
      p_source: 'STAFF',
    });
    await rpc('transitionner_devis', {
      p_devis_id: devisId,
      p_nouveau_statut: 'PROPOSE',
      p_montant: 120000,
      p_note: 'test cycle',
      p_acteur: null,
      p_source: 'STAFF',
    });
    await rpc('transitionner_devis', {
      p_devis_id: devisId,
      p_nouveau_statut: 'ACCEPTE',
      p_montant: null,
      p_note: 'test cycle',
      p_acteur: null,
      p_source: 'STAFF',
    });

    const commande = await rpc<Json>('creer_commande_depuis_devis', {
      p_devis_id: devisId,
      p_reference: referenceCommande,
      p_mode_paiement: 'MTN_MOMO',
      p_livraison_fcfa: 5000,
      p_ville: 'Brazzaville',
      p_adresse: 'Rue du test',
      p_livraison_prevue: null,
      p_idempotency_key: idempotencyCommande,
      p_acteur: null,
    });
    commandeId = String(commande.id ?? '');
    if (!commandeId) throw new Error('Création de commande sans identifiant.');
  }, 30_000);

  afterAll(async () => {
    if (commandeId) {
      await supprimer(`paiements?commande_id=eq.${commandeId}`);
      await supprimer(`travaux_production?commande_id=eq.${commandeId}`);
      await supprimer(`historique_statuts_commande?commande_id=eq.${commandeId}`);
      await supprimer(`fichiers_commande?commande_id=eq.${commandeId}`);
      await supprimer(`lignes_commande?commande_id=eq.${commandeId}`);
      await supprimer(`commandes?id=eq.${commandeId}`);
    }
    if (devisId) {
      await supprimer(`devis_sessions?devis_id=eq.${devisId}`);
      await supprimer(`notifications?entite_id=eq.${devisId}`);
      await supprimer(`journal_audit?entite_id=eq.${devisId}`);
      await supprimer(`historique_statuts_devis?devis_id=eq.${devisId}`);
      await supprimer(`fichiers_devis?devis_id=eq.${devisId}`);
      await supprimer(`devis?id=eq.${devisId}`);
    }
    if (clientId) await supprimer(`clients?id=eq.${clientId}`);
  }, 30_000);

  it('crée une commande brouillon avec référence, client, ligne et montant', async () => {
    const commande = await lireCommande();
    expect(commande.reference).toBe(referenceCommande);
    expect(commande.devis_id).toBe(devisId);
    expect(commande.client_id).toBe(clientId);
    expect(commande.statut).toBe('BROUILLON');
    expect(commande.statut_paiement).toBe('EN_ATTENTE');
    expect(commande.statut_production).toBe('A_FAIRE');
    expect(commande.statut_livraison).toBe('A_LIVRER');
    expect(commande.mode_paiement).toBe('MTN_MOMO');
    expect(commande.total_fcfa).toBe(125000);
    expect(commande.livraison_fcfa).toBe(5000);
    expect((commande.contact_snapshot as Json).nom).toBe('Test Commande');

    const lignes = (await (await rest(`lignes_commande?select=*&commande_id=eq.${commandeId}`)).json()) as Json[];
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.produit_id).toBe('tshirt-basic');
    expect(lignes[0]?.quantite).toBe(12);
    expect(lignes[0]?.total_ligne_fcfa).toBe(120000);
  });

  it('rejoue la création avec la même clé sans doublon', async () => {
    const rejeu = await rpc<Json>('creer_commande_depuis_devis', {
      p_devis_id: devisId,
      p_reference: referenceCommande,
      p_mode_paiement: 'MTN_MOMO',
      p_livraison_fcfa: 5000,
      p_ville: 'Brazzaville',
      p_adresse: 'Rue du test',
      p_livraison_prevue: null,
      p_idempotency_key: idempotencyCommande,
      p_acteur: null,
    });
    expect(String(rejeu.id)).toBe(commandeId);
    const r = await rest(`commandes?select=id&devis_id=eq.${devisId}`);
    expect((await r.json()) as unknown[]).toHaveLength(1);
  });

  it('refuse PAYEE avant tout paiement confirmé', async () => {
    await expect(
      rpc('transitionner_commande', {
        p_commande_id: commandeId,
        p_statut: 'PAYEE',
        p_note: 'tentative interdite',
        p_acteur: null,
      }),
    ).rejects.toThrow(/Transition de commande interdite/);
  });

  it('confirme un paiement manuel et garde la production à faire', async () => {
    await rpc('transitionner_commande', {
      p_commande_id: commandeId,
      p_statut: 'EN_ATTENTE_DE_VALIDATION',
      p_note: 'validation',
      p_acteur: null,
    });
    await rpc('transitionner_commande', {
      p_commande_id: commandeId,
      p_statut: 'EN_ATTENTE_DE_PAIEMENT',
      p_note: 'attente paiement',
      p_acteur: null,
    });
    await rpc('confirmer_paiement_manuel', {
      p_commande_id: commandeId,
      p_mode_paiement: 'MTN_MOMO',
      p_reference: `MANUAL-CMD-${runId}`,
      p_acteur: null,
    });

    const commande = await lireCommande();
    expect(commande.statut).toBe('PAYEE');
    expect(commande.statut_paiement).toBe('PAYE');
    expect(commande.paye_le).toBeTruthy();
    expect(commande.statut_production).toBe('A_FAIRE');
    expect(commande.statut_livraison).toBe('A_LIVRER');

    const paiements = (await (await rest(`paiements?select=*&commande_id=eq.${commandeId}`)).json()) as Json[];
    expect(paiements).toHaveLength(1);
    expect(paiements[0]?.statut).toBe('PAYE');
  });

  it('parcourt production, contrôle, livraison et clôture avec jalons', async () => {
    const etapes = [
      'A_PRODUIRE',
      'EN_PRODUCTION',
      'CONTROLE_QUALITE',
      'PRETE',
      'EN_LIVRAISON',
      'LIVREE',
    ] as const;
    for (const statut of etapes) {
      await rpc('transitionner_commande', {
        p_commande_id: commandeId,
        p_statut: statut,
        p_note: `test ${statut}`,
        p_acteur: null,
      });
    }

    const commande = await lireCommande();
    expect(commande.statut).toBe('LIVREE');
    expect(commande.statut_production).toBe('TERMINE');
    expect(commande.statut_livraison).toBe('LIVREE');
    expect(commande.production_demarree_le).toBeTruthy();
    expect(commande.controle_qualite_le).toBeTruthy();
    expect(commande.prete_le).toBeTruthy();
    expect(commande.livraison_demarree_le).toBeTruthy();
    expect(commande.livree_le).toBeTruthy();
    expect(commande.cloture_le).toBeTruthy();
  });

  it('refuse une transition inconnue après livraison', async () => {
    await expect(
      rpc('transitionner_commande', {
        p_commande_id: commandeId,
        p_statut: 'EN_PRODUCTION',
        p_note: 'retour arrière interdit',
        p_acteur: null,
      }),
    ).rejects.toThrow(/Transition de commande interdite/);
  });
});
