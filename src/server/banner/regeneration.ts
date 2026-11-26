import { supabaseAdmin } from '@/server/supabase/client';

import { regenererVisuel, type ResultatVisuel } from './finaliser';
import { visuelCourant } from './repository';

/**
 * Régénération après un changement d'imprimeur, et alerte de l'équipe si le visuel ne passe plus.
 * Toujours sans lever : la décision du partenaire est déjà enregistrée, rien ne doit l'annuler.
 */

async function devisDeLAffectation(affectationId: string): Promise<{ id: string; reference: string } | null> {
  const { data } = await supabaseAdmin().from('affectations_production').select('devis_id, devis:devis(reference)').eq('id', affectationId).maybeSingle();
  const l = data as { devis_id: string | null; devis: { reference: string } | null } | null;
  return l?.devis_id && l.devis ? { id: l.devis_id, reference: l.devis.reference } : null;
}

/** Message à l'équipe quand un visuel n'est plus imprimable tel quel. */
export async function alerterVisuel(devisId: string, reference: string, r: ResultatVisuel, contexte: string): Promise<void> {
  if (r.etat !== 'A_REVOIR') return;
  const sujet = `Visuel à revoir — ${reference}`;
  const points = r.alertes.filter((a) => a.severite === 'critique').map((a) => `• ${a.message}`).join('\n');
  const corps = `${contexte}\nLe visuel Banner Studio (version ${r.version}) n’a pas pu être rendu :\n${points || '• voir la fiche de la banderole'}\n\nSmart Vision Congo`;
  const lignes = [
    ['EMAIL', process.env.DEVIS_NOTIFY_EMAIL?.trim().toLowerCase()],
    ['TELEGRAM', process.env.TELEGRAM_CHAT_ID?.trim()],
  ].filter((x): x is [string, string] => Boolean(x[1]));
  for (const [canal, destinataire] of lignes) {
    const { error } = await supabaseAdmin().from('notifications').insert({
      canal, destinataire, sujet, corps, statut: 'A_ENVOYER', entite: 'devis', entite_id: devisId,
      cle_idempotence: `visuel:${devisId}:v${r.version}:${canal.toLowerCase()}`, metadata: {},
    });
    if (error && error.code !== '23505') console.error('visuel_alerte_echec', reference, error.message);
  }
}

/** Un imprimeur vient d'accepter une banderole : son profil s'applique, le visuel est rendu à nouveau. */
export async function regenererApresAffectation(affectationId: string): Promise<void> {
  try {
    const devis = await devisDeLAffectation(affectationId);
    if (!devis || !(await visuelCourant(devis.id))) return;
    const r = await regenererVisuel(devis.id, devis.reference);
    await alerterVisuel(devis.id, devis.reference, r, 'L’imprimeur affecté a changé.');
  } catch (e) {
    console.error('visuel_regeneration_echec', affectationId, e instanceof Error ? e.message : e);
  }
}
