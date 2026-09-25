import { describe, it, expect } from 'vitest';
import { PRODUCTS, getProduct } from '../src/lib/products';

describe('catalogue produits', () => {
  it('expose 3 produits (t-shirt, casquette, tableau)', () => {
    expect(PRODUCTS).toHaveLength(3);
    expect(PRODUCTS.map((p) => p.id)).toEqual(['tshirt', 'casquette', 'tableau']);
  });

  it('a des ids uniques', () => {
    const ids = PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a des zones normalisées valides (⊂ [0,1], x+w ≤ 1, y+h ≤ 1, w/h > 0)', () => {
    for (const p of PRODUCTS) {
      const { x, y, w, h } = p.zone;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      expect(x + w).toBeLessThanOrEqual(1);
      expect(y + h).toBeLessThanOrEqual(1);
    }
  });

  it('getProduct retrouve un produit par id et renvoie undefined sinon', () => {
    expect(getProduct('tshirt')?.label).toBe('T-shirt');
    expect(getProduct('inconnu')).toBeUndefined();
  });

  it('chaque produit pointe vers sa photo de mockup dans public/', () => {
    for (const p of PRODUCTS) {
      expect(p.mockup).toMatch(/^\/mockups\//);
    }
  });
});
