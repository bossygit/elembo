/**
 * Banner Studio — formats prédéfinis par support, en millimètres.
 *
 * Proposés, jamais imposés : le client peut saisir un format libre dans les bornes commerciales
 * (`LIMITES` du catalogue grand format : 0,2 à 50 m). Les formats standards des supports rigides
 * (roll-up, kakémono, X-banner) reprennent ceux du catalogue pour ne pas créer deux vérités.
 */

import { LIMITES, SUPPORTS } from '@/lib/grand-format/catalogue';

import type { FinitionStudio, SupportStudio } from './model';

export type Format = { id: string; nom: string; largeurMm: number; hauteurMm: number };

const m = (l: number, h: number): Format => ({
  id: `${Math.round(l * 1000)}x${Math.round(h * 1000)}`,
  nom: `${String(l).replace('.', ',')} × ${String(h).replace('.', ',')} m`,
  largeurMm: Math.round(l * 1000),
  hauteurMm: Math.round(h * 1000),
});

const standard = (support: SupportStudio): Format[] => {
  const f = SUPPORTS.find((s) => s.id === support)?.formatStandard;
  return f ? [m(f.largeurM, f.hauteurM)] : [];
};

export const FORMATS: Record<SupportStudio, Format[]> = {
  BANDEROLE: [m(2, 1), m(3, 1), m(4, 1), m(5, 1), m(6, 1), m(3, 0.8)],
  BACHE: [m(3, 2), m(4, 3), m(6, 3)],
  ROLL_UP: standard('ROLL_UP'),
  KAKEMONO: standard('KAKEMONO'),
  X_BANNER: standard('X_BANNER'),
  PANNEAU: [m(1.2, 0.8), m(2, 1), m(0.6, 0.4)],
};

/** Finitions qui ont un sens pour le support (les supports rigides n'en ont pas). */
export function finitionsApplicables(support: SupportStudio): FinitionStudio[] {
  const applicable = SUPPORTS.find((s) => s.id === support)?.finitionsApplicables ?? false;
  return applicable ? ['SANS', 'OEILLETS', 'OURLETS', 'OURLETS_OEILLETS', 'FOURREAUX'] : ['SANS'];
}

/** Bornes commerciales du catalogue, en mm. */
export const DIMENSION_MIN_MM = Math.round(LIMITES.dimensionMinM * 1000);
export const DIMENSION_MAX_MM = Math.round(LIMITES.dimensionMaxM * 1000);

/** Orientation et sens de lecture : le grand côté est le sens du déroulé du rouleau. */
export function orientation(largeurMm: number, hauteurMm: number): 'PAYSAGE' | 'PORTRAIT' | 'CARRE' {
  if (largeurMm === hauteurMm) return 'CARRE';
  return largeurMm > hauteurMm ? 'PAYSAGE' : 'PORTRAIT';
}
