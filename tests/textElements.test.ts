import { describe, it, expect } from 'vitest';
import {
  clampElement,
  compositionSize,
  elementBox,
  elementNaturalSize,
  elementRect,
  elementsOfSide,
  hitTest,
  nextElementId,
  nextZ,
  printAreaRect,
  rotatedBox,
  textBlockSize,
  textLines,
} from '../src/lib/canvas/design-canvas';
import type { Measurer } from '../src/lib/canvas/design-canvas';
import { CATALOG, getPrintArea, getProductById } from '../src/lib/products/catalog';
import type { ImageElement, Side, TextElement } from '../src/types/configurator';
import { DEFAULT_FONT_ID, FONTS, cssFont, fontById, fontByName, nearestWeight, resolveFont } from '../src/lib/fonts';

/** Mesureur déterministe : 10 px par caractère, quelle que soit la police. */
const mesureur: Measurer = (text) => text.length * 10;

const product = getProductById(CATALOG[0].id)!;
const AREA = getPrintArea(product, 'front')!;
const SPACE = compositionSize(AREA);

function texte(patch: Partial<TextElement> = {}): TextElement {
  return {
    id: 'text-001',
    type: 'text',
    content: 'CONGO',
    fontId: DEFAULT_FONT_ID,
    fontSize: 100,
    color: '#000000',
    fontWeight: 700,
    fontStyle: 'normal',
    letterSpacing: 0,
    lineHeight: 1.2,
    align: 'center',
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    side: 'front',
    z: 1,
    visible: true,
    ...patch,
  };
}

function image(patch: Partial<ImageElement> = {}): ImageElement {
  return {
    id: 'image-001',
    type: 'image',
    src: 'blob:test',
    name: 'logo.png',
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    side: 'front',
    z: 1,
    visible: true,
    ...patch,
  };
}

describe('texte : découpe et mesures', () => {
  it('respecte les retours à la ligne de l’utilisateur', () => {
    expect(textLines('CONGO\n2026')).toEqual(['CONGO', '2026']);
    expect(textLines('a\r\nb')).toEqual(['a', 'b']);
    expect(textLines('ligne\n\nvide')).toEqual(['ligne', '', 'vide']);
    expect(textLines('')).toEqual(['']);
  });

  it('mesure le bloc sur la ligne la plus large', () => {
    const el = texte({ content: 'AB\nABCD', fontSize: 100, lineHeight: 1.2 });
    const bloc = textBlockSize(el, mesureur, 1);
    expect(bloc.w).toBe(40); // « ABCD » × 10 px
    expect(bloc.h).toBe(2 * 100 * 1.2);
  });

  it('suit le facteur d’échelle de l’espace (aperçu 1024 → export 2048)', () => {
    const el = texte({ content: 'AB', fontSize: 100, lineHeight: 1.2 });
    // Une ligne de 100 px à interligne 1,2 : 120 px en espace d'aperçu, 240 px en export.
    expect(textBlockSize(el, mesureur, 1).h).toBe(120);
    expect(textBlockSize(el, mesureur, 2).h).toBe(240);
  });

  it('produit une chaîne ctx.font exploitable, italique comprise', () => {
    expect(cssFont({ fontId: 'bangers', fontSize: 100, fontWeight: 400, fontStyle: 'normal' })).toContain('100.00px');
    expect(cssFont({ fontId: 'bangers', fontSize: 100, fontWeight: 400, fontStyle: 'normal' })).toContain('Bangers');
    expect(cssFont({ fontId: 'bangers', fontSize: 50, fontWeight: 400, fontStyle: 'italic' }, 2)).toMatch(/^italic 400 100.00px/);
  });
});

describe('placement des éléments', () => {
  it('une image est ajustée en « contain » dans la zone, un texte garde sa taille', () => {
    const zone = printAreaRect(AREA, SPACE);
    const natImage = elementNaturalSize(image({ width: 800, height: 600 }), AREA, SPACE, mesureur);
    expect(natImage.fit).toBeCloseTo(Math.min(zone.w / 800, zone.h / 600), 6);

    const natTexte = elementNaturalSize(texte(), AREA, SPACE, mesureur);
    expect(natTexte.fit).toBe(1);
    expect(natTexte.w).toBe(50); // « CONGO » × 10 px
  });

  it('centre l’élément quand x et y valent 0', () => {
    const zone = printAreaRect(AREA, SPACE);
    const rect = elementRect(texte(), AREA, SPACE, mesureur);
    expect(rect.x + rect.w / 2).toBeCloseTo(zone.x + zone.w / 2, 5);
    expect(rect.y + rect.h / 2).toBeCloseTo(zone.y + zone.h / 2, 5);
  });

  it('déplace l’élément proportionnellement à la zone', () => {
    const zone = printAreaRect(AREA, SPACE);
    const centre = elementRect(texte({ x: 0.25, y: 0.1 }), AREA, SPACE, mesureur);
    expect(centre.x + centre.w / 2).toBeCloseTo(zone.x + zone.w / 2 + 0.25 * zone.w, 5);
    expect(centre.y + centre.h / 2).toBeCloseTo(zone.y + zone.h / 2 + 0.1 * zone.h, 5);
  });

  it('grossit l’élément avec son échelle', () => {
    const simple = elementRect(texte({ scale: 1 }), AREA, SPACE, mesureur);
    const double = elementRect(texte({ scale: 2 }), AREA, SPACE, mesureur);
    expect(double.w).toBeCloseTo(simple.w * 2, 5);
    expect(double.h).toBeCloseTo(simple.h * 2, 5);
  });

  it('la boîte englobante tient compte de la rotation', () => {
    const box = rotatedBox(100, 50, 90);
    expect(box.w).toBeCloseTo(50, 5);
    expect(box.h).toBeCloseTo(100, 5);
    const el = texte({ rotation: 45 });
    const droite = elementBox(el, AREA, SPACE, mesureur);
    const plate = elementBox(texte({ rotation: 0 }), AREA, SPACE, mesureur);
    expect(droite.w).toBeGreaterThan(plate.w);
  });
});

describe('bornage dans la zone d’impression', () => {
  it('ramène un texte poussé très loin à l’intérieur de la zone', () => {
    const zone = printAreaRect(AREA, SPACE);
    const borne = clampElement(texte({ x: 50, y: -50, fontSize: 60 }), AREA, SPACE, mesureur);
    const rect = elementRect(borne, AREA, SPACE, mesureur);
    expect(rect.x).toBeGreaterThanOrEqual(zone.x);
    expect(rect.x + rect.w).toBeLessThanOrEqual(zone.x + zone.w);
    expect(rect.y).toBeGreaterThanOrEqual(zone.y);
    expect(rect.y + rect.h).toBeLessThanOrEqual(zone.y + zone.h);
  });

  it('laisse une marge de sécurité : le texte ne colle pas au bord', () => {
    const zone = printAreaRect(AREA, SPACE);
    const borne = clampElement(texte({ x: 9, y: 0, fontSize: 60 }), AREA, SPACE, mesureur);
    const rect = elementRect(borne, AREA, SPACE, mesureur);
    const marge = zone.w * 0.015;
    expect(rect.x + rect.w).toBeLessThanOrEqual(zone.x + zone.w - marge + 0.5);
  });

  it('un élément plus grand que la zone peut glisser (ce qui dépasse est rogné)', () => {
    const borne = clampElement(texte({ x: 99, fontSize: 420, content: 'UN TEXTE IMMENSE' }), AREA, SPACE, mesureur);
    expect(borne.x).toBeGreaterThan(0);
  });

  it('borne la taille de police, l’interlettrage et la hauteur de ligne', () => {
    const borne = clampElement(texte({ fontSize: 5000, letterSpacing: 9, lineHeight: 9 }), AREA, SPACE, mesureur);
    expect(borne.fontSize).toBeLessThanOrEqual(420);
    expect(borne.letterSpacing).toBeLessThanOrEqual(0.6);
    expect(borne.lineHeight).toBeLessThanOrEqual(2.4);
  });

  it('tronque un contenu démesuré plutôt que de casser le rendu', () => {
    const borne = clampElement(texte({ content: 'A'.repeat(1000) }), AREA, SPACE, mesureur);
    expect(borne.content.length).toBe(240);
  });

  it('ne touche pas à la position si la face n’a pas de zone d’impression', () => {
    const el = texte({ x: 12 });
    expect(clampElement(el, null, SPACE, mesureur).x).toBe(12);
  });
});

describe('calques, sélection et numérotation', () => {
  const elements = [
    texte({ id: 'text-001', side: 'front', z: 1 }),
    texte({ id: 'text-002', side: 'front', z: 3 }),
    texte({ id: 'text-003', side: 'back', z: 2 }),
  ];

  it('ne retient que les éléments d’une face, du bas vers le haut', () => {
    expect(elementsOfSide(elements, 'front').map((e) => e.id)).toEqual(['text-001', 'text-002']);
    expect(elementsOfSide(elements, 'back').map((e) => e.id)).toEqual(['text-003']);
    expect(elementsOfSide(elements, 'back' as Side)).toHaveLength(1);
  });

  it('attrape le calque le plus haut en premier', () => {
    const empiles = [
      texte({ id: 'bas', z: 1, x: 0, y: 0 }),
      texte({ id: 'haut', z: 5, x: 0, y: 0 }),
    ];
    const centre = printAreaRect(AREA, SPACE);
    const touche = hitTest(empiles, AREA, SPACE, { x: centre.x + centre.w / 2, y: centre.y + centre.h / 2 }, mesureur);
    expect(touche?.id).toBe('haut');
  });

  it('ne renvoie rien hors de l’élément', () => {
    const coin = printAreaRect(AREA, SPACE);
    expect(hitTest([texte({ fontSize: 20 })], AREA, SPACE, { x: coin.x + 2, y: coin.y + 2 }, mesureur)).toBeNull();
  });

  it('ignore un élément masqué', () => {
    const zone = printAreaRect(AREA, SPACE);
    const centre = { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
    expect(hitTest([texte({ visible: false })], AREA, SPACE, centre, mesureur)).toBeNull();
  });

  it('numérote par type et empile au-dessus', () => {
    const base = [texte({ id: 'text-003', z: 2 }), image({ id: 'image-002', z: 5 })];
    expect(nextElementId(base, 'text')).toBe('text-004');
    expect(nextElementId(base, 'image')).toBe('image-003');
    expect(nextZ(base, 'front')).toBe(6);
  });
});

describe('polices du configurateur', () => {
  it('propose 12 à 20 familles, classées par usage', () => {
    expect(FONTS.length).toBeGreaterThanOrEqual(12);
    expect(FONTS.length).toBeLessThanOrEqual(20);
    for (const categorie of ['sans', 'display', 'script', 'serif']) {
      expect(FONTS.some((f) => f.category === categorie)).toBe(true);
    }
  });

  it('a des identifiants et des familles uniques', () => {
    expect(new Set(FONTS.map((f) => f.id)).size).toBe(FONTS.length);
    expect(new Set(FONTS.map((f) => f.name)).size).toBe(FONTS.length);
  });

  it('déclare une licence vérifiée pour chaque police (usage commercial)', () => {
    for (const font of FONTS) {
      expect(['OFL-1.1', 'Apache-2.0', 'UFL-1.0']).toContain(font.license);
      expect(font.licenseUrl).toMatch(/^https:\/\/raw\.githubusercontent\.com\/google\/fonts\//);
      expect(font.weights.length).toBeGreaterThan(0);
    }
  });

  it('résout une police par identifiant ou par nom, et retombe sur la première', () => {
    expect(fontById('bangers')?.name).toBe('Bangers');
    expect(fontByName('Bebas Neue')?.id).toBe('bebas-neue');
    expect(fontByName('Bebas Neue')?.id).toBe('bebas-neue');
    expect(resolveFont('inconnue').id).toBe(FONTS[0].id);
  });

  it('choisit la graisse disponible la plus proche', () => {
    const montserrat = fontById('montserrat')!;
    expect(nearestWeight(montserrat, 700)).toBe(700);
    expect(nearestWeight(montserrat, 500)).toBe(400);
    const anton = fontById('anton')!;
    expect(nearestWeight(anton, 700)).toBe(400);
  });
});
