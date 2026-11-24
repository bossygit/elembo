/**
 * Banner Studio — géométrie pure (boîtes orientées, hit-test, intersections, clamp, alignement).
 * Les propriétés sont vérifiées sur des boîtes tirées par un générateur à graine fixe : les
 * échecs sont reproductibles.
 */

import { describe, expect, it } from 'vitest';

import {
  aligner, chevaucheCercle, chevaucheRect, chevauchent, clamp, coins, contientPoint,
  elementSous, englobante, estDans, retrait, traverseLigne, type Boite, type Rect,
} from '../src/lib/banner/geometry';

const boite = (xMm: number, yMm: number, largeurMm: number, hauteurMm: number, rotationDeg = 0): Boite => ({ xMm, yMm, largeurMm, hauteurMm, rotationDeg });
const surface: Rect = { x: 0, y: 0, largeur: 3000, hauteur: 1000 };

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function hasard(graine: number) {
  let a = graine;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const boitesAuHasard = (n: number, graine = 42) => {
  const r = hasard(graine);
  return Array.from({ length: n }, () => boite(r() * 3000, r() * 1000, 10 + r() * 900, 10 + r() * 600, r() * 720 - 360));
};
const aire = (p: { x: number; y: number }[]) => Math.abs(p.reduce((s, q, i) => { const n = p[(i + 1) % p.length]; return s + q.x * n.y - n.x * q.y; }, 0)) / 2;

describe('coins et boîte englobante', () => {
  it('sans rotation, les coins sont ceux du cadre', () => {
    expect(coins(boite(100, 50, 40, 20))).toEqual([{ x: 80, y: 40 }, { x: 120, y: 40 }, { x: 120, y: 60 }, { x: 80, y: 60 }]);
  });

  it('à 90°, la boîte englobante échange largeur et hauteur', () => {
    const e = englobante(boite(100, 100, 200, 50, 90));
    expect(e.largeur).toBeCloseTo(50);
    expect(e.hauteur).toBeCloseTo(200);
    expect(e.x).toBeCloseTo(75);
  });

  it('un carré à 45° a une boîte englobante de côté × √2', () => {
    const e = englobante(boite(0, 0, 100, 100, 45));
    expect(e.largeur).toBeCloseTo(100 * Math.SQRT2);
    expect(e.hauteur).toBeCloseTo(100 * Math.SQRT2);
  });

  it('la rotation est horaire à l’écran (y vers le bas)', () => {
    // Le coin haut-droit d'une boîte tournée de 90° passe en bas à droite du centre.
    const [, hautDroit] = coins(boite(0, 0, 100, 20, 90));
    expect(hautDroit.x).toBeCloseTo(10);
    expect(hautDroit.y).toBeCloseTo(50);
  });

  it('propriété : la rotation conserve l’aire et 360° revient au cadre de départ', () => {
    for (const b of boitesAuHasard(200)) {
      expect(aire(coins(b))).toBeCloseTo(b.largeurMm * b.hauteurMm, 3);
      const tour = coins({ ...b, rotationDeg: b.rotationDeg + 360 });
      coins(b).forEach((p, i) => { expect(tour[i].x).toBeCloseTo(p.x, 6); expect(tour[i].y).toBeCloseTo(p.y, 6); });
    }
  });

  it('propriété : la boîte englobante contient tous les coins', () => {
    for (const b of boitesAuHasard(200, 7)) {
      const e = englobante(b);
      for (const p of coins(b)) {
        expect(p.x).toBeGreaterThanOrEqual(e.x - 1e-6);
        expect(p.x).toBeLessThanOrEqual(e.x + e.largeur + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(e.y - 1e-6);
        expect(p.y).toBeLessThanOrEqual(e.y + e.hauteur + 1e-6);
      }
    }
  });
});

describe('hit-test', () => {
  it('un point est testé dans le repère pivoté, pas dans la boîte englobante', () => {
    const b = boite(0, 0, 100, 10, 45);
    expect(contientPoint(b, { x: 30, y: 30 })).toBe(true); // sur la diagonale
    expect(contientPoint(b, { x: 30, y: -30 })).toBe(false); // dans l'englobante, hors de la boîte
  });

  it('propriété : chaque coin et le centre sont dans la boîte', () => {
    for (const b of boitesAuHasard(200, 3)) {
      expect(contientPoint(b, { x: b.xMm, y: b.yMm })).toBe(true);
      for (const p of coins(b)) expect(contientPoint(b, p)).toBe(true);
    }
  });

  it('elementSous renvoie l’élément le plus haut et ignore les invisibles', () => {
    const pile = [
      { ...boite(100, 100, 200, 200), id: 'fond' },
      { ...boite(100, 100, 50, 50), id: 'dessus', visible: false },
      { ...boite(120, 100, 50, 50), id: 'haut' },
    ];
    expect(elementSous(pile, { x: 125, y: 100 })?.id).toBe('haut');
    expect(elementSous(pile, { x: 90, y: 100 })?.id).toBe('fond');
    expect(elementSous(pile, { x: 900, y: 900 })).toBeNull();
  });
});

describe('intersections', () => {
  it('deux boîtes éloignées ne se chevauchent pas ; un simple contact de bord non plus', () => {
    expect(chevauchent(boite(0, 0, 10, 10), boite(100, 0, 10, 10))).toBe(false);
    expect(chevauchent(boite(0, 0, 10, 10), boite(10, 0, 10, 10))).toBe(false);
    expect(chevauchent(boite(0, 0, 10, 10), boite(9, 0, 10, 10))).toBe(true);
  });

  it('axes séparateurs : des boîtes englobantes qui se touchent ne suffisent pas', () => {
    // Losange (carré à 45°) près du coin d'un carré : les englobantes se chevauchent, les boîtes non.
    const carre = boite(0, 0, 100, 100);
    const losange = boite(85, 85, 50, 50, 45);
    const a = englobante(carre);
    const b = englobante(losange);
    expect(a.x + a.largeur > b.x && a.y + a.hauteur > b.y).toBe(true);
    expect(chevauchent(carre, losange)).toBe(false);
  });

  it('propriété : le chevauchement est symétrique', () => {
    const bs = boitesAuHasard(80, 11);
    for (let i = 0; i < bs.length - 1; i++) expect(chevauchent(bs[i], bs[i + 1])).toBe(chevauchent(bs[i + 1], bs[i]));
  });

  it('chevauchement avec un rectangle et un disque', () => {
    expect(chevaucheRect(boite(50, 50, 20, 20), { x: 0, y: 0, largeur: 45, hauteur: 100 })).toBe(true);
    expect(chevaucheRect(boite(50, 50, 20, 20), { x: 0, y: 0, largeur: 40, hauteur: 100 })).toBe(false);
    // Le bord bas de la boîte est à 15 mm du centre du disque.
    expect(chevaucheCercle(boite(100, 100, 20, 20), { x: 100, y: 125, rayon: 20 })).toBe(true);
    expect(chevaucheCercle(boite(100, 100, 20, 20), { x: 100, y: 125, rayon: 10 })).toBe(false);
    // Un disque près du coin d'une boîte pivotée de 45° ne la touche pas.
    expect(chevaucheCercle(boite(0, 0, 100, 100, 45), { x: 60, y: 60, rayon: 10 })).toBe(false);
  });

  it('estDans tient compte de la rotation', () => {
    expect(estDans(boite(500, 500, 400, 100), surface)).toBe(true);
    expect(estDans(boite(500, 500, 1200, 100, 90), surface)).toBe(false);
  });

  it('traverseLigne détecte un élément à cheval sur une jonction', () => {
    expect(traverseLigne(boite(3000, 500, 400, 100), 'x', 2990)).toBe(true);
    expect(traverseLigne(boite(3000, 500, 400, 100), 'x', 3300)).toBe(false);
    expect(traverseLigne(boite(500, 3000, 400, 100), 'y', 3020)).toBe(true);
  });
});

describe('clamp, alignement, retrait', () => {
  it('une boîte qui sort à gauche et en haut est ramenée à l’intérieur', () => {
    expect(clamp(boite(-50, 20, 200, 100), surface)).toEqual({ x: 100, y: 50 });
  });

  it('une boîte déjà dedans ne bouge pas', () => {
    expect(clamp(boite(500, 500, 200, 100), surface)).toEqual({ x: 500, y: 500 });
  });

  it('une boîte plus grande que la surface est centrée sur cet axe', () => {
    expect(clamp(boite(0, 500, 5000, 100), surface)).toEqual({ x: 1500, y: 500 });
  });

  it('propriété : une boîte qui tient dans la surface y est entièrement après clamp', () => {
    for (const b of boitesAuHasard(200, 19)) {
      const e = englobante(b);
      if (e.largeur > surface.largeur || e.hauteur > surface.hauteur) continue;
      const c = clamp(b, surface);
      expect(estDans({ ...b, xMm: c.x, yMm: c.y }, { x: -1e-6, y: -1e-6, largeur: surface.largeur + 2e-6, hauteur: surface.hauteur + 2e-6 })).toBe(true);
    }
  });

  it('alignements sur les bords et au centre, rotation comprise', () => {
    const b = boite(700, 300, 200, 100);
    expect(aligner(b, surface, 'gauche')).toEqual({ x: 100, y: 300 });
    expect(aligner(b, surface, 'droite')).toEqual({ x: 2900, y: 300 });
    expect(aligner(b, surface, 'centre-h')).toEqual({ x: 1500, y: 300 });
    expect(aligner(b, surface, 'haut')).toEqual({ x: 700, y: 50 });
    expect(aligner(b, surface, 'bas')).toEqual({ x: 700, y: 950 });
    expect(aligner(b, surface, 'centre-v')).toEqual({ x: 700, y: 500 });
    const pivotee = aligner(boite(700, 300, 200, 100, 90), surface, 'gauche');
    expect(pivotee.x).toBeCloseTo(50);
  });

  it('retrait réduit un rectangle sans jamais l’inverser', () => {
    expect(retrait(surface, 100)).toEqual({ x: 100, y: 100, largeur: 2800, hauteur: 800 });
    expect(retrait({ x: 0, y: 0, largeur: 100, hauteur: 40 }, 50)).toEqual({ x: 20, y: 20, largeur: 60, hauteur: 0 });
  });
});
