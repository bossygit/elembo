'use server';

/**
 * Gestion de l'équipe d'un atelier par son responsable (droit `utilisateurs.gerer`) : inviter,
 * annuler une invitation, changer un rôle, désactiver ou réactiver un membre. L'atelier vient de
 * la session ; un membre ou une invitation d'un autre atelier est introuvable.
 */

import { revalidatePath } from 'next/cache';

import { ROLES_PARTENAIRE, estRolePartenaire } from '@/lib/partenaires/droits';
import { lireInvitation } from '@/lib/partenaires/invitations';
import { journaliser } from '@/server/admin/audit';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { ErreurIntrouvable, ErreurMetier } from '@/server/partenaires/ecriture';
import { creerInvitation, membres, modifierMembre, revoquerInvitation } from '@/server/partenaires/invitations';
import { urlSite } from '@/server/partenaires/site';
import type { EtatDossier } from './etat-dossier';

export type EtatInvitation = EtatDossier & {
  /** Lien d'invitation, affiché une seule fois (à transmettre si l'e-mail n'arrive pas). */
  lien?: string;
  email?: string;
};

const CHEMIN = '/partenaire/utilisateurs';

function message(erreur: unknown): string {
  if (erreur instanceof ErreurMetier || erreur instanceof ErreurIntrouvable) return erreur.message;
  console.error('Portail partenaire — équipe :', erreur instanceof Error ? erreur.message : erreur);
  return 'L’opération a échoué. Réessayez.';
}

export async function inviterAction(_e: EtatInvitation, formData: FormData): Promise<EtatInvitation> {
  const session = await exigerPartenaire('utilisateurs.gerer');
  const lu = lireInvitation(formData, ROLES_PARTENAIRE.map((r) => r.id));
  if (!lu.ok) return { erreur: lu.erreur, valeurs: { email: [String(formData.get('email') ?? '')], role: [String(formData.get('role') ?? '')] } };
  try {
    const lien = await creerInvitation({
      partenaireId: session.partenaireId,
      nomPartenaire: session.nomPartenaire,
      email: lu.email,
      role: lu.role,
      invitePar: session.userId,
      site: await urlSite(),
    });
    await journaliser({ staff: { id: session.userId, email: session.email }, action: 'PARTENAIRE_INVITATION', entite: 'partenaire', entiteId: session.partenaireId, apres: { email: lu.email, role: lu.role } });
    revalidatePath(CHEMIN);
    return { lien, email: lu.email };
  } catch (erreur) {
    return { erreur: message(erreur), valeurs: { email: [lu.email], role: [lu.role] } };
  }
}

export async function revoquerInvitationAction(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('utilisateurs.gerer');
  const id = String(formData.get('id') ?? '');
  try {
    await revoquerInvitation(session.partenaireId, id);
    await journaliser({ staff: { id: session.userId, email: session.email }, action: 'PARTENAIRE_INVITATION_ANNULEE', entite: 'partenaire', entiteId: session.partenaireId, apres: { invitation: id } });
  } catch (erreur) {
    return { erreur: message(erreur) };
  }
  revalidatePath(CHEMIN);
  return {};
}

/** Rôle ou activité d'un membre. On n'agit jamais sur son propre compte (pas de verrouillage). */
export async function modifierMembreAction(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('utilisateurs.gerer');
  const id = String(formData.get('id') ?? '');
  const role = formData.get('role');
  const actif = formData.get('actif');
  try {
    const cible = (await membres(session.partenaireId)).find((m) => m.id === id);
    if (!cible) throw new ErreurIntrouvable('Membre introuvable.');
    if (cible.user_id === session.userId) return { erreur: 'Vous ne pouvez pas modifier votre propre accès.' };
    const champs = estRolePartenaire(role) ? { role_partenaire: role } : actif === 'true' || actif === 'false' ? { actif: actif === 'true' } : null;
    if (!champs) return { erreur: 'Modification invalide.' };
    await modifierMembre(session.partenaireId, id, champs);
    await journaliser({ staff: { id: session.userId, email: session.email }, action: 'PARTENAIRE_MEMBRE_MODIFIE', entite: 'partenaire', entiteId: session.partenaireId, avant: { membre: id, role: cible.role_partenaire, actif: cible.actif }, apres: champs });
  } catch (erreur) {
    return { erreur: message(erreur) };
  }
  revalidatePath(CHEMIN);
  return {};
}
