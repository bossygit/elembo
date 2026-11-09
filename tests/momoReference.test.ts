import { describe, expect, it } from 'vitest';

import { referenceValide } from '../src/server/momo/reference';

describe('référence de commande', () => {
  it('accepte les formats réellement produits', () => {
    expect(referenceValide('ELB-20261001-1200-AB')).toBe(true);
    expect(referenceValide('ELB-20261109-2359-ZZ')).toBe(true);
    expect(referenceValide('DEV-20261109-0001')).toBe(true);
    expect(referenceValide('  ELB-20261001-1200-AB  ')).toBe(true); // trim
  });

  it('refuse ce qui peut devenir un chemin ou un journal illisible', () => {
    expect(referenceValide('ELB/2026')).toBe(false);
    expect(referenceValide('../../etc/passwd')).toBe(false);
    expect(referenceValide('ELB..2026')).toBe(false);
    expect(referenceValide('ELB 2026')).toBe(false);
    expect(referenceValide('ELB\n2026')).toBe(false);
    expect(referenceValide('')).toBe(false);
    expect(referenceValide(null)).toBe(false);
    expect(referenceValide(42)).toBe(false);
  });

  it('borne la longueur', () => {
    expect(referenceValide('A'.repeat(5))).toBe(false);
    expect(referenceValide('A'.repeat(6))).toBe(true);
    expect(referenceValide('A'.repeat(40))).toBe(true);
    expect(referenceValide('A'.repeat(41))).toBe(false);
  });
});
