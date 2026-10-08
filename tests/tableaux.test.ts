// Barème et devis des tableaux (côté navigateur).
//
// Ce que ces tests protègent : le prix affiché au client. Il est calculé (jamais écrit en dur),
// arrondi au multiple supérieur de 500 FCFA, et la remise de quantité suit les paliers. Le
// service de paiement recalcule de son côté : `tests/coherenceCatalogues.test.ts` vérifie que
// les deux grilles sont identiques.

import { describe, expect, it } from 'vitest';

import {
  CADRE_AFFICHAGE,
  FORMATS,
  PALIERS,
  TARIFS,
  conseilFormat,
  devisTableau,
  dpiPourFormat,
  formatParId,
  palierPour,
  prixUnitaireFcfa,
  surfaceFacturableCm2,
  zonePourFormat,
} from '../src/lib/products/tableaux';

describe('formats de tableaux', () => {
  it('propose cinq formats, du plus petit au plus grand', () => {
    expect(FORMATS.map((f) => f.id)).toEqual(['20x30', '30x40', '40x60', '50x70', '60x90']);
    const surfaces = FORMATS.map((f) => f.largeurCm * f.hauteurCm);
    expect([...surfaces].sort((a, b) => a - b)).toEqual(surfaces);
  });

  it('refuse un format inconnu', () => {
    expect(formatParId('40x60')).toBeDefined();
    expect(formatParId('100x200')).toBeUndefined();
    expect(() => devisTableau({ formatId: '100x200', support: 'chassis', quantite: 1 })).toThrow();
  });
});

describe('surface facturée', () => {
  it('facture le débord de toile autour d’un châssis', () => {
    const f = formatParId('40x60')!;
    expect(surfaceFacturableCm2(f, 'toile-seule')).toBe(40 * 60);
    // 4 cm de débord de chaque côté : (40+8) × (60+8)
    expect(surfaceFacturableCm2(f, 'chassis')).toBe(48 * 68);
    expect(TARIFS.debordChassisCm).toBe(4);
  });
});

describe('prix public', () => {
  it('arrondit toujours au multiple de 500 FCFA supérieur', () => {
    for (const f of FORMATS) {
      for (const support of ['chassis', 'toile-seule'] as const) {
        const prix = prixUnitaireFcfa(f, support);
        expect(prix % TARIFS.arrondiFcfa, `${f.id}/${support} = ${prix}`).toBe(0);
        expect(prix).toBeGreaterThan(0);
      }
    }
  });

  it('le montage sur châssis coûte plus cher que la toile seule, à format égal', () => {
    for (const f of FORMATS) {
      expect(prixUnitaireFcfa(f, 'chassis')).toBeGreaterThan(prixUnitaireFcfa(f, 'toile-seule'));
    }
  });

  it('un grand format coûte plus cher qu’un petit, à support égal', () => {
    const prix = FORMATS.map((f) => prixUnitaireFcfa(f, 'chassis'));
    expect([...prix].sort((a, b) => a - b)).toEqual(prix);
  });
});

describe('remise de quantité', () => {
  it('applique les paliers 1 / 2 / 5 / 10', () => {
    expect(palierPour(1).remisePct).toBe(0);
    expect(palierPour(2).remisePct).toBe(5);
    expect(palierPour(4).remisePct).toBe(5);
    expect(palierPour(5).remisePct).toBe(10);
    expect(palierPour(9).remisePct).toBe(10);
    expect(palierPour(10).remisePct).toBe(15);
    expect(palierPour(50).remisePct).toBe(15);
    expect(PALIERS[0].remisePct).toBe(0);
  });

  it('la remise fait baisser le prix unitaire effectif', () => {
    const un = devisTableau({ formatId: '40x60', support: 'chassis', quantite: 1 });
    const dix = devisTableau({ formatId: '40x60', support: 'chassis', quantite: 10 });
    expect(un.remisePct).toBe(0);
    expect(dix.remisePct).toBe(15);
    const unitaire1 = un.sousTotalFcfa / un.quantite;
    const unitaire10 = dix.sousTotalFcfa / dix.quantite;
    expect(unitaire10).toBeLessThan(unitaire1);
  });

  it('le sous-total reste un multiple de 500 FCFA', () => {
    for (const quantite of [1, 2, 3, 5, 8, 10, 25]) {
      const d = devisTableau({ formatId: '50x70', support: 'chassis', quantite });
      expect(d.sousTotalFcfa % 500, `quantité ${quantite}`).toBe(0);
    }
  });
});

describe('délais', () => {
  it('une toile seule part plus vite qu’un tableau monté, et jamais plus de 3 jours', () => {
    expect(devisTableau({ formatId: '40x60', support: 'toile-seule', quantite: 1 }).delaiJours).toBe(1);
    expect(devisTableau({ formatId: '40x60', support: 'chassis', quantite: 1 }).delaiJours).toBe(2);
    for (const quantite of [1, 5, 20, 50]) {
      for (const support of ['chassis', 'toile-seule'] as const) {
        const d = devisTableau({ formatId: '40x60', support, quantite });
        expect(d.delaiJours).toBeGreaterThanOrEqual(1);
        expect(d.delaiJours).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('conseil de format selon la photo', () => {
  it('calcule la densité sur les dimensions physiques du format', () => {
    const f = formatParId('20x30')!;
    // 1000 px sur 20 cm = 1000 / (20/2,54) = 127 dpi ; sur 30 cm = 84,7 dpi
    expect(Math.round(dpiPourFormat(1000, 1000, f))).toBe(85);
  });

  it('conseille le plus grand format qui tient la densité, jamais au-delà', () => {
    // Photo de 12 Mpx (3000 × 4000) : 40 × 60 passe (≈169 dpi), 50 × 70 non (≈145 dpi)
    const conseil = conseilFormat(3000, 4000);
    expect(conseil.recommande.id).toBe('40x60');
    expect(conseil.tropPetite).toBe(false);
    expect(conseil.dpi).toBeGreaterThanOrEqual(150);
    const suivant = FORMATS[FORMATS.findIndex((f) => f.id === '40x60') + 1];
    expect(dpiPourFormat(3000, 4000, suivant)).toBeLessThan(150);
  });

  it('une photo de téléphone plafonne sur un petit format', () => {
    // 1200 × 1600 (2 Mpx) : seul 20 × 30 reste au-dessus de 90 dpi
    const conseil = conseilFormat(1200, 1600);
    expect(conseil.recommande.id).toBe('20x30');
  });

  it('signale une photo trop petite pour tout format', () => {
    const conseil = conseilFormat(300, 400);
    expect(conseil.tropPetite).toBe(true);
    expect(conseil.message).toContain('trop petite');
  });
});

describe('cadrage dans le mockup', () => {
  it('respecte le ratio du format, sans déformer', () => {
    for (const f of FORMATS) {
      const zone = zonePourFormat(f);
      expect(zone.w / zone.h).toBeCloseTo(f.largeurCm / f.hauteurCm, 6);
    }
  });

  it('tient dans le cadre d’affichage et reste centré', () => {
    for (const f of FORMATS) {
      const zone = zonePourFormat(f);
      expect(zone.x).toBeGreaterThanOrEqual(CADRE_AFFICHAGE.x - 1e-9);
      expect(zone.y).toBeGreaterThanOrEqual(CADRE_AFFICHAGE.y - 1e-9);
      expect(zone.x + zone.w).toBeLessThanOrEqual(CADRE_AFFICHAGE.x + CADRE_AFFICHAGE.w + 1e-9);
      expect(zone.y + zone.h).toBeLessThanOrEqual(CADRE_AFFICHAGE.y + CADRE_AFFICHAGE.h + 1e-9);
      const centreX = zone.x + zone.w / 2;
      const centreY = zone.y + zone.h / 2;
      expect(centreX).toBeCloseTo(CADRE_AFFICHAGE.x + CADRE_AFFICHAGE.w / 2, 6);
      expect(centreY).toBeCloseTo(CADRE_AFFICHAGE.y + CADRE_AFFICHAGE.h / 2, 6);
    }
  });

  it('un format paysage s’affiche en paysage', () => {
    const f = formatParId('40x60')!;
    const portrait = zonePourFormat(f, 'portrait');
    const paysage = zonePourFormat(f, 'paysage');
    expect(portrait.h).toBeGreaterThan(portrait.w);
    expect(paysage.w).toBeGreaterThan(paysage.h);
    expect(portrait.w / portrait.h).toBeCloseTo(40 / 60, 6);
    expect(paysage.w / paysage.h).toBeCloseTo(60 / 40, 6);
    // Le cadre d'affichage étant presque carré, la version paysage occupe moins de surface :
    // elle est bridée par la largeur disponible, pas par la hauteur.
    expect(paysage.w).toBeCloseTo(CADRE_AFFICHAGE.w, 6);
    expect(paysage.y + paysage.h).toBeLessThanOrEqual(CADRE_AFFICHAGE.y + CADRE_AFFICHAGE.h + 1e-9);
  });
});
