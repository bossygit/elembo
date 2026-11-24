/**
 * Banner Studio — catégories de modèles et formats : alignement avec le catalogue commercial
 * grand format et avec la contrainte SQL prévue pour `visuels_banderole.categorie_modele`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CATEGORIES, estCategorie, usageDeCategorie } from '../src/lib/banner/categories';
import { DIMENSION_MAX_MM, DIMENSION_MIN_MM, FORMATS, finitionsApplicables, orientation } from '../src/lib/banner/formats';
import { SUPPORTS, USAGES } from '../src/lib/grand-format/catalogue';

describe('catégories de modèles', () => {
  it('sept catégories, identifiants uniques', () => {
    expect(CATEGORIES).toHaveLength(7);
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(7);
  });

  it('les catégories sont celles de la contrainte SQL prévue par l’audit (§6.2)', () => {
    const audit = readFileSync(join(process.cwd(), 'docs/audit-banner-studio.md'), 'utf8');
    const check = audit.match(/categorie_modele text check \(categorie_modele in \(\s*([^)]*)\)/)?.[1];
    const attendues = (check ?? '').match(/'([A-Z_]+)'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
    expect(CATEGORIES.map((c) => c.id).sort()).toEqual(attendues.sort());
  });

  it('chaque catégorie correspond à un usage commercial existant', () => {
    const usages = USAGES.map((u) => u.id);
    for (const c of CATEGORIES) expect(usages).toContain(c.usage);
    expect(usageDeCategorie('MARIAGE')).toBe('EVENEMENT');
    expect(usageDeCategorie('ANNIVERSAIRE')).toBe('EVENEMENT');
    expect(usageDeCategorie('DEUIL')).toBe('DEUIL');
  });

  it('format et support par défaut cohérents', () => {
    for (const c of CATEGORIES) {
      expect(FORMATS[c.supportDefaut].length).toBeGreaterThan(0);
      expect(Math.min(c.formatDefaut.largeurMm, c.formatDefaut.hauteurMm)).toBeGreaterThanOrEqual(DIMENSION_MIN_MM);
      expect(Math.max(c.formatDefaut.largeurMm, c.formatDefaut.hauteurMm)).toBeLessThanOrEqual(DIMENSION_MAX_MM);
    }
    expect(estCategorie('DEUIL')).toBe(true);
    expect(estCategorie('NOEL')).toBe(false);
  });
});

describe('formats prédéfinis', () => {
  it('tous dans les bornes commerciales, identifiants uniques par support', () => {
    for (const formats of Object.values(FORMATS)) {
      expect(new Set(formats.map((f) => f.id)).size).toBe(formats.length);
      for (const f of formats) {
        expect(f.largeurMm).toBeGreaterThanOrEqual(DIMENSION_MIN_MM);
        expect(f.hauteurMm).toBeLessThanOrEqual(DIMENSION_MAX_MM);
      }
    }
  });

  it('les supports rigides reprennent le format standard du catalogue', () => {
    for (const s of SUPPORTS.filter((x) => x.formatStandard)) {
      const f = FORMATS[s.id as keyof typeof FORMATS][0];
      expect([f.largeurMm, f.hauteurMm]).toEqual([Math.round(s.formatStandard!.largeurM * 1000), Math.round(s.formatStandard!.hauteurM * 1000)]);
    }
    expect(FORMATS.ROLL_UP[0]).toMatchObject({ id: '850x2000', nom: '0,85 × 2 m' });
  });

  it('les finitions ne s’appliquent qu’aux supports souples', () => {
    expect(finitionsApplicables('BANDEROLE')).toContain('OURLETS_OEILLETS');
    expect(finitionsApplicables('ROLL_UP')).toEqual(['SANS']);
  });

  it('orientation et sens de lecture', () => {
    expect(orientation(3000, 1000)).toBe('PAYSAGE');
    expect(orientation(850, 2000)).toBe('PORTRAIT');
    expect(orientation(1000, 1000)).toBe('CARRE');
  });
});
