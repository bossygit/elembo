/**
 * Validation d'une demande grand format — fonctions pures, exécutées côté serveur.
 *
 * Une demande de banderole EST une demande de devis Elembo (famille IMPRESSION) enrichie de
 * paramètres structurés. On réutilise donc `validerDemandeDevis` pour tout ce qui est commun
 * (coordonnées, téléphone congolais, fichiers, consentement) : mêmes règles, mêmes limites,
 * mêmes messages que le formulaire de devis général.
 */

import { validerDemandeDevis } from '@/lib/devis/validation';
import type { DemandeDevis } from '@/lib/devis/types';
import {
  DELAIS,
  FINITIONS,
  LIMITES,
  PRESTATIONS,
  SUPPORTS,
  USAGES,
  formatDimensions,
  formatSurface,
  libelleDelai,
  libelleFinition,
  libellePrestation,
  libelleSupport,
  libelleUsage,
  supportParId,
  surfaceM2,
  type DelaiId,
  type FinitionId,
  type PrestationId,
  type SupportId,
  type UsageId,
} from './catalogue';
import type { Estimation, ParametresEstimation } from './estimation';

export type ParametresGrandFormat = ParametresEstimation & {
  usage: UsageId;
  supportPrecision: string | null;
  finitionPrecision: string | null;
  dateSouhaitee: string | null;
  commentaire: string | null;
};

type Resultat<T> = { ok: true; valeur: T } | { ok: false; erreurs: Record<string, string> };

function texte(valeur: unknown, max: number): string {
  return typeof valeur === 'string' ? valeur.trim().slice(0, max) : '';
}

function parmi<T extends string>(valeur: unknown, ids: readonly T[]): T | null {
  const t = typeof valeur === 'string' ? valeur.trim().toUpperCase() : '';
  return (ids as readonly string[]).includes(t) ? (t as T) : null;
}

/** Mètres saisis « 3 », « 1,5 » ou 1.5 → nombre arrondi au centimètre, ou NaN. */
export function lireMetres(valeur: unknown): number {
  const brut = typeof valeur === 'number' ? String(valeur) : typeof valeur === 'string' ? valeur.trim() : '';
  if (!/^\d{1,3}([.,]\d{1,3})?$/.test(brut)) return Number.NaN;
  return Math.round(Number(brut.replace(',', '.')) * 100) / 100;
}

function dateIso(valeur: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
  const d = new Date(`${valeur}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valeur;
}

function decalerJours(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Date du jour à Brazzaville (UTC+1, sans heure d'été). */
export function jourBrazzaville(maintenant = new Date()): string {
  return new Date(maintenant.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * `mode: 'estimation'` : seuls les paramètres qui changent le prix sont exigés (les précisions
 * et le commentaire ne bloquent pas l'aperçu du prix).
 */
export function validerParametres(
  brut: unknown,
  aujourdhui = jourBrazzaville(),
  mode: 'demande' | 'estimation' = 'demande',
): Resultat<ParametresGrandFormat> {
  const demande = mode === 'demande';
  const erreurs: Record<string, string> = {};
  const corps = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;

  const usage = parmi(corps.usage, USAGES.map((u) => u.id));
  if (!usage) erreurs.usage = 'Choisissez une utilisation.';

  const support = parmi<SupportId>(corps.support, SUPPORTS.map((s) => s.id));
  if (!support) erreurs.support = 'Choisissez un support.';
  const supportPrecision = texte(corps.supportPrecision, LIMITES.precisionMax) || null;
  if (demande && support === 'AUTRE' && !supportPrecision) erreurs.supportPrecision = 'Précisez le support souhaité.';

  const largeurM = lireMetres(corps.largeurM);
  const hauteurM = lireMetres(corps.hauteurM);
  const borne = (v: number) => Number.isFinite(v) && v >= LIMITES.dimensionMinM && v <= LIMITES.dimensionMaxM;
  const messageDimension = `Entre ${String(LIMITES.dimensionMinM).replace('.', ',')} et ${LIMITES.dimensionMaxM} mètres.`;
  if (!borne(largeurM)) erreurs.largeurM = messageDimension;
  if (!borne(hauteurM)) erreurs.hauteurM = messageDimension;

  const quantite = Number(corps.quantite);
  if (!Number.isSafeInteger(quantite) || quantite < 1 || quantite > LIMITES.quantiteMax) {
    erreurs.quantite = `La quantité doit être un nombre entier entre 1 et ${LIMITES.quantiteMax}.`;
  }

  const applicable = support ? supportParId(support)?.finitionsApplicables ?? false : false;
  let finition = parmi<FinitionId>(corps.finition, FINITIONS.map((f) => f.id));
  if (!applicable) finition = 'SANS';
  if (!finition) erreurs.finition = 'Choisissez une finition.';
  const finitionPrecision = texte(corps.finitionPrecision, LIMITES.precisionMax) || null;
  if (demande && finition === 'AUTRE' && !finitionPrecision) erreurs.finitionPrecision = 'Précisez la finition souhaitée.';

  const delai = parmi<DelaiId>(corps.delai, DELAIS.map((d) => d.id));
  if (!delai) erreurs.delai = 'Choisissez un délai.';
  let dateSouhaitee: string | null = texte(corps.dateSouhaitee, 10) || null;
  if (delai === 'DATE') {
    if (!dateSouhaitee || !dateIso(dateSouhaitee)) {
      erreurs.dateSouhaitee = 'Indiquez une date valide.';
    } else if (dateSouhaitee < aujourdhui) {
      erreurs.dateSouhaitee = 'La date est déjà passée.';
    } else if (dateSouhaitee > decalerJours(aujourdhui, 365)) {
      erreurs.dateSouhaitee = 'La date doit être dans les douze prochains mois.';
    }
  } else {
    dateSouhaitee = null;
  }

  const prestation = parmi<PrestationId>(corps.prestation, PRESTATIONS.map((p) => p.id));
  if (!prestation) erreurs.prestation = 'Choisissez un type de prestation.';

  const commentaire = texte(corps.commentaire, LIMITES.commentaireMax + 1) || null;
  if (commentaire && commentaire.length > LIMITES.commentaireMax) {
    erreurs.commentaire = `${LIMITES.commentaireMax} caractères au maximum.`;
  }
  if (demande && prestation === 'ACCOMPAGNEMENT' && (!commentaire || commentaire.length < 10)) {
    erreurs.commentaire = 'Décrivez votre besoin en quelques mots (10 caractères au moins).';
  }

  if (Object.keys(erreurs).length > 0) return { ok: false, erreurs };
  return {
    ok: true,
    valeur: {
      usage: usage!,
      support: support!,
      supportPrecision: support === 'AUTRE' ? supportPrecision : null,
      largeurM,
      hauteurM,
      quantite,
      finition: finition!,
      finitionPrecision: finition === 'AUTRE' ? finitionPrecision : null,
      delai: delai!,
      dateSouhaitee,
      prestation: prestation!,
      commentaire,
    },
  };
}

/** Paramètres d'estimation seuls (route d'estimation : aucune coordonnée requise). */
export function validerParametresEstimation(brut: unknown, aujourdhui = jourBrazzaville()): Resultat<ParametresGrandFormat> {
  return validerParametres(brut, aujourdhui, 'estimation');
}

export function libelleEstimation(estimation: Estimation | null): string {
  if (!estimation || !estimation.disponible) return 'Sur devis';
  return `${estimation.montantFcfa.toLocaleString('fr-FR').replace(/ | /g, ' ')} FCFA (indicatif, hors livraison)`;
}

/**
 * Spécifications lisibles enregistrées sur le devis. Elles sont montrées telles quelles au
 * client (suivi) et à l'équipe : clés en français, valeurs simples, aucune donnée interne.
 */
export function specificationsLisibles(p: ParametresGrandFormat, estimation: Estimation | null): Record<string, string> {
  const support = p.support === 'AUTRE' && p.supportPrecision ? `Autre : ${p.supportPrecision}` : libelleSupport(p.support);
  const finition = p.finition === 'AUTRE' && p.finitionPrecision ? `Autre : ${p.finitionPrecision}` : libelleFinition(p.finition);
  const delai = p.delai === 'DATE' && p.dateSouhaitee
    ? `Pour le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${p.dateSouhaitee}T12:00:00Z`))}`
    : libelleDelai(p.delai);
  return {
    Offre: 'Banderoles & supports grand format',
    Utilisation: libelleUsage(p.usage),
    Support: support,
    Dimensions: formatDimensions(p.largeurM, p.hauteurM),
    'Surface par pièce': formatSurface(surfaceM2(p.largeurM, p.hauteurM)),
    Finition: finition,
    Délai: delai,
    Prestation: libellePrestation(p.prestation),
    'Estimation en ligne': libelleEstimation(estimation),
  };
}

/** Texte « besoin » du devis : un résumé exploitable même sans ouvrir le détail. */
export function besoinDepuisParametres(p: ParametresGrandFormat): string {
  const resume = `${libelleSupport(p.support)} ${formatDimensions(p.largeurM, p.hauteurM)} × ${p.quantite} — ${libelleUsage(p.usage)} — ${libellePrestation(p.prestation)}.`;
  return p.commentaire ? `${resume}\n\n${p.commentaire}` : resume;
}

export type DemandeGrandFormat = { devis: DemandeDevis; parametres: ParametresGrandFormat };

/**
 * Valide le corps complet (paramètres + coordonnées + fichiers annoncés) et construit la
 * demande de devis standard. L'estimation, qui exige la grille en base, est ajoutée ensuite
 * par la route : `specifications` est recalculé à ce moment-là.
 */
export function validerDemandeGrandFormat(brut: unknown, aujourdhui = jourBrazzaville()): Resultat<DemandeGrandFormat> {
  const corps = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const parametres = validerParametres(corps, aujourdhui);

  const contact = (corps.contact && typeof corps.contact === 'object' ? corps.contact : {}) as Record<string, unknown>;
  const devis = validerDemandeDevis({
    famille: 'IMPRESSION',
    nom: contact.nom,
    societe: contact.societe,
    email: contact.email,
    telephone: contact.telephone,
    ville: contact.ville,
    besoin: parametres.ok ? besoinDepuisParametres(parametres.valeur) : 'demande grand format',
    format: parametres.ok ? formatDimensions(parametres.valeur.largeurM, parametres.valeur.hauteurM) : undefined,
    quantite: parametres.ok ? parametres.valeur.quantite : undefined,
    specifications: parametres.ok ? specificationsLisibles(parametres.valeur, null) : {},
    fichiers: corps.fichiers,
    consentement: corps.consentement,
  });

  const erreurs = { ...(parametres.ok ? {} : parametres.erreurs), ...(devis.ok ? {} : devis.erreurs) };
  // Les champs dérivés (besoin, format, quantité) n'existent pas dans le formulaire banderole :
  // leurs erreurs sont déjà portées par les paramètres.
  delete erreurs.besoin;
  delete erreurs.format;
  delete erreurs.famille;
  if (!parametres.ok || !devis.ok || Object.keys(erreurs).length > 0) {
    return { ok: false, erreurs: Object.keys(erreurs).length ? erreurs : { formulaire: 'Demande invalide.' } };
  }
  return { ok: true, valeur: { devis: devis.valeur, parametres: parametres.valeur } };
}
