import { describe, it, expect } from 'vitest';
import { computePrintRect } from '../src/lib/printArea';

describe('computePrintRect', () => {
  it('contain : design carré dans zone carrée → remplit la zone', () => {
    // canvas 200x200, zone {0,0,0.5,0.5} → zonePx 100x100 ; design 100x100
    const r = computePrintRect(100, 100, 200, 200, { x: 0, y: 0, w: 0.5, h: 0.5 });
    expect(r).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it('contain : design 1000×500 dans zone 300×300 → 300×150, ratio préservé, centré', () => {
    // canvas 600x600, zone {0,0,0.5,0.5} → zonePx 300x300
    const r = computePrintRect(1000, 500, 600, 600, { x: 0, y: 0, w: 0.5, h: 0.5 });
    expect(r.w).toBeCloseTo(300);
    expect(r.h).toBeCloseTo(150);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(75);
    expect(r.w / r.h).toBeCloseTo(2); // ratio design préservé
  });

  it('contain : jamais de dépassement de la zone', () => {
    const zone = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const zx = 0.25 * 400;
    const zw = 0.5 * 400;
    for (const [dw, dh] of [
      [400, 200],
      [200, 400],
      [50, 900],
      [900, 50],
      [123, 456],
    ]) {
      const r = computePrintRect(dw, dh, 400, 400, zone);
      expect(r.x).toBeGreaterThanOrEqual(zx - 0.001);
      expect(r.y).toBeGreaterThanOrEqual(zx - 0.001);
      expect(r.x + r.w).toBeLessThanOrEqual(zx + zw + 0.001);
      expect(r.y + r.h).toBeLessThanOrEqual(zx + zw + 0.001);
    }
  });

  it('contain : zone décalée → design centré dans la zone', () => {
    // canvas 400x400, zone {0.25,0.25,0.5,0.5} → zonePx {100,100,200,200} ; design 400x200
    const r = computePrintRect(400, 200, 400, 400, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(r.w).toBeCloseTo(200);
    expect(r.h).toBeCloseTo(100);
    expect(r.x).toBeCloseTo(100);
    expect(r.y).toBeCloseTo(150);
  });

  it('stretch : remplit la zone sans préserver le ratio', () => {
    const r = computePrintRect(1000, 500, 600, 600, { x: 0, y: 0, w: 0.5, h: 0.5 }, 'stretch');
    expect(r).toEqual({ x: 0, y: 0, w: 300, h: 300 });
  });

  it('cover : zone remplie, rect peut dépasser (l\'appelant clippe au dessin)', () => {
    // canvas 400x400, zone {0.25,0.25,0.5,0.5} → zonePx {100,100,200,200} ; design 400x200
    const r = computePrintRect(400, 200, 400, 400, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 'cover');
    expect(r.w).toBeCloseTo(400); // dépasse la zone de 200 px
    expect(r.h).toBeCloseTo(200);
    expect(r.x).toBeCloseTo(0); // centré : déborde à gauche
  });

  it('rejette les dimensions non positives', () => {
    expect(() => computePrintRect(0, 100, 400, 400, { x: 0, y: 0, w: 0.5, h: 0.5 })).toThrow(RangeError);
    expect(() => computePrintRect(100, -5, 400, 400, { x: 0, y: 0, w: 0.5, h: 0.5 })).toThrow(RangeError);
    expect(() => computePrintRect(100, 100, 0, 400, { x: 0, y: 0, w: 0.5, h: 0.5 })).toThrow(RangeError);
  });
});
