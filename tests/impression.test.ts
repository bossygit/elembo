// Fichier d'impression d'un tableau : la géométrie doit correspondre EXACTEMENT à ce qui est
// payé et à ce que le prestataire doit fabriquer. L'erreur coûteuse ici n'est pas visible à
// l'écran : un fichier au format fini ne permet pas de monter un châssis (il manque 8 cm de
// toile dans chaque direction), et un aperçu (avec le décor de la pièce) ne doit jamais servir
// à imprimer.

import { describe, expect, it } from 'vitest';

import { TARIFS, formatParId } from '../src/lib/products/tableaux';
import {
  DPI_IMPRESSION,
  dimensionsImprimeesCm,
  ficheFichierImpression,
  ficheTexte,
  rectVisuelPx,
  tailleFichierPx,
} from '../src/lib/products/impression';

const f40x60 = formatParId('40x60')!;
const f20x30 = formatParId('20x30')!;

describe('surface réellement imprimée', () => {
  it('une toile seule s’imprime au format fini exact', () => {
    expect(dimensionsImprimeesCm(f40x60, 'toile-seule')).toEqual({ w: 40, h: 60 });
  });

  it('un tableau monté s’imprime avec le débord nécessaire à l’enveloppe du châssis', () => {
    const d = dimensionsImprimeesCm(f40x60, 'chassis');
    expect(d).toEqual({ w: 40 + 2 * TARIFS.debordChassisCm, h: 60 + 2 * TARIFS.debordChassisCm });
    expect(d.w).toBeGreaterThan(f40x60.largeurCm); // sans ce débord, pas de montage possible
  });

  it('la surface imprimée d’un tableau monté est celle qui est facturée', () => {
    // Cohérence tarif ↔ production : le prix est calculé sur la surface imprimée (débord compris).
    // Si l'un des deux change sans l'autre, on facture une surface qu'on n'imprime pas (ou
    // l'inverse) : ce testé-là le rend impossible.
    const { w, h } = dimensionsImprimeesCm(f40x60, 'chassis');
    const surfaceFactureeCm2 = (w * h) / 10_000;
    expect(surfaceFactureeCm2).toBeCloseTo((48 * 68) / 10_000, 6);
  });
});

describe('taille du fichier', () => {
  it('est calculée sur la surface imprimée à 150 dpi', () => {
    expect(tailleFichierPx(dimensionsImprimeesCm(f40x60, 'toile-seule'))).toEqual({ w: 2362, h: 3543 });
    expect(tailleFichierPx(dimensionsImprimeesCm(f40x60, 'chassis'))).toEqual({ w: 2835, h: 4016 });
    expect(DPI_IMPRESSION).toBe(150);
  });

  it('le fichier d’un tableau monté est plus grand que celui d’une toile seule', () => {
    const seule = tailleFichierPx(dimensionsImprimeesCm(f40x60, 'toile-seule'));
    const monte = tailleFichierPx(dimensionsImprimeesCm(f40x60, 'chassis'));
    expect(monte.w).toBeGreaterThan(seule.w);
    expect(monte.h).toBeGreaterThan(seule.h);
  });
});

describe('place du visuel dans le fichier', () => {
  it('bord galerie : le visuel couvre tout le fichier (il se prolonge sur les côtés)', () => {
    const fichier = tailleFichierPx(dimensionsImprimeesCm(f40x60, 'chassis'));
    expect(rectVisuelPx({ format: f40x60, support: 'chassis', bord: 'galerie' })).toEqual({
      x: 0,
      y: 0,
      w: fichier.w,
      h: fichier.h,
    });
  });

  it('bord encadrement : le visuel occupe la face, les débords restent unis', () => {
    const fichier = tailleFichierPx(dimensionsImprimeesCm(f40x60, 'chassis'));
    const rect = rectVisuelPx({ format: f40x60, support: 'chassis', bord: 'encadrement' });
    const debordPx = Math.round((TARIFS.debordChassisCm / 2.54) * DPI_IMPRESSION);
    expect(rect.x).toBe(debordPx);
    expect(rect.y).toBe(debordPx);
    expect(rect.w).toBe(fichier.w - 2 * debordPx);
    expect(rect.h).toBe(fichier.h - 2 * debordPx);
    // la face centrale correspond bien au format fini, à un pixel près d'arrondi
    const faceW = Math.round((f40x60.largeurCm / 2.54) * DPI_IMPRESSION);
    expect(Math.abs(rect.w - faceW)).toBeLessThanOrEqual(1);
  });

  it('toile seule : le visuel couvre tout le fichier, sans débord', () => {
    const fichier = tailleFichierPx(dimensionsImprimeesCm(f40x60, 'toile-seule'));
    const rect = rectVisuelPx({ format: f40x60, support: 'toile-seule', bord: 'galerie' });
    expect(rect).toEqual({ x: 0, y: 0, w: fichier.w, h: fichier.h });
  });
});

describe('fiche destinée à l’atelier', () => {
  it('nomme le fichier de production de façon explicite et non ambiguë', () => {
    const fiche = ficheFichierImpression({
      commande: 'ELB-20261008-1700-AA',
      format: f40x60,
      support: 'chassis',
      bord: 'galerie',
    });
    expect(fiche.fichier).toBe('ELB-20261008-1700-AA-IMPRESSION-40x60-chassis.png');
    expect(fiche.fichier).toContain('IMPRESSION');
    expect(fiche.fichier).toContain('chassis');
    expect(fiche.fichier).not.toContain('mockup');
  });

  it('distingue sans ambiguïté la toile seule du montage sur châssis', () => {
    const seule = ficheFichierImpression({ commande: 'C', format: f20x30, support: 'toile-seule', bord: 'galerie' });
    const monte = ficheFichierImpression({ commande: 'C', format: f20x30, support: 'chassis', bord: 'galerie' });
    expect(seule.consigne).toMatch(/SEULE/);
    expect(seule.consigne).toMatch(/ne pas monter/i);
    expect(monte.consigne).toMatch(/MONTÉE/);
    expect(monte.largeurCm).toBeGreaterThan(seule.largeurCm);
  });

  it('rappelle de ne jamais imprimer depuis l’aperçu', () => {
    const fiche = ficheFichierImpression({ commande: 'C', format: f20x30, support: 'chassis', bord: 'encadrement' });
    const texte = ficheTexte([fiche], ['COMMANDE C', 'Tableau 20 × 30 cm']);
    expect(texte).toContain('PRODUCTION');
    expect(texte).toMatch(/jamais imprimer depuis l’aperçu/i);
    expect(texte).toContain('20 × 30 cm');
  });
});
