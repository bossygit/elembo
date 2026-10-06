import { describe, it, expect } from 'vitest';
import {
  DELIVERY,
  buildProductionSheet,
  deliveryDays,
  deliveryOption,
  facesToProduce,
  formatFcfa,
  makeReference,
  orderTotals,
  placementCm,
  productionSheetText,
  totalQuantity,
} from '../src/lib/order/order';
import type { SizeLine } from '../src/lib/order/order';
import { CATALOG, getPrintArea, getProductById } from '../src/lib/products/catalog';
import { compositionSize } from '../src/lib/canvas/design-canvas';
import type { Measurer } from '../src/lib/canvas/design-canvas';
import type { ImageElement, TextElement } from '../src/types/configurator';
import { DEFAULT_FONT_ID } from '../src/lib/fonts';

const mesureur: Measurer = (text, font) => {
  const taille = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  return text.length * taille * 0.6;
};

const product = getProductById(CATALOG[0].id)!;
const AREA = getPrintArea(product, 'front')!;

function texte(patch: Partial<TextElement> = {}): TextElement {
  return {
    id: 'text-001',
    type: 'text',
    content: 'CONGO',
    fontId: DEFAULT_FONT_ID,
    fontSize: 100,
    color: '#1A1A1A',
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
    width: 1200,
    height: 900,
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

const LIGNES: SizeLine[] = [
  { size: 'M', quantity: 2 },
  { size: 'L', quantity: 3 },
];

describe('livraison', () => {
  it('facture 1 000 FCFA pour Brazzaville', () => {
    expect(deliveryOption('brazzaville').feeFcfa).toBe(1000);
  });

  it('facture 2 000 FCFA pour Pointe-Noire', () => {
    expect(deliveryOption('pointe-noire').feeFcfa).toBe(2000);
  });

  it('aucune ville livrée n’affiche un tarif non arbitré', () => {
    // L'invariant du projet : un montant qui n'est pas arbitré doit manquer (null) plutôt
    // qu'être inventé. Ce test échoue si une ville est ajoutée sans tarif.
    for (const ville of DELIVERY) {
      expect(ville.feeFcfa).not.toBeNull();
      expect(ville.feeFcfa ?? 0).toBeGreaterThan(0);
    }
  });

  it('annonce un délai qui varie avec la quantité, sans jamais dépasser 3 jours', () => {
    expect(deliveryDays(1)).toBe(1);
    expect(deliveryDays(5)).toBe(1);
    expect(deliveryDays(6)).toBe(2);
    expect(deliveryDays(20)).toBe(2);
    expect(deliveryDays(21)).toBe(3);
    expect(deliveryDays(500)).toBe(3);
    for (const q of [1, 3, 10, 50, 200, 1000]) expect(deliveryDays(q)).toBeLessThanOrEqual(3);
    for (const ville of DELIVERY) {
      for (const q of [1, 100, 999]) expect(deliveryDays(q, ville.city)).toBeLessThanOrEqual(ville.maxDays);
    }
  });
});

describe('récapitulatif de commande (FCFA)', () => {
  it('compte les pièces toutes tailles confondues', () => {
    expect(totalQuantity(LIGNES)).toBe(5);
    expect(totalQuantity([{ size: 'M', quantity: 0 }, { size: 'L', quantity: 4 }])).toBe(4);
  });

  it('calcule sous-total et total avec la livraison', () => {
    const t = orderTotals({ lines: LIGNES, unitPriceFcfa: 5000, city: 'brazzaville' });
    expect(t.quantity).toBe(5);
    expect(t.itemsSubtotalFcfa).toBe(25000);
    expect(t.shippingFcfa).toBe(1000);
    expect(t.totalFcfa).toBe(26000);
    expect(t.blockedBy).toEqual([]);
  });

  it('bloque tant que le prix unitaire ou les frais ne sont pas définis', () => {
    const sansPrix = orderTotals({ lines: LIGNES, unitPriceFcfa: null, city: 'brazzaville' });
    expect(sansPrix.totalFcfa).toBeNull();
    expect(sansPrix.blockedBy.join(' ')).toContain('prix unitaire');

    const vide = orderTotals({ lines: [], unitPriceFcfa: 5000, city: 'brazzaville' });
    expect(vide.blockedBy.join(' ')).toContain('quantité');
  });

  it('totalise la commande pour Pointe-Noire avec ses frais', () => {
    const pn = orderTotals({ lines: LIGNES, unitPriceFcfa: 5000, city: 'pointe-noire' });
    expect(pn.shippingFcfa).toBe(2000);
    expect(pn.itemsSubtotalFcfa).toBe(25000);
    expect(pn.totalFcfa).toBe(27000);
    expect(pn.blockedBy).toEqual([]);
  });

  it('formate les montants en FCFA', () => {
    expect(formatFcfa(26000)).toBe('26 000 FCFA');
    expect(formatFcfa(null)).toBe('à confirmer');
  });
});

describe('positionnement transmis à l’imprimeur', () => {
  it('exprime la position en centimètres depuis le coin haut-gauche de la zone', () => {
    const space = compositionSize(AREA);
    const p = placementCm(texte({ fontSize: 100 }), AREA, mesureur, space);
    // Élément centré : son centre tombe au milieu de la zone (10,5 × 15 cm).
    expect(p.centreXCm).toBeCloseTo(AREA.cmWidth / 2, 1);
    expect(p.centreYCm).toBeCloseTo(AREA.cmHeight / 2, 1);
    expect(p.largeurCm).toBeGreaterThan(0);
    expect(p.hauteurCm).toBeGreaterThan(0);
    expect(p.rogne).toBe(false);
  });

  it('décrit le texte : contenu, police, corps en cm, couleur', () => {
    const space = compositionSize(AREA);
    const p = placementCm(texte({ content: 'CONGO\n2026', fontId: 'bangers', fontSize: 120, color: '#C62828' }), AREA, mesureur, space);
    expect(p.texte?.contenu).toBe('CONGO\n2026');
    expect(p.texte?.police).toBe('Bangers');
    expect(p.texte?.couleur).toBe('#C62828');
    expect(p.texte?.corpsCm).toBeGreaterThan(0);
    expect(p.texte?.corpsCm).toBeLessThan(AREA.cmHeight);
  });

  it('décrit l’image : nom et résolution effective', () => {
    const space = compositionSize(AREA);
    const p = placementCm(image(), AREA, mesureur, space);
    expect(p.image?.nom).toBe('logo.png');
    expect(p.image?.dpiEstime).toBeGreaterThan(0);
  });

  it('signale un élément qui déborde de la zone', () => {
    const space = compositionSize(AREA);
    const enorme = placementCm(texte({ fontSize: 400, content: 'UN TEXTE ÉNORME QUI DÉBORDE' }), AREA, mesureur, space);
    expect(enorme.rogne).toBe(true);
  });
});

describe('fiche de production', () => {
  const draft = {
    reference: 'ELB-20261001-1200-AB',
    product,
    color: '#FFFFFF',
    lines: LIGNES,
    city: 'brazzaville' as const,
    unitPriceFcfa: 5000,
    elements: [texte({ content: 'CONGO' }), image({ side: 'back' })],
    measure: mesureur,
  };

  it('ne produit que les faces réellement personnalisées', () => {
    expect(facesToProduce({ elements: [] })).toEqual([]);
    expect(facesToProduce({ elements: [texte()] })).toEqual(['front']);
    expect(facesToProduce({ elements: [texte(), image({ side: 'back' })] })).toEqual(['front', 'back']);
    // Un élément masqué ne justifie pas une face.
    expect(facesToProduce({ elements: [texte(), image({ side: 'back', visible: false })] })).toEqual(['front']);
  });

  it('décrit faces, fichiers, quantité, livraison et montant', () => {
    const sheet = buildProductionSheet(draft, new Date('2026-10-01T12:00:00Z'));
    expect(sheet.commande).toBe('ELB-20261001-1200-AB');
    expect(sheet.faces.map((f) => f.side)).toEqual(['front', 'back']);
    expect(sheet.faces[0].fichier).toBe('ELB-20261001-1200-AB-avant.png');
    expect(sheet.faces[1].fichier).toBe('ELB-20261001-1200-AB-arriere.png');
    expect(sheet.faces[0].pixels).toEqual({ w: 2480, h: 3543 }); // 21 × 30 cm à 300 dpi
    expect(sheet.faces[0].zoneCm).toEqual({ w: 21, h: 30 });
    expect(sheet.tailleEtQuantite.total).toBe(5);
    expect(sheet.livraison).toMatchObject({ ville: 'Brazzaville', fraisFcfa: 1000, delaiJours: 1 });
    expect(sheet.paiement).toMatchObject({ moyen: 'MTN Mobile Money (MoMo)', devise: 'FCFA', montantFcfa: 26000 });
    expect(sheet.consignes.length).toBeGreaterThan(2);
  });

  it('rend une fiche texte exploitable par l’atelier', () => {
    const sheet = buildProductionSheet(draft);
    const txt = productionSheetText(sheet);
    expect(txt).toContain('FICHE DE PRODUCTION');
    expect(txt).toContain('CONGO');
    expect(txt).toContain('Montserrat');
    expect(txt).toContain('cm du bord gauche');
    expect(txt).toContain('Brazzaville');
    expect(txt).toContain('1 000 FCFA');
    expect(txt).toContain('26 000 FCFA');
    expect(txt).toContain('DTF');
  });

  it('génère une référence de commande lisible et unique', () => {
    const refs = new Set(Array.from({ length: 40 }, () => makeReference(new Date('2026-10-01T09:30:00'))));
    expect(refs.size).toBeGreaterThan(30);
    for (const r of refs) expect(r).toMatch(/^ELB-20261001-0930-[A-Z0-9]{2}$/);
  });
});

describe('le catalogue permet de commander', () => {
  it('chaque produit vendable a un prix unitaire en FCFA', () => {
    for (const p of CATALOG) {
      expect(typeof p.priceFcfa, `prix manquant pour ${p.id}`).toBe('number');
      expect(p.priceFcfa).toBeGreaterThan(0);
    }
  });

  it('une pièce du produit par défaut donne un total validable', () => {
    const t = orderTotals({ lines: [{ size: 'M', quantity: 1 }], unitPriceFcfa: product.priceFcfa ?? null, city: 'brazzaville' });
    expect(t.blockedBy).toEqual([]);
    expect(t.totalFcfa).toBe((product.priceFcfa ?? 0) + 1000);
  });
});
