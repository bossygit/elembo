/**
 * Banner Studio — vue du plan de travail : échelle (px par mm) et décalage, sans DOM.
 * Le zoom est relatif à l'échelle « ajustée » : 100 % = la banderole entière tient à l'écran.
 */

export type Vue = { echelle: number; x: number; y: number };
export type Cadre = { largeur: number; hauteur: number };
type Dimensions = { largeurMm: number; hauteurMm: number };

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 16;

/** Échelle et décalage pour voir toute la banderole, avec une marge. */
export function ajuster(cadre: Cadre, d: Dimensions, marge = 32): Vue {
  const m = Math.min(marge, cadre.largeur / 4, cadre.hauteur / 4);
  const echelle = Math.max(1e-6, Math.min((cadre.largeur - 2 * m) / d.largeurMm, (cadre.hauteur - 2 * m) / d.hauteurMm));
  return { echelle, x: (cadre.largeur - d.largeurMm * echelle) / 2, y: (cadre.hauteur - d.hauteurMm * echelle) / 2 };
}

/** Garde au moins une bande de la banderole visible : on ne peut pas la perdre en déplaçant la vue. */
export function contenir(v: Vue, cadre: Cadre, d: Dimensions, visible = 80): Vue {
  const axe = (pos: number, taille: number, ecran: number) => {
    const b = Math.min(visible, taille, ecran);
    return Math.min(ecran - b, Math.max(b - taille, pos));
  };
  return { ...v, x: axe(v.x, d.largeurMm * v.echelle, cadre.largeur), y: axe(v.y, d.hauteurMm * v.echelle, cadre.hauteur) };
}

/** Zoom autour d'un point de l'écran : le point de la banderole sous le curseur ne bouge pas. */
export function zoomer(v: Vue, facteur: number, ancre: { x: number; y: number }, cadre: Cadre, d: Dimensions): Vue {
  const base = ajuster(cadre, d).echelle;
  const echelle = Math.min(base * ZOOM_MAX, Math.max(base * ZOOM_MIN, v.echelle * facteur));
  const k = echelle / v.echelle;
  return contenir({ echelle, x: ancre.x - (ancre.x - v.x) * k, y: ancre.y - (ancre.y - v.y) * k }, cadre, d);
}

export const pourcentage = (v: Vue, cadre: Cadre, d: Dimensions) => Math.round((v.echelle / ajuster(cadre, d).echelle) * 100);

/** Graduation « ronde » d'une règle, en mm : au moins `ecartPx` entre deux traits chiffrés. */
export function pasRegle(echelle: number, ecartPx = 56): number {
  const brut = ecartPx / echelle;
  const p = 10 ** Math.floor(Math.log10(brut));
  return [1, 2, 5, 10].map((n) => n * p).find((n) => n >= brut - 1e-9)!;
}
