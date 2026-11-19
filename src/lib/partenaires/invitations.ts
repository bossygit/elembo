/**
 * Invitations à rejoindre un atelier partenaire — règles pures, testées par
 * `partenairesInvitations.test.ts`.
 *
 * Le jeton (32 octets aléatoires, base64url) n'existe en clair que dans le lien remis à la
 * personne invitée ; la base n'en garde que l'empreinte SHA-256 (`partenaire_invitations`).
 * L'acceptation exige en plus un compte confirmé portant exactement l'adresse invitée
 * (`accepter_invitation_partenaire`).
 */

import { estRolePartenaire, type RolePartenaire } from './droits';

export const DUREE_INVITATION_JOURS = 7;
/** Invitations en attente au plus, par atelier. */
export const INVITATIONS_EN_ATTENTE_MAX = 10;

const JETON = /^[A-Za-z0-9_-]{43}$/;

export function estJetonInvitation(v: unknown): v is string {
  return typeof v === 'string' && JETON.test(v);
}

export const CHEMIN_INVITATION = '/partenaire/invitation/';

export function lienInvitation(site: string, jeton: string): string {
  return `${site.replace(/\/+$/, '')}${CHEMIN_INVITATION}${jeton}`;
}

/** La destination est-elle une page d'invitation bien formée ? */
export function estCheminInvitation(chemin: string): boolean {
  return chemin.startsWith(CHEMIN_INVITATION) && estJetonInvitation(chemin.slice(CHEMIN_INVITATION.length));
}

export type EtatInvitation = 'EN_ATTENTE' | 'ACCEPTEE' | 'REVOQUEE' | 'EXPIREE';

export function etatInvitation(
  inv: { acceptee_le: string | null; revoquee_le: string | null; expire_le: string },
  maintenant = new Date(),
): EtatInvitation {
  if (inv.acceptee_le) return 'ACCEPTEE';
  if (inv.revoquee_le) return 'REVOQUEE';
  return new Date(inv.expire_le).getTime() <= maintenant.getTime() ? 'EXPIREE' : 'EN_ATTENTE';
}

export const LIBELLES_ETAT_INVITATION: Record<EtatInvitation, string> = {
  EN_ATTENTE: 'En attente',
  ACCEPTEE: 'Acceptée',
  REVOQUEE: 'Annulée',
  EXPIREE: 'Expirée',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Formulaire d'invitation. `rolesAutorises` : le responsable d'un atelier invite tous les rôles ;
 * Smart Vision invite un responsable (rattachement d'une fiche créée au back-office).
 */
export function lireInvitation(
  formData: FormData,
  rolesAutorises: readonly RolePartenaire[],
): { ok: true; email: string; role: RolePartenaire } | { ok: false; erreur: string } {
  const brut = formData.get('email');
  const email = typeof brut === 'string' ? brut.trim().toLowerCase().slice(0, 254) : '';
  if (!EMAIL.test(email)) return { ok: false, erreur: 'Indiquez une adresse e-mail valide.' };
  const role = formData.get('role');
  if (!estRolePartenaire(role) || !rolesAutorises.includes(role)) return { ok: false, erreur: 'Rôle invalide.' };
  return { ok: true, email, role };
}
