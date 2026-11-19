/**
 * Accès aux données de l'offre grand format. Client `service_role` : à n'appeler que depuis une
 * route serveur ou une action serveur qui a DÉJÀ contrôlé l'accès (rôle staff ou route publique
 * limitée à la création et à l'estimation).
 */

import type { DemandeDevis } from '@/lib/devis/types';
import type { StatutCommande, StatutDevis, StatutProduction } from '@/lib/admin/statuts';
import type { Estimation, StatutPrixGrille, TarifGrandFormat } from '@/lib/grand-format/estimation';
import type { ParametresGrandFormat } from '@/lib/grand-format/validation';
import { ETAPES_GRAND_FORMAT, type PosteCout } from '@/lib/grand-format/suivi';
import type { DelaiId, FinitionId, PrestationId, SupportId, UsageId } from '@/lib/grand-format/catalogue';
import type { OptionsCreation, ResultatCreation } from '@/server/devis/creation';
import { supabaseAdmin } from '@/server/supabase/client';

function admin() {
  return supabaseAdmin();
}

function nombreOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ----------------------------------------------------------------- grille ---- */

export type LigneTarif = {
  support: SupportId;
  libelle: string;
  prix_m2_fcfa: number | null;
  minimum_piece_fcfa: number | null;
  supplement_oeillets_ml_fcfa: number | null;
  supplement_ourlets_ml_fcfa: number | null;
  supplement_fourreaux_ml_fcfa: number | null;
  frais_creation_fcfa: number | null;
  laize_max_m: number | null;
  statut_prix: StatutPrixGrille;
  prix_valide_par_email: string | null;
  prix_valide_le: string | null;
  actif: boolean;
  notes: string | null;
  maj_le: string;
};

export function versTarif(l: LigneTarif): TarifGrandFormat {
  return {
    support: l.support,
    libelle: l.libelle,
    prixM2Fcfa: nombreOuNull(l.prix_m2_fcfa),
    minimumPieceFcfa: nombreOuNull(l.minimum_piece_fcfa),
    supplementOeilletsMlFcfa: nombreOuNull(l.supplement_oeillets_ml_fcfa),
    supplementOurletsMlFcfa: nombreOuNull(l.supplement_ourlets_ml_fcfa),
    supplementFourreauxMlFcfa: nombreOuNull(l.supplement_fourreaux_ml_fcfa),
    fraisCreationFcfa: nombreOuNull(l.frais_creation_fcfa),
    laizeMaxM: nombreOuNull(l.laize_max_m),
    statutPrix: l.statut_prix,
    actif: l.actif,
  };
}

/** Tarif utilisable pour une estimation publique : VALIDE et actif, sinon `null`. */
export async function tarifValide(support: SupportId): Promise<TarifGrandFormat | null> {
  const { data, error } = await admin()
    .from('tarifs_grand_format')
    .select('*')
    .eq('support', support)
    .eq('statut_prix', 'VALIDE')
    .eq('actif', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? versTarif(data as LigneTarif) : null;
}

export async function listerTarifs(): Promise<LigneTarif[]> {
  const { data, error } = await admin().from('tarifs_grand_format').select('*').order('support');
  if (error) throw new Error(error.message);
  return (data ?? []) as LigneTarif[];
}

export type ChampsTarif = Pick<
  LigneTarif,
  | 'prix_m2_fcfa'
  | 'minimum_piece_fcfa'
  | 'supplement_oeillets_ml_fcfa'
  | 'supplement_ourlets_ml_fcfa'
  | 'supplement_fourreaux_ml_fcfa'
  | 'frais_creation_fcfa'
  | 'laize_max_m'
  | 'actif'
  | 'notes'
>;

async function tarifBrut(support: string): Promise<LigneTarif> {
  const { data, error } = await admin().from('tarifs_grand_format').select('*').eq('support', support).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Support inconnu.');
  return data as LigneTarif;
}

export async function modifierTarif(support: string, champs: ChampsTarif): Promise<{ avant: LigneTarif; apres: LigneTarif }> {
  const avant = await tarifBrut(support);
  const { data, error } = await admin().from('tarifs_grand_format').update(champs).eq('support', support).select('*').single();
  if (error) throw new Error(error.message);
  return { avant, apres: data as LigneTarif };
}

/** Validation explicite : auteur et date tracés, sans changer aucun montant. */
export async function validerTarif(
  support: string,
  staff: { id: string; email: string | null },
): Promise<LigneTarif> {
  const avant = await tarifBrut(support);
  if (avant.prix_m2_fcfa === null) throw new Error('Saisissez au moins le prix au m² avant de valider.');
  const { data, error } = await admin()
    .from('tarifs_grand_format')
    .update({
      statut_prix: 'VALIDE',
      prix_valide_par: staff.id,
      prix_valide_par_email: staff.email ?? 'staff',
      prix_valide_le: new Date().toISOString(),
    })
    .eq('support', support)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as LigneTarif;
}

/** Retire la validation (le tarif cesse immédiatement d'alimenter l'estimation publique). */
export async function suspendreTarif(support: string): Promise<LigneTarif> {
  const { data, error } = await admin()
    .from('tarifs_grand_format')
    .update({ statut_prix: 'PROVISOIRE', prix_valide_par: null, prix_valide_par_email: null, prix_valide_le: null })
    .eq('support', support)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as LigneTarif;
}

/* --------------------------------------------------------------- création ---- */

export async function creerDemandeGrandFormat(
  demande: DemandeDevis,
  parametres: ParametresGrandFormat,
  estimation: Estimation | null,
  options: OptionsCreation,
): Promise<ResultatCreation> {
  const { data, error } = await admin().rpc('creer_demande_grand_format', {
    p_idempotency_key: options.idempotencyKey,
    p_reference: options.reference,
    p_suivi_token_hash: options.suiviTokenHash,
    p_suivi_token_expire_le: options.suiviTokenExpireLe,
    p_nom: demande.nom,
    p_societe: demande.societe ?? null,
    p_email: demande.email ?? null,
    p_telephone: demande.telephone,
    p_telephone_normalise: demande.telephoneNormalise,
    p_type_client: demande.typeClient,
    p_ville: demande.ville ?? null,
    p_besoin: demande.besoin,
    p_format: demande.format ?? null,
    p_quantite: demande.quantite ?? null,
    p_specifications: demande.specifications,
    p_contact_snapshot: {
      nom: demande.nom,
      societe: demande.societe ?? null,
      email: demande.email ?? null,
      telephone: demande.telephone,
      ville: demande.ville ?? null,
    },
    p_staff_email: process.env.DEVIS_NOTIFY_EMAIL?.trim() || null,
    p_staff_telegram: process.env.TELEGRAM_CHAT_ID?.trim() || null,
    p_grand_format: {
      usage: parametres.usage,
      support: parametres.support,
      support_precision: parametres.supportPrecision,
      largeur_m: parametres.largeurM,
      hauteur_m: parametres.hauteurM,
      quantite: parametres.quantite,
      finition: parametres.finition,
      finition_precision: parametres.finitionPrecision,
      delai: parametres.delai,
      date_souhaitee: parametres.dateSouhaitee,
      prestation: parametres.prestation,
      commentaire: parametres.commentaire,
      estimation_fcfa: estimation?.disponible ? estimation.montantFcfa : null,
      estimation_detail: estimation ?? {},
    },
  });
  if (error) throw new Error(error.message);
  const ligne = (Array.isArray(data) ? data[0] : data) as
    | { devis_id: string; client_id: string; reference: string; deja_existant: boolean }
    | null;
  if (!ligne) throw new Error('Création de la demande sans réponse.');
  return { devisId: ligne.devis_id, clientId: ligne.client_id, reference: ligne.reference, dejaExistant: ligne.deja_existant };
}

/* ---------------------------------------------------------------- lecture ---- */

export type CommandeLiee = {
  id: string;
  reference: string;
  statut: StatutCommande;
  statut_paiement: string;
  total_fcfa: number;
  sous_total_fcfa: number;
  livraison_fcfa: number;
  cout_fcfa: number;
  marge_fcfa: number;
  livraison_prevue_le: string | null;
};

export type DemandeGrandFormat = {
  devis_id: string;
  usage: UsageId;
  support: SupportId;
  support_precision: string | null;
  largeur_m: number;
  hauteur_m: number;
  quantite: number;
  surface_totale_m2: number;
  finition: FinitionId;
  finition_precision: string | null;
  delai: DelaiId;
  date_souhaitee: string | null;
  prestation: PrestationId;
  commentaire: string | null;
  estimation_fcfa: number | null;
  estimation_detail: Record<string, unknown>;
  partenaire_id: string | null;
  prix_impression_fcfa: number | null;
  frais_creation_fcfa: number | null;
  prix_vente_fcfa: number | null;
  cout_impression_estime_fcfa: number | null;
  cout_creation_estime_fcfa: number | null;
  cout_livraison_estime_fcfa: number | null;
  autres_couts_estimes_fcfa: number | null;
  cout_estime_total_fcfa: number | null;
  production_prevue_le: string | null;
  livraison_prevue_le: string | null;
  cree_le: string;
  maj_le: string;
  devis: {
    id: string;
    reference: string;
    statut: StatutDevis;
    montant_propose_fcfa: number | null;
    contact_snapshot: Record<string, unknown>;
    client_id: string;
    cree_le: string;
  };
  commande: CommandeLiee | null;
  partenaire: { id: string; nom: string } | null;
};

const SELECTION = `
  *,
  partenaire:partenaires(id, nom),
  devis:devis!inner(
    id, reference, statut, montant_propose_fcfa, contact_snapshot, client_id, cree_le,
    commandes(id, reference, statut, statut_paiement, total_fcfa, sous_total_fcfa, livraison_fcfa, cout_fcfa, marge_fcfa, livraison_prevue_le)
  )
`;

type LigneBrute = Omit<DemandeGrandFormat, 'commande'> & {
  devis: DemandeGrandFormat['devis'] & { commandes?: CommandeLiee[] | CommandeLiee | null };
};

function normaliser(l: LigneBrute): DemandeGrandFormat {
  const commandes = l.devis.commandes;
  const commande = Array.isArray(commandes) ? commandes[0] ?? null : commandes ?? null;
  const { commandes: _ignore, ...devis } = l.devis;
  void _ignore;
  return {
    ...l,
    largeur_m: Number(l.largeur_m),
    hauteur_m: Number(l.hauteur_m),
    surface_totale_m2: Number(l.surface_totale_m2),
    devis,
    commande,
  };
}

export async function listerDemandes(options: { limite?: number } = {}): Promise<DemandeGrandFormat[]> {
  const { data, error } = await admin()
    .from('demandes_grand_format')
    .select(SELECTION)
    .order('cree_le', { ascending: false })
    .limit(Math.min(Math.max(options.limite ?? 200, 1), 500));
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as LigneBrute[]).map(normaliser);
}

export async function demandeParDevis(devisId: string): Promise<DemandeGrandFormat | null> {
  const { data, error } = await admin()
    .from('demandes_grand_format')
    .select(SELECTION)
    .eq('devis_id', devisId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normaliser(data as unknown as LigneBrute) : null;
}

export async function estDemandeGrandFormat(devisId: string): Promise<boolean> {
  const { count, error } = await admin()
    .from('demandes_grand_format')
    .select('devis_id', { count: 'exact', head: true })
    .eq('devis_id', devisId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/* --------------------------------------------------------------- chiffrage ---- */

export type ChampsChiffrage = {
  partenaire_id?: string | null;
  prix_impression_fcfa?: number | null;
  frais_creation_fcfa?: number | null;
  cout_impression_estime_fcfa?: number | null;
  cout_creation_estime_fcfa?: number | null;
  cout_livraison_estime_fcfa?: number | null;
  autres_couts_estimes_fcfa?: number | null;
  production_prevue_le?: string | null;
  livraison_prevue_le?: string | null;
};

export async function enregistrerChiffrage(
  devisId: string,
  champs: ChampsChiffrage,
): Promise<{ avant: ChampsChiffrage; apres: ChampsChiffrage }> {
  const colonnes = Object.keys(champs).join(', ');
  const { data: avant, error: e1 } = await admin()
    .from('demandes_grand_format')
    .select(colonnes)
    .eq('devis_id', devisId)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!avant) throw new Error('Demande grand format introuvable.');
  const { data: apres, error } = await admin()
    .from('demandes_grand_format')
    .update(champs)
    .eq('devis_id', devisId)
    .select(colonnes)
    .single();
  if (error) {
    if (error.message.includes('planning_check')) throw new Error('La livraison ne peut pas précéder la production.');
    throw new Error(error.message);
  }
  return { avant: avant as ChampsChiffrage, apres: apres as ChampsChiffrage };
}

/* ------------------------------------------------- production et coûts réels ---- */

export type TacheGrandFormat = {
  id: string;
  etape: string;
  statut: StatutProduction;
  partenaire_id: string | null;
  interne: boolean;
  date_prevue: string | null;
  cout_fcfa: number | null;
  instructions: string | null;
};

export async function tachesDeCommande(commandeId: string): Promise<TacheGrandFormat[]> {
  const { data, error } = await admin()
    .from('travaux_production')
    .select('id, etape, statut, partenaire_id, interne, date_prevue, cout_fcfa, instructions')
    .eq('commande_id', commandeId)
    .order('cree_le');
  if (error) throw new Error(error.message);
  return (data ?? []) as TacheGrandFormat[];
}

/**
 * À la transformation du devis en commande : le chiffrage devient des tâches d'atelier
 * (imprimeur affecté, dates, coûts estimés comme première valeur). La base recalcule alors le
 * coût et la marge de la commande ; l'équipe remplace ensuite les estimations par les coûts
 * réels. Idempotent : une étape déjà présente n'est jamais écrasée.
 */
export async function initialiserTravaux(demande: DemandeGrandFormat, commandeId: string): Promise<number> {
  const taches: Record<string, unknown>[] = [
    {
      etape: ETAPES_GRAND_FORMAT.impression,
      partenaire_id: demande.partenaire_id,
      interne: !demande.partenaire_id,
      date_prevue: demande.production_prevue_le,
      cout_fcfa: demande.cout_impression_estime_fcfa,
      instructions: `${demande.quantite} × ${demande.largeur_m} × ${demande.hauteur_m} m — finition ${demande.finition}`,
    },
  ];
  if (demande.prestation === 'CREATION' || demande.cout_creation_estime_fcfa !== null) {
    taches.push({ etape: ETAPES_GRAND_FORMAT.creation, interne: true, cout_fcfa: demande.cout_creation_estime_fcfa });
  }
  if (demande.cout_livraison_estime_fcfa !== null || demande.livraison_prevue_le) {
    taches.push({
      etape: ETAPES_GRAND_FORMAT.livraison,
      interne: true,
      date_prevue: demande.livraison_prevue_le,
      cout_fcfa: demande.cout_livraison_estime_fcfa,
    });
  }
  if (demande.autres_couts_estimes_fcfa !== null) {
    taches.push({ etape: ETAPES_GRAND_FORMAT.autres, interne: true, cout_fcfa: demande.autres_couts_estimes_fcfa });
  }
  const { data, error } = await admin()
    .from('travaux_production')
    .upsert(
      taches.map((t) => ({ commande_id: commandeId, statut: 'A_FAIRE', ...t })),
      { onConflict: 'commande_id,etape', ignoreDuplicates: true },
    )
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

/**
 * Coût réel d'un poste : met à jour la tâche correspondante (ou la crée). Le trigger de la
 * migration 0010 recalcule aussitôt le coût et la marge de la commande.
 */
export async function enregistrerCoutReel(
  commandeId: string,
  poste: PosteCout,
  champs: { cout_fcfa: number | null; partenaire_id?: string | null; date_prevue?: string | null },
): Promise<{ avant: TacheGrandFormat | null; apres: TacheGrandFormat }> {
  const etape = ETAPES_GRAND_FORMAT[poste];
  const { data: avant, error: e1 } = await admin()
    .from('travaux_production')
    .select('id, etape, statut, partenaire_id, interne, date_prevue, cout_fcfa, instructions')
    .eq('commande_id', commandeId)
    .eq('etape', etape)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  const maj: Record<string, unknown> = { cout_fcfa: champs.cout_fcfa };
  if (champs.partenaire_id !== undefined) {
    maj.partenaire_id = champs.partenaire_id;
    maj.interne = !champs.partenaire_id;
  }
  if (champs.date_prevue !== undefined) maj.date_prevue = champs.date_prevue;

  const requete = avant
    ? admin().from('travaux_production').update(maj).eq('id', (avant as TacheGrandFormat).id)
    : admin().from('travaux_production').insert({ commande_id: commandeId, etape, statut: 'A_FAIRE', interne: true, ...maj });
  const { data, error } = await requete
    .select('id, etape, statut, partenaire_id, interne, date_prevue, cout_fcfa, instructions')
    .single();
  if (error) throw new Error(error.message);
  return { avant: (avant as TacheGrandFormat | null) ?? null, apres: data as TacheGrandFormat };
}

/** Date de livraison prévue de la commande (affichée au client dans son suivi). */
export async function modifierLivraisonPrevue(commandeId: string, jour: string | null): Promise<void> {
  const { error } = await admin().from('commandes').update({ livraison_prevue_le: jour }).eq('id', commandeId);
  if (error) throw new Error(error.message);
}
