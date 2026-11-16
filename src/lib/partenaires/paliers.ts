/**
 * Paliers de quantité d'un tarif négocié.
 *
 * `verifierPaliers` applique exactement la règle de `public.erreur_paliers_tarif` (migration
 * 0012) : le formulaire affiche l'erreur avant l'envoi, la base refuse de toute façon un tarif
 * incohérent.
 *
 * Règles : un prix de base ou au moins un palier ; paliers contigus (le suivant commence à
 * `max + 1`), sans chevauchement ; un seul palier ouvert (sans maximum), en dernier ; vingt
 * paliers au plus. Un prix de palier vide signifie « sur négociation ».
 */

export type Palier = {
  quantiteMin: number;
  quantiteMax: number | null;
  /** `null` = sur négociation. */
  prixUnitaireFcfa: number | null;
};

export const PALIERS_MAX = 20;

const entierPositif = (n: number) => Number.isInteger(n) && n >= 1;
const montant = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100_000_000;

export function trierPaliers(paliers: readonly Palier[]): Palier[] {
  return [...paliers].sort((a, b) => a.quantiteMin - b.quantiteMin);
}

/** `null` si le tarif est cohérent, sinon le motif à afficher. */
export function verifierPaliers(prixBaseFcfa: number | null, paliers: readonly Palier[]): string | null {
  if (prixBaseFcfa !== null && !montant(prixBaseFcfa)) return 'Prix de base invalide';
  for (const p of paliers) {
    if (!entierPositif(p.quantiteMin)) return 'Quantité minimale invalide';
    if (p.quantiteMax !== null && (!entierPositif(p.quantiteMax) || p.quantiteMax < p.quantiteMin)) {
      return `Quantité maximale invalide (palier à partir de ${p.quantiteMin})`;
    }
    if (p.prixUnitaireFcfa !== null && !montant(p.prixUnitaireFcfa)) {
      return `Prix invalide (palier à partir de ${p.quantiteMin})`;
    }
  }

  const tries = trierPaliers(paliers);
  let precedent: Palier | null = null;
  for (const p of tries) {
    if (precedent) {
      if (precedent.quantiteMax === null) return 'Seul le dernier palier peut être sans quantité maximale';
      if (p.quantiteMin !== precedent.quantiteMax + 1) {
        return `Les paliers doivent se suivre sans trou ni chevauchement (palier à partir de ${p.quantiteMin})`;
      }
    }
    precedent = p;
  }
  if (tries.length > PALIERS_MAX) return 'Vingt paliers au maximum';
  if (prixBaseFcfa === null && tries.length === 0) return 'Indiquez un prix ou au moins un palier';
  return null;
}

export type PrixPourQuantite =
  | { type: 'PRIX'; prixUnitaireFcfa: number; source: 'PALIER' | 'BASE' }
  | { type: 'NEGOCIATION' }
  | { type: 'SOUS_MINIMUM'; quantiteMin: number }
  | { type: 'HORS_GRILLE' };

/**
 * Prix unitaire applicable à une quantité. Le palier qui couvre la quantité l'emporte ; à
 * défaut, le prix de base s'applique (au-delà ou en l'absence de paliers). En dessous du premier
 * palier, sans prix de base, la quantité est sous le minimum de commande.
 */
export function prixPourQuantite(
  prixBaseFcfa: number | null,
  paliers: readonly Palier[],
  quantite: number,
): PrixPourQuantite {
  if (!(quantite > 0)) return { type: 'HORS_GRILLE' };
  const tries = trierPaliers(paliers);
  const palier = tries.find((p) => quantite >= p.quantiteMin && (p.quantiteMax === null || quantite <= p.quantiteMax));
  if (palier) {
    return palier.prixUnitaireFcfa === null
      ? { type: 'NEGOCIATION' }
      : { type: 'PRIX', prixUnitaireFcfa: palier.prixUnitaireFcfa, source: 'PALIER' };
  }
  if (prixBaseFcfa !== null) return { type: 'PRIX', prixUnitaireFcfa: prixBaseFcfa, source: 'BASE' };
  if (tries.length > 0 && quantite < tries[0].quantiteMin) {
    return { type: 'SOUS_MINIMUM', quantiteMin: tries[0].quantiteMin };
  }
  return { type: 'HORS_GRILLE' };
}
