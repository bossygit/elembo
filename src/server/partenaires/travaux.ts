/**
 * Travaux affectés — lectures et décisions du portail atelier.
 *
 * Les lectures passent par les fonctions `security definer` `mes_affectations()` et
 * `mon_affectation()` avec la session de l'utilisateur : la RLS n'expose aucune ligne directe
 * de la table au partenaire, et le montant n'est renvoyé qu'au RESPONSABLE.
 *
 * Les écritures passent par `service_role` après `exigerPartenaire` ; les fonctions SQL
 * revérifient le rattachement, le rôle et l'échéance (défense en profondeur).
 */

import { after } from 'next/server';

import type { SessionPartenaire } from '@/lib/partenaires/compte';
import { notifierEvenementAffectation } from '@/server/affectations/notifications';
import { creerClientAuthServeur } from '@/server/auth/session';
import { regenererApresAffectation } from '@/server/banner/regeneration';
import { supabaseAdmin } from '@/server/supabase/client';
import { ErreurIntrouvable, ErreurMetier } from './ecriture';

export type AffectationPortail = {
  id: string;
  reference: string;
  objet: string;
  statut: string;
  libelle: string;
  support: string | null;
  quantite: number | null;
  unite: string | null;
  surface_m2: number | null;
  details: Record<string, unknown>;
  instructions: string | null;
  priorite: string;
  date_debut_prevue: string | null;
  date_fin_prevue: string | null;
  date_limite_reponse: string;
  montant_fcfa: number | null;
  tarif_nom: string | null;
  tarif_version: number | null;
  tarif_mode_calcul: string | null;
  tarif_prix_unitaire_fcfa: number | null;
  commande_reference: string | null;
  cree_le: string;
  acceptee_le: string | null;
  refusee_le: string | null;
  terminee_le: string | null;
  motif_refus: string | null;
  motif_annulation: string | null;
};

export type EvenementAffectation = {
  statut: string;
  acteur_type: string;
  motif: string | null;
  cree_le: string;
};

export type FichierAffectation = {
  fichier_id: string;
  nom: string;
  type_mime: string;
  taille_octets: number;
};

export type AffectationDetail = AffectationPortail & {
  evenements: EvenementAffectation[];
  fichiers: FichierAffectation[];
};

function db() {
  return supabaseAdmin();
}

export async function mesAffectations(): Promise<AffectationPortail[]> {
  const client = await creerClientAuthServeur();
  const { data, error } = await client.rpc('mes_affectations');
  if (error) throw new Error(error.message);
  return (data ?? []) as AffectationPortail[];
}

export async function monAffectation(id: string): Promise<AffectationDetail | null> {
  const client = await creerClientAuthServeur();
  const { data, error } = await client.rpc('mon_affectation', { p_id: id });
  if (error) throw new Error(error.message);
  return ((data ?? [])[0] as AffectationDetail | undefined) ?? null;
}

function traduire(error: { code?: string; message: string }): never {
  if (error.code === 'P0002') throw new ErreurIntrouvable(error.message);
  if (error.code === '23514' || error.code === '22023' || error.code === '42501' || error.code === 'P0001') {
    throw new ErreurMetier(error.message);
  }
  throw new Error(error.message);
}

export async function repondreAffectation(
  session: SessionPartenaire,
  id: string,
  decision: 'ACCEPTEE' | 'REFUSEE',
  motif: string | null,
): Promise<void> {
  const { error } = await db().rpc('decider_affectation', {
    p_id: id,
    p_utilisateur: session.userId,
    p_decision: decision,
    p_motif: decision === 'REFUSEE' ? (motif ?? '').trim().slice(0, 1000) : null,
  });
  if (error) traduire(error);
  await notifierEvenementAffectation(id, decision, { motif: decision === 'REFUSEE' ? motif : null });
  // Banderole Banner Studio : le profil du nouvel imprimeur s'applique. Après la réponse, sans la retarder.
  if (decision === 'ACCEPTEE') after(() => regenererApresAffectation(id));
}

export async function terminerAffectation(session: SessionPartenaire, id: string): Promise<void> {
  const { error } = await db().rpc('terminer_affectation', {
    p_id: id,
    p_utilisateur: session.userId,
  });
  if (error) traduire(error);
  await notifierEvenementAffectation(id, 'TERMINEE');
}

/** Trace le téléchargement d'un fichier partagé, sans bloquer la livraison. */
export async function journaliserTelechargement(
  session: SessionPartenaire,
  affectationId: string,
  fichierId: string,
  nom: string,
): Promise<void> {
  try {
    const { error } = await db().from('journal_audit').insert({
      acteur: session.userId,
      acteur_email: session.email,
      action: 'AFFECTATION_FICHIER_TELECHARGE',
      entite: 'affectation',
      entite_id: affectationId,
      apres: { fichier_id: fichierId, nom },
    });
    if (error) console.error('Audit téléchargement non enregistré :', error.code ?? error.message);
  } catch (erreur) {
    console.error('Audit téléchargement non enregistré :', erreur instanceof Error ? erreur.message : erreur);
  }
}
