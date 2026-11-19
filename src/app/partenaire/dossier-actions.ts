'use server';

/**
 * Actions du dossier partenaire : entreprise, machines, capacités, services, disponibilités,
 * soumission. Chaque action exige d'abord la session et le droit du rôle (`exigerPartenaire`) ;
 * l'entreprise vient de la session, jamais du formulaire. Un identifiant d'objet reçu est
 * toujours filtré par l'entreprise de la session (module `ecriture`).
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  lireCapacite,
  lireDisponibilite,
  lireEntreprise,
  lireEtatMachine,
  lireMachine,
  lireService,
} from '@/lib/partenaires/formulaires';
import { exigerPartenaire } from '@/server/partenaires/acces';
import {
  ErreurIntrouvable,
  ErreurMetier,
  archiverMachine,
  basculerCapacite,
  basculerService,
  creerCapacite,
  creerMachine,
  creerService,
  declarerDisponibilite,
  modifierCapacite,
  modifierEntreprise,
  modifierEtatMachine,
  modifierMachine,
  modifierService,
  soumettreDossier,
} from '@/server/partenaires/ecriture';
import { valeursDe, type EtatDossier } from './etat-dossier';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiant facultatif (création si absent). `false` si présent mais invalide. */
function identifiant(formData: FormData): string | null | false {
  const v = formData.get('id');
  if (v === null || v === '') return null;
  return typeof v === 'string' && UUID.test(v) ? v : false;
}

/** Traduit une erreur d'écriture en message affichable ; relance ce qui n'est pas prévu. */
function messageErreur(erreur: unknown): string {
  if (erreur instanceof ErreurMetier || erreur instanceof ErreurIntrouvable) return erreur.message;
  console.error('Portail partenaire — écriture refusée :', erreur instanceof Error ? erreur.message : erreur);
  return 'L’enregistrement a échoué. Réessayez ; si le problème persiste, contactez Smart Vision.';
}

function rafraichir(...chemins: string[]) {
  for (const c of ['/partenaire', ...chemins]) revalidatePath(c);
}

/* --------------------------------------------------------------- entreprise -- */

export async function enregistrerEntreprise(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('entreprise.modifier');
  const lu = lireEntreprise(formData);
  if (!lu.ok) return { erreur: lu.erreur, valeurs: valeursDe(formData) };
  try {
    await modifierEntreprise(session, lu.valeur);
  } catch (erreur) {
    return { erreur: messageErreur(erreur), valeurs: valeursDe(formData) };
  }
  rafraichir('/partenaire/entreprise');
  redirect('/partenaire/entreprise?ok=enregistre');
}

/* ----------------------------------------------------------------- machines -- */

export async function enregistrerMachine(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('machines.modifier');
  const id = identifiant(formData);
  if (id === false) return { erreur: 'Machine invalide.' };
  const lu = lireMachine(formData);
  if (!lu.ok) return { erreur: lu.erreur, valeurs: valeursDe(formData) };
  try {
    if (id) await modifierMachine(session, id, lu.valeur);
    else await creerMachine(session, lu.valeur);
  } catch (erreur) {
    return { erreur: messageErreur(erreur), valeurs: valeursDe(formData) };
  }
  rafraichir('/partenaire/machines');
  redirect(`/partenaire/machines?ok=${id ? 'modifiee' : 'ajoutee'}`);
}

/** État et maintenance : ouvert à l'opérateur de production, sans revalidation. */
export async function enregistrerEtatMachine(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('machines.etat');
  const id = identifiant(formData);
  if (!id) return { erreur: 'Machine invalide.' };
  const lu = lireEtatMachine(formData);
  if (!lu.ok) return { erreur: lu.erreur, valeurs: valeursDe(formData) };
  try {
    await modifierEtatMachine(session, id, lu.valeur);
  } catch (erreur) {
    return { erreur: messageErreur(erreur), valeurs: valeursDe(formData) };
  }
  rafraichir('/partenaire/machines', `/partenaire/machines/${id}`);
  redirect(`/partenaire/machines/${id}?ok=etat`);
}

export async function archiverMachineAction(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('machines.modifier');
  const id = identifiant(formData);
  if (!id) return { erreur: 'Machine invalide.' };
  try {
    await archiverMachine(session, id);
  } catch (erreur) {
    return { erreur: messageErreur(erreur) };
  }
  rafraichir('/partenaire/machines');
  redirect('/partenaire/machines?ok=archivee');
}

/* ---------------------------------------------------------------- capacités -- */

export async function enregistrerCapacite(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('capacites.modifier');
  const id = identifiant(formData);
  if (id === false) return { erreur: 'Capacité invalide.' };
  const lu = lireCapacite(formData);
  if (!lu.ok) return { erreur: lu.erreur, valeurs: valeursDe(formData) };
  try {
    if (id) await modifierCapacite(session, id, lu.valeur.champs, lu.valeur.machines);
    else await creerCapacite(session, lu.valeur.champs, lu.valeur.machines);
  } catch (erreur) {
    return { erreur: messageErreur(erreur), valeurs: valeursDe(formData) };
  }
  rafraichir('/partenaire/capacites');
  redirect(`/partenaire/capacites?ok=${id ? 'modifiee' : 'ajoutee'}`);
}

export async function basculerCapaciteAction(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('capacites.modifier');
  const id = identifiant(formData);
  if (!id) return { erreur: 'Capacité invalide.' };
  const actif = formData.get('actif') === 'true';
  try {
    await basculerCapacite(session, id, actif);
  } catch (erreur) {
    return { erreur: messageErreur(erreur) };
  }
  rafraichir('/partenaire/capacites');
  redirect(`/partenaire/capacites?ok=${actif ? 'reactivee' : 'desactivee'}`);
}

/* ----------------------------------------------------------------- services -- */

export async function enregistrerService(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('services.modifier');
  const id = identifiant(formData);
  if (id === false) return { erreur: 'Service invalide.' };
  const lu = lireService(formData);
  if (!lu.ok) return { erreur: lu.erreur, valeurs: valeursDe(formData) };
  try {
    if (id) await modifierService(session, id, lu.valeur);
    else await creerService(session, lu.valeur);
  } catch (erreur) {
    return { erreur: messageErreur(erreur), valeurs: valeursDe(formData) };
  }
  rafraichir('/partenaire/services');
  redirect(`/partenaire/services?ok=${id ? 'modifie' : 'ajoute'}`);
}

export async function basculerServiceAction(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('services.modifier');
  const id = identifiant(formData);
  if (!id) return { erreur: 'Service invalide.' };
  const actif = formData.get('actif') === 'true';
  try {
    await basculerService(session, id, actif);
  } catch (erreur) {
    return { erreur: messageErreur(erreur) };
  }
  rafraichir('/partenaire/services');
  redirect(`/partenaire/services?ok=${actif ? 'reactive' : 'desactive'}`);
}

/* ----------------------------------------------------------- disponibilités -- */

export async function declarerDisponibiliteAction(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('disponibilites.declarer');
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const lu = lireDisponibilite(formData, aujourdhui);
  if (!lu.ok) return { erreur: lu.erreur, valeurs: valeursDe(formData) };
  try {
    await declarerDisponibilite(session, lu.valeur);
  } catch (erreur) {
    return { erreur: messageErreur(erreur), valeurs: valeursDe(formData) };
  }
  rafraichir('/partenaire/disponibilites');
  redirect('/partenaire/disponibilites?ok=declaree');
}

/* --------------------------------------------------------------- soumission -- */

export async function soumettreDossierAction(): Promise<EtatDossier> {
  const session = await exigerPartenaire('validation.soumettre');
  try {
    await soumettreDossier(session);
  } catch (erreur) {
    return { erreur: messageErreur(erreur) };
  }
  rafraichir();
  redirect('/partenaire?ok=soumis');
}
