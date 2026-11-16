/**
 * Lecture du dossier de l'entreprise pour le portail.
 *
 * Volontairement faite avec le client de la SESSION de l'utilisateur (clé anon + jeton) : la RLS
 * de la migration 0012 s'applique réellement et constitue une seconde barrière effective. Un bug
 * de filtrage ici ne peut pas exposer les données d'une autre entreprise.
 *
 * L'appelant a déjà obtenu la session par `exigerPartenaire`.
 */

import type { SessionPartenaire } from '@/lib/partenaires/compte';
import type { StatutPartenaire } from '@/lib/partenaires/statuts';
import { creerClientAuthServeur } from '@/server/auth/session';
import { supabaseAdmin } from '@/server/supabase/client';

export type FichePartenaire = {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  statut: StatutPartenaire;
  motif_decision: string | null;
  soumis_le: string | null;
  valide_le: string | null;
};

export type ResumeDossier = {
  fiche: FichePartenaire;
  machines: number;
  capacites: number;
  services: number;
  utilisateurs: number;
};

export async function resumeDossier(session: SessionPartenaire): Promise<ResumeDossier | null> {
  const client = await creerClientAuthServeur();
  const compter = async (table: string, filtre?: [string, boolean]) => {
    let q = client.from(table).select('id', { count: 'exact', head: true });
    if (filtre) q = q.eq(filtre[0], filtre[1]);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const [{ data: fiches, error }, machines, capacites, services, utilisateurs] = await Promise.all([
    client.rpc('mon_partenaire'),
    compter('partenaire_machines', ['archive', false]),
    compter('partenaire_capacites', ['actif', true]),
    compter('partenaire_services', ['actif', true]),
    compter('partenaire_utilisateurs', ['actif', true]),
  ]);
  if (error) throw new Error(error.message);
  const fiche = ((fiches ?? []) as FichePartenaire[])[0];
  // Garde-fou : la fiche renvoyée par la RLS doit être celle de la session.
  if (!fiche || fiche.id !== session.partenaireId) return null;
  return { fiche, machines, capacites, services, utilisateurs };
}

/**
 * Motif d'une suspension. Lu avec service_role : une entreprise suspendue n'a plus de session
 * RLS (c'est voulu). L'identifiant vient de la session vérifiée, jamais de la requête.
 */
export async function motifSuspension(partenaireId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('partenaires')
    .select('motif_decision')
    .eq('id', partenaireId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.motif_decision as string | null) ?? null;
}
