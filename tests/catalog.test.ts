import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  DEFAULT_PRODUCT_ID,
  PLACEHOLDER_PRODUCT,
  decalFrame,
  getPrintArea,
  getProductById,
  resolveModelUrl,
  validateProduct,
} from '../src/lib/products/catalog';
import type { Product } from '../src/lib/products/catalog';
import { compositionSize } from '../src/lib/canvas/design-canvas';

// Produit commercial : modèle fournisseur, visuel projeté (technique 'decal').
const tshirt = getProductById(DEFAULT_PRODUCT_ID)!;
// Produit de démonstration : placeholder avec panneaux nommés (technique 'uv').
const demo = getProductById(PLACEHOLDER_PRODUCT.id)!;

const clone = (p: Product = tshirt): Product => JSON.parse(JSON.stringify(p));

describe('catalogue 3D', () => {
  it('contient le T-shirt fournisseur en produit par défaut', () => {
    expect(tshirt.id).toBe('tshirt-basic');
    expect(tshirt.modelUrl).toBe('/models/tshirt/tshirt.glb');
    expect(tshirt.technique).toBe('decal');
    expect(tshirt.unitToCm).toBe(2.54);
  });

  it('expose aussi le produit de démonstration (technique uv)', () => {
    expect(PLACEHOLDER_PRODUCT.technique).toBe('uv');
    expect(PLACEHOLDER_PRODUCT.modelUrl).toBe('/models/tshirt/tshirt-placeholder.glb');
  });

  it('chaque produit du catalogue est valide', () => {
    for (const product of [PLACEHOLDER_PRODUCT, ...CATALOG]) {
      const { ok, errors } = validateProduct(product);
      expect(ok, `${product.id} : ${errors.join(' | ')}`).toBe(true);
    }
  });

  it('expose une zone avant et une zone arrière', () => {
    expect(getPrintArea(tshirt, 'front')).not.toBeNull();
    expect(getPrintArea(tshirt, 'back')).not.toBeNull();
    expect(getPrintArea(tshirt, 'front')!.side).toBe('front');
  });

  it('renvoie null pour un produit inexistant', () => {
    expect(getPrintArea(undefined, 'front')).toBeNull();
    expect(getProductById('inexistant')).toBeUndefined();
  });

  it('préfixe le chemin du modèle avec le basePath du déploiement', () => {
    expect(resolveModelUrl(tshirt, '')).toBe('/models/tshirt/tshirt.glb');
    expect(resolveModelUrl(tshirt, '/elembo')).toBe('/elembo/models/tshirt/tshirt.glb');
  });

  it('refuse un modelUrl hors de /models ou non .glb', () => {
    const bad = clone();
    bad.modelUrl = 'https://exemple.com/tshirt.gltf';
    const { ok, errors } = validateProduct(bad);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toMatch(/models/);
    expect(errors.join(' ')).toMatch(/glb/);
  });

  it('refuse un produit sans couleur ou avec un hex invalide', () => {
    const noColors = clone();
    noColors.colors = [];
    expect(validateProduct(noColors).ok).toBe(false);

    const badHex = clone();
    badHex.colors = [{ name: 'Bleu', hex: 'bleu' }];
    expect(validateProduct(badHex).errors.join(' ')).toMatch(/hex invalide/);
  });

  it('refuse une face incohérente entre la clé et le champ side', () => {
    const bad = clone();
    bad.printAreas.front!.side = 'back';
    expect(validateProduct(bad).errors.join(' ')).toMatch(/side incohérent/);
  });

  describe('technique uv (panneaux du modèle)', () => {
    it('refuse une zone qui sort de la texture', () => {
      const bad = clone(demo);
      bad.printAreas.front!.x = 0.8;
      bad.printAreas.front!.w = 0.4;
      expect(validateProduct(bad).errors.join(' ')).toMatch(/sort de la texture/);
    });

    it('refuse une conversion texture → cm non isotrope', () => {
      const bad = clone(demo);
      bad.printAreas.front!.cmWidth = 40; // 40/30 ≠ (0,42×50) / (0,5×60)
      const { ok, errors } = validateProduct(bad);
      expect(ok).toBe(false);
      expect(errors.join(' ')).toMatch(/isotrope/);
    });

    it('exige les dimensions du panneau', () => {
      const bad = clone(demo);
      delete bad.panel;
      expect(validateProduct(bad).errors.join(' ')).toMatch(/panel/);
    });
  });

  describe('technique decal (visuel projeté)', () => {
    it('exige une zone qui couvre toute la texture du décalque', () => {
      const bad = clone();
      bad.printAreas.front!.w = 0.5;
      expect(validateProduct(bad).errors.join(' ')).toMatch(/couvrir toute la texture/);
    });

    it('exige un cadre de projection complet', () => {
      const bad = clone();
      delete bad.printAreas.front!.projection;
      expect(validateProduct(bad).errors.join(' ')).toMatch(/projection incomplète/);
    });

    it('exige unitToCm pour convertir la zone en unités du modèle', () => {
      const bad = clone();
      delete bad.unitToCm;
      expect(validateProduct(bad).errors.join(' ')).toMatch(/unitToCm/);
    });

    it('refuse une zone dont la technique ne correspond pas au produit', () => {
      const bad = clone();
      bad.printAreas.front!.technique = 'uv';
      expect(validateProduct(bad).errors.join(' ')).toMatch(/technique uv ≠ produit decal/);
    });

    it('convertit les centimètres en unités du modèle', () => {
      const frame = decalFrame(tshirt.printAreas.front!, tshirt.unitToCm)!;
      expect(frame.width).toBeCloseTo(21 / 2.54, 3); // ≈ 8,27 unités
      expect(frame.height).toBeCloseTo(30 / 2.54, 3);
      expect(frame.depth).toBeGreaterThan(1);
      expect(frame.center).toHaveLength(3);
    });

    it('place le cadre arrière de l’autre côté du vêtement (rotation π)', () => {
      const front = decalFrame(tshirt.printAreas.front!, tshirt.unitToCm)!;
      const back = decalFrame(tshirt.printAreas.back!, tshirt.unitToCm)!;
      expect(front.center[2]).toBeGreaterThan(0);
      expect(back.center[2]).toBeLessThan(0);
      expect(front.rotationY).toBe(0);
      expect(Math.abs(back.rotationY)).toBeCloseTo(Math.PI, 6);
    });
  });

  describe('espace de composition', () => {
    it('est carré pour les panneaux uv', () => {
      const space = compositionSize(getPrintArea(demo, 'front')!, 1000);
      expect(space).toEqual({ width: 1000, height: 1000 });
    });

    it('suit le format de la zone pour un décalque (sinon le visuel serait étiré)', () => {
      const space = compositionSize(getPrintArea(tshirt, 'front')!, 1024);
      expect(space.width).toBe(1024);
      expect(space.height).toBe(Math.round(1024 * (30 / 21))); // A4 portrait
    });
  });
});
