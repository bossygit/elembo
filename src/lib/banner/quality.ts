/**
 * Banner Studio — définition des images (audit §7.5).
 *
 * DPI effectif = pixels de la zone **recadrée** / taille imprimée en pouces, sur chaque axe ; on
 * retient le plus faible. En `cover`, la zone visible est plus petite que le recadrage : on en
 * tient compte. Les seuils dépendent de la distance de lecture, combinés à ceux du profil.
 */

import type { Asset, DistanceLecture, DocumentBanner, ElementImage } from './model';

export const MM_PAR_POUCE = 25.4;

/** Seuils par distance de lecture : minimum acceptable et recommandé (dpi). */
export const SEUILS_DISTANCE: Record<DistanceLecture, { min: number; recommande: number }> = {
  1: { min: 150, recommande: 300 },
  3: { min: 72, recommande: 150 },
  10: { min: 30, recommande: 72 },
};

/** Seuils retenus : le plus exigeant de la distance et du profil, pour chaque niveau. */
export function seuils(distance: DistanceLecture, profil: { dpiMin: number; dpiRecommande: number }) {
  const d = SEUILS_DISTANCE[distance];
  return { min: Math.max(d.min, profil.dpiMin), recommande: Math.max(d.recommande, profil.dpiRecommande) };
}

/**
 * Pixels sources réellement visibles dans le cadre. En `contain`, toute la zone recadrée est
 * visible ; en `cover`, elle est rognée pour remplir le cadre.
 */
export function pixelsVisibles(e: ElementImage, asset: Asset): { largeurPx: number; hauteurPx: number } {
  const r = e.image.recadrage;
  const cw = r.l * asset.largeurPx;
  const ch = r.h * asset.hauteurPx;
  if (e.image.ajustement === 'contain') return { largeurPx: cw, hauteurPx: ch };
  const echelle = Math.max(e.largeurMm / cw, e.hauteurMm / ch);
  return { largeurPx: e.largeurMm / echelle, hauteurPx: e.hauteurMm / echelle };
}

/** Taille imprimée de l'image, en mm (en `contain`, l'image ne remplit pas tout le cadre). */
export function tailleImprimeeMm(e: ElementImage, asset: Asset): { largeurMm: number; hauteurMm: number } {
  if (e.image.ajustement === 'cover') return { largeurMm: e.largeurMm, hauteurMm: e.hauteurMm };
  const r = e.image.recadrage;
  const cw = r.l * asset.largeurPx;
  const ch = r.h * asset.hauteurPx;
  const echelle = Math.min(e.largeurMm / cw, e.hauteurMm / ch);
  return { largeurMm: cw * echelle, hauteurMm: ch * echelle };
}

/** DPI effectif (le plus faible des deux axes), arrondi à l'unité. */
export function dpiEffectif(e: ElementImage, asset: Asset): number {
  const px = pixelsVisibles(e, asset);
  const mm = tailleImprimeeMm(e, asset);
  const dx = px.largeurPx / (mm.largeurMm / MM_PAR_POUCE);
  const dy = px.hauteurPx / (mm.hauteurMm / MM_PAR_POUCE);
  return Math.round(Math.min(dx, dy));
}

/** DPI de l'image de fond, sur la surface finie et son fond perdu. */
export function dpiFond(doc: DocumentBanner, asset: Asset): number {
  const b = 2 * doc.contraintes.fondPerduMm;
  const kx = (doc.dimensions.largeurMm + b) / asset.largeurPx;
  const ky = (doc.dimensions.hauteurMm + b) / asset.hauteurPx;
  const mmParPx = doc.fond.type === 'image' && doc.fond.ajustement === 'contain' ? Math.min(kx, ky) : Math.max(kx, ky);
  return Math.round(MM_PAR_POUCE / mmParPx);
}

/** Plus grande largeur imprimée (mm) à laquelle l'image reste au-dessus d'un seuil. */
export function largeurNetteMm(e: ElementImage, asset: Asset, dpi: number): number {
  return (pixelsVisibles(e, asset).largeurPx / dpi) * MM_PAR_POUCE;
}

export type NiveauQualite = 'BONNE' | 'FAIBLE' | 'INSUFFISANTE';

export function niveauQualite(dpi: number, s: { min: number; recommande: number }): NiveauQualite {
  if (dpi < s.min) return 'INSUFFISANTE';
  if (dpi < s.recommande) return 'FAIBLE';
  return 'BONNE';
}
