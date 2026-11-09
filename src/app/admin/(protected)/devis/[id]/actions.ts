'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { utilisateurStaff } from '@/server/auth/session';
import {
  fichierDuDevis,
  revoquerSessionsDevis,
  transitionnerDevis,
} from '@/server/devis/repository';
import { creerUrlTelechargement } from '@/server/storage/supabase';
import {
  MODES_PAIEMENT,
  commandeDuDevis,
  creerCommandeDepuisDevis,
  type ModePaiement,
} from '@/server/commandes/repository';

async function staffAutorise(roles: string[]): Promise<{ sub: string | null }> {
  const staff = await utilisateurStaff();
  if (!staff || !roles.includes(staff.role)) redirect('/admin/connexion');
  return { sub: staff.claims.sub ?? null };
}

function texte(formData: FormData, nom: string): string {
  return String(formData.get(nom) ?? '').trim();
}

export async function proposerDevis(formData: FormData): Promise<void> {
  const staff = await staffAutorise(['admin', 'commercial']);
  const id = texte(formData, 'devis_id');
  const montant = Number(texte(formData, 'montant'));
  const note = texte(formData, 'note').slice(0, 2000);
  if (!id || !Number.isSafeInteger(montant) || montant <= 0) {
    redirect(`/admin/devis/${id}?erreur=montant`);
  }

  try {
    await transitionnerDevis(id, 'PROPOSE', montant, note || null, staff.sub, 'STAFF');
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message.slice(0, 300) : 'Transition refusée';
    redirect(`/admin/devis/${id}?erreur=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/devis/${id}`);
  redirect(`/admin/devis/${id}?ok=propose`);
}

export async function changerStatut(formData: FormData): Promise<void> {
  const staff = await staffAutorise(['admin', 'commercial']);
  const id = texte(formData, 'devis_id');
  const statut = texte(formData, 'statut');
  if (!['EN_ANALYSE', 'EXPIRE'].includes(statut)) redirect(`/admin/devis/${id}?erreur=statut`);

  try {
    await transitionnerDevis(
      id,
      statut as 'EN_ANALYSE' | 'EXPIRE',
      null,
      null,
      staff.sub,
      'STAFF',
    );
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message.slice(0, 300) : 'Transition refusée';
    redirect(`/admin/devis/${id}?erreur=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/devis/${id}`);
  redirect(`/admin/devis/${id}?ok=statut`);
}

export async function deciderPourClient(formData: FormData): Promise<void> {
  const staff = await staffAutorise(['admin', 'commercial']);
  const id = texte(formData, 'devis_id');
  const decision = texte(formData, 'decision');
  if (decision !== 'ACCEPTE' && decision !== 'REFUSE') {
    redirect(`/admin/devis/${id}?erreur=decision`);
  }
  const note = texte(formData, 'note').slice(0, 2000);

  try {
    await transitionnerDevis(id, decision, null, note || null, staff.sub, 'STAFF');
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message.slice(0, 300) : 'Décision refusée';
    redirect(`/admin/devis/${id}?erreur=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/devis/${id}`);
  redirect(`/admin/devis/${id}?ok=decision`);
}

export async function revoquerSessions(formData: FormData): Promise<void> {
  await staffAutorise(['admin']);
  const id = texte(formData, 'devis_id');
  try {
    await revoquerSessionsDevis(id, 'revocation_admin');
  } catch {
    redirect(`/admin/devis/${id}?erreur=revocation`);
  }
  revalidatePath(`/admin/devis/${id}`);
  redirect(`/admin/devis/${id}?ok=sessions`);
}

export async function telechargerFichier(formData: FormData): Promise<void> {
  await staffAutorise(['admin', 'commercial']);
  const devisId = texte(formData, 'devis_id');
  const fichierId = texte(formData, 'fichier_id');
  const fichier = await fichierDuDevis(devisId, fichierId);
  if (!fichier || !fichier.verifie || fichier.statut_analyse !== 'PROPRE') {
    redirect(`/admin/devis/${devisId}?erreur=fichier_indisponible`);
  }
  const url = await creerUrlTelechargement(fichier.chemin, 60);
  redirect(url);
}

export async function creerCommande(formData: FormData): Promise<void> {
  const staff = await staffAutorise(['admin', 'commercial']);
  const id = texte(formData, 'devis_id');
  const mode = texte(formData, 'mode_paiement') as ModePaiement;
  const livraison = Number(texte(formData, 'livraison'));
  const ville = texte(formData, 'ville').slice(0, 120) || null;
  const adresse = texte(formData, 'adresse').slice(0, 300) || null;
  const dateLivraison = texte(formData, 'livraison_prevue');

  if (!id || !MODES_PAIEMENT.some((m) => m.id === mode) || !Number.isSafeInteger(livraison) || livraison < 0) {
    redirect(`/admin/devis/${id}?erreur=commande_invalide`);
  }
  if (dateLivraison && !/^\d{4}-\d{2}-\d{2}$/.test(dateLivraison)) {
    redirect(`/admin/devis/${id}?erreur=date_livraison`);
  }

  try {
    const existante = await commandeDuDevis(id);
    if (existante) redirect(`/admin/commandes/${existante.id}?ok=existante`);

    const commande = await creerCommandeDepuisDevis({
      devisId: id,
      modePaiement: mode,
      livraisonFcfa: livraison,
      ville,
      adresse,
      livraisonPrevueLe: dateLivraison || null,
      idempotencyKey: `devis:${id}:commande`,
      acteur: staff.sub,
    });
    revalidatePath('/admin/commandes');
    revalidatePath(`/admin/devis/${id}`);
    redirect(`/admin/commandes/${commande.id}?ok=creee`);
  } catch (erreur) {
    // redirect() lève une exception spéciale Next : ne pas la transformer en message d'erreur.
    if (typeof erreur === 'object' && erreur !== null && 'digest' in erreur) throw erreur;
    const message = erreur instanceof Error ? erreur.message.slice(0, 300) : 'Création refusée';
    redirect(`/admin/devis/${id}?erreur=${encodeURIComponent(message)}`);
  }
}
