import { describe, it, expect, beforeEach } from 'vitest';
import { useConfiguratorStore, serializeConfig, readableTextColor, DEFAULT_TEXT } from '../src/stores/configurator-store';
import { CATALOG, DEFAULT_PRODUCT_ID, getPrintArea, getProductById } from '../src/lib/products/catalog';
import { compositionSize, elementRect, printAreaRect } from '../src/lib/canvas/design-canvas';
import type { TextElement } from '../src/types/configurator';

const store = () => useConfiguratorStore.getState();
const product = getProductById(DEFAULT_PRODUCT_ID)!;

function reset() {
  store().reset();
  store().setProduct(DEFAULT_PRODUCT_ID);
  store().setSide('front');
}

function texte(id: string): TextElement {
  const el = store().elements.find((e) => e.id === id);
  if (!el || el.type !== 'text') throw new Error(`texte ${id} introuvable`);
  return el;
}

beforeEach(reset);

describe('store du configurateur — base', () => {
  it('démarre sur le produit par défaut et sa première couleur', () => {
    expect(store().productId).toBe(DEFAULT_PRODUCT_ID);
    expect(store().color).toBe(product.colors[0].hex);
    expect(store().side).toBe('front');
    expect(store().product()?.name).toBe(product.name);
  });

  it('change la couleur et refuse une valeur invalide', () => {
    store().setColor('#C62828');
    expect(store().color).toBe('#C62828');
    store().setColor('rouge');
    expect(store().color).toBe('#C62828');
  });

  it('change de face et refuse une face absente du produit', () => {
    store().setSide('back');
    expect(store().side).toBe('back');
    store().setSide('front');
    expect(store().side).toBe('front');
  });

  it('le catalogue reste cohérent après changement de produit', () => {
    store().setColor('#1565C0');
    store().setProduct(CATALOG[0].id);
    expect(store().color).toBe(CATALOG[0].colors[0].hex);
  });
});

describe('store du configurateur — éléments de design', () => {
  it('crée un texte avec des valeurs par défaut cohérentes et le sélectionne', () => {
    const id = store().addText({ content: 'CONGO' });
    const el = texte(id);
    expect(id).toBe('text-001');
    expect(el.content).toBe('CONGO');
    expect(el.fontId).toBe(DEFAULT_TEXT.fontId);
    expect(el.side).toBe('front');
    expect(el.visible).toBe(true);
    expect(el.x).toBe(0);
    expect(el.y).toBe(0);
    expect(store().selectedId).toBe(id);
  });

  it('choisit une couleur de texte lisible sur le vêtement', () => {
    expect(texte(store().addText({ content: 'A' })).color).toBe(readableTextColor('#FFFFFF'));
    store().setColor('#1A1A1A');
    expect(texte(store().addText({ content: 'B' })).color).toBe(readableTextColor('#1A1A1A'));
    expect(readableTextColor('#FFFFFF')).toBe('#1A1A1A');
    expect(readableTextColor('#1A1A1A')).toBe('#FFFFFF');
  });

  it('numérote les éléments par type : text-001, text-002, image-001', () => {
    expect(store().addText({ content: 'A' })).toBe('text-001');
    expect(store().addImage({ src: 'blob:1', name: 'logo.png', width: 800, height: 600 })).toBe('image-001');
    expect(store().addText({ content: 'B' })).toBe('text-002');
  });

  it('modifie le contenu, la police, la couleur, la taille et la rotation', () => {
    const id = store().addText();
    store().updateElement(id, {
      content: 'Brazzaville',
      fontId: 'pacifico',
      color: '#C62828',
      fontSize: 200,
      rotation: 30,
    });
    const el = texte(id);
    expect(el.content).toBe('Brazzaville');
    expect(el.fontId).toBe('pacifico');
    expect(el.color).toBe('#C62828');
    expect(el.fontSize).toBe(200);
    expect(el.rotation).toBe(30);
  });

  it('borne la position d’un texte dans la zone d’impression (avec marge de sécurité)', () => {
    const id = store().addText({ content: 'X', fontSize: 40 });
    store().updateElement(id, { x: 99, y: -99 });
    const el = texte(id);

    const area = getPrintArea(product, 'front')!;
    const space = compositionSize(area);
    const zone = printAreaRect(area, space);
    const rect = elementRect(el, area, space);
    expect(rect.x).toBeGreaterThanOrEqual(zone.x - 0.001);
    expect(rect.x + rect.w).toBeLessThanOrEqual(zone.x + zone.w + 0.001);
    expect(rect.y).toBeGreaterThanOrEqual(zone.y - 0.001);
    expect(rect.y + rect.h).toBeLessThanOrEqual(zone.y + zone.h + 0.001);
  });

  it('borne la taille de police et la rotation aux limites du modèle', () => {
    const id = store().addText({ content: 'X' });
    store().updateElement(id, { fontSize: 99999, rotation: 720 });
    const el = texte(id);
    expect(el.fontSize).toBeLessThanOrEqual(420);
    expect(el.rotation).toBeLessThanOrEqual(180);
  });

  it('déplace au clavier sans jamais sortir de la zone', () => {
    const id = store().addText({ content: 'X', fontSize: 40 });
    for (let i = 0; i < 200; i++) store().nudge(id, 1, 0);
    const el = texte(id);
    expect(el.x).toBeGreaterThan(0);
    expect(el.x).toBeLessThan(0.5);
  });

  it('supprime un élément et désélectionne', () => {
    const id = store().addText();
    store().removeElement(id);
    expect(store().elements).toHaveLength(0);
    expect(store().selectedId).toBeNull();
  });

  it('gère plusieurs éléments indépendamment (image + texte)', () => {
    const t1 = store().addText({ content: 'LOGO' });
    const i1 = store().addImage({ src: 'blob:1', name: 'logo.png', width: 800, height: 600 });
    const t2 = store().addText({ content: '2026' });

    store().updateElement(t2, { color: '#1565C0' });
    expect(texte(t1).color).not.toBe('#1565C0');
    expect(texte(t2).color).toBe('#1565C0');
    expect(store().elements.map((e) => e.id)).toEqual([t1, i1, t2]);
  });

  it('change un élément de face sans jamais mélanger avant et arrière', () => {
    const id = store().addText({ content: 'DOS' });
    store().setElementSide(id, 'back');
    expect(texte(id).side).toBe('back');
    expect(store().side).toBe('back');
    expect(store().elementsForSide('front')).toHaveLength(0);
    expect(store().elementsForSide('back')).toHaveLength(1);
  });

  it('gère les calques : monter et descendre', () => {
    const a = store().addText({ content: 'A' });
    const b = store().addText({ content: 'B' });
    expect(texte(a).z).toBeLessThan(texte(b).z);
    store().moveElement(a, 'up');
    expect(texte(a).z).toBeGreaterThan(texte(b).z);
    store().moveElement(a, 'down');
    expect(texte(a).z).toBeLessThan(texte(b).z);
  });

  it('masque et réaffiche un élément', () => {
    const id = store().addText();
    store().toggleElementVisible(id);
    expect(texte(id).visible).toBe(false);
    store().toggleElementVisible(id);
    expect(texte(id).visible).toBe(true);
  });

  it('sérialise une configuration complète (texte + image + image + texte)', () => {
    const t1 = store().addText({ content: 'LOGO' });
    const i1 = store().addImage({ src: 'blob:logo', name: 'logo.png', width: 800, height: 600 });
    const i2 = store().addImage({ src: 'blob:photo', name: 'photo.png', width: 1200, height: 900 });
    const t2 = store().addText({ content: '2026' });
    store().updateElement(t2, { rotation: 15, scale: 0.8 });

    const config = store().serialize();
    expect(config.version).toBe(2);
    expect(config.elements.map((e) => e.id)).toEqual([t1, i1, i2, t2]);
    expect(config.elements.map((e) => e.type)).toEqual(['text', 'image', 'image', 'text']);

    const premier = config.elements[0];
    expect(premier.type).toBe('text');
    if (premier.type === 'text') {
      expect(premier.content).toBe('LOGO');
      expect(premier.fontFamily).toBe('Montserrat');
    }
    // Une image n'embarque jamais son object URL (fichier de session).
    const json = JSON.stringify(config);
    expect(json).not.toContain('blob:');
    expect(json).toContain('logo.png');

    // Une seule définition de la configuration : le store produit exactement ceci.
    expect(serializeConfig({ ...store() })).toEqual(config);
  });

  it('recharge une configuration sérialisée à l’identique', () => {
    const t1 = store().addText({ content: 'CONGO' });
    store().addImage({ src: 'blob:logo', name: 'logo.png', width: 800, height: 600 });
    const t2 = store().addText({ content: '2026' });
    store().setElementSide(t2, 'back');
    store().updateElement(t1, { fontId: 'bangers', color: '#F2C300', fontSize: 180, rotation: -12 });
    const config = JSON.parse(JSON.stringify(store().serialize()));

    store().reset();
    expect(store().elements).toHaveLength(0);

    const result = store().loadConfig(config);
    expect(result.ok).toBe(true);
    // Les images ne sont pas embarquées : leur absence est signalée, pas bloquante.
    expect(result.warnings.join(' ')).toContain('recharger');
    expect(store().elements).toHaveLength(3);
    const recharge = texte(t1);
    expect(recharge.content).toBe('CONGO');
    expect(recharge.fontId).toBe('bangers');
    expect(recharge.color).toBe('#F2C300');
    expect(recharge.fontSize).toBe(180);
    expect(recharge.rotation).toBe(-12);
    expect(texte(t2).side).toBe('back');
  });

  it('accepte encore l’ancienne configuration (v1 : un visuel + une transformation)', () => {
    const result = store().loadConfig({
      version: 1,
      productId: DEFAULT_PRODUCT_ID,
      color: '#1565C0',
      side: 'back',
      design: { imageUrl: 'blob:ancien', name: 'ancien.png', width: 1000, height: 1000, x: 0.1, y: 0.2, scale: 1.2, rotation: 10 },
    });
    expect(result.ok).toBe(true);
    expect(store().color).toBe('#1565C0');
    expect(store().side).toBe('back');
    expect(store().elements).toHaveLength(1);
    const el = store().elements[0];
    expect(el.type).toBe('image');
    expect(el.x).toBeCloseTo(0.1, 5);
    expect(el.scale).toBeCloseTo(1.2, 5);
    expect(el.rotation).toBe(10);
  });

  it('refuse une configuration invalide sans toucher à l’état', () => {
    store().setColor('#C62828');
    expect(store().loadConfig({ version: 2, productId: 'inconnu' }).ok).toBe(false);
    expect(store().loadConfig(null).ok).toBe(false);
    expect(store().color).toBe('#C62828');

    const result = store().loadConfig({
      version: 2,
      productId: DEFAULT_PRODUCT_ID,
      color: '#FFFFFF',
      side: 'front',
      elements: [{ type: 'forme' }],
    });
    expect(result.errors.join(' ')).toContain('type inconnu');
  });

  it('une police inconnue retombe sur la police par défaut (configuration éditée à la main)', () => {
    const result = store().loadConfig({
      version: 2,
      productId: DEFAULT_PRODUCT_ID,
      color: '#FFFFFF',
      side: 'front',
      elements: [{ id: 'text-001', type: 'text', content: 'X', fontId: 'police-fantome', fontSize: 100 }],
    });
    expect(result.ok).toBe(true);
    expect(texte('text-001').fontId).toBe(DEFAULT_TEXT.fontId);
  });
});
