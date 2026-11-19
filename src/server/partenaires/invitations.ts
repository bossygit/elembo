/**
 * Invitations et membres d'un atelier partenaire (service_role). Utilisé par le portail (le
 * responsable gère son équipe) et par le back-office (Smart Vision invite un responsable, par
 * exemple pour rattacher une fiche créée au back-office).
 *
 * `partenaireId` est TOUJOURS fourni par l'appelant depuis une source vérifiée : la session
 * partenaire (`exigerPartenaire`) ou une fiche ouverte par le staff (`exigerAcces`). Chaque
 * lecture ou écriture d'un membre ou d'une invitation est filtrée par cet atelier.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { RolePartenaire } from '@/lib/partenaires/droits';
import {
  DUREE_INVITATION_JOURS,
  INVITATIONS_EN_ATTENTE_MAX,
  estJetonInvitation,
  etatInvitation,
  lienInvitation,
  type EtatInvitation,
} from '@/lib/partenaires/invitations';
import type { StatutPartenaire } from '@/lib/partenaires/statuts';
import { supabaseAdmin } from '@/server/supabase/client';
import { ErreurIntrouvable, ErreurMetier } from './ecriture';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function db() {
  return supabaseAdmin();
}

export function empreinteJeton(jeton: string): string {
  return createHash('sha256').update(jeton).digest('hex');
}

function nouveauJeton(): string {
  return randomBytes(32).toString('base64url');
}

/* ----------------------------------------------------------------- membres -- */

export type Membre = { id: string; user_id: string; email: string | null; role_partenaire: RolePartenaire; actif: boolean; cree_le: string };

export async function membres(partenaireId: string): Promise<Membre[]> {
  const { data, error } = await db()
    .from('partenaire_utilisateurs')
    .select('id, user_id, role_partenaire, actif, cree_le')
    .eq('partenaire_id', partenaireId)
    .order('actif', { ascending: false })
    .order('cree_le');
  if (error) throw new Error(error.message);
  return Promise.all(
    (data ?? []).map(async (m) => {
      const { data: u } = await db().auth.admin.getUserById(m.user_id as string);
      return { ...(m as Omit<Membre, 'email'>), email: u.user?.email?.toLowerCase() ?? null };
    }),
  );
}

function traduireMembre(error: { code?: string; message: string }): never {
  if (error.code === '23514') throw new ErreurMetier(error.message);
  if (error.code === '23505') throw new ErreurMetier('Ce compte appartient déjà à une autre entreprise active.');
  throw new Error(error.message);
}

/** Change le rôle ou l'activité d'un membre de l'atelier. La base protège le dernier responsable. */
export async function modifierMembre(
  partenaireId: string,
  membreId: string,
  champs: { role_partenaire?: RolePartenaire; actif?: boolean },
): Promise<void> {
  if (!UUID.test(membreId)) throw new ErreurIntrouvable('Membre introuvable.');
  const { data, error } = await db()
    .from('partenaire_utilisateurs')
    .update(champs)
    .eq('id', membreId)
    .eq('partenaire_id', partenaireId)
    .select('id')
    .maybeSingle();
  if (error) traduireMembre(error);
  if (!data) throw new ErreurIntrouvable('Membre introuvable.');
}

/* ------------------------------------------------------------- invitations -- */

export type Invitation = { id: string; email: string; role_partenaire: RolePartenaire; expire_le: string; cree_le: string; etat: EtatInvitation };

export async function invitations(partenaireId: string): Promise<Invitation[]> {
  const { data, error } = await db()
    .from('partenaire_invitations')
    .select('id, email, role_partenaire, expire_le, cree_le, acceptee_le, revoquee_le')
    .eq('partenaire_id', partenaireId)
    .order('cree_le', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  const maintenant = new Date();
  return (data ?? []).map((i) => ({
    id: i.id as string,
    email: i.email as string,
    role_partenaire: i.role_partenaire as RolePartenaire,
    expire_le: i.expire_le as string,
    cree_le: i.cree_le as string,
    etat: etatInvitation(i as { acceptee_le: string | null; revoquee_le: string | null; expire_le: string }, maintenant),
  }));
}

/**
 * Crée une invitation et renvoie le lien (seule occurrence du jeton en clair, avec l'e-mail mis
 * en file). Une invitation encore en attente pour la même adresse est annulée et remplacée.
 */
export async function creerInvitation(options: {
  partenaireId: string;
  nomPartenaire: string;
  email: string;
  role: RolePartenaire;
  invitePar: string;
  site: string;
}): Promise<string> {
  const { partenaireId, email, role } = options;

  const { data: p, error: e0 } = await db().from('partenaires').select('statut').eq('id', partenaireId).maybeSingle();
  if (e0) throw new Error(e0.message);
  if (!p) throw new ErreurIntrouvable('Partenaire introuvable.');
  if (['SUSPENDU', 'ARCHIVE'].includes(p.statut as StatutPartenaire)) throw new ErreurMetier('Ce partenaire n’accepte pas de nouveaux comptes.');

  const deja = (await membres(partenaireId)).find((m) => m.email === email && m.actif);
  if (deja) throw new ErreurMetier('Cette personne a déjà un accès actif à l’atelier.');

  const maintenant = new Date();
  const enAttente = (await invitations(partenaireId)).filter((i) => i.etat === 'EN_ATTENTE');
  const remplacees = enAttente.filter((i) => i.email === email);
  if (enAttente.length - remplacees.length >= INVITATIONS_EN_ATTENTE_MAX) {
    throw new ErreurMetier(`Trop d’invitations en attente (${INVITATIONS_EN_ATTENTE_MAX}). Annulez-en avant d’en créer.`);
  }
  if (remplacees.length) {
    const { error } = await db()
      .from('partenaire_invitations')
      .update({ revoquee_le: maintenant.toISOString() })
      .in('id', remplacees.map((i) => i.id))
      .eq('partenaire_id', partenaireId);
    if (error) throw new Error(error.message);
  }

  const jeton = nouveauJeton();
  const expire = new Date(maintenant.getTime() + DUREE_INVITATION_JOURS * 24 * 3600 * 1000);
  const { data: inv, error } = await db()
    .from('partenaire_invitations')
    .insert({
      partenaire_id: partenaireId,
      email,
      role_partenaire: role,
      jeton_hash: empreinteJeton(jeton),
      invite_par: options.invitePar,
      expire_le: expire.toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const lien = lienInvitation(options.site, jeton);
  const { error: e2 } = await db()
    .from('notifications')
    .insert({
      canal: 'EMAIL',
      destinataire: email,
      sujet: `Invitation à rejoindre ${options.nomPartenaire} sur Elembo`,
      corps:
        `Vous êtes invité à rejoindre l’espace partenaire de ${options.nomPartenaire} sur Elembo (Smart Vision Congo).\n\n` +
        `Ouvrez ce lien pour accepter (valable ${DUREE_INVITATION_JOURS} jours, à usage unique) :\n${lien}\n\n` +
        `Vous devrez vous connecter ou créer un compte avec cette adresse e-mail : ${email}.`,
      statut: 'A_ENVOYER',
      entite: 'partenaire',
      entite_id: partenaireId,
      cle_idempotence: `partenaire:${partenaireId}:invitation:${inv.id as string}`,
      metadata: { invitation_id: inv.id },
    });
  if (e2) console.error('E-mail d’invitation non enregistré :', e2.code ?? e2.message);
  return lien;
}

export async function revoquerInvitation(partenaireId: string, invitationId: string): Promise<void> {
  if (!UUID.test(invitationId)) throw new ErreurIntrouvable('Invitation introuvable.');
  const { data, error } = await db()
    .from('partenaire_invitations')
    .update({ revoquee_le: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('partenaire_id', partenaireId)
    .is('acceptee_le', null)
    .is('revoquee_le', null)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ErreurMetier('Cette invitation n’est plus en attente.');
  // L'e-mail encore en file pour cette invitation n'a plus lieu d'être envoyé.
  await db().from('notifications').update({ statut: 'ANNULEE' }).eq('cle_idempotence', `partenaire:${partenaireId}:invitation:${invitationId}`).eq('statut', 'A_ENVOYER');
}

/* ------------------------------------------------------------- acceptation -- */

export type InvitationPublique = {
  id: string;
  partenaire_id: string;
  partenaire: string;
  email: string;
  role_partenaire: RolePartenaire;
  etat: EtatInvitation;
  partenaireOuvert: boolean;
};

/** Invitation désignée par un jeton (page publique d'acceptation). `null` si inconnue. */
export async function invitationParJeton(jeton: string): Promise<InvitationPublique | null> {
  if (!estJetonInvitation(jeton)) return null;
  const { data, error } = await db()
    .from('partenaire_invitations')
    .select('id, partenaire_id, email, role_partenaire, expire_le, acceptee_le, revoquee_le, partenaire:partenaires!inner(nom, statut)')
    .eq('jeton_hash', empreinteJeton(jeton))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const p = data.partenaire as unknown as { nom: string; statut: string };
  return {
    id: data.id as string,
    partenaire_id: data.partenaire_id as string,
    partenaire: p.nom,
    email: data.email as string,
    role_partenaire: data.role_partenaire as RolePartenaire,
    etat: etatInvitation(data as { acceptee_le: string | null; revoquee_le: string | null; expire_le: string }),
    partenaireOuvert: !['SUSPENDU', 'ARCHIVE'].includes(p.statut),
  };
}

/** Accepte l'invitation pour ce compte (contrôles en base : adresse, usage unique, expiration). */
export async function accepterInvitation(jeton: string, userId: string): Promise<string> {
  if (!estJetonInvitation(jeton) || !UUID.test(userId)) throw new ErreurIntrouvable('Invitation invalide.');
  const { data, error } = await db().rpc('accepter_invitation_partenaire', { p_jeton_hash: empreinteJeton(jeton), p_user_id: userId });
  if (error) {
    if (['P0002', '42501', '23505', '23514'].includes(error.code ?? '')) throw new ErreurMetier(error.message);
    throw new Error(error.message);
  }
  return data as string;
}

/**
 * Invitations en attente adressées à une adresse CONFIRMÉE (page « Bienvenue ») : la personne a
 * prouvé qu'elle contrôle cette adresse ; elle peut accepter sans le lien (perdu, ou retour de
 * confirmation d'e-mail vers une autre page).
 */
export async function invitationsPourEmail(email: string): Promise<{ id: string; partenaire: string; role_partenaire: RolePartenaire }[]> {
  const { data, error } = await db()
    .from('partenaire_invitations')
    .select('id, role_partenaire, expire_le, acceptee_le, revoquee_le, partenaire:partenaires!inner(nom, statut)')
    .eq('email', email.toLowerCase())
    .is('acceptee_le', null)
    .is('revoquee_le', null)
    .gt('expire_le', new Date().toISOString())
    .order('cree_le', { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((i) => !['SUSPENDU', 'ARCHIVE'].includes((i.partenaire as unknown as { statut: string }).statut))
    .map((i) => ({
      id: i.id as string,
      partenaire: (i.partenaire as unknown as { nom: string }).nom,
      role_partenaire: i.role_partenaire as RolePartenaire,
    }));
}

/** Accepte une invitation désignée par son identifiant, pour un compte dont l'adresse est confirmée. */
export async function accepterInvitationParId(invitationId: string, userId: string, emailConfirme: string): Promise<string> {
  if (!UUID.test(invitationId) || !UUID.test(userId)) throw new ErreurIntrouvable('Invitation invalide.');
  const { data, error } = await db().from('partenaire_invitations').select('email, jeton_hash').eq('id', invitationId).maybeSingle();
  if (error) throw new Error(error.message);
  // Même réponse qu'une invitation inconnue si l'adresse ne correspond pas (pas d'énumération).
  if (!data || data.email !== emailConfirme.toLowerCase()) throw new ErreurIntrouvable('Invitation introuvable.');
  const { data: partenaireId, error: e2 } = await db().rpc('accepter_invitation_partenaire', { p_jeton_hash: data.jeton_hash, p_user_id: userId });
  if (e2) {
    if (['P0002', '42501', '23505', '23514'].includes(e2.code ?? '')) throw new ErreurMetier(e2.message);
    throw new Error(e2.message);
  }
  return partenaireId as string;
}
