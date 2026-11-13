/**
 * Catalogue du back-office : produits, catégories, variantes, images, stock.
 * L'appelant a vérifié la permission ; ces fonctions utilisent le client service_role.
 */

import { randomUUID } from 'node:crypto';

import { supabaseAdmin } from '@/server/supabase/client';
import { mimeAttendu, typeDepuisSignature, type TypeFichierVerifie } from '@/server/storage/verification';

function admin() {
  return supabaseAdmin();
}

export const BUCKET_CATALOGUE = 'catalogue';
export const TAILLE_MAX_IMAGE = 4 * 1024 * 1024;
export const ID_PRODUIT = /^[a-z0-9][a-z0-9_-]{2,63}$/;
export const ID_CATEGORIE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export type Produit = {
  id: string;
  famille: string;
  categorie_id: string | null;
  nom: string;
  description: string | null;
  technique: string | null;
  disponible: boolean;
  actif: boolean;
  statut_prix: 'TEST' | 'PROVISOIRE' | 'VALIDE';
  prix_fcfa: number | null;
  cout_fcfa: number | null;
  delai_jours: number | null;
  quantite_min: number;
  prix_valide_par_email: string | null;
  prix_valide_le: string | null;
  cree_le: string;
  maj_le: string;
};

export type Variante = {
  id: string;
  produit_id: string;
  taille: string | null;
  couleur: string | null;
  sku: string | null;
  stock: number;
  seuil_alerte: number;
  prix_fcfa: number | null;
  cout_fcfa: number | null;
  actif: boolean;
};

export type Categorie = {
  id: string;
  nom: string;
  famille: string;
  description: string | null;
  ordre: number;
  actif: boolean;
};

export type ImageProduit = {
  id: string;
  produit_id: string;
  chemin: string;
  type_mime: string;
  taille_octets: number;
  texte_alternatif: string | null;
  ordre: number;
  principale: boolean;
  url: string;
};

export type ProduitListe = Produit & {
  nb_variantes: number;
  stock_total: number;
  alertes: number;
  image: string | null;
};

function urlPublique(chemin: string): string {
  return admin().storage.from(BUCKET_CATALOGUE).getPublicUrl(chemin).data.publicUrl;
}

export async function listerProduits(filtres: {
  texte?: string | null;
  categorie?: string | null;
  etat?: 'actifs' | 'inactifs' | 'indisponibles' | null;
} = {}): Promise<ProduitListe[]> {
  let requete = admin()
    .from('produits')
    .select('*, variantes:variantes_produit(stock, seuil_alerte, actif), images:images_produit(chemin, principale, ordre)')
    .order('nom');
  if (filtres.categorie) requete = requete.eq('categorie_id', filtres.categorie);
  if (filtres.etat === 'actifs') requete = requete.eq('actif', true);
  if (filtres.etat === 'inactifs') requete = requete.eq('actif', false);
  if (filtres.etat === 'indisponibles') requete = requete.eq('disponible', false);
  const { data, error } = await requete;
  if (error) throw new Error(error.message);

  const texte = filtres.texte?.trim().toLowerCase();
  return ((data ?? []) as (Produit & {
    variantes: { stock: number; seuil_alerte: number; actif: boolean }[];
    images: { chemin: string; principale: boolean; ordre: number }[];
  })[])
    .filter((p) => !texte || p.nom.toLowerCase().includes(texte) || p.id.includes(texte))
    .map(({ variantes, images, ...p }) => {
      const principale = [...images].sort((a, b) => Number(b.principale) - Number(a.principale) || a.ordre - b.ordre)[0];
      return {
        ...p,
        nb_variantes: variantes.length,
        stock_total: variantes.filter((v) => v.actif).reduce((t, v) => t + v.stock, 0),
        alertes: variantes.filter((v) => v.actif && v.seuil_alerte > 0 && v.stock <= v.seuil_alerte).length,
        image: principale ? urlPublique(principale.chemin) : null,
      };
    });
}

export async function produitParId(id: string): Promise<Produit | null> {
  const { data, error } = await admin().from('produits').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Produit | null) ?? null;
}

export async function creerProduit(champs: Partial<Produit> & { id: string; nom: string; famille: string }): Promise<Produit> {
  const { data, error } = await admin().from('produits').insert(champs).select('*').single();
  if (error) {
    if (error.code === '23505') throw new Error('Cet identifiant de produit existe déjà.');
    throw new Error(error.message);
  }
  return data as Produit;
}

export async function modifierProduit(
  id: string,
  champs: Partial<Produit>,
): Promise<{ avant: Produit; apres: Produit }> {
  const avant = await produitParId(id);
  if (!avant) throw new Error('Produit introuvable.');
  const { data, error } = await admin().from('produits').update(champs).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return { avant, apres: data as Produit };
}

/* -------------------------------------------------------------- catégories -- */

export async function listerCategories(): Promise<(Categorie & { nb_produits: number })[]> {
  const { data, error } = await admin()
    .from('categories_produit')
    .select('*, produits(count)')
    .order('ordre')
    .order('nom');
  if (error) throw new Error(error.message);
  return ((data ?? []) as (Categorie & { produits: { count: number }[] })[]).map(({ produits, ...c }) => ({
    ...c,
    nb_produits: produits?.[0]?.count ?? 0,
  }));
}

export async function creerCategorie(champs: Omit<Categorie, 'actif'>): Promise<Categorie> {
  const { data, error } = await admin().from('categories_produit').insert({ ...champs, actif: true }).select('*').single();
  if (error) {
    if (error.code === '23505') throw new Error('Cet identifiant de catégorie existe déjà.');
    throw new Error(error.message);
  }
  return data as Categorie;
}

export async function modifierCategorie(
  id: string,
  champs: Partial<Omit<Categorie, 'id'>>,
): Promise<{ avant: Categorie; apres: Categorie }> {
  const { data: avant, error: e1 } = await admin().from('categories_produit').select('*').eq('id', id).maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!avant) throw new Error('Catégorie introuvable.');
  const { data, error } = await admin().from('categories_produit').update(champs).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return { avant: avant as Categorie, apres: data as Categorie };
}

/* --------------------------------------------------------------- variantes -- */

export async function variantesDuProduit(produitId: string): Promise<Variante[]> {
  const { data, error } = await admin()
    .from('variantes_produit')
    .select('id, produit_id, taille, couleur, sku, stock, seuil_alerte, prix_fcfa, cout_fcfa, actif')
    .eq('produit_id', produitId)
    .order('couleur', { nullsFirst: true })
    .order('taille', { nullsFirst: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Variante[];
}

function messageVariante(code: string | undefined, message: string): string {
  if (code === '23505') return 'Cette combinaison taille / couleur ou ce SKU existe déjà.';
  return message;
}

export async function creerVariante(champs: Omit<Variante, 'id' | 'actif'>): Promise<Variante> {
  const { data, error } = await admin().from('variantes_produit').insert({ ...champs, actif: true }).select('*').single();
  if (error) throw new Error(messageVariante(error.code, error.message));
  return data as Variante;
}

export async function modifierVariante(
  produitId: string,
  varianteId: string,
  champs: Partial<Omit<Variante, 'id' | 'produit_id' | 'stock'>>,
): Promise<{ avant: Variante; apres: Variante }> {
  const { data: avant, error: e1 } = await admin()
    .from('variantes_produit')
    .select('*')
    .eq('id', varianteId)
    .eq('produit_id', produitId)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!avant) throw new Error('Variante introuvable pour ce produit.');
  const { data, error } = await admin()
    .from('variantes_produit')
    .update(champs)
    .eq('id', varianteId)
    .eq('produit_id', produitId)
    .select('*')
    .single();
  if (error) throw new Error(messageVariante(error.code, error.message));
  return { avant: avant as Variante, apres: data as Variante };
}

export type TypeMouvement = 'ENTREE' | 'SORTIE' | 'AJUSTEMENT' | 'PERTE';

export async function mouvementerStock(options: {
  produitId: string;
  varianteId: string;
  type: TypeMouvement;
  quantite: number;
  motif: string | null;
}): Promise<{ avant: number; apres: number }> {
  const { data: avant, error: e1 } = await admin()
    .from('variantes_produit')
    .select('stock')
    .eq('id', options.varianteId)
    .eq('produit_id', options.produitId)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!avant) throw new Error('Variante introuvable pour ce produit.');
  const { data, error } = await admin().rpc('mouvementer_stock', {
    p_variante_id: options.varianteId,
    p_type: options.type,
    p_quantite: options.quantite,
    p_motif: options.motif,
    p_commande_id: null,
  });
  if (error) throw new Error(error.message);
  const ligne = (Array.isArray(data) ? data[0] : data) as Variante;
  return { avant: Number(avant.stock), apres: Number(ligne.stock) };
}

export type MouvementStock = {
  id: string;
  variante_id: string | null;
  type: TypeMouvement;
  quantite: number;
  motif: string | null;
  cree_le: string;
};

export async function mouvementsDuProduit(produitId: string, limite = 30): Promise<MouvementStock[]> {
  const { data, error } = await admin()
    .from('mouvements_stock')
    .select('id, variante_id, type, quantite, motif, cree_le')
    .eq('produit_id', produitId)
    .order('cree_le', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []) as MouvementStock[];
}

/* ------------------------------------------------------------------ images -- */

export async function imagesDuProduit(produitId: string): Promise<ImageProduit[]> {
  const { data, error } = await admin()
    .from('images_produit')
    .select('*')
    .eq('produit_id', produitId)
    .order('principale', { ascending: false })
    .order('ordre');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Omit<ImageProduit, 'url'>[]).map((i) => ({ ...i, url: urlPublique(i.chemin) }));
}

const TYPES_IMAGE: readonly TypeFichierVerifie[] = ['PNG', 'JPEG', 'WEBP'];
const EXTENSION: Record<string, string> = { PNG: 'png', JPEG: 'jpg', WEBP: 'webp' };

/**
 * Vérifie une image envoyée par formulaire : taille, puis type réel lu dans les premiers
 * octets (le type annoncé par le navigateur n'est pas une preuve). SVG refusé (script).
 */
export function verifierImage(octets: Uint8Array): { ok: true; type: TypeFichierVerifie; mime: string } | { ok: false; raison: string } {
  if (octets.byteLength === 0) return { ok: false, raison: 'Fichier vide.' };
  if (octets.byteLength > TAILLE_MAX_IMAGE) return { ok: false, raison: 'Image trop lourde (4 Mo maximum).' };
  const type = typeDepuisSignature(octets);
  if (!type || !TYPES_IMAGE.includes(type)) return { ok: false, raison: 'Format refusé : PNG, JPEG ou WebP uniquement.' };
  return { ok: true, type, mime: mimeAttendu(type) };
}

export async function ajouterImage(options: {
  produitId: string;
  octets: Uint8Array;
  texteAlternatif: string | null;
}): Promise<ImageProduit> {
  const verdict = verifierImage(options.octets);
  if (!verdict.ok) throw new Error(verdict.raison);
  const chemin = `produits/${options.produitId}/${randomUUID()}.${EXTENSION[verdict.type]}`;
  const stockage = admin().storage.from(BUCKET_CATALOGUE);
  const { error: e1 } = await stockage.upload(chemin, options.octets, {
    contentType: verdict.mime,
    upsert: false,
    cacheControl: '31536000',
  });
  if (e1) throw new Error(`Envoi de l’image impossible : ${e1.message}`);

  const { count } = await admin()
    .from('images_produit')
    .select('id', { count: 'exact', head: true })
    .eq('produit_id', options.produitId);
  const { data, error } = await admin()
    .from('images_produit')
    .insert({
      produit_id: options.produitId,
      chemin,
      type_mime: verdict.mime,
      taille_octets: options.octets.byteLength,
      texte_alternatif: options.texteAlternatif,
      ordre: count ?? 0,
      principale: (count ?? 0) === 0,
    })
    .select('*')
    .single();
  if (error) {
    // Pas d'objet orphelin si la ligne n'a pas pu être créée.
    await stockage.remove([chemin]);
    throw new Error(error.message);
  }
  return { ...(data as Omit<ImageProduit, 'url'>), url: urlPublique(chemin) };
}

export async function definirImagePrincipale(produitId: string, imageId: string): Promise<void> {
  const { error: e1 } = await admin().from('images_produit').update({ principale: false }).eq('produit_id', produitId);
  if (e1) throw new Error(e1.message);
  const { error } = await admin()
    .from('images_produit')
    .update({ principale: true })
    .eq('produit_id', produitId)
    .eq('id', imageId);
  if (error) throw new Error(error.message);
}

export async function supprimerImage(produitId: string, imageId: string): Promise<ImageProduit> {
  const { data, error: e1 } = await admin()
    .from('images_produit')
    .select('*')
    .eq('produit_id', produitId)
    .eq('id', imageId)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!data) throw new Error('Image introuvable pour ce produit.');
  const image = data as Omit<ImageProduit, 'url'>;
  const { error } = await admin().from('images_produit').delete().eq('id', imageId);
  if (error) throw new Error(error.message);
  await admin().storage.from(BUCKET_CATALOGUE).remove([image.chemin]);
  if (image.principale) {
    const { data: suivante } = await admin()
      .from('images_produit')
      .select('id')
      .eq('produit_id', produitId)
      .order('ordre')
      .limit(1)
      .maybeSingle();
    if (suivante) await definirImagePrincipale(produitId, String(suivante.id));
  }
  return { ...image, url: urlPublique(image.chemin) };
}
