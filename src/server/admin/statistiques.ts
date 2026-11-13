/**
 * Indicateurs du tableau de bord, calculés en une requête par `statistiques_back_office`
 * (migration 0010). Les définitions (CA = commandes payées, marge = ventes − coût…) sont
 * documentées dans la fonction SQL.
 */

import { supabaseAdmin } from '@/server/supabase/client';

export type Statistiques = {
  periode: { debut: string; fin: string; unite: 'day' | 'week' };
  chiffre_affaires_fcfa: number;
  ventes_fcfa: number;
  commandes_recues: number;
  commandes_payees: number;
  commandes_livrees: number;
  commandes_en_production: number;
  commandes_a_lancer: number;
  commandes_pretes: number;
  paiements_anomalie: number;
  devis_recus: number;
  devis_par_statut: Record<string, number>;
  travaux_en_retard: number;
  marge: { ventes_fcfa: number; cout_fcfa: number; marge_fcfa: number; sans_cout: number };
  ventes_par_categorie: { categorie: string; montant_fcfa: number; quantite: number }[];
  produits_plus_vendus: { produit_id: string; nom: string; quantite: number; montant_fcfa: number; marge_fcfa: number }[];
  serie: { debut: string; ca_fcfa: number; commandes: number }[];
  alertes_stock: {
    id: string;
    produit_id: string;
    produit_nom: string;
    taille: string | null;
    couleur: string | null;
    sku: string | null;
    stock: number;
    seuil_alerte: number;
  }[];
};

export async function statistiques(debut: string, fin: string): Promise<Statistiques> {
  const { data, error } = await supabaseAdmin().rpc('statistiques_back_office', { p_debut: debut, p_fin: fin });
  if (error) throw new Error(error.message);
  const s = data as Statistiques;
  // `sum()` PostgreSQL renvoie un bigint sérialisé en nombre ; on normalise par sécurité.
  return {
    ...s,
    chiffre_affaires_fcfa: Number(s.chiffre_affaires_fcfa),
    ventes_fcfa: Number(s.ventes_fcfa),
    marge: {
      ventes_fcfa: Number(s.marge.ventes_fcfa),
      cout_fcfa: Number(s.marge.cout_fcfa),
      marge_fcfa: Number(s.marge.marge_fcfa),
      sans_cout: Number(s.marge.sans_cout),
    },
  };
}
