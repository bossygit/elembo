import { describe, it, expect } from 'vitest';
import {
  PREVIEW_TEXTURE_SIZE,
  clampTransform,
  designRect,
  printAreaRect,
  printedCm,
  productionTextureSize,
  rotatedBox,
} from '../src/lib/canvas/design-canvas';
import { getPrintArea, getProductById, DEFAULT_PRODUCT_ID } from '../src/lib/products/catalog';
import type { DesignTransform } from '../src/types/configurator';

const area = getPrintArea(getProductById(DEFAULT_PRODUCT_ID), 'front')!;
const IDENTITY: DesignTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
const DESIGN = { w: 1000, h: 1000 };
const SIZE = PREVIEW_TEXTURE_SIZE;

describe('printAreaRect', () => {
  it('convertit la zone (fractions) en pixels de texture', () => {
    const rect = printAreaRect(area, 1000);
    expect(rect.x).toBeCloseTo(area.x * 1000);
    expect(rect.w).toBeCloseTo(area.w * 1000);
  });

  it('rejette une taille de texture nulle', () => {
    expect(() => printAreaRect(area, 0)).toThrow(RangeError);
  });
});

describe('rotatedBox', () => {
  it('sans rotation, la boîte est le rectangle lui-même', () => {
    expect(rotatedBox(100, 50, 0)).toEqual({ w: 100, h: 50 });
  });

  it('à 90°, largeur et hauteur s’échangent', () => {
    const b = rotatedBox(100, 50, 90);
    expect(b.w).toBeCloseTo(50);
    expect(b.h).toBeCloseTo(100);
  });
});

describe('designRect', () => {
  it('à l’échelle 1, le visuel occupe la zone au mieux sans déformation (contain)', () => {
    const rect = designRect(IDENTITY, area, SIZE, DESIGN);
    const zone = printAreaRect(area, SIZE);
    // Zone A4 portrait (0,84 de ratio) + visuel carré → il est limité par la LARGEUR
    expect(rect.w).toBeCloseTo(zone.w);
    expect(rect.h).toBeCloseTo(zone.w);
    expect(rect.w / rect.h).toBeCloseTo(1);
    // centré
    expect(rect.x + rect.w / 2).toBeCloseTo(zone.x + zone.w / 2);
    expect(rect.y + rect.h / 2).toBeCloseTo(zone.y + zone.h / 2);
  });

  it('préserve le ratio d’un visuel non carré', () => {
    const rect = designRect(IDENTITY, area, SIZE, { w: 800, h: 400 });
    expect(rect.w / rect.h).toBeCloseTo(2);
  });

  it('l’échelle multiplie la taille imprimée', () => {
    const base = designRect(IDENTITY, area, SIZE, DESIGN);
    const double = designRect({ ...IDENTITY, scale: 2 }, area, SIZE, DESIGN);
    expect(double.w).toBeCloseTo(base.w * 2);
    expect(double.h).toBeCloseTo(base.h * 2);
  });

  it('le décalage s’exprime en fraction de zone', () => {
    const zone = printAreaRect(area, SIZE);
    const moved = designRect({ ...IDENTITY, x: 0.25, y: -0.5 }, area, SIZE, DESIGN);
    const base = designRect(IDENTITY, area, SIZE, DESIGN);
    expect(moved.x - base.x).toBeCloseTo(0.25 * zone.w);
    expect(moved.y - base.y).toBeCloseTo(-0.5 * zone.h);
  });

  it('rejette un visuel de dimensions invalides', () => {
    expect(() => designRect(IDENTITY, area, SIZE, { w: 0, h: 10 })).toThrow(RangeError);
  });
});

describe('clampTransform — le visuel ne sort pas de la zone', () => {
  it('borne le décalage d’un visuel plus petit que la zone', () => {
    const c = clampTransform({ ...IDENTITY, scale: 0.5, x: 5, y: -5 }, area, SIZE, DESIGN);
    const zone = printAreaRect(area, SIZE);
    const rect = designRect({ ...IDENTITY, scale: 0.5 }, area, SIZE, DESIGN);
    const maxX = (zone.w - rect.w) / 2 / zone.w;
    const maxY = (zone.h - rect.h) / 2 / zone.h;
    expect(c.x).toBeCloseTo(maxX);
    expect(c.y).toBeCloseTo(-maxY);
    expect(c.x).toBeLessThan(1);
    // et le visuel reste entièrement dans la zone
    const placed = designRect(c, area, SIZE, DESIGN);
    expect(placed.x).toBeGreaterThanOrEqual(zone.x - 0.001);
    expect(placed.x + placed.w).toBeLessThanOrEqual(zone.x + zone.w + 0.001);
    expect(placed.y).toBeGreaterThanOrEqual(zone.y - 0.001);
    expect(placed.y + placed.h).toBeLessThanOrEqual(zone.y + zone.h + 0.001);
  });

  it('un visuel plus grand que la zone peut glisser, mais reste borné et recouvre la zone', () => {
    const c = clampTransform({ ...IDENTITY, scale: 2, x: 99, y: 0 }, area, SIZE, DESIGN);
    const zone = printAreaRect(area, SIZE);
    const rect = designRect(c, area, SIZE, DESIGN);
    expect(rect.x).toBeLessThanOrEqual(zone.x + 0.001);
    expect(rect.x + rect.w).toBeGreaterThanOrEqual(zone.x + zone.w - 0.001);
    expect(c.x).toBeLessThan(2);
  });

  it('borne l’échelle et la rotation aux limites métier', () => {
    const big = clampTransform({ ...IDENTITY, scale: 99, rotation: 720 }, area, SIZE, DESIGN);
    expect(big.scale).toBe(2);
    expect(big.rotation).toBe(180);

    const small = clampTransform({ ...IDENTITY, scale: -3, rotation: -720 }, area, SIZE, DESIGN);
    expect(small.scale).toBe(0.2);
    expect(small.rotation).toBe(-180);
  });

  it('tient compte de la rotation dans la borne', () => {
    const straight = clampTransform({ ...IDENTITY, scale: 1, rotation: 0, x: 9 }, area, SIZE, DESIGN);
    const turned = clampTransform({ ...IDENTITY, scale: 1, rotation: 45, x: 9 }, area, SIZE, DESIGN);
    // À 45° la boîte englobante du visuel grandit : il peut glisser davantage sans
    // découvrir la zone — mais la borne reste finie.
    expect(turned.x).toBeGreaterThan(straight.x);
    expect(turned.x).toBeLessThan(1);
  });
});

describe('conversion physique', () => {
  it('une zone à l’échelle 1 mesure la taille physique de la zone', () => {
    const zone = printAreaRect(area, SIZE);
    const cm = printedCm(zone, area, SIZE);
    expect(cm.w).toBeCloseTo(area.cmWidth);
    expect(cm.h).toBeCloseTo(area.cmHeight);
  });

  it('un visuel deux fois plus grand double la taille imprimée', () => {
    const base = designRect(IDENTITY, area, SIZE, DESIGN);
    const doubled = designRect({ ...IDENTITY, scale: 2 }, area, SIZE, DESIGN);
    const cmBase = printedCm(base, area, SIZE);
    const cmDouble = printedCm(doubled, area, SIZE);
    expect(cmDouble.w).toBeCloseTo(cmBase.w * 2);
    expect(cmDouble.h).toBeCloseTo(cmBase.h * 2);
    // à l'échelle 1, un visuel carré occupe toute la largeur de la zone
    expect(cmBase.w).toBeCloseTo(area.cmWidth);
    expect(cmDouble.w).toBeCloseTo(area.cmWidth * 2);
  });

  it('produit un fichier de production à 300 dpi de la zone physique', () => {
    const out = productionTextureSize(area);
    expect(out.w).toBe(Math.round((area.cmWidth / 2.54) * 300));
    expect(out.h).toBe(Math.round((area.cmHeight / 2.54) * 300));
    expect(out.w).toBe(2480); // 21 cm
  });
});
