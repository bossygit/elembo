/**
 * Clients du back-office. L'appelant a vérifié la permission.
 */

import { supabaseAdmin } from '@/server/supabase/client';
import type { TypeClient } from '@/lib/admin/statuts';

function admin() {
  return supabaseAdmin();
}

export type ClientListe = {
  id: string;
  type_client: TypeClient;
  nom: string;
  societe: string | null;
  email: string | null;
  telephone: string;
  ville: string | null;
  cree_le: string;
  nb_commandes: number;
  montant_depense_fcfa: number;
  derniere_commande_le: string | null;
};

export async function rechercherClients(filtres: {
  texte?: string | null;
  type?: TypeClient | null;
  limite?: number;
  decalage?: number;
}): Promise<{ clients: ClientListe[]; total: number }> {
  const { data, error } = await admin().rpc('rechercher_clients', {
    p_texte: filtres.texte?.slice(0, 120) || null,
    p_type: filtres.type ?? null,
    p_limite: filtres.limite ?? 50,
    p_decalage: filtres.decalage ?? 0,
  });
  if (error) throw new Error(error.message);
  const lignes = (data ?? []) as (ClientListe & { total_lignes: number })[];
  return {
    clients: lignes.map((l) => ({
      ...l,
      nb_commandes: Number(l.nb_commandes),
      montant_depense_fcfa: Number(l.montant_depense_fcfa),
    })),
    total: Number(lignes[0]?.total_lignes ?? 0),
  };
}

export type Client = {
  id: string;
  type_client: TypeClient;
  nom: string;
  societe: string | null;
  email: string | null;
  telephone: string;
  telephone_normalise: string | null;
  adresse: string | null;
  ville: string | null;
  notes: string | null;
  facturation_raison_sociale: string | null;
  facturation_niu: string | null;
  facturation_rccm: string | null;
  facturation_adresse: string | null;
  facturation_ville: string | null;
  facturation_email: string | null;
  cree_le: string;
  maj_le: string;
};

export type CommandeClient = {
  id: string;
  reference: string;
  statut: string;
  statut_paiement: string;
  total_fcfa: number;
  marge_fcfa: number;
  cree_le: string;
};

export type DevisClient = {
  id: string;
  reference: string;
  statut: string;
  famille: string;
  montant_propose_fcfa: number | null;
  cree_le: string;
};

export async function clientParId(id: string): Promise<Client | null> {
  const { data, error } = await admin().from('clients').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Client | null) ?? null;
}

export async function historiqueClient(id: string): Promise<{ commandes: CommandeClient[]; devis: DevisClient[] }> {
  const [commandes, devis] = await Promise.all([
    admin()
      .from('commandes')
      .select('id, reference, statut, statut_paiement, total_fcfa, marge_fcfa, cree_le')
      .eq('client_id', id)
      .order('cree_le', { ascending: false })
      .limit(200),
    admin()
      .from('devis')
      .select('id, reference, statut, famille, montant_propose_fcfa, cree_le')
      .eq('client_id', id)
      .order('cree_le', { ascending: false })
      .limit(200),
  ]);
  if (commandes.error) throw new Error(commandes.error.message);
  if (devis.error) throw new Error(devis.error.message);
  return {
    commandes: (commandes.data ?? []) as CommandeClient[],
    devis: (devis.data ?? []) as DevisClient[],
  };
}

/** Indicateurs d'un client : seules les commandes PAYÉES comptent dans le montant dépensé. */
export function indicateursClient(commandes: CommandeClient[]) {
  const payees = commandes.filter((c) => c.statut_paiement === 'PAYE');
  const depense = payees.reduce((t, c) => t + Number(c.total_fcfa), 0);
  return {
    nbCommandes: commandes.length,
    nbPayees: payees.length,
    montantDepense: depense,
    panierMoyen: payees.length ? Math.round(depense / payees.length) : null,
    marge: payees.reduce((t, c) => t + Number(c.marge_fcfa), 0),
    premiere: commandes.at(-1)?.cree_le ?? null,
    derniere: commandes[0]?.cree_le ?? null,
  };
}

export async function modifierClient(
  id: string,
  champs: Partial<Omit<Client, 'id' | 'cree_le' | 'maj_le'>>,
): Promise<{ avant: Client; apres: Client }> {
  const avant = await clientParId(id);
  if (!avant) throw new Error('Client introuvable.');
  const { data, error } = await admin().from('clients').update(champs).eq('id', id).select('*').single();
  if (error) {
    if (error.code === '23505') throw new Error('Cet email est déjà utilisé par un autre client.');
    throw new Error(error.message);
  }
  return { avant, apres: data as Client };
}
