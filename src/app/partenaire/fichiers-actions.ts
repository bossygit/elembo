'use server';

/**
 * Actions des fichiers du dossier partenaire (appelées par le composant d'envoi et le bouton
 * « Retirer »). Le droit dépend du type : photos de machines → `machines.etat` (opérateur
 * compris) ; logo, atelier, réalisations, documents → `entreprise.modifier`.
 */

import { revalidatePath } from 'next/cache';

import type { TypeFichierPartenaire } from '@/lib/partenaires/catalogue';
import { peutPartenaire } from '@/lib/partenaires/droits';
import { droitPourType, estMimeFichier, estTypeFichier } from '@/lib/partenaires/fichiers';
import { exigerPartenaire, type SessionPartenaire } from '@/server/partenaires/acces';
import { ErreurIntrouvable, ErreurMetier } from '@/server/partenaires/ecriture';
import { confirmerEnvoi, preparerEnvoi, supprimerFichier, typeDuFichier } from '@/server/partenaires/fichiers';
import type { EtatDossier } from './etat-dossier';

export type ResultatEnvoi = { ok: true; chemin?: string; signedUrl?: string } | { ok: false; erreur: string };

function message(erreur: unknown): string {
  if (erreur instanceof ErreurMetier || erreur instanceof ErreurIntrouvable) return erreur.message;
  console.error('Portail partenaire — fichier :', erreur instanceof Error ? erreur.message : erreur);
  return 'L’envoi a échoué. Réessayez dans un instant.';
}

function autorise(session: SessionPartenaire, type: TypeFichierPartenaire): boolean {
  return peutPartenaire(session.role, droitPourType(type), session.statutPartenaire);
}

function rafraichir(type: TypeFichierPartenaire, machineId: string | null) {
  if (type === 'MACHINE' && machineId) revalidatePath(`/partenaire/machines/${machineId}`);
  else revalidatePath('/partenaire/entreprise');
}

type Demande = { type: unknown; machineId?: unknown; mime: unknown; taille: unknown };

function lireDemande(d: Demande) {
  if (!estTypeFichier(d.type) || !estMimeFichier(d.mime) || typeof d.taille !== 'number') return null;
  const machineId = typeof d.machineId === 'string' && d.machineId ? d.machineId : null;
  return { type: d.type, mime: d.mime, taille: d.taille, machineId };
}

export async function preparerEnvoiFichier(demande: Demande): Promise<ResultatEnvoi> {
  const session = await exigerPartenaire('fichiers.envoyer');
  const d = lireDemande(demande);
  if (!d) return { ok: false, erreur: 'Envoi invalide.' };
  if (!autorise(session, d.type)) return { ok: false, erreur: 'Votre rôle ne permet pas d’envoyer ce fichier.' };
  try {
    const { chemin, signedUrl } = await preparerEnvoi(session, d);
    return { ok: true, chemin, signedUrl };
  } catch (erreur) {
    return { ok: false, erreur: message(erreur) };
  }
}

export async function confirmerFichier(demande: Demande & { chemin: unknown; nom: unknown }): Promise<ResultatEnvoi> {
  const session = await exigerPartenaire('fichiers.envoyer');
  const d = lireDemande(demande);
  if (!d || typeof demande.chemin !== 'string') return { ok: false, erreur: 'Envoi invalide.' };
  if (!autorise(session, d.type)) return { ok: false, erreur: 'Votre rôle ne permet pas d’envoyer ce fichier.' };
  try {
    await confirmerEnvoi(session, { ...d, chemin: demande.chemin, nom: typeof demande.nom === 'string' ? demande.nom : null });
  } catch (erreur) {
    return { ok: false, erreur: message(erreur) };
  }
  rafraichir(d.type, d.machineId);
  return { ok: true };
}

export async function retirerFichierAction(_e: EtatDossier, formData: FormData): Promise<EtatDossier> {
  const session = await exigerPartenaire('fichiers.envoyer');
  const id = String(formData.get('id') ?? '');
  try {
    const type = await typeDuFichier(session, id);
    if (!type) return { erreur: 'Fichier introuvable.' };
    if (!autorise(session, type)) return { erreur: 'Votre rôle ne permet pas de retirer ce fichier.' };
    const { machineId } = await supprimerFichier(session, id);
    rafraichir(type, machineId);
  } catch (erreur) {
    return { erreur: message(erreur) };
  }
  return {};
}
