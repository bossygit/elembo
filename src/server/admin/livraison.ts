// Frais de livraison — paramètre `livraison` (jsonb) de la table `parametres`.
//
// Le paiement le relit à chaque commande (src/server/tarifs/base.ts) : une valeur enregistrée
// ici est la valeur encaissée. On ne stocke donc qu'une forme contrôlée (lireLivraisonBase).

import { supabaseAdmin } from '@/server/supabase/client';
import { lireLivraisonBase, statutVersBase, type TarifsLivraison } from '@/lib/tarifs/tarifs';

export async function lireLivraison(): Promise<TarifsLivraison> {
  const { data, error } = await supabaseAdmin().from('parametres').select('valeur').eq('cle', 'livraison').maybeSingle();
  if (error) throw new Error(`Frais de livraison illisibles : ${error.message}`);
  if (!data) throw new Error('Paramètre « livraison » absent : appliquez les migrations.');
  return lireLivraisonBase(data.valeur);
}

/** Enregistre les frais après contrôle ; renvoie l'avant et l'après (journal d'audit). */
export async function enregistrerLivraison(
  nouvelle: TarifsLivraison,
): Promise<{ avant: TarifsLivraison; apres: TarifsLivraison }> {
  const avant = await lireLivraison();
  const valeur = {
    villes: nouvelle.villes.map((v) => ({ id: v.id, nom: v.nom, frais_fcfa: v.fraisFcfa })),
    statut_prix: statutVersBase(nouvelle.statutPrix),
    delai_max_jours: nouvelle.delaiMaxJours,
  };
  const apres = lireLivraisonBase(valeur); // même contrôle qu'à la lecture : rien d'invalide n'est écrit
  const { error } = await supabaseAdmin()
    .from('parametres')
    .update({ valeur, maj_le: new Date().toISOString() })
    .eq('cle', 'livraison');
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
  return { avant, apres };
}
