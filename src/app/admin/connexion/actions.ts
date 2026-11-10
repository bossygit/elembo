'use server';

import { redirect } from 'next/navigation';

import { creerClientAuthServeur } from '@/server/auth/session';

export async function connexion(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const motDePasse = String(formData.get('mot_de_passe') ?? '');
  if (!email || !motDePasse) redirect('/admin/connexion?erreur=champs');

  const client = await creerClientAuthServeur();
  const { error } = await client.auth.signInWithPassword({ email, password: motDePasse });
  if (error) redirect('/admin/connexion?erreur=identifiants');
  redirect('/admin');
}

export async function deconnexion(): Promise<void> {
  const client = await creerClientAuthServeur();
  await client.auth.signOut();
  redirect('/admin/connexion');
}
