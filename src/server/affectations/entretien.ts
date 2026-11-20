/**
 * Entretien quotidien des affectations (Lot 2.4) : expiration des propositions dépassées et
 * rappel aux ateliers à moins de 24 h de l'échéance. Branché dans le cron existant
 * `/api/cron/notifications` (le plan Hobby n'autorise que deux crons par projet).
 */

import { supabaseAdmin } from '@/server/supabase/client';
import { notifierEvenementAffectation } from './notifications';

function db() {
  return supabaseAdmin();
}

export async function expirerAffectationsEtNotifier(): Promise<{ expirees: number }> {
  const maintenant = new Date().toISOString();
  const { data, error } = await db()
    .from('affectations_production')
    .select('id')
    .eq('statut', 'PROPOSEE')
    .lt('date_limite_reponse', maintenant);
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as { id: string }[]).map((l) => l.id);

  const { data: expirees, error: e2 } = await db().rpc('expirer_affectations');
  if (e2) throw new Error(e2.message);

  for (const id of ids) await notifierEvenementAffectation(id, 'EXPIREE');
  return { expirees: Number(expirees ?? 0) };
}

export async function programmerRappelsAffectations(): Promise<{ rappels: number }> {
  const maintenant = new Date();
  const dans24h = new Date(maintenant.getTime() + 24 * 60 * 60 * 1000);
  const { data, error } = await db()
    .from('affectations_production')
    .select('id, date_limite_reponse')
    .eq('statut', 'PROPOSEE')
    .gt('date_limite_reponse', maintenant.toISOString())
    .lte('date_limite_reponse', dans24h.toISOString());
  if (error) throw new Error(error.message);
  const lignes = (data ?? []) as { id: string }[];
  for (const ligne of lignes) await notifierEvenementAffectation(ligne.id, 'RAPPEL');
  return { rappels: lignes.length };
}
