'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { utilisateurStaff } from '@/server/auth/session';
import {
  STATUTS_COMMANDE,
  confirmerPaiementManuel,
  transitionnerCommande,
  type ModePaiement,
  type StatutCommande,
} from '@/server/commandes/repository';

async function staffAutorise(): Promise<{ sub: string | null }> {
  const staff = await utilisateurStaff();
  if (!staff || !['admin', 'commercial', 'atelier', 'finance'].includes(staff.role)) {
    redirect('/admin/connexion');
  }
  return { sub: staff.claims.sub ?? null };
}

function texte(formData: FormData, nom: string): string {
  return String(formData.get(nom) ?? '').trim();
}

export async function changerStatutCommande(formData: FormData): Promise<void> {
  const staff = await staffAutorise();
  const id = texte(formData, 'commande_id');
  const statut = texte(formData, 'statut') as StatutCommande;
  const note = texte(formData, 'note').slice(0, 2000);

  if (!id || !STATUTS_COMMANDE.some((s) => s.id === statut)) {
    redirect(`/admin/commandes/${id}?erreur=statut`);
  }

  try {
    await transitionnerCommande(id, statut, note || null, staff.sub);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message.slice(0, 300) : 'Transition refusée';
    redirect(`/admin/commandes/${id}?erreur=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/commandes/${id}`);
  revalidatePath('/admin/commandes');
  redirect(`/admin/commandes/${id}?ok=statut`);
}

export async function confirmerPaiement(formData: FormData): Promise<void> {
  const staff = await staffAutorise();
  const id = texte(formData, 'commande_id');
  const mode = texte(formData, 'mode_paiement') as ModePaiement;
  const reference = texte(formData, 'reference_paiement').slice(0, 120);
  if (!id || !reference) redirect(`/admin/commandes/${id}?erreur=paiement_invalide`);

  try {
    await confirmerPaiementManuel(id, mode, reference, staff.sub);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message.slice(0, 300) : 'Paiement refusé';
    redirect(`/admin/commandes/${id}?erreur=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/commandes/${id}`);
  revalidatePath('/admin/commandes');
  redirect(`/admin/commandes/${id}?ok=paiement`);
}
