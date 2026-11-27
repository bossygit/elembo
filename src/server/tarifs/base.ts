// Lecture des tarifs dans l'admin (Supabase) — SANS cache.
//
// C'est la lecture du PAIEMENT : le montant encaissé doit être le prix courant de l'admin, pas
// une copie mise en cache. Si Supabase n'est pas configuré (développement local, tests), la
// grille du dépôt sert de repli. Si Supabase est configuré mais illisible, on ÉCHOUE : jamais de
// repli silencieux sur une grille qui pourrait ne plus être à jour.

import { supabaseAdmin } from '@/server/supabase/client';
import { tarifsDepuisBase, tarifsDepuisGrille, type LigneProduitBase, type Tarifs } from '@/lib/tarifs/tarifs';

export function tarifsBaseConfigures(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export class ErreurTarifs extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurTarifs';
  }
}

/** Tarifs de l'admin, lus à l'instant. Lève `ErreurTarifs` si la base est illisible. */
export async function lireTarifsBase(): Promise<Tarifs> {
  const client = supabaseAdmin();
  const [produits, livraison] = await Promise.all([
    client.from('produits').select('id, nom, prix_fcfa, statut_prix, actif, disponible'),
    client.from('parametres').select('valeur').eq('cle', 'livraison').maybeSingle(),
  ]);
  if (produits.error) throw new ErreurTarifs(`Prix illisibles : ${produits.error.message}`);
  if (livraison.error) throw new ErreurTarifs(`Frais de livraison illisibles : ${livraison.error.message}`);
  if (!livraison.data) throw new ErreurTarifs('Frais de livraison absents (paramètre « livraison »).');
  try {
    return tarifsDepuisBase((produits.data ?? []) as LigneProduitBase[], livraison.data.valeur);
  } catch (erreur) {
    throw new ErreurTarifs((erreur as Error).message);
  }
}

/** Tarifs appliqués par le paiement : l'admin si Supabase est configuré, sinon la grille. */
export async function tarifsServeur(): Promise<Tarifs> {
  return tarifsBaseConfigures() ? lireTarifsBase() : tarifsDepuisGrille();
}
