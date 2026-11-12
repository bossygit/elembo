import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  DEFAULT_PRODUCT_ID,
  ELEMBO_TSHIRT_ZONES,
  PLACEHOLDER_PRODUCT,
  TSHIRT_FRONT,
  decalFrame,
  getPrintArea,
  getProductById,
  productSides,
  resolveModelUrl,
  validateProduct,
  zoneArea,
} from '../src/lib/products/catalog';
import type { Product } from '../src/lib/products/catalog';
import { compositionSize, productionTextureSize } from '../src/lib/canvas/design-canvas';
import { PROFILS, profilParId } from '../src/lib/products/production';
import { SIDE_LABELS, SIDES } from '../src/types/configurator';
import type { Side } from '../src/types/configurator';

// Produit commercial par défaut : modèle Elembo à cinq zones d'impression (technique 'zones').
const tshirt = getProductById(DEFAULT_PRODUCT_ID)!;
// Second produit : modèle fournisseur, visuel projeté (technique 'decal'), conservé pour
// vérifier que l'ancienne technique n'a pas régressé.
const decal = getProductById('tshirt-alt')!;
// Produit de démonstration : placeholder avec panneaux nommés (technique 'uv').
const demo = getProductById(PLACEHOLDER_PRODUCT.id)!;

const clone = (p: Product = tshirt): Product => JSON.parse(JSON.stringify(p));

describe('catalogue 3D', () => {
  it('charge le modèle Elembo à cinq zones comme produit par défaut', () => {
    expect(tshirt.id).toBe('tshirt-basic');
    expect(tshirt.modelUrl).toBe('/models/elembo-tshirt/elembo-tshirt.glb');
    expect(tshirt.technique).toBe('zones');
    expect(tshirt.fabricMaterials).toEqual(['FABRIC', 'FABRIC_RIB']);
    // Les noms de maillages sont ceux VÉRIFIÉS dans le GLB (tests/elemboModel.test.ts).
    expect(Object.values(tshirt.zones ?? {}).map((z) => z!.mesh)).toEqual([
      'TSHIRT_FRONT_PRINT',
      'TSHIRT_BACK_PRINT',
      'TSHIRT_LEFT_SLEEVE_PRINT',
      'TSHIRT_RIGHT_SLEEVE_PRINT',
      'TSHIRT_COLLAR_PRINT',
    ]);
    expect(tshirt.colors.map((c) => c.name)).toEqual([
      'Blanc',
      'Noir',
      'Gris',
      'Bleu marine',
      'Rouge',
      'Vert',
      'Jaune',
      'Orange Elembo',
    ]);
  });

  it('expose aussi les deux produits historiques', () => {
    expect(getProductById('tshirt-alt')?.technique).toBe('decal');
    expect(PLACEHOLDER_PRODUCT.technique).toBe('uv');
    expect(PLACEHOLDER_PRODUCT.modelUrl).toBe('/models/tshirt/tshirt-placeholder.glb');
  });

  it('chaque produit du catalogue est valide', () => {
    for (const product of [PLACEHOLDER_PRODUCT, ...CATALOG]) {
      const { ok, errors } = validateProduct(product);
      expect(ok, `${product.id} : ${errors.join(' | ')}`).toBe(true);
    }
  });

  it('expose les cinq zones du T-shirt Elembo', () => {
    expect(productSides(tshirt)).toEqual(['front', 'back', 'left-sleeve', 'right-sleeve', 'collar']);
    expect(productSides(decal)).toEqual(['front', 'back']);
    expect(SIDES.every((side) => SIDE_LABELS[side]?.length > 0)).toBe(true);
  });

  it('calcule des zones d’impression DANS la texture, selon le procédé', () => {
    const dtf = profilParId('dtf');
    const front = getPrintArea(tshirt, 'front', dtf.id)!;
    expect(front.technique).toBe('zones');
    expect(front.cmWidth).toBe(21);
    expect(front.cmHeight).toBe(30);
    expect(front.textureCm).toEqual({ w: 63.2, h: 79 });
    // La zone imprimable est un sous-rectangle de la texture, centré horizontalement.
    expect(front.x).toBeGreaterThan(0);
    expect(front.x + front.w).toBeLessThan(1);
    expect(front.y).toBeGreaterThan(0);

    const sublimation = profilParId('sublimation');
    const pleine = getPrintArea(tshirt, 'collar', sublimation.id)!;
    expect(pleine).toMatchObject({ x: 0, y: 0, w: 1, h: 1, cmWidth: 12, cmHeight: 6.7 });
  });

  it('place la zone imprimable sous le repère mesuré (col, tête de manche)', () => {
    // Creux du col avant à 11,85 cm du haut de la texture + 7 cm de marge DTF.
    const front = zoneArea(tshirt, 'front', profilParId('dtf'))!;
    expect(front.y * 79).toBeCloseTo(18.85, 1);
    // Manche : tête de manche à 1,08 cm + 6 cm de marge.
    const manche = zoneArea(tshirt, 'left-sleeve', profilParId('dtf'))!;
    expect(manche.y * 30).toBeCloseTo(7.08, 1);
    expect(manche.x + manche.w / 2).toBeCloseTo(0.5, 6);
  });

  it('ne sort jamais de la texture, même avec un procédé trop grand', () => {
    for (const profil of PROFILS) {
      for (const side of productSides(tshirt) as Side[]) {
        const area = zoneArea(tshirt, side, profil);
        if (!area) continue;
        expect(area.x).toBeGreaterThanOrEqual(-1e-9);
        expect(area.y).toBeGreaterThanOrEqual(-1e-9);
        expect(area.x + area.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(area.y + area.h).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('renvoie null pour un produit inexistant', () => {
    expect(getPrintArea(undefined, 'front')).toBeNull();
    expect(getProductById('inexistant')).toBeUndefined();
  });

  it('préfixe le chemin du modèle avec le basePath du déploiement', () => {
    expect(resolveModelUrl(tshirt, '')).toBe('/models/elembo-tshirt/elembo-tshirt.glb');
    expect(resolveModelUrl(tshirt, '/elembo')).toBe('/elembo/models/elembo-tshirt/elembo-tshirt.glb');
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

  describe('technique zones (modèle Elembo)', () => {
    it('exige les matériaux du tissu', () => {
      const bad = clone();
      delete bad.fabricMaterials;
      expect(validateProduct(bad).errors.join(' ')).toMatch(/matériaux du tissu/);
    });

    it('exige au moins une surface d’impression', () => {
      const bad = clone();
      bad.zones = {};
      expect(validateProduct(bad).errors.join(' ')).toMatch(/surface d’impression/);
    });

    it('exige des dimensions de texture positives', () => {
      const bad = clone();
      bad.zones!.front!.textureCm = { w: 0, h: 0 };
      expect(validateProduct(bad).errors.join(' ')).toMatch(/textureCm invalide/);
    });
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
      const bad = clone(decal);
      bad.printAreas.front!.w = 0.5;
      expect(validateProduct(bad).errors.join(' ')).toMatch(/couvrir toute la texture/);
    });

    it('exige un cadre de projection complet', () => {
      const bad = clone(decal);
      delete bad.printAreas.front!.projection;
      expect(validateProduct(bad).errors.join(' ')).toMatch(/projection incomplète/);
    });

    it('exige unitToCm pour convertir la zone en unités du modèle', () => {
      const bad = clone(decal);
      delete bad.unitToCm;
      expect(validateProduct(bad).errors.join(' ')).toMatch(/unitToCm/);
    });

    it('refuse une zone dont la technique ne correspond pas au produit', () => {
      const bad = clone(decal);
      bad.printAreas.front!.technique = 'uv';
      expect(validateProduct(bad).errors.join(' ')).toMatch(/technique uv ≠ produit decal/);
    });

    it('convertit les centimètres en unités du modèle', () => {
      const frame = decalFrame(TSHIRT_FRONT, 100)!;
      expect(frame.width).toBeCloseTo(21 / 100, 3);
      expect(frame.height).toBeCloseTo(30 / 100, 3);
      expect(frame.depth).toBeGreaterThan(0.01);
      expect(frame.center).toHaveLength(3);
    });

    it('place le cadre arrière de l’autre côté du vêtement (rotation π)', () => {
      const frame = decalFrame(decal.printAreas.back!, decal.unitToCm)!;
      expect(frame.center[2]).toBeLessThan(0);
      expect(Math.abs(frame.rotationY)).toBeCloseTo(Math.PI, 6);
    });
  });

  describe('espace de composition', () => {
    it('est carré pour les panneaux uv', () => {
      const space = compositionSize(getPrintArea(demo, 'front')!, 1000);
      expect(space).toEqual({ width: 1000, height: 1000 });
    });

    it('suit le format de la texture de la zone (sinon le visuel serait étiré)', () => {
      const space = compositionSize(getPrintArea(tshirt, 'front', 'dtf')!, 1024);
      expect(space.width).toBe(1024);
      // Texture 63,2 × 79 cm : ratio du VÊTEMENT, pas celui du rectangle imprimable.
      expect(space.height).toBe(Math.round(1024 * (79 / 63.2)));
      expect(space.height).toBe(1280);
    });

    it('suit le format physique pour un décalque', () => {
      const area = getPrintArea(decal, 'front')!;
      const space = compositionSize(area, 1024);
      expect(space).toEqual({ width: 1024, height: Math.round(1024 * (area.cmHeight / area.cmWidth)) });
    });
  });

  describe('fichiers de production', () => {
    it('calcule la résolution à la densité du procédé', () => {
      const area = getPrintArea(tshirt, 'front', 'dtf')!;
      expect(productionTextureSize(area, 300)).toEqual({ w: 2480, h: 3543 });
      expect(productionTextureSize(area, 150)).toEqual({ w: 1240, h: 1772 });
    });

    it('plafonne la taille en conservant les proportions', () => {
      // Sublimation intégrale : la pièce entière à 150 dpi dépasse le garde-fou 4096 px.
      const area = getPrintArea(tshirt, 'front', 'sublimation')!;
      const pixels = productionTextureSize(area, 150);
      expect(Math.max(pixels.w, pixels.h)).toBe(4096);
      expect(pixels.w / pixels.h).toBeCloseTo(area.cmWidth / area.cmHeight, 2);
    });
  });

  it('les noms de zones du modèle restent conformes au catalogue', () => {
    for (const zone of Object.values(ELEMBO_TSHIRT_ZONES)) {
      expect(zone!.mesh).toMatch(/^TSHIRT_[A-Z_]+_PRINT$/);
      expect(zone!.textureCm.w).toBeGreaterThan(0);
      expect(zone!.textureCm.h).toBeGreaterThan(0);
    }
  });
});
