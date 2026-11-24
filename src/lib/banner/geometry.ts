/**
 * Banner Studio — géométrie pure, en millimètres (y vers le bas, rotation horaire à l'écran).
 *
 * Un élément est une boîte orientée (OBB) : centre, demi-dimensions, angle. Les tests
 * d'intersection utilisent le théorème des axes séparateurs, exact pour deux rectangles.
 */

export type Point = { x: number; y: number };
/** Rectangle aligné sur les axes. */
export type Rect = { x: number; y: number; largeur: number; hauteur: number };
export type Cercle = { x: number; y: number; rayon: number };
export type Boite = { xMm: number; yMm: number; largeurMm: number; hauteurMm: number; rotationDeg: number };

const EPS = 1e-9;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Les quatre coins de la boîte, dans l'ordre haut-gauche, haut-droit, bas-droit, bas-gauche. */
export function coins(b: Boite): Point[] {
  const a = rad(b.rotationDeg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const w = b.largeurMm / 2;
  const h = b.hauteurMm / 2;
  return [
    [-w, -h],
    [w, -h],
    [w, h],
    [-w, h],
  ].map(([dx, dy]) => ({ x: b.xMm + dx * c - dy * s, y: b.yMm + dx * s + dy * c }));
}

/** Boîte englobante alignée sur les axes (après rotation). */
export function englobante(b: Boite): Rect {
  const p = coins(b);
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => q.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, largeur: Math.max(...xs) - x, hauteur: Math.max(...ys) - y };
}

/** Point exprimé dans le repère local de la boîte (centre à l'origine, sans rotation). */
export function versLocal(b: Boite, p: Point): Point {
  const a = rad(-b.rotationDeg);
  const dx = p.x - b.xMm;
  const dy = p.y - b.yMm;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

/** Le point est-il dans la boîte (bords compris) ? */
export function contientPoint(b: Boite, p: Point): boolean {
  const l = versLocal(b, p);
  return Math.abs(l.x) <= b.largeurMm / 2 + EPS && Math.abs(l.y) <= b.hauteurMm / 2 + EPS;
}

/** Hit-test d'une pile d'éléments : le plus haut (dernier) qui contient le point, sinon null. */
export function elementSous<T extends Boite & { visible?: boolean }>(elements: readonly T[], p: Point): T | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i];
    if (e.visible !== false && contientPoint(e, p)) return e;
  }
  return null;
}

const rectEnBoite = (r: Rect): Boite => ({ xMm: r.x + r.largeur / 2, yMm: r.y + r.hauteur / 2, largeurMm: r.largeur, hauteurMm: r.hauteur, rotationDeg: 0 });

function projeter(points: Point[], axe: Point): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const v = p.x * axe.x + p.y * axe.y;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** Deux boîtes orientées se chevauchent-elles (contact strict, un simple contact de bord ne compte pas) ? */
export function chevauchent(a: Boite, b: Boite): boolean {
  const pa = coins(a);
  const pb = coins(b);
  const axes = [pa[1], pa[3], pb[1], pb[3]].map((q, i) => {
    const o = i < 2 ? pa[0] : pb[0];
    const v = { x: q.x - o.x, y: q.y - o.y };
    const n = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / n, y: v.y / n };
  });
  return axes.every((axe) => {
    const [amin, amax] = projeter(pa, axe);
    const [bmin, bmax] = projeter(pb, axe);
    return amax > bmin + EPS && bmax > amin + EPS;
  });
}

export const chevaucheRect = (b: Boite, r: Rect) => r.largeur > 0 && r.hauteur > 0 && chevauchent(b, rectEnBoite(r));

/** La boîte est-elle entièrement dans le rectangle ? */
export function estDans(b: Boite, r: Rect): boolean {
  return coins(b).every((p) => p.x >= r.x - EPS && p.x <= r.x + r.largeur + EPS && p.y >= r.y - EPS && p.y <= r.y + r.hauteur + EPS);
}

/** La boîte touche-t-elle le disque (point de la boîte le plus proche du centre) ? */
export function chevaucheCercle(b: Boite, c: Cercle): boolean {
  const l = versLocal(b, c);
  const px = Math.max(-b.largeurMm / 2, Math.min(b.largeurMm / 2, l.x));
  const py = Math.max(-b.hauteurMm / 2, Math.min(b.hauteurMm / 2, l.y));
  return Math.hypot(l.x - px, l.y - py) < c.rayon - EPS;
}

/**
 * Recale le centre pour que la boîte englobante tienne dans le rectangle. Si la boîte est plus
 * grande que le rectangle sur un axe, elle est centrée sur cet axe (on ne la redimensionne pas).
 */
export function clamp(b: Boite, r: Rect): Point {
  const e = englobante(b);
  const decalage = (debut: number, taille: number, debutR: number, tailleR: number) => {
    if (taille >= tailleR) return debutR + tailleR / 2 - (debut + taille / 2);
    if (debut < debutR) return debutR - debut;
    if (debut + taille > debutR + tailleR) return debutR + tailleR - (debut + taille);
    return 0;
  };
  return { x: b.xMm + decalage(e.x, e.largeur, r.x, r.largeur), y: b.yMm + decalage(e.y, e.hauteur, r.y, r.hauteur) };
}

export type ModeAlignement = 'gauche' | 'centre-h' | 'droite' | 'haut' | 'centre-v' | 'bas';

/** Nouveau centre pour aligner la boîte englobante sur un bord ou le centre du rectangle. */
export function aligner(b: Boite, r: Rect, mode: ModeAlignement): Point {
  const e = englobante(b);
  const dx = b.xMm - (e.x + e.largeur / 2);
  const dy = b.yMm - (e.y + e.hauteur / 2);
  switch (mode) {
    case 'gauche': return { x: r.x + e.largeur / 2 + dx, y: b.yMm };
    case 'centre-h': return { x: r.x + r.largeur / 2 + dx, y: b.yMm };
    case 'droite': return { x: r.x + r.largeur - e.largeur / 2 + dx, y: b.yMm };
    case 'haut': return { x: b.xMm, y: r.y + e.hauteur / 2 + dy };
    case 'centre-v': return { x: b.xMm, y: r.y + r.hauteur / 2 + dy };
    case 'bas': return { x: b.xMm, y: r.y + r.hauteur - e.hauteur / 2 + dy };
  }
}

/** Rectangle réduit de `marge` sur chaque côté (jamais négatif). */
export function retrait(r: Rect, marge: number): Rect {
  const m = Math.max(0, Math.min(marge, r.largeur / 2, r.hauteur / 2));
  return { x: r.x + m, y: r.y + m, largeur: r.largeur - 2 * m, hauteur: r.hauteur - 2 * m };
}

/**
 * La droite `x = v` (axe 'x') ou `y = v` (axe 'y') coupe-t-elle la boîte ? Sert aux jonctions de
 * panneaux : un texte à cheval sur une jonction est signalé.
 */
export function traverseLigne(b: Boite, axe: 'x' | 'y', v: number): boolean {
  const p = coins(b).map((q) => (axe === 'x' ? q.x : q.y));
  return p.some((q) => q < v - EPS) && p.some((q) => q > v + EPS);
}
