import { randomBytes } from 'node:crypto';

import { supabaseAdmin } from '@/server/supabase/client';
import type { StatutDevis } from '@/lib/devis/types';

export type StatutCommande =
  | 'BROUILLON'
  | 'EN_ATTENTE_DE_VALIDATION'
  | 'EN_ATTENTE_DE_PAIEMENT'
  | 'PAYEE'
  | 'A_PRODUIRE'
  | 'EN_PRODUCTION'
  | 'CONTROLE_QUALITE'
  | 'PRETE'
  | 'EN_LIVRAISON'
  | 'LIVREE'
  | 'ANNULEE'
  | 'REMBOURSEMENT_A_TRAITER';

export type ModePaiement = 'MTN_MOMO' | 'AIRTEL_MONEY' | 'ESPECES' | 'VIREMENT' | 'A_CONFIRMER';

export type CommandeLigne = {
  id: string;
  commande_id: string;
  produit_id: string | null;
  variante_id: string | null;
  designation: string;
  quantite: number;
  prix_unitaire_fcfa: number;
  cout_unitaire_fcfa: number;
  total_ligne_fcfa: number;
  options: Record<string, unknown>;
  cree_le: string;
};

export type CommandeLigneRow = {
  id: string;
  reference: string;
  client_id: string;
  devis_id: string | null;
  statut: StatutCommande;
  statut_paiement: string;
  statut_production: string;
  statut_livraison: string;
  sous_total_fcfa: number;
  livraison_fcfa: number;
  total_fcfa: number;
  /** Coût de revient et marge, recalculés en base (migration 0010). */
  cout_fcfa: number;
  marge_fcfa: number;
  ville: string | null;
  adresse: string | null;
  notes: string | null;
  mode_paiement: ModePaiement;
  contact_snapshot: Record<string, unknown>;
  design_snapshot: Record<string, unknown>;
  valide_le: string | null;
  paye_le: string | null;
  production_demarree_le: string | null;
  controle_qualite_le: string | null;
  prete_le: string | null;
  livraison_demarree_le: string | null;
  livraison_prevue_le: string | null;
  livree_le: string | null;
  cloture_le: string | null;
  annulee_le: string | null;
  remboursement_demande_le: string | null;
  cree_le: string;
  maj_le: string;
};

export type CommandeDetail = {
  commande: CommandeLigneRow;
  client: Record<string, unknown> | null;
  lignes: CommandeLigne[];
  fichiers: Record<string, unknown>[];
  historique: Record<string, unknown>[];
  paiements: Record<string, unknown>[];
  production: Record<string, unknown>[];
};

export const STATUTS_COMMANDE: { id: StatutCommande; label: string }[] = [
  { id: 'BROUILLON', label: 'Brouillon' },
  { id: 'EN_ATTENTE_DE_VALIDATION', label: 'En attente de validation' },
  { id: 'EN_ATTENTE_DE_PAIEMENT', label: 'En attente de paiement' },
  { id: 'PAYEE', label: 'Payée' },
  { id: 'A_PRODUIRE', label: 'À produire' },
  { id: 'EN_PRODUCTION', label: 'En production' },
  { id: 'CONTROLE_QUALITE', label: 'En contrôle qualité' },
  { id: 'PRETE', label: 'Prête' },
  { id: 'EN_LIVRAISON', label: 'En livraison' },
  { id: 'LIVREE', label: 'Livrée' },
  { id: 'ANNULEE', label: 'Annulée' },
  { id: 'REMBOURSEMENT_A_TRAITER', label: 'Remboursement à traiter' },
];

export const MODES_PAIEMENT: { id: ModePaiement; label: string }[] = [
  { id: 'MTN_MOMO', label: 'MTN Mobile Money' },
  { id: 'AIRTEL_MONEY', label: 'Airtel Money' },
  { id: 'ESPECES', label: 'Espèces' },
  { id: 'VIREMENT', label: 'Virement' },
  { id: 'A_CONFIRMER', label: 'À confirmer' },
];

export function referenceCommande(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `ELB-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function admin() {
  return supabaseAdmin();
}

function erreur(message: string): Error {
  return new Error(message);
}

export async function commandeParId(id: string): Promise<CommandeLigneRow | null> {
  const { data, error } = await admin().from('commandes').select('*').eq('id', id).maybeSingle();
  if (error) throw erreur(error.message);
  return (data as CommandeLigneRow | null) ?? null;
}

export async function commandeParReference(reference: string): Promise<CommandeLigneRow | null> {
  const { data, error } = await admin().from('commandes').select('*').eq('reference', reference).maybeSingle();
  if (error) throw erreur(error.message);
  return (data as CommandeLigneRow | null) ?? null;
}

export async function commandeDuDevis(devisId: string): Promise<CommandeLigneRow | null> {
  const { data, error } = await admin().from('commandes').select('*').eq('devis_id', devisId).maybeSingle();
  if (error) throw erreur(error.message);
  return (data as CommandeLigneRow | null) ?? null;
}

export async function listerCommandes(options: { statut?: string; limite?: number } = {}): Promise<CommandeLigneRow[]> {
  let requete = admin()
    .from('commandes')
    .select('*')
    .order('cree_le', { ascending: false })
    .limit(Math.min(Math.max(options.limite ?? 100, 1), 200));
  if (options.statut) requete = requete.eq('statut', options.statut);
  const { data, error } = await requete;
  if (error) throw erreur(error.message);
  return (data ?? []) as CommandeLigneRow[];
}

export async function detailCommande(id: string): Promise<CommandeDetail | null> {
  const commande = await commandeParId(id);
  if (!commande) return null;

  const [client, lignes, fichiers, historique, paiements, production] = await Promise.all([
    admin().from('clients').select('*').eq('id', commande.client_id).maybeSingle(),
    admin().from('lignes_commande').select('*').eq('commande_id', id).order('cree_le'),
    admin().from('fichiers_commande').select('*').eq('commande_id', id).order('cree_le'),
    admin().from('historique_statuts_commande').select('*').eq('commande_id', id).order('cree_le'),
    admin().from('paiements').select('*').eq('commande_id', id).order('cree_le', { ascending: false }),
    admin().from('travaux_production').select('*').eq('commande_id', id).order('cree_le'),
  ]);

  for (const reponse of [client, lignes, fichiers, historique, paiements, production]) {
    if (reponse.error) throw erreur(reponse.error.message);
  }

  return {
    commande,
    client: (client.data as Record<string, unknown> | null) ?? null,
    lignes: (lignes.data ?? []) as CommandeLigne[],
    fichiers: (fichiers.data ?? []) as Record<string, unknown>[],
    historique: (historique.data ?? []) as Record<string, unknown>[],
    paiements: (paiements.data ?? []) as Record<string, unknown>[],
    production: (production.data ?? []) as Record<string, unknown>[],
  };
}

export async function creerCommandeDepuisDevis(options: {
  devisId: string;
  modePaiement: ModePaiement;
  livraisonFcfa: number;
  ville?: string | null;
  adresse?: string | null;
  livraisonPrevueLe?: string | null;
  idempotencyKey: string;
  acteur: string | null;
}): Promise<CommandeLigneRow> {
  const reference = referenceCommande();
  const { data, error } = await admin().rpc('creer_commande_depuis_devis', {
    p_devis_id: options.devisId,
    p_reference: reference,
    p_mode_paiement: options.modePaiement,
    p_livraison_fcfa: options.livraisonFcfa,
    p_ville: options.ville ?? null,
    p_adresse: options.adresse ?? null,
    p_livraison_prevue: options.livraisonPrevueLe ?? null,
    p_idempotency_key: options.idempotencyKey,
    p_acteur: options.acteur,
  });
  if (error) throw erreur(error.message);
  const ligne = (Array.isArray(data) ? data[0] : data) as CommandeLigneRow | null;
  if (!ligne) throw erreur('Création de commande sans réponse.');
  return ligne;
}

export async function confirmerPaiementManuel(
  commandeId: string,
  modePaiement: ModePaiement,
  reference: string,
  acteur: string | null,
): Promise<CommandeLigneRow> {
  const { data, error } = await admin().rpc('confirmer_paiement_manuel', {
    p_commande_id: commandeId,
    p_mode_paiement: modePaiement,
    p_reference: reference,
    p_acteur: acteur,
  });
  if (error) throw erreur(error.message);
  const ligne = (Array.isArray(data) ? data[0] : data) as CommandeLigneRow | null;
  if (!ligne) throw erreur('Paiement sans réponse.');
  return ligne;
}

export async function transitionnerCommande(
  commandeId: string,
  statut: StatutCommande,
  note: string | null,
  acteur: string | null,
): Promise<CommandeLigneRow> {
  const { data, error } = await admin().rpc('transitionner_commande', {
    p_commande_id: commandeId,
    p_statut: statut,
    p_note: note,
    p_acteur: acteur,
  });
  if (error) throw erreur(error.message);
  const ligne = (Array.isArray(data) ? data[0] : data) as CommandeLigneRow | null;
  if (!ligne) throw erreur('Transition sans réponse.');
  return ligne;
}

/** Libellé lisible d'un statut de devis, utilisé dans les écrans de conversion. */
export function libelleStatutDevis(statut: StatutDevis): string {
  const labels: Record<StatutDevis, string> = {
    NOUVEAU: 'Nouveau',
    EN_ANALYSE: 'En analyse',
    PROPOSE: 'Proposé',
    ACCEPTE: 'Accepté',
    REFUSE: 'Refusé',
    EXPIRE: 'Expiré',
  };
  return labels[statut];
}
