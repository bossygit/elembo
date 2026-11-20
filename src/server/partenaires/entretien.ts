/**
 * Entretien des dossiers partenaires (Lot 2.5).
 *
 * Les dossiers `BROUILLON` issus d'une inscription, jamais soumis et inactifs depuis plus de
 * 90 jours sont archivés : objets du bucket supprimés, accès désactivés, lignes de fichiers
 * retirées. La fiche `partenaires` n'est jamais supprimée, ni le compte Supabase Auth ; le staff
 * peut réactiver un dossier archivé.
 *
 * Appelé par le cron existant `/api/cron/notifications` (pas de troisième cron Vercel).
 */

import { supabaseAdmin } from '@/server/supabase/client';
import { BUCKET_PARTENAIRES } from './fichiers';

const MOTIF = 'Dossier abandonné depuis plus de 90 jours (purge automatique)';

type Candidat = { id: string; nom: string; maj_le: string; fichiers: number };

function db() {
  return supabaseAdmin();
}

async function supprimerObjets(chemins: string[]): Promise<void> {
  for (let i = 0; i < chemins.length; i += 100) {
    const lot = chemins.slice(i, i + 100);
    const { error } = await db().storage.from(BUCKET_PARTENAIRES).remove(lot);
    if (error) throw new Error(`Suppression des fichiers impossible : ${error.message}`);
  }
}

async function journaliserPurge(partenaireId: string, fichiers: number): Promise<void> {
  try {
    const { error } = await db().from('journal_audit').insert({
      acteur: null,
      acteur_email: null,
      action: 'PARTENAIRE_BROUILLON_PURGE',
      entite: 'partenaire',
      entite_id: partenaireId,
      apres: { motif: MOTIF, fichiers_supprimes: fichiers },
    });
    if (error) console.error('Audit purge non enregistré :', error.code ?? error.message);
  } catch (erreur) {
    console.error('Audit purge non enregistré :', erreur instanceof Error ? erreur.message : erreur);
  }
}

export async function purgerBrouillonsAbandonnes(jours = 90): Promise<{ archives: number; fichiers: number }> {
  const { data, error } = await db().rpc('brouillons_abandonnes', { p_jours: jours });
  if (error) throw new Error(error.message);
  const candidats = (data ?? []) as Candidat[];

  let archives = 0;
  let fichiers = 0;
  for (const candidat of candidats) {
    const { data: lignes, error: e2 } = await db()
      .from('partenaire_fichiers')
      .select('chemin')
      .eq('partenaire_id', candidat.id);
    if (e2) throw new Error(e2.message);
    const chemins = ((lignes ?? []) as { chemin: string }[]).map((l) => l.chemin);
    await supprimerObjets(chemins);

    const { error: e3 } = await db().rpc('archiver_brouillon', { p_id: candidat.id, p_motif: MOTIF });
    if (e3) throw new Error(e3.message);
    await journaliserPurge(candidat.id, chemins.length);
    archives += 1;
    fichiers += chemins.length;
  }
  return { archives, fichiers };
}
