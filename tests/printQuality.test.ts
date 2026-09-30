import { describe, it, expect } from 'vitest';
import {
  printedSizeCm,
  computeDpi,
  assessPrintQuality,
  MIN_GOOD_DPI,
} from '../src/lib/printQuality';

// Cas de référence : t-shirt, zone carrée de 20 cm de côté (zoneCm {20,20}),
// zone de 500 px de large sur le canvas.
const zonePx = { w: 500, h: 500 };
const zoneCm = { w: 20, h: 20 };

describe('printedSizeCm', () => {
  it('rect égal à la zone, échelle 1 → la taille d’impression en cm est celle du produit', () => {
    const s = printedSizeCm({ x: 0, y: 0, w: 500, h: 500 }, zonePx, zoneCm, 1);
    expect(s.w).toBeCloseTo(20);
    expect(s.h).toBeCloseTo(20);
  });

  it('échelle 1,5× → 1,5 fois la taille physique', () => {
    const s = printedSizeCm({ x: 0, y: 0, w: 500, h: 500 }, zonePx, zoneCm, 1.5);
    expect(s.w).toBeCloseTo(30);
  });

  it('rect plus petit que la zone (contain) → impression plus petite que la zone', () => {
    // design 1000×500 → contain dans 500×500 : rect 500×250 → 20 cm × 10 cm
    const s = printedSizeCm({ x: 0, y: 125, w: 500, h: 250 }, zonePx, zoneCm, 1);
    expect(s.w).toBeCloseTo(20);
    expect(s.h).toBeCloseTo(10);
  });

  it('échelle 0,5× → moitié de la taille physique', () => {
    const s = printedSizeCm({ x: 0, y: 0, w: 500, h: 500 }, zonePx, zoneCm, 0.5);
    expect(s.w).toBeCloseTo(10);
  });

  it('rejette une zone de taille nulle', () => {
    expect(() => printedSizeCm({ x: 0, y: 0, w: 10, h: 10 }, { w: 0, h: 0 }, zoneCm, 1)).toThrow(RangeError);
  });
});

describe('computeDpi', () => {
  it('500 px imprimés sur 25,4 cm (10 po) → 50 dpi', () => {
    expect(computeDpi(500, 500, 25.4, 25.4)).toBeCloseTo(50);
  });

  it('3000 px sur 2,54 cm (1 po) → 3000 dpi', () => {
    expect(computeDpi(3000, 3000, 2.54, 2.54)).toBeCloseTo(3000);
  });

  it('retient la direction la plus faible quand les densités diffèrent', () => {
    // horizontal : 1000 px sur 10 po = 100 dpi ; vertical : 1000 px sur 5 po = 200 dpi
    expect(computeDpi(1000, 1000, 25.4, 12.7)).toBeCloseTo(100);
  });

  it('rejette une taille d’impression nulle ou négative', () => {
    expect(() => computeDpi(100, 100, 0, 10)).toThrow(RangeError);
    expect(() => computeDpi(100, 100, 10, -1)).toThrow(RangeError);
  });
});

describe('assessPrintQuality', () => {
  it('≥ 300 dpi → qualité photo', () => {
    const q = assessPrintQuality(300);
    expect(q.level).toBe('photo');
    expect(q.message).toMatch(/photo|excellent/i);
  });

  it('entre 150 et 300 dpi → bonne qualité', () => {
    expect(assessPrintQuality(150).level).toBe('bonne');
    expect(assessPrintQuality(299).level).toBe('bonne');
  });

  it('entre 100 et 150 dpi → qualité faible', () => {
    const q = assessPrintQuality(120);
    expect(q.level).toBe('faible');
    expect(q.message.length).toBeGreaterThan(10);
  });

  it('sous 100 dpi → insuffisant, avec conseil concret', () => {
    const q = assessPrintQuality(42);
    expect(q.level).toBe('insuffisant');
    expect(q.message).toMatch(/flou/i);
    expect(q.message).toMatch(/\d/); // donne un objectif chiffré
  });

  it('seuil de référence à 150 dpi', () => {
    expect(MIN_GOOD_DPI).toBe(150);
  });

  it('dpi non fini → insuffisant plutôt qu’une exception', () => {
    expect(assessPrintQuality(NaN).level).toBe('insuffisant');
  });
});
