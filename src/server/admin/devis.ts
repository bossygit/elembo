/**
 * Pipeline commercial des devis : réception → analyse → proposition → prix validé →
 * acceptation → commande → paiement. Les transitions de statut restent portées par la RPC
 * `transitionner_devis` (repository existant) ; ce module ajoute l'analyse, la proposition
 * détaillée, la validation interne du prix et les vues de suivi.
 */

import { supabaseAdmin } from '@/server/supabase/client';
import type { StatutDevis } from '@/lib/admin/statuts';

function admin() {
  return supabaseAdmin();
}

export type DevisListe = {
  id: string;
  reference: string;
  famille: string;
  statut: StatutDevis;
  montant_propose_fcfa: number | null;
  prix_valide: boolean;
  quantite: number | null;
  contact_snapshot: Record<string, unknown>;
  cree_le: string;
  maj_le: string;
  commande: { id: string; reference: string; statut: string; statut_paiement: string } | null;
};

export async function rechercherDevis(filtres: {
  statut?: StatutDevis | null;
  texte?: string | null;
  limite?: number;
}): Promise<DevisListe[]> {
  let requete = admin()
    .from('devis')
    .select('id, reference, famille, statut, montant_propose_fcfa, prix_valide, quantite, contact_snapshot, cree_le, maj_le, commandes(id, reference, statut, statut_paiement)')
    .order('cree_le', { ascending: false })
    .limit(Math.min(Math.max(filtres.limite ?? 200, 1), 500));
  if (filtres.statut) requete = requete.eq('statut', filtres.statut);
  const { data, error } = await requete;
  if (error) throw new Error(error.message);

  const texte = filtres.texte?.trim().toLowerCase();
  return ((data ?? []) as (Omit<DevisListe, 'commande'> & { commandes: DevisListe['commande'][] | DevisListe['commande'] })[])
    .map(({ commandes, ...d }) => ({
      ...d,
      commande: Array.isArray(commandes) ? commandes[0] ?? null : commandes ?? null,
    }))
    .filter((d) => {
      if (!texte) return true;
      const contact = d.contact_snapshot as Record<string, unknown>;
      return [d.reference, contact.nom, contact.societe, contact.telephone, contact.email]
        .some((v) => typeof v === 'string' && v.toLowerCase().includes(texte));
    });
}

export async function compterDevisParStatut(): Promise<Record<string, number>> {
  const { data, error } = await admin().from('devis').select('statut');
  if (error) throw new Error(error.message);
  const comptes: Record<string, number> = {};
  for (const l of (data ?? []) as { statut: string }[]) comptes[l.statut] = (comptes[l.statut] ?? 0) + 1;
  return comptes;
}

export type DevisCommercial = {
  analyse_besoins: string | null;
  cout_estime_fcfa: number | null;
  delai_propose_jours: number | null;
  proposition_commerciale: string | null;
  prix_valide: boolean;
  prix_valide_par_email: string | null;
  prix_valide_le: string | null;
  montant_propose_fcfa: number | null;
  statut: StatutDevis;
};

export async function voletCommercial(devisId: string): Promise<DevisCommercial | null> {
  const { data, error } = await admin()
    .from('devis')
    .select('analyse_besoins, cout_estime_fcfa, delai_propose_jours, proposition_commerciale, prix_valide, prix_valide_par_email, prix_valide_le, montant_propose_fcfa, statut')
    .eq('id', devisId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DevisCommercial | null) ?? null;
}

export async function enregistrerAnalyse(
  devisId: string,
  champs: { analyse_besoins: string | null; cout_estime_fcfa: number | null; delai_propose_jours: number | null },
): Promise<{ avant: DevisCommercial; apres: DevisCommercial }> {
  const avant = await voletCommercial(devisId);
  if (!avant) throw new Error('Devis introuvable.');
  if (avant.statut === 'ACCEPTE' || avant.statut === 'REFUSE' || avant.statut === 'EXPIRE') {
    throw new Error('Devis clos : l’analyse n’est plus modifiable.');
  }
  const { data, error } = await admin().from('devis').update(champs).eq('id', devisId).select('*').single();
  if (error) throw new Error(error.message);
  return { avant, apres: data as DevisCommercial };
}

export async function enregistrerProposition(devisId: string, texte: string | null): Promise<void> {
  const { error } = await admin().from('devis').update({ proposition_commerciale: texte }).eq('id', devisId);
  if (error) throw new Error(error.message);
}

/**
 * Validation interne du prix proposé. Refusée sans montant ou sur un devis clos.
 * Si le montant change ensuite, la base remet `prix_valide` à faux (migration 0010).
 */
export async function validerPrix(
  devisId: string,
  staff: { id: string; email: string | null },
): Promise<DevisCommercial> {
  const avant = await voletCommercial(devisId);
  if (!avant) throw new Error('Devis introuvable.');
  if (avant.montant_propose_fcfa === null) throw new Error('Aucun montant à valider.');
  if (avant.statut === 'REFUSE' || avant.statut === 'EXPIRE') throw new Error('Devis clos.');
  if (avant.prix_valide) return avant;
  const { data, error } = await admin()
    .from('devis')
    .update({
      prix_valide: true,
      prix_valide_par: staff.id,
      prix_valide_par_email: staff.email,
      prix_valide_le: new Date().toISOString(),
    })
    .eq('id', devisId)
    .eq('montant_propose_fcfa', avant.montant_propose_fcfa)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Le montant a changé entre-temps : rechargez le devis.');
  return data as DevisCommercial;
}

/**
 * À la transformation en commande, le coût de revient estimé pendant l'analyse devient le coût
 * de la ligne (réparti par unité) : la marge de la commande est juste dès sa création.
 * Sans estimation, la ligne reste à coût nul et la commande est signalée « coût à renseigner ».
 */
export async function reporterCoutEstime(devisId: string, commandeId: string): Promise<number | null> {
  const volet = await voletCommercial(devisId);
  if (!volet?.cout_estime_fcfa) return null;
  const { data: lignes, error } = await admin()
    .from('lignes_commande')
    .select('id, quantite, cout_unitaire_fcfa')
    .eq('commande_id', commandeId);
  if (error) throw new Error(error.message);
  if (!lignes || lignes.length !== 1 || Number(lignes[0].cout_unitaire_fcfa) > 0) return null;
  const cout = Math.round(volet.cout_estime_fcfa / Math.max(1, Number(lignes[0].quantite)));
  const { error: e2 } = await admin().from('lignes_commande').update({ cout_unitaire_fcfa: cout }).eq('id', lignes[0].id);
  if (e2) throw new Error(e2.message);
  return cout;
}

export type EtapePipeline = { cle: string; label: string; faite: boolean; le: string | null; detail?: string };

/** Les sept étapes commerciales d'un devis, calculées depuis son état. */
export function etapesPipeline(options: {
  statut: StatutDevis;
  cree_le: string;
  analyse_besoins: string | null;
  montant_propose_fcfa: number | null;
  proposition_commerciale: string | null;
  prix_valide: boolean;
  prix_valide_le: string | null;
  commande: { reference: string; statut_paiement: string; paye_le?: string | null; cree_le?: string } | null;
  historique: { nouveau_statut: string; cree_le: string }[];
}): EtapePipeline[] {
  const date = (statut: string) => options.historique.find((h) => h.nouveau_statut === statut)?.cree_le ?? null;
  const rang: Record<StatutDevis, number> = { NOUVEAU: 0, EN_ANALYSE: 1, PROPOSE: 2, ACCEPTE: 3, REFUSE: -1, EXPIRE: -1 };
  const r = rang[options.statut];
  return [
    { cle: 'reception', label: 'Demande reçue', faite: true, le: options.cree_le },
    {
      cle: 'analyse',
      label: 'Analyse des besoins',
      faite: r >= 1 || Boolean(options.analyse_besoins),
      le: date('EN_ANALYSE'),
    },
    {
      cle: 'proposition',
      label: 'Proposition commerciale',
      faite: r >= 2,
      le: date('PROPOSE'),
      detail: options.montant_propose_fcfa !== null ? `${options.montant_propose_fcfa.toLocaleString('fr-FR')} FCFA` : undefined,
    },
    { cle: 'prix', label: 'Prix validé', faite: options.prix_valide, le: options.prix_valide_le },
    { cle: 'acceptation', label: 'Acceptation du client', faite: options.statut === 'ACCEPTE', le: date('ACCEPTE') },
    {
      cle: 'commande',
      label: 'Transformée en commande',
      faite: Boolean(options.commande),
      le: options.commande?.cree_le ?? null,
      detail: options.commande?.reference,
    },
    {
      cle: 'paiement',
      label: 'Paiement reçu',
      faite: options.commande?.statut_paiement === 'PAYE',
      le: options.commande?.paye_le ?? null,
    },
  ];
}

export async function historiqueDevis(devisId: string) {
  const { data, error } = await admin()
    .from('historique_statuts_devis')
    .select('ancien_statut, nouveau_statut, type_evenement, ancien_montant_fcfa, nouveau_montant_fcfa, source, cree_le')
    .eq('devis_id', devisId)
    .order('cree_le', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as {
    ancien_statut: string;
    nouveau_statut: string;
    type_evenement: string;
    ancien_montant_fcfa: number | null;
    nouveau_montant_fcfa: number | null;
    source: string;
    cree_le: string;
  }[];
}
