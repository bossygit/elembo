import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  DEFAULT_PRODUCT_ID,
  getPrintArea,
  getProductById,
  resolveModelUrl,
  validateProduct,
} from '../src/lib/products/catalog';
import type { Product } from '../src/lib/products/catalog';

const tshirt = getProductById(DEFAULT_PRODUCT_ID)!;

function clone(): Product {
  return JSON.parse(JSON.stringify(tshirt));
}

describe('catalogue 3D', () => {
  it('contient le T-shirt de référence', () => {
    expect(tshirt.id).toBe('tshirt-basic');
    expect(tshirt.modelUrl).toBe('/models/tshirt/tshirt.glb');
  });

  it('chaque produit du catalogue est valide', () => {
    for (const product of CATALOG) {
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

  it('refuse une zone qui sort de la texture', () => {
    const bad = clone();
    bad.printAreas.front!.x = 0.8;
    bad.printAreas.front!.w = 0.4;
    expect(validateProduct(bad).errors.join(' ')).toMatch(/sort de la texture/);
  });

  it('refuse une zone dont la conversion pixels → cm n’est pas isotrope', () => {
    const bad = clone();
    bad.printAreas.front!.cmWidth = 40; // 40/30 ≠ 0,42×50 / 0,5×60
    const { ok, errors } = validateProduct(bad);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toMatch(/isotrope/);
  });

  it('refuse une face incohérente entre la clé et le champ side', () => {
    const bad = clone();
    bad.printAreas.front!.side = 'back';
    expect(validateProduct(bad).errors.join(' ')).toMatch(/side incohérent/);
  });
});
