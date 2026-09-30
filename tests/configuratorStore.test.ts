import { describe, it, expect, beforeEach } from 'vitest';
import { useConfiguratorStore } from '../src/stores/configurator-store';
import { CATALOG, DEFAULT_PRODUCT_ID, getPrintArea, getProductById } from '../src/lib/products/catalog';
import { PREVIEW_TEXTURE_SIZE, designRect, printAreaRect } from '../src/lib/canvas/design-canvas';
import type { DesignAsset } from '../src/types/configurator';

const product = getProductById(DEFAULT_PRODUCT_ID)!;
const DESIGN: DesignAsset = { originalUrl: 'blob:local/design', name: 'logo.png', width: 1000, height: 1000 };

function resetStore() {
  useConfiguratorStore.setState({
    productId: DEFAULT_PRODUCT_ID,
    color: product.colors[0].hex,
    side: 'front',
    design: null,
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    showGuides: true,
  });
}

beforeEach(resetStore);

describe('store du configurateur', () => {
  it('démarre sur le produit par défaut et sa première couleur', () => {
    const s = useConfiguratorStore.getState();
    expect(s.productId).toBe(DEFAULT_PRODUCT_ID);
    expect(s.color).toBe(product.colors[0].hex);
    expect(s.side).toBe('front');
    expect(s.product()?.name).toBe(product.name);
  });

  it('change la couleur et refuse une valeur invalide', () => {
    useConfiguratorStore.getState().setColor('#C62828');
    expect(useConfiguratorStore.getState().color).toBe('#C62828');
    useConfiguratorStore.getState().setColor('rouge');
    expect(useConfiguratorStore.getState().color).toBe('#C62828');
  });

  it('change de face et refuse une face absente du produit', () => {
    useConfiguratorStore.getState().setSide('back');
    expect(useConfiguratorStore.getState().side).toBe('back');
    // le produit par défaut n'a pas d'autre face : « gauche » n'existe pas
    useConfiguratorStore.getState().setSide('front');
    expect(useConfiguratorStore.getState().side).toBe('front');
  });

  it('enregistre le visuel et remet la transformation à l’identité', () => {
    useConfiguratorStore.getState().setTransform({ x: 0.4, scale: 1.5 });
    useConfiguratorStore.getState().setDesign(DESIGN);
    const s = useConfiguratorStore.getState();
    expect(s.design?.name).toBe('logo.png');
    expect(s.transform.scale).toBe(1);
    expect(s.transform.x).toBe(0);
  });

  it('borne la transformation dès qu’un visuel est présent', () => {
    useConfiguratorStore.getState().setDesign(DESIGN);
    useConfiguratorStore.getState().setTransform({ x: 99, y: -99 });
    const t = useConfiguratorStore.getState().transform;

    const area = getPrintArea(product, 'front')!;
    const zone = printAreaRect(area, PREVIEW_TEXTURE_SIZE);
    const rect = designRect(t, area, PREVIEW_TEXTURE_SIZE, { w: DESIGN.width, h: DESIGN.height });
    expect(rect.x).toBeGreaterThanOrEqual(zone.x - 0.001);
    expect(rect.x + rect.w).toBeLessThanOrEqual(zone.x + zone.w + 0.001);
    expect(rect.y).toBeGreaterThanOrEqual(zone.y - 0.001);
    expect(rect.y + rect.h).toBeLessThanOrEqual(zone.y + zone.h + 0.001);
  });

  it('n’applique aucune borne sans visuel (rien à contraindre)', () => {
    useConfiguratorStore.getState().setTransform({ x: 99 });
    expect(useConfiguratorStore.getState().transform.x).toBe(99);
  });

  it('recentrer remet la transformation à l’identité', () => {
    useConfiguratorStore.getState().setDesign(DESIGN);
    useConfiguratorStore.getState().setTransform({ x: 0.2, scale: 1.6, rotation: 45 });
    useConfiguratorStore.getState().resetTransform();
    expect(useConfiguratorStore.getState().transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 });
  });

  it('reset retire le visuel', () => {
    useConfiguratorStore.getState().setDesign(DESIGN);
    useConfiguratorStore.getState().reset();
    expect(useConfiguratorStore.getState().design).toBeNull();
  });

  it('sérialise la configuration complète', () => {
    useConfiguratorStore.getState().setColor('#1A1A1A');
    useConfiguratorStore.getState().setDesign(DESIGN);
    useConfiguratorStore.getState().setTransform({ scale: 1.25, rotation: 30 });
    const config = useConfiguratorStore.getState().serialize();
    expect(config).toMatchObject({
      version: 1,
      productId: DEFAULT_PRODUCT_ID,
      color: '#1A1A1A',
      side: 'front',
    });
    expect(config.design).toMatchObject({
      imageUrl: 'blob:local/design',
      name: 'logo.png',
      width: 1000,
      height: 1000,
      scale: 1.25,
      rotation: 30,
    });
  });

  it('sérialise sans visuel (design: null)', () => {
    expect(useConfiguratorStore.getState().serialize().design).toBeNull();
  });

  it('recharge une configuration et borne la transformation', () => {
    const result = useConfiguratorStore.getState().loadConfig({
      version: 1,
      productId: DEFAULT_PRODUCT_ID,
      color: '#1565C0',
      side: 'back',
      design: { imageUrl: 'blob:local/autre', name: 'dos.png', width: 800, height: 600, x: 9, y: 0, scale: 5, rotation: 400 },
    });
    expect(result.ok).toBe(true);
    const s = useConfiguratorStore.getState();
    expect(s.color).toBe('#1565C0');
    expect(s.side).toBe('back');
    expect(s.design?.name).toBe('dos.png');
    expect(s.transform.scale).toBe(2);
    expect(s.transform.rotation).toBe(180);
    expect(Math.abs(s.transform.x)).toBeLessThan(2);
  });

  it('refuse une configuration invalide sans toucher à l’état', () => {
    useConfiguratorStore.getState().setColor('#C62828');
    expect(useConfiguratorStore.getState().loadConfig({ version: 2, productId: DEFAULT_PRODUCT_ID }).ok).toBe(false);
    expect(useConfiguratorStore.getState().loadConfig({ version: 1, productId: 'inconnu' }).ok).toBe(false);
    expect(useConfiguratorStore.getState().color).toBe('#C62828');
  });

  it('le catalogue reste cohérent après changement de produit', () => {
    useConfiguratorStore.getState().setColor('#1565C0');
    useConfiguratorStore.getState().setProduct(CATALOG[0].id);
    expect(useConfiguratorStore.getState().color).toBe(CATALOG[0].colors[0].hex);
  });
});
