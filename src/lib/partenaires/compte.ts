/**
 * Comptes du portail partenaire — règles pures (sans dépendance serveur), testées par
 * `partenairesCompte.test.ts`.
 *
 *  - `resoudreEtatCompte` : ce qu'un utilisateur Supabase Auth peut faire sur /partenaire ;
 *  - `destinationPartenaire` : redirection après connexion, sans redirection ouverte ;
 *  - `lireInscription`, `lireConnexion`, `lireNouveauMotDePasse` : validation des formulaires.
 */

import { estRolePartenaire, type RolePartenaire } from './droits';
import { estCheminInvitation } from './invitations';
import { estStatutPartenaire, type StatutPartenaire } from './statuts';

/* ---------------------------------------------------------- état du compte -- */

export type SessionPartenaire = {
  userId: string;
  email: string;
  /** Toujours déduit de la session (rattachement vérifié), jamais d'un formulaire ou d'une URL. */
  partenaireId: string;
  nomPartenaire: string;
  role: RolePartenaire;
  statutPartenaire: StatutPartenaire;
};

/** Ce que l'inscription a déclaré (pré-remplissage uniquement, jamais une source de droit). */
export type IntentionInscription = { nom: string; telephone: string | null };

export type EtatCompte =
  | { type: 'anonyme' }
  /** Compte du personnel : il n'entre pas dans le portail (et inversement). */
  | { type: 'staff'; email: string }
  | { type: 'non_confirme'; email: string }
  /** Compte confirmé, rattaché à aucune entreprise : création ou invitation à accepter. */
  | { type: 'sans_entreprise'; userId: string; email: string; intention: IntentionInscription | null }
  | { type: 'partenaire'; session: SessionPartenaire };

export type UtilisateurAuth = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

export type Rattachement = {
  partenaire_id: string;
  role_partenaire: string;
  nom: string;
  statut: string;
};

/** Clé de `user_metadata` posée par le formulaire d'inscription du portail. */
export const CLE_INSCRIPTION = 'inscription_partenaire';

export function intentionInscription(metadata: Record<string, unknown> | null | undefined): IntentionInscription | null {
  const brut = metadata?.[CLE_INSCRIPTION];
  if (!brut || typeof brut !== 'object') return null;
  const nom = typeof (brut as { nom?: unknown }).nom === 'string' ? (brut as { nom: string }).nom.trim() : '';
  const tel = (brut as { telephone?: unknown }).telephone;
  if (nom.length < 2 || nom.length > 120) return null;
  return { nom, telephone: typeof tel === 'string' && tel.trim() ? tel.trim().slice(0, 32) : null };
}

export function resoudreEtatCompte(utilisateur: UtilisateurAuth | null, rattachement: Rattachement | null): EtatCompte {
  if (!utilisateur?.id) return { type: 'anonyme' };
  const email = (utilisateur.email ?? '').toLowerCase();
  const roleStaff = utilisateur.app_metadata?.role;
  if (typeof roleStaff === 'string' && roleStaff.trim() !== '') return { type: 'staff', email };
  if (!utilisateur.email_confirmed_at) return { type: 'non_confirme', email };
  if (!rattachement || !estRolePartenaire(rattachement.role_partenaire) || !estStatutPartenaire(rattachement.statut)) {
    return { type: 'sans_entreprise', userId: utilisateur.id, email, intention: intentionInscription(utilisateur.user_metadata) };
  }
  return {
    type: 'partenaire',
    session: {
      userId: utilisateur.id,
      email,
      partenaireId: rattachement.partenaire_id,
      nomPartenaire: rattachement.nom,
      role: rattachement.role_partenaire,
      statutPartenaire: rattachement.statut,
    },
  };
}

/* ------------------------------------------------------------ navigation -- */

/** Pages du portail accessibles sans session. */
export const PAGES_PUBLIQUES_PARTENAIRE = [
  '/partenaire/connexion',
  '/partenaire/inscription',
  '/partenaire/mot-de-passe',
  '/partenaire/auth/confirmer',
  '/partenaire/invitation',
] as const;

export function estPagePubliquePartenaire(chemin: string): boolean {
  // `/partenaire/mot-de-passe/nouveau` exige la session ouverte par le lien de réinitialisation.
  if (chemin === '/partenaire/mot-de-passe/nouveau') return false;
  return PAGES_PUBLIQUES_PARTENAIRE.some((p) => chemin === p || chemin.startsWith(`${p}/`));
}

/**
 * Destination après connexion : uniquement une page protégée du portail. Toute autre valeur
 * (URL absolue, `//hôte`, remontée `..`, page publique) retombe sur /partenaire.
 */
export function destinationPartenaire(suite: unknown): string {
  if (typeof suite !== 'string') return '/partenaire';
  if (!/^\/partenaire(?:\/[A-Za-z0-9/_\-.]*)?$/.test(suite) || suite.includes('//') || suite.includes('..')) {
    return '/partenaire';
  }
  // Seule page publique admise : l'invitation à accepter après connexion ou inscription.
  if (estCheminInvitation(suite)) return suite;
  if (estPagePubliquePartenaire(suite)) return '/partenaire';
  return suite;
}

/* ---------------------------------------------------------- formulaires -- */

export const MOT_DE_PASSE_MIN = 10;
/** Limite de bcrypt (Supabase Auth) : au-delà de 72 octets, le reste serait ignoré. */
export const MOT_DE_PASSE_MAX_OCTETS = 72;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEPHONE = /^\+?[0-9][0-9 ().-]{5,30}$/;

const texte = (v: FormDataEntryValue | null, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function lireEmail(v: FormDataEntryValue | null): string | null {
  const email = texte(v, 254).toLowerCase();
  return EMAIL.test(email) ? email : null;
}

/** `null` si le mot de passe est acceptable, sinon le motif. */
export function erreurMotDePasse(motDePasse: string): string | null {
  if (motDePasse.length < MOT_DE_PASSE_MIN) return `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères.`;
  if (new TextEncoder().encode(motDePasse).length > MOT_DE_PASSE_MAX_OCTETS) return 'Le mot de passe est trop long (72 caractères au plus).';
  if (/^\s|\s$/.test(motDePasse)) return 'Le mot de passe ne doit pas commencer ni finir par un espace.';
  return null;
}

export type Inscription = { email: string; motDePasse: string; nom: string; telephone: string };

export function lireInscription(formData: FormData): { ok: true; valeur: Inscription } | { ok: false; erreur: string } {
  const nom = texte(formData.get('nom'), 120);
  const telephone = texte(formData.get('telephone'), 32);
  const email = lireEmail(formData.get('email'));
  const motDePasse = typeof formData.get('mot_de_passe') === 'string' ? (formData.get('mot_de_passe') as string) : '';
  const confirmation = typeof formData.get('confirmation') === 'string' ? (formData.get('confirmation') as string) : '';

  if (nom.length < 2) return { ok: false, erreur: 'Indiquez le nom de votre entreprise.' };
  if (!TELEPHONE.test(telephone)) return { ok: false, erreur: 'Indiquez un numéro de téléphone valide.' };
  if (!email) return { ok: false, erreur: 'Indiquez une adresse e-mail valide.' };
  const erreur = erreurMotDePasse(motDePasse);
  if (erreur) return { ok: false, erreur };
  if (motDePasse !== confirmation) return { ok: false, erreur: 'Les deux mots de passe ne correspondent pas.' };
  if (formData.get('engagement') !== 'oui') {
    return { ok: false, erreur: 'Confirmez que les informations seront vérifiées par Smart Vision.' };
  }
  return { ok: true, valeur: { email, motDePasse, nom, telephone } };
}

export function lireConnexion(formData: FormData): { email: string; motDePasse: string } | null {
  const email = lireEmail(formData.get('email'));
  const motDePasse = typeof formData.get('mot_de_passe') === 'string' ? (formData.get('mot_de_passe') as string).slice(0, 200) : '';
  return email && motDePasse ? { email, motDePasse } : null;
}

export function lireNouveauMotDePasse(formData: FormData): { ok: true; motDePasse: string } | { ok: false; erreur: string } {
  const motDePasse = typeof formData.get('mot_de_passe') === 'string' ? (formData.get('mot_de_passe') as string) : '';
  const confirmation = typeof formData.get('confirmation') === 'string' ? (formData.get('confirmation') as string) : '';
  const erreur = erreurMotDePasse(motDePasse);
  if (erreur) return { ok: false, erreur };
  if (motDePasse !== confirmation) return { ok: false, erreur: 'Les deux mots de passe ne correspondent pas.' };
  return { ok: true, motDePasse };
}

/** Types de lien d'e-mail Supabase acceptés par /partenaire/auth/confirmer. */
export const TYPES_LIEN = ['signup', 'email', 'recovery', 'invite', 'email_change'] as const;
export type TypeLien = (typeof TYPES_LIEN)[number];

export function estTypeLien(v: unknown): v is TypeLien {
  return typeof v === 'string' && (TYPES_LIEN as readonly string[]).includes(v);
}
