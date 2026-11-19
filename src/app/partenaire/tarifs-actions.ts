'use server';

/**
 * Actions des tarifs négociés (responsable de l'atelier uniquement). La lignée visée vient du
 * formulaire mais n'est jamais crue : la fonction SQL vérifie qu'elle appartient à l'entreprise
 * de la session, imposée par le serveur.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { lireTarif } from '@/lib/partenaires/formulaires';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { ErreurIntrouvable, ErreurMetier } from '@/server/partenaires/ecriture';
import { proposerTarif, retirerProposition } from '@/server/partenaires/tarifs';
import { valeursDe, type EtatDossier } from './etat-dossier';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function message(erreur: unknown): string {
  if (erreur instanceof ErreurMetier || erreur instanceof ErreurIntrouvable) return erreur.message;
  console.error('Portail partenaire — tarif :', erreur instanceof Error ? erreur.message : erreur);
  return 'L’enregistrement a échoué. Réessayez ; si le problème persiste, contactez Smart Vision.';
}

function lignee(formData: FormData): string | null | false {
  const v = formData.get('lignee_id');
  if (v === null || v === '') return null;
  return typeof v === 'string' && UUID.test(v) ? v : false;
}

export async function proposerTarifAction(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('tarifs.proposer');
  const ligneeId = lignee(formData);
  if (ligneeId === false) return { erreur: 'Tarif invalide.' };
  const lu = lireTarif(formData);
  if (!lu.ok) return { erreur: lu.erreur, valeurs: valeursDe(formData) };
  let cible: string;
  try {
    const tarifId = await proposerTarif(session, ligneeId, lu.valeur.champs, lu.valeur.paliers);
    cible = ligneeId ?? tarifId; // nouvelle lignée : son identifiant est celui de la version 1
  } catch (erreur) {
    return { erreur: message(erreur), valeurs: valeursDe(formData) };
  }
  revalidatePath('/partenaire/tarifs');
  redirect(`/partenaire/tarifs/${cible}?ok=propose`);
}

export async function retirerPropositionAction(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('tarifs.proposer');
  const ligneeId = lignee(formData);
  if (!ligneeId) return { erreur: 'Tarif invalide.' };
  try {
    await retirerProposition(session, ligneeId);
  } catch (erreur) {
    return { erreur: message(erreur) };
  }
  revalidatePath('/partenaire/tarifs');
  redirect(`/partenaire/tarifs/${ligneeId}?ok=retire`);
}
