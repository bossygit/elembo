/**
 * Tarifs négociés — décisions de Smart Vision (back-office). L'appelant a vérifié la permission
 * (`partenaires.tarifs_saisir` / `partenaires.tarifs_valider`, admin et finance).
 *
 *  - saisir : Smart Vision propose un tarif ou une nouvelle version (origine SMART_VISION) ; il
 *    reste PROPOSE, la validation est un acte séparé (une personne peut valider sa propre saisie,
 *    décision P7 — l'audit garde la trace des deux actes) ;
 *  - valider : `valider_tarif_partenaire` (la version validée précédente passe à REMPLACE dans la
 *    même transaction) ;
 *  - refuser / demander une modification : motif obligatoire, visible du partenaire ;
 *  - retirer : un tarif validé n'est plus utilisable à partir d'aujourd'hui.
 *
 * Les transitions sont contrôlées par la base (`transition_tarif_autorisee`, tarif décidé figé).
 */

import type { ChampsTarif } from '@/lib/partenaires/formulaires';
import { regrouperTarifs, type LigneeTarif, type Palier } from '@/lib/partenaires/paliers';
import { supabaseAdmin } from '@/server/supabase/client';
import { COLONNES_TARIF, parametresTarif, traduireErreurTarif, versVersion } from '@/server/partenaires/tarifs';
import { ErreurIntrouvable, ErreurMetier } from '@/server/partenaires/ecriture';
import type { Staff } from './acces';
import { journaliser } from './audit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function verifierId(id: string, quoi = 'Tarif'): void {
  if (!UUID.test(id)) throw new ErreurIntrouvable(`${quoi} introuvable.`);
}

export async function tarifsDuPartenaire(partenaireId: string): Promise<LigneeTarif[]> {
  verifierId(partenaireId, 'Partenaire');
  const { data, error } = await supabaseAdmin()
    .from('partenaire_tarifs')
    .select(COLONNES_TARIF)
    .eq('partenaire_id', partenaireId)
    .order('version', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return regrouperTarifs((data ?? []).map((l) => versVersion(l as Parameters<typeof versVersion>[0])));
}

async function partenaireDuTarif(tarifId: string): Promise<{ partenaire_id: string; statut: string; lignee_id: string }> {
  verifierId(tarifId);
  const { data, error } = await supabaseAdmin()
    .from('partenaire_tarifs')
    .select('partenaire_id, statut, lignee_id')
    .eq('id', tarifId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErreurIntrouvable('Tarif introuvable.');
  return data as { partenaire_id: string; statut: string; lignee_id: string };
}

export async function saisirTarif(
  staff: Staff,
  partenaireId: string,
  ligneeId: string | null,
  champs: ChampsTarif,
  paliers: Palier[],
): Promise<string> {
  verifierId(partenaireId, 'Partenaire');
  if (ligneeId !== null) verifierId(ligneeId);
  const { p_tarif, p_paliers } = parametresTarif(champs, paliers);
  const { data, error } = await supabaseAdmin().rpc('proposer_tarif_partenaire', {
    p_partenaire_id: partenaireId,
    p_lignee_id: ligneeId,
    p_origine: 'SMART_VISION',
    p_acteur: staff.id,
    p_tarif,
    p_paliers,
  });
  if (error) traduireErreurTarif(error);
  await journaliser({ staff, action: 'PARTENAIRE_TARIF_SAISI', entite: 'partenaire', entiteId: partenaireId, apres: { tarif_id: data, lignee_id: ligneeId, ...champs, paliers } });
  return data as string;
}

export async function validerTarif(staff: Staff, tarifId: string, valideDu: string | null, valideJusquau: string | null): Promise<void> {
  const t = await partenaireDuTarif(tarifId);
  if (!staff.email) throw new ErreurMetier('Validation impossible : l’e-mail du valideur est inconnu.');
  const { error } = await supabaseAdmin().rpc('valider_tarif_partenaire', {
    p_tarif_id: tarifId,
    p_acteur: staff.id,
    p_acteur_email: staff.email,
    p_valide_du: valideDu,
    p_valide_jusquau: valideJusquau,
  });
  if (error) traduireErreurTarif(error);
  await journaliser({ staff, action: 'PARTENAIRE_TARIF_VALIDE', entite: 'partenaire', entiteId: t.partenaire_id, apres: { tarif_id: tarifId, lignee_id: t.lignee_id, valide_du: valideDu, valide_jusquau: valideJusquau } });
}

async function decider(staff: Staff, tarifId: string, statut: 'REFUSE' | 'MODIFICATION_DEMANDEE', motif: string): Promise<void> {
  const texte = motif.trim().slice(0, 2000);
  if (!texte) throw new ErreurMetier('Un motif est obligatoire : il est transmis au partenaire.');
  const t = await partenaireDuTarif(tarifId);
  const { data, error } = await supabaseAdmin()
    .from('partenaire_tarifs')
    .update({ statut, motif_decision: texte })
    .eq('id', tarifId)
    .eq('statut', 'PROPOSE')
    .select('id');
  if (error) traduireErreurTarif(error);
  if (!data?.length) throw new ErreurMetier('Ce tarif n’est plus en attente de décision.');
  await journaliser({ staff, action: statut === 'REFUSE' ? 'PARTENAIRE_TARIF_REFUSE' : 'PARTENAIRE_TARIF_A_MODIFIER', entite: 'partenaire', entiteId: t.partenaire_id, apres: { tarif_id: tarifId, motif: texte } });
}

export async function refuserTarif(staff: Staff, tarifId: string, motif: string): Promise<void> {
  await decider(staff, tarifId, 'REFUSE', motif);
}

export async function demanderModificationTarif(staff: Staff, tarifId: string, motif: string): Promise<void> {
  await decider(staff, tarifId, 'MODIFICATION_DEMANDEE', motif);
}

/** Retire un tarif validé : il cesse d'être utilisable à la date du jour (historique conservé). */
export async function retirerTarifValide(staff: Staff, tarifId: string): Promise<void> {
  const t = await partenaireDuTarif(tarifId);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { data: ligne, error: e1 } = await supabaseAdmin().from('partenaire_tarifs').select('valide_du').eq('id', tarifId).single();
  if (e1) throw new Error(e1.message);
  const fin = ligne.valide_du && ligne.valide_du > aujourdhui ? ligne.valide_du : aujourdhui;
  const { data, error } = await supabaseAdmin()
    .from('partenaire_tarifs')
    .update({ statut: 'RETIRE', valide_jusquau: fin })
    .eq('id', tarifId)
    .eq('statut', 'VALIDE')
    .select('id');
  if (error) traduireErreurTarif(error);
  if (!data?.length) throw new ErreurMetier('Ce tarif n’est pas validé.');
  await journaliser({ staff, action: 'PARTENAIRE_TARIF_RETIRE', entite: 'partenaire', entiteId: t.partenaire_id, apres: { tarif_id: tarifId, valide_jusquau: fin } });
}
