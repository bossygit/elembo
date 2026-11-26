import type { LigneProfil, CapacitePartenaire } from '@/lib/banner/profils';
import type { SupportStudio } from '@/lib/banner/model';
import { supabaseAdmin } from '@/server/supabase/client';

/** Profils d'impression. Client `service_role` : l'appelant a déjà vérifié l'accès. */

const COLONNES = 'id, nom, support, partenaire_id, est_public, statut, version, laize_max_mm, longueur_max_mm, marge_securite_mm, fond_perdu_mm, ourlet_mm, oeillet_diametre_mm, oeillet_espacement_mm, oeillet_marge_mm, fourreau_haut_mm, fourreau_bas_mm, dpi_min, dpi_recommande, page_max_mm, mode_grand_format, notes, valide_par_email, valide_le, maj_le';

export async function listerProfils(options: { support?: SupportStudio; actifs?: boolean } = {}): Promise<LigneProfil[]> {
  let q = supabaseAdmin().from('profils_impression').select(COLONNES).order('est_public', { ascending: false }).order('support').order('nom');
  if (options.support) q = q.eq('support', options.support);
  if (options.actifs) q = q.neq('statut', 'ARCHIVE');
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as LigneProfil[];
}

export async function profilParId(id: string): Promise<LigneProfil | null> {
  const { data, error } = await supabaseAdmin().from('profils_impression').select(COLONNES).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LigneProfil | null) ?? null;
}

export async function modifierProfil(id: string, champs: Record<string, unknown>): Promise<{ avant: LigneProfil | null; apres: LigneProfil }> {
  const avant = await profilParId(id);
  const { data, error } = await supabaseAdmin().from('profils_impression').update(champs).eq('id', id).select(COLONNES).single();
  if (error) throw new Error(error.message);
  return { avant, apres: data as LigneProfil };
}

export async function creerProfil(champs: Record<string, unknown>): Promise<LigneProfil> {
  const { data, error } = await supabaseAdmin().from('profils_impression').insert(champs).select(COLONNES).single();
  if (error) throw new Error(error.code === '23505' ? 'Ce partenaire a déjà un profil actif pour ce support.' : error.message);
  return data as LigneProfil;
}

export async function nomPartenaire(id: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from('partenaires').select('nom').eq('id', id).maybeSingle();
  return (data as { nom: string } | null)?.nom ?? null;
}

/** Capacité grand format validée et active d'un partenaire pour ce support. */
export async function capacitePartenaire(partenaireId: string, support: SupportStudio): Promise<CapacitePartenaire | null> {
  const { data, error } = await supabaseAdmin()
    .from('partenaire_capacites')
    .select('largeur_max_mm, longueur_max_mm, finitions, supports_compatibles, prestation')
    .eq('partenaire_id', partenaireId).eq('categorie', 'GRAND_FORMAT').eq('statut_validation', 'VALIDEE').eq('actif', true);
  if (error) throw new Error(error.message);
  const l = (data ?? []).find((c) => c.prestation === support || (c.supports_compatibles as string[]).includes(support));
  return l ? { largeur_max_mm: l.largeur_max_mm, longueur_max_mm: l.longueur_max_mm, finitions: l.finitions } : null;
}
