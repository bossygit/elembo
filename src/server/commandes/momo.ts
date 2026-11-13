import { supabaseAdmin } from '@/server/supabase/client';
import { PRODUIT_TABLEAU, STATUT_PRIX_TABLEAUX, produit } from '@/server/momo/catalogue';
import { normaliserMsisdn } from '@/server/momo/msisdn';
import { calculerMontant, normaliserLignes } from '@/server/momo/pricing';
import { referenceValide } from '@/server/momo/reference';
import type { ModePaiement } from '@/server/commandes/repository';
import { commandeParReference } from '@/server/commandes/repository';

/**
 * Raccordement du tunnel MTN direct à Supabase.
 *
 * La commande commerciale est créée avant l'appel à MTN, avec une référence stable fournie
 * par le navigateur. Le journal Redis reste la source de la transaction MTN ; Supabase
 * conserve la commande, ses lignes, son client et ses statuts.
 *
 * Si Supabase n'est pas configuré, le tunnel existant continue sans persistance Supabase.
 * Si Supabase est configuré mais que l'écriture échoue, le paiement est refusé : on ne
 * prend pas un paiement qui ne pourrait pas être retrouvé côté atelier.
 */
export function commandesSupabaseConfigurees(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export class ErreurCommandeDirecte extends Error {
  constructor(
    message: string,
    readonly statutHttp = 422,
  ) {
    super(message);
    this.name = 'ErreurCommandeDirecte';
  }
}

type PayloadDirect = {
  commande?: unknown;
  produitId?: unknown;
  lignes?: unknown;
  tableaux?: unknown;
  villeId?: unknown;
  telephone?: unknown;
  nom?: unknown;
  email?: unknown;
  couleur?: unknown;
  zones?: unknown;
};

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

/** Couleur du support : texte court ou code hexadécimal, sinon ignorée. Informatif. */
export function couleurSure(valeur: unknown): string | null {
  const t = texte(valeur).slice(0, 40);
  return t && /^[\p{L}\p{N} #'’-]+$/u.test(t) ? t : null;
}

/** Zones imprimées annoncées (libellés courts), au plus 10. Informatif. */
export function zonesSures(valeur: unknown): string[] {
  if (!Array.isArray(valeur)) return [];
  return valeur
    .map((z) => texte(z).slice(0, 40))
    .filter((z) => z && /^[\p{L}\p{N} '’-]+$/u.test(z))
    .slice(0, 10);
}

function telephoneNormalise(brut: string): string | null {
  try {
    return normaliserMsisdn(brut, process.env.MOMO_ENV === 'sandbox' ? 'sandbox' : 'mtncongo');
  } catch {
    return brut.replace(/[^\d+]/g, '') || null;
  }
}

type LigneDirecte = {
  produit_id: string | null;
  designation: string;
  quantite: number;
  prix_unitaire_fcfa: number;
  total_ligne_fcfa: number;
  options: Record<string, unknown>;
};

function verifierPrixFacturable(produitId: string): void {
  if (process.env.MOMO_ALLOW_TEST_PRICES === '1' || process.env.MOMO_MOCK === '1') return;
  if (produitId === PRODUIT_TABLEAU) {
    if (STATUT_PRIX_TABLEAUX !== 'valide') {
      throw new ErreurCommandeDirecte(
        'Le barème des tableaux n’est pas validé commercialement : paiement en ligne fermé, demandez un devis.',
      );
    }
    return;
  }
  const fiche = produit(produitId);
  if (fiche && fiche.statutPrix !== 'valide') {
    throw new ErreurCommandeDirecte(
      `Le prix de « ${fiche.nom} » n’est pas validé commercialement : paiement en ligne fermé, demandez un devis.`,
    );
  }
}

/**
 * Crée la commande directe à partir du payload de paiement. Le montant est recalculé ici,
 * exactement comme dans le service MTN : le navigateur ne fixe jamais le prix.
 */
export async function preparerCommandeDirecte(payload: unknown): Promise<void> {
  if (!commandesSupabaseConfigurees()) return;

  const corps = (payload ?? {}) as PayloadDirect;
  const commande = texte(corps.commande);
  const produitId = texte(corps.produitId);
  const villeId = texte(corps.villeId);
  const telephone = texte(corps.telephone);

  if (!commande || !referenceValide(commande)) {
    throw new ErreurCommandeDirecte('Référence de commande invalide.');
  }
  if (!produitId || !villeId || !telephone) {
    throw new ErreurCommandeDirecte('Produit, ville ou téléphone manquant.');
  }
  verifierPrixFacturable(produitId);
  const couleur = couleurSure(corps.couleur);
  const zones = zonesSures(corps.zones);

  let montant;
  try {
    montant = calculerMontant({
      produitId,
      lignes: Array.isArray(corps.lignes) ? corps.lignes as { taille: string; quantite: number }[] : [],
      tableaux: Array.isArray(corps.tableaux) ? corps.tableaux as { formatId: string; support: string; quantite: number }[] : [],
      villeId,
    });
  } catch (erreur) {
    throw new ErreurCommandeDirecte(
      erreur instanceof Error ? erreur.message : 'Commande non chiffrable.',
    );
  }

  let lignes: LigneDirecte[];
  if (produitId === PRODUIT_TABLEAU) {
    lignes = (montant.lignesTableaux ?? []).map((ligne) => ({
      produit_id: PRODUIT_TABLEAU,
      designation: `Tableau canvas — ${ligne.formatLibelle} — ${ligne.support === 'chassis' ? 'monté sur châssis' : 'toile seule'}`,
      quantite: ligne.quantite,
      prix_unitaire_fcfa: ligne.prixUnitaireFcfa,
      total_ligne_fcfa: ligne.sousTotalFcfa,
      options: {
        formatId: ligne.formatId,
        support: ligne.support,
        remisePct: ligne.remisePct,
      },
    }));
  } else {
    const fiche = produit(produitId);
    const prixUnitaire = fiche?.prixFcfa;
    if (prixUnitaire == null) {
      throw new ErreurCommandeDirecte(`Prix unitaire absent pour « ${produitId} ».`);
    }
    const lignesTexte = normaliserLignes(
      Array.isArray(corps.lignes) ? corps.lignes as { taille: string; quantite: number }[] : [],
    );
    lignes = lignesTexte.map((ligne) => ({
      produit_id: produitId,
      designation: `${fiche?.nom ?? produitId} — taille ${ligne.taille}`,
      quantite: ligne.quantite,
      prix_unitaire_fcfa: prixUnitaire,
      total_ligne_fcfa: prixUnitaire * ligne.quantite,
      options: { taille: ligne.taille, produitId, ...(couleur ? { couleur } : {}) },
    }));
  }

  const { data, error } = await supabaseAdmin().rpc('creer_commande_directe', {
    p_reference: commande,
    p_nom: texte(corps.nom) || 'Client web',
    p_email: texte(corps.email) || null,
    p_telephone: telephone,
    p_telephone_normalise: telephoneNormalise(telephone),
    p_ville: montant.villeNom,
    p_adresse: null,
    p_sous_total_fcfa: montant.sousTotalFcfa,
    p_livraison_fcfa: montant.fraisLivraisonFcfa,
    p_total_fcfa: montant.montantFcfa,
    p_lignes: lignes,
    p_design_snapshot: {
      source: 'CONFIGURATEUR',
      produitId,
      produitNom: montant.produitNom,
      villeId,
      villeNom: montant.villeNom,
      lignes: Array.isArray(corps.lignes) ? corps.lignes : [],
      tableaux: Array.isArray(corps.tableaux) ? corps.tableaux : [],
      ...(couleur ? { couleur } : {}),
      ...(zones.length ? { zones } : {}),
    },
    p_mode_paiement: 'MTN_MOMO' satisfies ModePaiement,
  });
  if (error) {
    throw new ErreurCommandeDirecte(
      `La commande n’a pas pu être enregistrée dans Supabase : ${error.message}`,
      503,
    );
  }
  if (!data) throw new ErreurCommandeDirecte('Commande directe sans réponse Supabase.', 503);
}

export type PaiementMomoSupabase = {
  referenceCommande: string;
  referenceId: string;
  statut: 'PENDING' | 'PAYE' | 'ECHEC' | 'ANOMALIE';
  montantFcfa?: number | null;
  financialTransactionId?: string | null;
  raison?: string | null;
  msisdn?: string | null;
};

/** Synchronise un état MTN dans la commande Supabase. Les rejeux sont idempotents. */
export async function synchroniserPaiementMomo(paiement: PaiementMomoSupabase): Promise<void> {
  if (!commandesSupabaseConfigurees()) return;
  if (!paiement.referenceCommande || !paiement.referenceId) return;

  const { error } = await supabaseAdmin().rpc('synchroniser_paiement_momo', {
    p_reference_commande: paiement.referenceCommande,
    p_reference_id: paiement.referenceId,
    p_statut: paiement.statut,
    p_montant_fcfa: paiement.montantFcfa ?? null,
    p_financial_tx_id: paiement.financialTransactionId ?? null,
    p_raison: paiement.raison ?? null,
    p_msisdn: paiement.msisdn ?? null,
  });
  if (error) throw new ErreurCommandeDirecte(`Synchronisation MTN Supabase : ${error.message}`, 503);
}

/** Synchronise à partir du corps JSON renvoyé par le service MTN. */
export async function synchroniserDepuisCorpsMomo(corps: unknown): Promise<void> {
  if (!corps || typeof corps !== 'object') return;
  const b = corps as Record<string, unknown>;
  const referenceCommande = texte(b.commande);
  const referenceId = texte(b.referenceId ?? b.reference_id);
  const statut = texte(b.statut) as PaiementMomoSupabase['statut'];
  if (!referenceCommande || !referenceId || !['PENDING', 'PAYE', 'ECHEC', 'ANOMALIE'].includes(statut)) {
    return;
  }
  await synchroniserPaiementMomo({
    referenceCommande,
    referenceId,
    statut,
    montantFcfa: typeof b.montantFcfa === 'number' ? b.montantFcfa : null,
    financialTransactionId: typeof b.financialTransactionId === 'string' ? b.financialTransactionId : null,
    raison: typeof b.raison === 'string' ? b.raison : null,
    msisdn: typeof b.msisdn === 'string' ? b.msisdn : null,
  });
}

/** Rattache les fichiers réellement déposés à la commande Supabase (après paiement). */
export async function attacherFichiersProduction(
  reference: string,
  fichiers: { nom: string; chemin: string; taille: number; type: string }[],
): Promise<void> {
  if (!commandesSupabaseConfigurees() || !reference || fichiers.length === 0) return;
  const commande = await commandeParReference(reference);
  if (!commande) return;

  const lignes = fichiers.map((f) => ({
    commande_id: commande.id,
    nom: f.nom.slice(0, 255),
    chemin: f.chemin,
    type_mime: f.type.slice(0, 120) || 'application/octet-stream',
    taille_octets: f.taille,
    type_fichier: /fiche-production/i.test(f.nom)
      ? 'FICHE_PRODUCTION'
      : /\.(png|jpe?g|webp|pdf)$/i.test(f.nom)
        ? 'VISUEL_IMPRESSION'
        : 'AUTRE',
    fournisseur: 'VERCEL_BLOB',
  }));

  const { error } = await supabaseAdmin()
    .from('fichiers_commande')
    .upsert(lignes, { onConflict: 'commande_id,nom', ignoreDuplicates: true });
  if (error) throw new ErreurCommandeDirecte(`Fichiers de production non rattachés : ${error.message}`, 503);
}
