/**
 * Contrôle d'accès du portail partenaire — la couche que TOUTES les pages, actions serveur et
 * routes de /partenaire appellent avant de lire ou d'écrire une donnée.
 *
 * Même principe que `src/server/admin/acces.ts` (guide Next.js « Authentication », Data Access
 * Layer) : le layout et le proxy ne protègent rien ; le contrôle vit au plus près de la donnée.
 *
 *  - session : `auth.getUser()`, qui revalide le jeton auprès de Supabase Auth ;
 *  - rattachement : lu avec service_role dans `partenaire_utilisateurs` (la RLS masquerait une
 *    entreprise suspendue, que l'on doit pouvoir annoncer) ;
 *  - l'identifiant de l'entreprise vient TOUJOURS d'ici, jamais du formulaire ni de l'URL.
 */

import { cache } from 'react';
import { redirect } from 'next/navigation';

import { devisConfigure } from '@/lib/devis/configuration';
import { resoudreEtatCompte, type EtatCompte, type Rattachement, type SessionPartenaire } from '@/lib/partenaires/compte';
import { peutPartenaire, type DroitPartenaire } from '@/lib/partenaires/droits';
import { accesPortail } from '@/lib/partenaires/statuts';
import { creerClientAuthServeur } from '@/server/auth/session';
import { supabaseAdmin } from '@/server/supabase/client';

export type { SessionPartenaire };

async function rattachementActif(userId: string): Promise<Rattachement | null> {
  const { data, error } = await supabaseAdmin()
    .from('partenaire_utilisateurs')
    .select('partenaire_id, role_partenaire, partenaires!inner(nom, statut)')
    .eq('user_id', userId)
    .eq('actif', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const p = data.partenaires as unknown as { nom: string; statut: string };
  return { partenaire_id: data.partenaire_id, role_partenaire: data.role_partenaire, nom: p.nom, statut: p.statut };
}

/**
 * État du compte, lu à l'instant. Préférer `etatCompte` (mémoïsé) ; celle-ci sert juste après une
 * connexion, quand la valeur mémoïsée date d'avant l'ouverture de session.
 */
export async function lireEtatCompte(): Promise<EtatCompte> {
  if (!devisConfigure) return { type: 'anonyme' };
  try {
    const client = await creerClientAuthServeur();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return { type: 'anonyme' };
    const roleStaff = data.user.app_metadata?.role;
    // Un compte staff n'a pas de rattachement partenaire (garanti en base) : inutile de chercher.
    const rattachement =
      typeof roleStaff === 'string' && roleStaff ? null : data.user.email_confirmed_at ? await rattachementActif(data.user.id) : null;
    return resoudreEtatCompte(data.user, rattachement);
  } catch {
    // Supabase injoignable : on refuse l'accès plutôt que de l'accorder par défaut.
    return { type: 'anonyme' };
  }
}

/** État du compte pour la requête en cours (mémoïsé par requête). */
export const etatCompte = cache(lireEtatCompte);

export async function partenaireCourant(): Promise<SessionPartenaire | null> {
  const etat = await etatCompte();
  return etat.type === 'partenaire' ? etat.session : null;
}

/**
 * Oriente un compte qui n'est pas (ou plus) un partenaire actif. Ne rend jamais la main.
 */
function orienter(etat: Exclude<EtatCompte, { type: 'partenaire' }>, suite?: string): never {
  switch (etat.type) {
    case 'anonyme':
      redirect(suite ? `/partenaire/connexion?suite=${encodeURIComponent(suite)}` : '/partenaire/connexion');
    case 'staff':
      redirect('/partenaire/connexion?erreur=staff');
    case 'non_confirme':
      redirect('/partenaire/connexion?erreur=non_confirme');
    case 'sans_entreprise':
      redirect('/partenaire/bienvenue');
  }
}

/**
 * Exige une session partenaire et un droit. Entreprise suspendue ou archivée → page dédiée ;
 * droit absent → tableau de bord avec un message de refus.
 */
export async function exigerPartenaire(droit: DroitPartenaire, suite?: string): Promise<SessionPartenaire> {
  const etat = await etatCompte();
  if (etat.type !== 'partenaire') orienter(etat, suite);
  const session = etat.session;
  if (accesPortail(session.statutPartenaire) === 'aucun') redirect('/partenaire/suspendu');
  if (!peutPartenaire(session.role, droit, session.statutPartenaire)) {
    redirect(`/partenaire?refus=${encodeURIComponent(droit)}`);
  }
  return session;
}

/**
 * Crée l'entreprise (BROUILLON) d'un compte inscrit depuis le portail, à sa première connexion
 * confirmée. Idempotent (la fonction SQL l'est aussi). Sans intention d'inscription (compte
 * invité, compte créé ailleurs), ne fait rien : la page /partenaire/bienvenue prend le relais.
 *
 * Renvoie l'identifiant de l'entreprise créée, ou `null`.
 */
export async function finaliserInscription(etat: EtatCompte): Promise<string | null> {
  if (etat.type !== 'sans_entreprise' || !etat.intention) return null;
  return creerEntreprise(etat.userId, etat.intention.nom, etat.intention.telephone);
}

export async function creerEntreprise(userId: string, nom: string, telephone: string | null): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .rpc('creer_partenaire_inscription', { p_user_id: userId, p_nom: nom, p_telephone: telephone })
    .single();
  if (error) throw new Error(error.message);
  const ligne = data as { partenaire_id: string; deja_existant: boolean };
  return ligne.partenaire_id;
}

/** Ateliers dont l'accès de ce compte a été désactivé (message sur la page « Bienvenue »). */
export async function accesDesactives(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin()
    .from('partenaire_utilisateurs')
    .select('partenaires!inner(nom)')
    .eq('user_id', userId)
    .eq('actif', false);
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => (l.partenaires as unknown as { nom: string }).nom);
}
