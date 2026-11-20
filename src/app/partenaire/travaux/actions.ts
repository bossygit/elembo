'use server';

/**
 * Actions des travaux affectés (portail atelier). L'identifiant vient du formulaire mais n'est
 * jamais cru : les fonctions SQL vérifient le rattachement de l'utilisateur et l'appartenance de
 * l'affectation à son entreprise.
 */

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { redirect } from 'next/navigation';

import { traiterNotifications } from '@/server/devis/notifications';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { ErreurIntrouvable, ErreurMetier } from '@/server/partenaires/ecriture';
import { repondreAffectation, terminerAffectation } from '@/server/partenaires/travaux';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function identifiant(formData: FormData): string | null {
  const v = formData.get('id');
  return typeof v === 'string' && UUID.test(v) ? v : null;
}

function message(erreur: unknown): string {
  if (erreur instanceof ErreurMetier || erreur instanceof ErreurIntrouvable) return erreur.message;
  console.error('Portail partenaire — travaux :', erreur instanceof Error ? erreur.message : erreur);
  return 'L’opération a échoué. Réessayez ; si le problème persiste, contactez Smart Vision.';
}

function rafraichir(id: string): void {
  revalidatePath('/partenaire/travaux');
  revalidatePath(`/partenaire/travaux/${id}`);
  revalidatePath('/partenaire');
}

export async function accepterAffectationAction(formData: FormData): Promise<void> {
  const session = await exigerPartenaire('travaux.decider');
  const id = identifiant(formData);
  if (!id) redirect('/partenaire/travaux?erreur=' + encodeURIComponent('Travail introuvable.'));
  try {
    await repondreAffectation(session, id, 'ACCEPTEE', null);
  } catch (erreur) {
    redirect(`/partenaire/travaux/${id}?erreur=` + encodeURIComponent(message(erreur)));
  }
  after(() => traiterNotifications(20).catch(() => undefined));
  rafraichir(id);
  redirect(`/partenaire/travaux/${id}?ok=acceptee`);
}

export async function refuserAffectationAction(formData: FormData): Promise<void> {
  const session = await exigerPartenaire('travaux.decider');
  const id = identifiant(formData);
  if (!id) redirect('/partenaire/travaux?erreur=' + encodeURIComponent('Travail introuvable.'));
  const motif = String(formData.get('motif') ?? '').trim().slice(0, 1000);
  if (!motif) redirect(`/partenaire/travaux/${id}?erreur=` + encodeURIComponent('Un motif est obligatoire pour refuser.'));
  try {
    await repondreAffectation(session, id, 'REFUSEE', motif);
  } catch (erreur) {
    redirect(`/partenaire/travaux/${id}?erreur=` + encodeURIComponent(message(erreur)));
  }
  after(() => traiterNotifications(20).catch(() => undefined));
  rafraichir(id);
  redirect(`/partenaire/travaux/${id}?ok=refusee`);
}

export async function terminerAffectationAction(formData: FormData): Promise<void> {
  const session = await exigerPartenaire('travaux.executer');
  const id = identifiant(formData);
  if (!id) redirect('/partenaire/travaux?erreur=' + encodeURIComponent('Travail introuvable.'));
  try {
    await terminerAffectation(session, id);
  } catch (erreur) {
    redirect(`/partenaire/travaux/${id}?erreur=` + encodeURIComponent(message(erreur)));
  }
  after(() => traiterNotifications(20).catch(() => undefined));
  rafraichir(id);
  redirect(`/partenaire/travaux/${id}?ok=terminee`);
}
