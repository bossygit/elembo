/**
 * Estimation automatique d'une commande grand format — fonction pure.
 *
 * Règle commerciale : on n'affiche JAMAIS un prix qui n'a pas été validé par Smart Vision.
 * Sans tarif `VALIDE` et actif pour le support, sans montant pour la finition ou la création
 * demandée, hors gabarit ou en urgence, l'estimation est refusée avec une raison lisible et le
 * client est orienté vers le devis.
 *
 * Elle est exécutée côté serveur (`/api/banderoles/estimation` et à la création de la demande).
 * Le navigateur ne fait qu'afficher le résultat ; il ne calcule ni ne transmet de montant.
 *
 * Calcul (montants entiers en FCFA, dimensions converties en centimètres entiers pour éviter
 * les erreurs d'arrondi binaire) :
 *   prix pièce = max(minimum, ⌈ surface × prix/m² + périmètre × supplément finition/ml ⌉₁₀₀)
 *   impression = prix pièce × quantité
 *   création   = frais de création (une fois par demande), si la prestation est « création »
 *   total      = impression + création            (hors livraison)
 */

import type { DelaiId, FinitionId, PrestationId, SupportId } from './catalogue';

export type StatutPrixGrille = 'TEST' | 'PROVISOIRE' | 'VALIDE';

export type TarifGrandFormat = {
  support: SupportId;
  libelle: string;
  prixM2Fcfa: number | null;
  minimumPieceFcfa: number | null;
  supplementOeilletsMlFcfa: number | null;
  supplementOurletsMlFcfa: number | null;
  supplementFourreauxMlFcfa: number | null;
  fraisCreationFcfa: number | null;
  /** Largeur utile maximale du rouleau (m) : la plus petite dimension doit y tenir. */
  laizeMaxM: number | null;
  statutPrix: StatutPrixGrille;
  actif: boolean;
};

export type ParametresEstimation = {
  support: SupportId;
  largeurM: number;
  hauteurM: number;
  quantite: number;
  finition: FinitionId;
  delai: DelaiId;
  prestation: PrestationId;
};

export type RaisonSansEstimation =
  | 'TARIF_NON_VALIDE'
  | 'SUPPORT_SUR_DEVIS'
  | 'ACCOMPAGNEMENT'
  | 'EXPRESS'
  | 'FINITION_SUR_DEVIS'
  | 'HORS_GABARIT'
  | 'CREATION_SUR_DEVIS';

export type Estimation =
  | {
      disponible: true;
      montantFcfa: number;
      impressionFcfa: number;
      creationFcfa: number;
      prixPieceFcfa: number;
      quantite: number;
      surfacePieceM2: number;
      surfaceTotaleM2: number;
      minimumApplique: boolean;
    }
  | { disponible: false; raison: RaisonSansEstimation; message: string };

export const MESSAGES_SANS_ESTIMATION: Record<RaisonSansEstimation, string> = {
  TARIF_NON_VALIDE:
    'Les tarifs de ce support sont en cours de validation : Smart Vision vous adresse un devis personnalisé.',
  SUPPORT_SUR_DEVIS: 'Ce support est chiffré au cas par cas : Smart Vision vous adresse un devis.',
  ACCOMPAGNEMENT: 'Vous avez demandé un accompagnement : le prix sera établi avec vous, dans le devis.',
  EXPRESS: 'Une demande urgente dépend des disponibilités de production : le prix est confirmé dans le devis.',
  FINITION_SUR_DEVIS: 'Cette finition est chiffrée au cas par cas : le prix est confirmé dans le devis.',
  HORS_GABARIT:
    'Ce format dépasse la largeur d’impression standard : il sera assemblé ou adapté, et chiffré dans le devis.',
  CREATION_SUR_DEVIS: 'La création graphique est chiffrée selon votre projet : le prix est confirmé dans le devis.',
};

function sans(raison: RaisonSansEstimation): Estimation {
  return { disponible: false, raison, message: MESSAGES_SANS_ESTIMATION[raison] };
}

function entierPositif(valeur: number | null | undefined): valeur is number {
  return typeof valeur === 'number' && Number.isSafeInteger(valeur) && valeur >= 0;
}

/** Supplément au mètre linéaire de la finition ; `undefined` = finition non chiffrable. */
function supplementFinition(tarif: TarifGrandFormat, finition: FinitionId, applicable: boolean): number | undefined {
  if (!applicable || finition === 'SANS') return 0;
  const o = tarif.supplementOeilletsMlFcfa;
  const u = tarif.supplementOurletsMlFcfa;
  switch (finition) {
    case 'OEILLETS':
      return entierPositif(o) ? o : undefined;
    case 'OURLETS':
      return entierPositif(u) ? u : undefined;
    case 'OURLETS_OEILLETS':
      return entierPositif(o) && entierPositif(u) ? o + u : undefined;
    case 'FOURREAUX':
      return entierPositif(tarif.supplementFourreauxMlFcfa) ? tarif.supplementFourreauxMlFcfa : undefined;
    default:
      return undefined;
  }
}

/** Arrondi à la centaine supérieure d'un montant exprimé en dix-millièmes de FCFA. */
function centaineSuperieure(numerateur: number, denominateur: number): number {
  return Math.ceil(numerateur / (denominateur * 100)) * 100;
}

export function estimer(
  tarif: TarifGrandFormat | null | undefined,
  p: ParametresEstimation,
  options: { finitionsApplicables: boolean },
): Estimation {
  if (p.prestation === 'ACCOMPAGNEMENT') return sans('ACCOMPAGNEMENT');
  if (p.support === 'AUTRE') return sans('SUPPORT_SUR_DEVIS');
  if (p.delai === 'EXPRESS') return sans('EXPRESS');
  if (!tarif || !tarif.actif || tarif.statutPrix !== 'VALIDE' || tarif.support !== p.support) {
    return sans('TARIF_NON_VALIDE');
  }
  if (!entierPositif(tarif.prixM2Fcfa) || tarif.prixM2Fcfa === 0) return sans('TARIF_NON_VALIDE');

  const largeurCm = Math.round(p.largeurM * 100);
  const hauteurCm = Math.round(p.hauteurM * 100);
  if (tarif.laizeMaxM !== null && tarif.laizeMaxM > 0) {
    if (Math.min(largeurCm, hauteurCm) > Math.round(tarif.laizeMaxM * 100)) return sans('HORS_GABARIT');
  }

  const supplement = supplementFinition(tarif, p.finition, options.finitionsApplicables);
  if (supplement === undefined) return sans('FINITION_SUR_DEVIS');

  let creationFcfa = 0;
  if (p.prestation === 'CREATION') {
    if (!entierPositif(tarif.fraisCreationFcfa)) return sans('CREATION_SUR_DEVIS');
    creationFcfa = tarif.fraisCreationFcfa;
  }

  // Tout en entiers : cm² × FCFA/m² et cm × FCFA/ml × 100 partagent le dénominateur 10 000.
  const surfaceCm2 = largeurCm * hauteurCm;
  const perimetreCm = 2 * (largeurCm + hauteurCm);
  const numerateur = surfaceCm2 * tarif.prixM2Fcfa + perimetreCm * supplement * 100;
  const calcule = centaineSuperieure(numerateur, 10000);
  const minimum = entierPositif(tarif.minimumPieceFcfa) ? tarif.minimumPieceFcfa : 0;
  const prixPieceFcfa = Math.max(calcule, minimum);
  const impressionFcfa = prixPieceFcfa * p.quantite;

  return {
    disponible: true,
    montantFcfa: impressionFcfa + creationFcfa,
    impressionFcfa,
    creationFcfa,
    prixPieceFcfa,
    quantite: p.quantite,
    surfacePieceM2: surfaceCm2 / 10000,
    surfaceTotaleM2: (surfaceCm2 * p.quantite) / 10000,
    minimumApplique: minimum > calcule,
  };
}
