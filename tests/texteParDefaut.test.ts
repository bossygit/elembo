// Texte ajouté par défaut : il doit tenir dans la zone imprimable de chaque produit, de chaque
// procédé et de chaque zone. La taille de police s'exprime dans la largeur de la texture,
// souvent bien plus grande que la zone (T-shirt : 63 cm pour 21 cm) : sans ajustement,
// « VOTRE TEXTE » débordait et aurait été rogné à l'impression.

import { beforeEach, describe, expect, it } from 'vitest';
import { CATALOG, DEFAULT_PRODUCT_ID, getPrintArea, getProductById, productSides } from '../src/lib/products/catalog';
import { profilsDuProduit } from '../src/lib/products/production';
import { DEFAULT_TEXT, useConfiguratorStore } from '../src/stores/configurator-store';
import { compositionSize, elementOverflow, roughMeasurer, tailleTexteAjustee } from '../src/lib/canvas/design-canvas';
import type { TextElement } from '../src/types/configurator';

const store = () => useConfiguratorStore.getState();

describe('texte ajouté par défaut', () => {
  beforeEach(() => {
    store().reset();
    store().setProduct(DEFAULT_PRODUCT_ID);
  });

  it('tient dans la zone, pour chaque produit, procédé et zone', () => {
    for (const product of CATALOG) {
      const profils = product.technique === 'zones' ? profilsDuProduit(product) : [null];
      for (const profil of profils) {
        for (const side of productSides(product)) {
          store().reset();
          store().setProduct(product.id);
          if (profil) store().setProfile(profil.id);
          store().setSide(side);
          const id = store().addText();
          const el = store().elements.find((e) => e.id === id) as TextElement;
          const area = getPrintArea(getProductById(product.id), side, store().profileId);
          const { over } = elementOverflow(el, area, compositionSize(area!), roughMeasurer);
          expect(over, `${product.id} / ${profil?.id ?? '-'} / ${side} : texte de ${el.fontSize} px qui déborde`).toBe(false);
          expect(el.fontSize).toBeLessThanOrEqual(DEFAULT_TEXT.fontSize);
        }
      }
    }
  });

  it('est réduit sur la poitrine du T-shirt (zone de 21 cm dans une texture de 63 cm)', () => {
    const id = store().addText();
    const el = store().elements.find((e) => e.id === id) as TextElement;
    expect(el.fontSize).toBeLessThan(DEFAULT_TEXT.fontSize);
    expect(el.fontSize).toBeGreaterThan(20);
  });

  it('respecte une taille de police demandée explicitement', () => {
    const id = store().addText({ fontSize: 200 });
    expect((store().elements.find((e) => e.id === id) as TextElement).fontSize).toBe(200);
  });
});

describe('tailleTexteAjustee', () => {
  const area = { side: 'front' as const, technique: 'zones' as const, x: 0.25, y: 0.25, w: 0.5, h: 0.5, cmWidth: 10, cmHeight: 10 };
  const texte = { ...DEFAULT_TEXT, id: 't', type: 'text' as const, color: '#000000', x: 0, y: 0, scale: 1, rotation: 0, side: 'front' as const, z: 1, visible: true };

  it('ne grossit jamais un texte qui tient déjà', () => {
    expect(tailleTexteAjustee({ ...texte, content: 'A', fontSize: 40 }, area, 1024)).toBe(40);
  });

  it('réduit un texte trop large à 85 % de la largeur utile au plus', () => {
    const taille = tailleTexteAjustee(texte, area, 1024);
    expect(taille).toBeLessThan(DEFAULT_TEXT.fontSize);
    const largeur = roughMeasurer(texte.content, `700 ${taille}px x`, 0);
    expect(largeur).toBeLessThanOrEqual(512 * 0.97 * 0.85 + 1);
  });

  it('sans zone, garde la taille demandée', () => {
    expect(tailleTexteAjustee(texte, null, 1024)).toBe(DEFAULT_TEXT.fontSize);
  });
});
