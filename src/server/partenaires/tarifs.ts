/**
 * Tarifs négociés — côté partenaire (proposer, corriger, retirer une proposition ; lire).
 *
 * CONFIDENTIEL : réservé au responsable de l'atelier (droits `tarifs.*`, RLS de la migration 0012).
 * La proposition passe par `proposer_tarif_partenaire` (une transaction : version + paliers,
 * contrôle des paliers, version validée jamais modifiée). Un tarif proposé n'est jamais validé
 * automatiquement : la validation est un acte de Smart Vision (`src/server/admin/tarifsPartenaires.ts`).
 */

import type { SessionPartenaire } from '@/lib/partenaires/compte';
import type { ChampsTarif } from '@/lib/partenaires/formulaires';
import { regrouperTarifs, type LigneeTarif, type Palier, type VersionTarif } from '@/lib/partenaires/paliers';
import { journaliser } from '@/server/admin/audit';
import { creerClientAuthServeur } from '@/server/auth/session';
import { supabaseAdmin } from '@/server/supabase/client';
import { ErreurIntrouvable, ErreurMetier } from './ecriture';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const COLONNES_TARIF =
  'id, lignee_id, version, nom, mode_calcul, nature, prix_fcfa, conditions, capacite_id, service_id, statut, origine, valide_du, valide_jusquau, valide_le, motif_decision, cree_le, paliers:partenaire_tarif_paliers(quantite_min, quantite_max, prix_unitaire_fcfa)';

type LigneBrute = Omit<VersionTarif, 'paliers'> & {
  paliers: { quantite_min: number; quantite_max: number | null; prix_unitaire_fcfa: number | null }[] | null;
};

export function versVersion(l: LigneBrute): VersionTarif {
  return {
    ...l,
    paliers: (l.paliers ?? [])
      .map((p) => ({ quantiteMin: p.quantite_min, quantiteMax: p.quantite_max, prixUnitaireFcfa: p.prix_unitaire_fcfa }))
      .sort((a, b) => a.quantiteMin - b.quantiteMin),
  };
}

/** Paramètres de `proposer_tarif_partenaire` (jsonb). */
export function parametresTarif(champs: ChampsTarif, paliers: Palier[]) {
  return {
    p_tarif: { ...champs, prix_fcfa: champs.prix_fcfa === null ? '' : String(champs.prix_fcfa) },
    p_paliers: paliers.map((p) => ({
      quantite_min: p.quantiteMin,
      quantite_max: p.quantiteMax === null ? '' : p.quantiteMax,
      prix_unitaire_fcfa: p.prixUnitaireFcfa === null ? '' : p.prixUnitaireFcfa,
    })),
  };
}

export function traduireErreurTarif(error: { code?: string; message: string }): never {
  if (error.code === '23514' || error.code === '22023' || error.code === 'P0001') throw new ErreurMetier(error.message);
  if (error.code === 'P0002') throw new ErreurIntrouvable(error.message);
  if (error.code === '42501') throw new ErreurMetier(error.message);
  if (error.code === '23505') throw new ErreurMetier('Une proposition est déjà en cours pour ce tarif.');
  throw new Error(error.message);
}

/* ------------------------------------------------------------- lectures -- */

/** Tarifs de l'entreprise, lus sous RLS (responsable uniquement : rien pour les autres rôles). */
export async function mesTarifs(): Promise<LigneeTarif[]> {
  const client = await creerClientAuthServeur();
  const { data, error } = await client
    .from('partenaire_tarifs')
    .select(COLONNES_TARIF)
    .order('lignee_id')
    .order('version', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return regrouperTarifs(((data ?? []) as LigneBrute[]).map(versVersion));
}

export async function maLigneeTarif(ligneeId: string): Promise<LigneeTarif | null> {
  if (!UUID.test(ligneeId)) return null;
  const client = await creerClientAuthServeur();
  const { data, error } = await client
    .from('partenaire_tarifs')
    .select(COLONNES_TARIF)
    .eq('lignee_id', ligneeId)
    .order('version', { ascending: false });
  if (error) throw new Error(error.message);
  return regrouperTarifs(((data ?? []) as LigneBrute[]).map(versVersion))[0] ?? null;
}

/* ------------------------------------------------------------- écritures -- */

/**
 * Propose un tarif (nouvelle lignée) ou une nouvelle version d'une lignée de l'entreprise.
 * Une proposition déjà en discussion sur la lignée est remplacée (même version).
 * Smart Vision est prévenu (Telegram) sans bloquer l'enregistrement.
 */
export async function proposerTarif(
  session: SessionPartenaire,
  ligneeId: string | null,
  champs: ChampsTarif,
  paliers: Palier[],
): Promise<string> {
  if (ligneeId !== null && !UUID.test(ligneeId)) throw new ErreurIntrouvable('Tarif introuvable.');
  const { p_tarif, p_paliers } = parametresTarif(champs, paliers);
  const { data, error } = await supabaseAdmin().rpc('proposer_tarif_partenaire', {
    p_partenaire_id: session.partenaireId,
    p_lignee_id: ligneeId,
    p_origine: 'PARTENAIRE',
    p_acteur: session.userId,
    p_tarif,
    p_paliers,
  });
  if (error) traduireErreurTarif(error);
  const tarifId = data as string;

  await journaliser({
    staff: { id: session.userId, email: session.email },
    action: 'PARTENAIRE_TARIF_PROPOSE',
    entite: 'partenaire',
    entiteId: session.partenaireId,
    apres: { tarif_id: tarifId, lignee_id: ligneeId, ...champs, paliers },
  });

  const { error: e2 } = await supabaseAdmin()
    .from('notifications')
    .insert({
      canal: 'TELEGRAM',
      destinataire: process.env.TELEGRAM_CHAT_ID?.trim() ?? '',
      sujet: 'Tarif partenaire à valider',
      // Le montant n'est PAS recopié dans la notification (canal hors back-office).
      corps: `Elembo Partners — ${session.nomPartenaire} propose un tarif « ${champs.nom} ». À examiner dans le back-office.`,
      statut: 'A_ENVOYER',
      entite: 'partenaire',
      entite_id: session.partenaireId,
      cle_idempotence: `partenaire:${session.partenaireId}:tarif:${tarifId}:${new Date().toISOString()}`,
      metadata: { tarif_id: tarifId },
    });
  if (e2) console.error('Notification de tarif partenaire non enregistrée :', e2.code ?? e2.message);
  return tarifId;
}

/** Retire la proposition en discussion d'une lignée de l'entreprise (la version validée reste). */
export async function retirerProposition(session: SessionPartenaire, ligneeId: string): Promise<void> {
  if (!UUID.test(ligneeId)) throw new ErreurIntrouvable('Tarif introuvable.');
  const { data, error } = await supabaseAdmin()
    .from('partenaire_tarifs')
    .update({ statut: 'RETIRE' })
    .eq('lignee_id', ligneeId)
    .eq('partenaire_id', session.partenaireId)
    .in('statut', ['PROPOSE', 'MODIFICATION_DEMANDEE'])
    .select('id');
  if (error) traduireErreurTarif(error);
  if (!data?.length) throw new ErreurIntrouvable('Aucune proposition en cours pour ce tarif.');
  await journaliser({
    staff: { id: session.userId, email: session.email },
    action: 'PARTENAIRE_TARIF_RETIRE',
    entite: 'partenaire',
    entiteId: session.partenaireId,
    avant: { tarif_id: data[0].id, lignee_id: ligneeId },
  });
}
