'use server';

import { redirect } from 'next/navigation';

import { creerProduit, mettreAJourProduit, creerVariante } from '@/server/produits/repository';

export async function creerProduitAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim().toLowerCase();
  const nom = String(formData.get('nom') ?? '').trim();
  const famille = String(formData.get('famille') ?? '').trim();
  if (!id || !nom || !famille) redirect('/admin/produits?erreur=champs');

  await creerProduit({
    id,
    nom,
    famille: famille as never,
    description: String(formData.get('description') ?? '').trim() || null,
    disponible: formData.get('disponible') === 'on',
    actif: formData.get('actif') === 'on',
    statut_prix: String(formData.get('statut_prix') ?? 'PROVISOIRE'),
    prix_fcfa: formData.get('prix_fcfa') ? Number(formData.get('prix_fcfa')) : null,
    cout_fcfa: formData.get('cout_fcfa') ? Number(formData.get('cout_fcfa')) : null,
    delai_jours: formData.get('delai_jours') ? Number(formData.get('delai_jours')) : null,
    quantite_min: formData.get('quantite_min') ? Number(formData.get('quantite_min')) : 1,
  });
  redirect('/admin/produits');
}

export async function basculerProduitAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const champ = String(formData.get('champ') ?? '');
  const valeur = formData.get('valeur') === 'true';
  if (!id || (champ !== 'actif' && champ !== 'disponible')) redirect('/admin/produits');
  await mettreAJourProduit(id, { [champ]: valeur } as never);
  redirect('/admin/produits');
}

export async function ajouterVarianteAction(formData: FormData): Promise<void> {
  const produit_id = String(formData.get('produit_id') ?? '');
  if (!produit_id) redirect('/admin/produits');
  await creerVariante({
    produit_id,
    taille: String(formData.get('taille') ?? '').trim() || null,
    couleur: String(formData.get('couleur') ?? '').trim() || null,
    sku: String(formData.get('sku') ?? '').trim() || null,
    stock: formData.get('stock') ? Number(formData.get('stock')) : 0,
    seuil_alerte: formData.get('seuil_alerte') ? Number(formData.get('seuil_alerte')) : 0,
    actif: true,
  });
  redirect(`/admin/produits/${produit_id}`);
}
