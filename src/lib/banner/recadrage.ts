/**
 * Banner Studio — recadrage d'une image, en fractions de l'image source. Pur : la fenêtre de
 * recadrage n'a qu'à transmettre les déplacements du pointeur.
 */

import type { Asset, ElementImage, Recadrage } from './model';
import { pixelsVisibles } from './quality';

export type Poignee = 'n' | 's' | 'e' | 'o' | 'ne' | 'no' | 'se' | 'so';
export const POIGNEES: Poignee[] = ['no', 'n', 'ne', 'e', 'se', 's', 'so', 'o'];
export const RECADRAGE_PLEIN: Recadrage = { x: 0, y: 0, l: 1, h: 1 };

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const arrondir = (v: number) => Math.round(v * 1e6) / 1e6;

/** Millionième près, et jamais hors de l'image : c'est ce que le schéma vérifie. */
export function normaliser(r: Recadrage): Recadrage {
  const l = borner(arrondir(r.l), 0.001, 1);
  const h = borner(arrondir(r.h), 0.001, 1);
  return { x: borner(arrondir(r.x), 0, arrondir(1 - l)), y: borner(arrondir(r.y), 0, arrondir(1 - h)), l, h };
}

/** Plus petit recadrage proposé : 20 px de la source, et au moins 2 %. */
export const tailleMin = (asset: Pick<Asset, 'largeurPx' | 'hauteurPx'>) => ({ l: Math.min(1, Math.max(0.02, 20 / asset.largeurPx)), h: Math.min(1, Math.max(0.02, 20 / asset.hauteurPx)) });

/** Rapport largeur/hauteur à l'écran → rapport en fractions de cette image. */
export const enFractions = (rapport: number, asset: Pick<Asset, 'largeurPx' | 'hauteurPx'>) => (rapport * asset.hauteurPx) / asset.largeurPx;

/** Partie de l'image réellement montrée : en `cover`, plus petite que le recadrage enregistré. */
export function recadrageVisible(e: ElementImage, asset: Asset): Recadrage {
  const px = pixelsVisibles(e, asset);
  const r = e.image.recadrage;
  const l = px.largeurPx / asset.largeurPx;
  const h = px.hauteurPx / asset.hauteurPx;
  return normaliser({ x: r.x + (r.l - l) / 2, y: r.y + (r.h - h) / 2, l, h });
}

export const deplacerRecadrage = (r: Recadrage, dx: number, dy: number): Recadrage => normaliser({ ...r, x: r.x + dx, y: r.y + dy });

/** Plus grand cadre de ce rapport (en fractions) dans l'image, au plus près du centre actuel. */
export function auRapport(r: Recadrage, rapport: number): Recadrage {
  const l = Math.min(1, rapport);
  const h = Math.min(1, 1 / rapport);
  return normaliser({ l, h, x: r.x + r.l / 2 - l / 2, y: r.y + r.h / 2 - h / 2 });
}

/** Agrandit ou réduit autour du centre (curseur « taille », accessible au clavier). */
export function zoomerRecadrage(r: Recadrage, facteur: number, min: { l: number; h: number }): Recadrage {
  const k = borner(facteur, Math.max(min.l / r.l, min.h / r.h), Math.min(1 / r.l, 1 / r.h));
  const l = r.l * k;
  const h = r.h * k;
  return normaliser({ l, h, x: r.x + (r.l - l) / 2, y: r.y + (r.h - h) / 2 });
}

/** Tire une poignée : le bord opposé ne bouge pas, le rapport est tenu s'il est imposé. */
export function tirerPoignee(r: Recadrage, p: Poignee, dx: number, dy: number, rapport: number | null, min: { l: number; h: number }): Recadrage {
  const sx = p.includes('e') ? 1 : p.includes('o') ? -1 : 0;
  const sy = p.includes('s') ? 1 : p.includes('n') ? -1 : 0;
  // Place disponible depuis le bord fixe (ou depuis le centre quand l'axe n'est pas tiré).
  const placeL = sx > 0 ? 1 - r.x : sx < 0 ? r.x + r.l : 2 * Math.min(r.x + r.l / 2, 1 - r.x - r.l / 2);
  const placeH = sy > 0 ? 1 - r.y : sy < 0 ? r.y + r.h : 2 * Math.min(r.y + r.h / 2, 1 - r.y - r.h / 2);
  let l = r.l + sx * dx;
  let h = r.h + sy * dy;
  if (rapport) {
    l = sx && sy ? Math.max(l, h * rapport) : sx ? l : h * rapport;
    const lMin = Math.max(min.l, min.h * rapport);
    const lMax = Math.min(placeL, placeH * rapport);
    l = borner(l, Math.min(lMin, lMax), lMax);
    h = l / rapport;
  } else {
    l = sx ? borner(l, Math.min(min.l, placeL), placeL) : r.l;
    h = sy ? borner(h, Math.min(min.h, placeH), placeH) : r.h;
  }
  return normaliser({
    l,
    h,
    x: sx > 0 ? r.x : sx < 0 ? r.x + r.l - l : r.x + (r.l - l) / 2,
    y: sy > 0 ? r.y : sy < 0 ? r.y + r.h - h : r.y + (r.h - h) / 2,
  });
}
