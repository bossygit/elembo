import { supabaseAdmin } from '@/server/supabase/client';

function admin() { return supabaseAdmin(); }
function erreur(message: string) { return new Error(message); }

export type ProduitLigne = {
  id: string;
  famille: string;
  nom: string;
  description: string | null;
  technique: string | null;
  disponible: boolean;
  actif: boolean;
  statut_prix: string;
  prix_fcfa: number | null;
  cout_fcfa: number | null;
  delai_jours: number | null;
  quantite_min: number;
  metadata: Record<string, unknown>;
  cree_le: string;
  maj_le: string;
};

export type VarianteLigne = {
  id: string;
  produit_id: string;
  taille: string | null;
  couleur: string | null;
  sku: string | null;
  stock: number;
  seuil_alerte: number;
  actif: boolean;
  cree_le: string;
  maj_le: string;
};

export async function listerProduits(): Promise<ProduitLigne[]> {
  const { data, error } = await admin().from('produits').select('*').order('nom');
  if (error) throw erreur(error.message);
  return (data ?? []) as ProduitLigne[];
}

export async function produitParId(id: string): Promise<ProduitLigne | null> {
  const { data, error } = await admin().from('produits').select('*').eq('id', id).maybeSingle();
  if (error) throw erreur(error.message);
  return (data as ProduitLigne | null) ?? null;
}

export async function variantesDuProduit(produitId: string): Promise<VarianteLigne[]> {
  const { data, error } = await admin().from('variantes_produit').select('*').eq('produit_id', produitId).order('cree_le');
  if (error) throw erreur(error.message);
  return (data ?? []) as VarianteLigne[];
}

export async function creerProduit(input: Partial<ProduitLigne>): Promise<ProduitLigne> {
  const { data, error } = await admin().from('produits').insert(input).select('*').single();
  if (error) throw erreur(error.message);
  return data as ProduitLigne;
}

export async function mettreAJourProduit(id: string, input: Partial<ProduitLigne>): Promise<void> {
  const { error } = await admin().from('produits').update(input).eq('id', id);
  if (error) throw erreur(error.message);
}

export async function creerVariante(input: Partial<VarianteLigne>): Promise<void> {
  const { error } = await admin().from('variantes_produit').insert(input);
  if (error) throw erreur(error.message);
}

export async function mettreAJourVariante(id: string, input: Partial<VarianteLigne>): Promise<void> {
  const { error } = await admin().from('variantes_produit').update(input).eq('id', id);
  if (error) throw erreur(error.message);
}
