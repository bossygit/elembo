'use server';

/**
 * Actions du portail partenaire : inscription, connexion, déconnexion, mot de passe, création
 * de l'entreprise. Chaque action est traitée comme un point d'entrée public (guide Next.js
 * « Authentication » → Server Actions) : validation serveur, limitation, message neutre.
 */

import { createHash } from 'node:crypto';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  CLE_INSCRIPTION,
  destinationPartenaire,
  lireConnexion,
  lireEmail,
  lireInscription,
  lireNouveauMotDePasse,
} from '@/lib/partenaires/compte';
import { journaliser } from '@/server/admin/audit';
import { creerClientAuthServeur } from '@/server/auth/session';
import { creerEntreprise, etatCompte, finaliserInscription, lireEtatCompte } from '@/server/partenaires/acces';
import { ErreurLimiteIndisponible, limiter } from '@/server/security/rateLimit';

export type EtatFormulaire = {
  erreur?: string;
  /** Code de succès affiché sans quitter la page (ex. « verifier » après l'inscription). */
  ok?: string;
  /** Valeurs non sensibles renvoyées pour ne pas faire tout ressaisir (jamais le mot de passe). */
  valeurs?: Record<string, string>;
};

const LIMITE_ATTEINTE = 'Trop de tentatives. Réessayez dans quelques minutes.';

function empreinte(valeur: string): string {
  return createHash('sha256').update(valeur.trim().toLowerCase()).digest('hex').slice(0, 32);
}

async function ip(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || h.get('x-real-ip') || 'inconnue';
}

/**
 * Limitation par IP et par compte. Redis indisponible : on laisse passer (Supabase Auth applique
 * ses propres limites), comme pour la connexion du back-office ; l'incident est journalisé.
 */
async function autorise(action: string, cles: [string, number, number][]): Promise<boolean> {
  try {
    for (const [cle, maximum, fenetre] of cles) {
      if (!(await limiter(`partenaire:${action}:${cle}`, maximum, fenetre))) return false;
    }
    return true;
  } catch (erreur) {
    if (erreur instanceof ErreurLimiteIndisponible) {
      console.error(`Portail partenaire (${action}) : limitation indisponible (Redis).`);
      return true;
    }
    throw erreur;
  }
}

/** Adresse publique du site, pour les liens envoyés par e-mail. */
async function urlSite(): Promise<string> {
  const configuree = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  if (configuree) return configuree;
  const h = await headers();
  const hote = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const protocole = h.get('x-forwarded-proto') ?? (hote.startsWith('localhost') ? 'http' : 'https');
  return `${protocole}://${hote}`;
}

/* ------------------------------------------------------------- inscription -- */

export async function inscrire(_prec: EtatFormulaire, formData: FormData): Promise<EtatFormulaire> {
  const lu = lireInscription(formData);
  const valeurs = {
    nom: String(formData.get('nom') ?? '').slice(0, 120),
    telephone: String(formData.get('telephone') ?? '').slice(0, 32),
    email: String(formData.get('email') ?? '').slice(0, 254),
  };
  if (!lu.ok) return { erreur: lu.erreur, valeurs };
  const { email, motDePasse, nom, telephone } = lu.valeur;

  const adresse = await ip();
  if (!(await autorise('inscription', [[`ip:${empreinte(adresse)}`, 5, 3600], [`compte:${empreinte(email)}`, 3, 3600]]))) {
    return { erreur: LIMITE_ATTEINTE, valeurs };
  }

  const client = await creerClientAuthServeur();
  const { data, error } = await client.auth.signUp({
    email,
    password: motDePasse,
    options: {
      emailRedirectTo: `${await urlSite()}/partenaire/auth/confirmer`,
      // Pré-remplissage seulement : jamais lu comme une source de droit.
      data: { [CLE_INSCRIPTION]: { nom, telephone } },
    },
  });

  if (error) {
    // Mot de passe refusé par la politique Supabase (ex. trop faible ou divulgué) : à dire.
    if (error.code === 'weak_password') {
      return { erreur: 'Ce mot de passe est trop faible ou connu publiquement. Choisissez-en un autre.', valeurs };
    }
    // Adresse déjà utilisée, ou toute autre erreur : réponse neutre (pas d'énumération).
    if (error.code !== 'user_already_exists' && error.code !== 'email_exists') {
      console.error('Inscription partenaire refusée par Supabase Auth :', error.code ?? error.status);
    }
    return { ok: 'verifier' };
  }

  // Confirmation d'e-mail désactivée sur ce projet : la session est ouverte immédiatement.
  if (data.session && data.user) {
    const partenaireId = await creerEntreprise(data.user.id, nom, telephone);
    await journaliser({
      staff: { id: data.user.id, email },
      action: 'PARTENAIRE_INSCRIPTION',
      entite: 'partenaire',
      entiteId: partenaireId,
      apres: { nom, statut: 'BROUILLON', confirmation: 'automatique' },
    });
    redirect('/partenaire?ok=bienvenue');
  }

  return { ok: 'verifier' };
}

/* --------------------------------------------------------------- connexion -- */

export async function connecter(_prec: EtatFormulaire, formData: FormData): Promise<EtatFormulaire> {
  const suite = destinationPartenaire(formData.get('suite'));
  const lu = lireConnexion(formData);
  const valeurs = { email: String(formData.get('email') ?? '').slice(0, 254) };
  if (!lu) return { erreur: 'Renseignez votre e-mail et votre mot de passe.', valeurs };

  const adresse = await ip();
  if (!(await autorise('connexion', [[`ip:${empreinte(adresse)}`, 10, 900], [`compte:${empreinte(lu.email)}`, 5, 900]]))) {
    return { erreur: LIMITE_ATTEINTE, valeurs };
  }

  const client = await creerClientAuthServeur();
  const { data, error } = await client.auth.signInWithPassword({ email: lu.email, password: lu.motDePasse });
  if (error?.code === 'email_not_confirmed') {
    return { erreur: 'Confirmez d’abord votre adresse e-mail : ouvrez le lien reçu après l’inscription.', valeurs };
  }
  // Message identique pour un e-mail inconnu et un mauvais mot de passe.
  if (error || !data.user) return { erreur: 'Identifiants refusés.', valeurs };

  const roleStaff = data.user.app_metadata?.role;
  if (typeof roleStaff === 'string' && roleStaff) {
    // Compte du personnel : aucune session ne doit subsister côté portail.
    await client.auth.signOut({ scope: 'local' });
    return { erreur: 'Ce compte est un compte du personnel Smart Vision : connectez-vous depuis le back-office.', valeurs };
  }

  await journaliser({
    staff: { id: data.user.id, email: lu.email },
    action: 'PARTENAIRE_CONNEXION',
    entite: 'session',
    entiteId: data.user.id,
  });

  // Première connexion après une confirmation faite ailleurs : l'entreprise n'existe pas encore.
  // (`etatCompte` est mémoïsé et daterait d'avant la connexion : on relit.)
  const etat = await lireEtatCompte();
  const cree = await finaliserInscription(etat);
  if (cree) {
    await journaliser({
      staff: { id: data.user.id, email: lu.email },
      action: 'PARTENAIRE_INSCRIPTION',
      entite: 'partenaire',
      entiteId: cree,
      apres: { statut: 'BROUILLON' },
    });
    redirect('/partenaire?ok=bienvenue');
  }
  redirect(suite);
}

export async function deconnecter(): Promise<void> {
  const etat = await etatCompte();
  const client = await creerClientAuthServeur();
  // `scope: 'local'` : ferme cette session, pas celles ouvertes sur d'autres appareils.
  await client.auth.signOut({ scope: 'local' });
  if (etat.type === 'partenaire') {
    await journaliser({
      staff: { id: etat.session.userId, email: etat.session.email },
      action: 'PARTENAIRE_DECONNEXION',
      entite: 'session',
      entiteId: etat.session.userId,
    });
  }
  redirect('/partenaire/connexion?ok=deconnexion');
}

/* ------------------------------------------------------------ mot de passe -- */

export async function demanderReinitialisation(_prec: EtatFormulaire, formData: FormData): Promise<EtatFormulaire> {
  const email = lireEmail(formData.get('email'));
  if (!email) return { erreur: 'Indiquez une adresse e-mail valide.' };

  const adresse = await ip();
  if (!(await autorise('mot-de-passe', [[`ip:${empreinte(adresse)}`, 5, 3600], [`compte:${empreinte(email)}`, 3, 3600]]))) {
    return { erreur: LIMITE_ATTEINTE };
  }

  const client = await creerClientAuthServeur();
  const suite = encodeURIComponent('/partenaire/mot-de-passe/nouveau');
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${await urlSite()}/partenaire/auth/confirmer?suite=${suite}`,
  });
  if (error) console.error('Réinitialisation partenaire : envoi refusé par Supabase Auth :', error.code ?? error.status);
  // Toujours la même réponse, que l'adresse existe ou non.
  return { ok: 'envoye' };
}

export async function definirMotDePasse(_prec: EtatFormulaire, formData: FormData): Promise<EtatFormulaire> {
  const etat = await etatCompte();
  // Session ouverte par le lien de réinitialisation (compte confirmé, hors staff).
  if (etat.type !== 'partenaire' && etat.type !== 'sans_entreprise') redirect('/partenaire/connexion?erreur=lien');

  const lu = lireNouveauMotDePasse(formData);
  if (!lu.ok) return { erreur: lu.erreur };

  const client = await creerClientAuthServeur();
  const { error } = await client.auth.updateUser({ password: lu.motDePasse });
  if (error?.code === 'same_password') return { erreur: 'Choisissez un mot de passe différent de l’ancien.' };
  if (error?.code === 'weak_password') return { erreur: 'Ce mot de passe est trop faible ou connu publiquement.' };
  if (error) return { erreur: 'Le mot de passe n’a pas pu être modifié. Recommencez depuis le lien reçu par e-mail.' };

  const acteur = etat.type === 'partenaire' ? etat.session : { userId: etat.userId, email: etat.email };
  await journaliser({
    staff: { id: acteur.userId, email: acteur.email },
    action: 'PARTENAIRE_MOT_DE_PASSE',
    entite: 'session',
    entiteId: acteur.userId,
  });
  redirect('/partenaire?ok=mot_de_passe');
}

/* ------------------------------------------------- création de l'entreprise -- */

/** Compte confirmé sans entreprise (créé hors du formulaire d'inscription). */
export async function creerMonEntreprise(_prec: EtatFormulaire, formData: FormData): Promise<EtatFormulaire> {
  const etat = await etatCompte();
  if (etat.type === 'partenaire') redirect('/partenaire');
  if (etat.type !== 'sans_entreprise') redirect('/partenaire/connexion');

  const nom = String(formData.get('nom') ?? '').trim().slice(0, 120);
  const telephone = String(formData.get('telephone') ?? '').trim().slice(0, 32);
  const valeurs = { nom, telephone };
  if (nom.length < 2) return { erreur: 'Indiquez le nom de votre entreprise.', valeurs };
  if (!/^\+?[0-9][0-9 ().-]{5,30}$/.test(telephone)) return { erreur: 'Indiquez un numéro de téléphone valide.', valeurs };

  const partenaireId = await creerEntreprise(etat.userId, nom, telephone);
  await journaliser({
    staff: { id: etat.userId, email: etat.email },
    action: 'PARTENAIRE_INSCRIPTION',
    entite: 'partenaire',
    entiteId: partenaireId,
    apres: { nom, statut: 'BROUILLON' },
  });
  redirect('/partenaire?ok=bienvenue');
}
