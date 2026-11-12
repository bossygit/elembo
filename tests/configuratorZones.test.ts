import { describe, it, expect, beforeEach } from 'vitest';
import { useConfiguratorStore } from '../src/stores/configurator-store';
import { DEFAULT_PRODUCT_ID, getPrintArea, getProductById, productSides } from '../src/lib/products/catalog';
import { elementsOfSide } from '../src/lib/canvas/design-canvas';
import type { Side, TextElement } from '../src/types/configurator';

const store = () => useConfiguratorStore.getState();
const product = getProductById(DEFAULT_PRODUCT_ID)!;

function reset() {
  useConfiguratorStore.setState({ past: [], future: [] });
  store().reset();
  store().setProduct(DEFAULT_PRODUCT_ID);
  store().setProfile('dtf');
  store().setSide('front');
  useConfiguratorStore.setState({ past: [], future: [] });
}

function texte(id: string): TextElement {
  const el = store().elements.find((e) => e.id === id);
  if (!el || el.type !== 'text') throw new Error(`texte ${id} introuvable`);
  return el;
}

beforeEach(reset);

describe('store du configurateur — cinq zones', () => {
  it('expose les cinq zones du modèle Elembo', () => {
    expect(productSides(product)).toEqual(['front', 'back', 'left-sleeve', 'right-sleeve', 'collar']);
    for (const side of productSides(product)) {
      expect(getPrintArea(product, side, 'dtf')).not.toBeNull();
    }
  });

  it('chaque zone a son propre espace de travail', () => {
    const front = store().addText({ content: 'AVANT' });
    store().setSide('back');
    const dos = store().addText({ content: 'DOS' });
    store().setSide('left-sleeve');
    const manche = store().addText({ content: 'MANCHE' });
    store().setSide('collar');
    const col = store().addText({ content: 'COL' });

    expect(elementsOfSide(store().elements, 'front').map((e) => e.id)).toEqual([front]);
    expect(elementsOfSide(store().elements, 'back').map((e) => e.id)).toEqual([dos]);
    expect(elementsOfSide(store().elements, 'left-sleeve').map((e) => e.id)).toEqual([manche]);
    expect(elementsOfSide(store().elements, 'collar').map((e) => e.id)).toEqual([col]);
    expect(store().elements).toHaveLength(4);
  });

  it('revenir sur une zone déjà personnalisée conserve ses éléments', () => {
    store().addText({ content: 'AVANT' });
    store().setSide('back');
    store().addText({ content: 'DOS' });
    store().setSide('front');
    expect(elementsOfSide(store().elements, 'front')[0]).toMatchObject({ content: 'AVANT' });
    store().setSide('back');
    expect(elementsOfSide(store().elements, 'back')[0]).toMatchObject({ content: 'DOS' });
  });

  it('déplace un élément vers une autre zone et le borne dans la nouvelle zone', () => {
    const id = store().addText({ content: 'TRANSFERT' });
    store().setElementSide(id, 'left-sleeve');
    const el = texte(id);
    expect(el.side).toBe('left-sleeve');
    expect(store().side).toBe('left-sleeve');
    // La zone d'une manche est bien plus petite et large : l'élément a été revalidé.
    expect(Math.abs(el.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(el.y)).toBeLessThanOrEqual(1);
  });

  it('refuse une zone que le produit ne propose pas', () => {
    store().setSide('collar');
    expect(store().side).toBe('collar');
    // Un produit décalque n'expose que l'avant et l'arrière.
    store().setProduct('tshirt-alt');
    expect(['front', 'back']).toContain(store().side);
    expect(store().elements).toHaveLength(0);
    // La zone « col » n'existe pas sur ce produit : le store l'ignore.
    store().setSide('collar' as Side);
    expect(store().side).not.toBe('collar');
  });

  it('vide une seule zone sans toucher aux autres', () => {
    store().addText({ content: 'AVANT' });
    store().setSide('back');
    store().addText({ content: 'DOS' });
    store().clearSide('back');
    expect(elementsOfSide(store().elements, 'back')).toHaveLength(0);
    expect(elementsOfSide(store().elements, 'front')).toHaveLength(1);
  });
});

describe('store du configurateur — procédé de production', () => {
  it('démarre sur le procédé par défaut et le sérialise', () => {
    expect(store().profileId).toBe('dtf');
    expect(store().serialize().profileId).toBe('dtf');
  });

  it('change les dimensions imprimables sans perdre les éléments', () => {
    store().addText({ content: 'FLEX' });
    expect(getPrintArea(product, 'front', 'dtf')).toMatchObject({ cmWidth: 21, cmHeight: 30 });
    store().setProfile('flex');
    expect(store().profileId).toBe('flex');
    expect(getPrintArea(product, 'front', 'flex')).toMatchObject({ cmWidth: 28, cmHeight: 35 });
    expect(store().elements).toHaveLength(1);
    expect(store().serialize().profileId).toBe('flex');
  });

  it('un procédé inconnu retombe sur le procédé par défaut', () => {
    store().setProfile('inexistant');
    expect(store().profileId).toBe('dtf');
  });
});

describe('store du configurateur — historique', () => {
  it('annule et rétablit un ajout', () => {
    expect(store().canUndo()).toBe(false);
    const id = store().addText({ content: 'ANNULE' });
    expect(store().canUndo()).toBe(true);
    store().undo();
    expect(store().elements).toHaveLength(0);
    expect(store().canRedo()).toBe(true);
    store().redo();
    expect(store().elements).toHaveLength(1);
    expect(store().elements[0].id).toBe(id);
  });

  it('annule une suppression', () => {
    const id = store().addText({ content: 'GARDE' });
    store().removeElement(id);
    expect(store().elements).toHaveLength(0);
    store().undo();
    expect(store().elements).toHaveLength(1);
    expect(store().elements[0].id).toBe(id);
  });

  it('annule un déplacement et une rotation', () => {
    const id = store().addText({ content: 'MOVE', fontSize: 80 });
    const depart = { x: texte(id).x, y: texte(id).y };
    store().updateElement(id, { x: 0.2, y: 0.1 });
    expect(texte(id).x).toBeCloseTo(0.2, 5);
    store().undo();
    expect(texte(id).x).toBeCloseTo(depart.x, 5);
    expect(texte(id).y).toBeCloseTo(depart.y, 5);
  });

  it('fusionne les écritures continues d’un même geste', () => {
    store().addText({ content: 'GLISSE', fontSize: 80 });
    const id = 'text-001';
    const depart = texte(id).x;
    // Simule les appels successifs d'un glisser : un seul « annuler » doit suffire.
    for (let i = 1; i <= 10; i++) store().updateElement(id, { x: depart + i * 0.01 });
    expect(texte(id).x).toBeGreaterThan(depart);
    store().undo();
    expect(texte(id).x).toBeCloseTo(depart, 5);
  });

  it('annule un changement de couleur', () => {
    const initiale = store().color;
    store().setColor('#FF5A12');
    store().undo();
    expect(store().color).toBe(initiale);
  });

  it('ne descend jamais sous le premier état', () => {
    store().addText();
    store().undo();
    store().undo();
    store().undo();
    expect(store().elements).toHaveLength(0);
  });

  it('vide l’historique au chargement d’une configuration', () => {
    store().addText();
    expect(store().canUndo()).toBe(true);
    store().loadConfig({
      version: 3,
      productId: DEFAULT_PRODUCT_ID,
      color: '#F4F3EF',
      side: 'front',
      profileId: 'dtf',
      elements: [],
    });
    expect(store().canUndo()).toBe(false);
  });
});

describe('store du configurateur — duplication et sérialisation v3', () => {
  it('duplique un élément au-dessus, avec un nouvel identifiant', () => {
    const id = store().addText({ content: 'ORIGINAL' });
    const copie = store().duplicateElement(id)!;
    expect(copie).not.toBe(id);
    expect(store().elements).toHaveLength(2);
    const nouveau = texte(copie);
    expect(nouveau.content).toBe('ORIGINAL');
    expect(nouveau.z).toBeGreaterThan(texte(id).z);
    expect(store().selectedId).toBe(copie);
  });

  it('sérialise la version 3 : procédé, cinq zones, assetId des images', () => {
    store().addText({ content: 'AVANT' });
    store().setSide('left-sleeve');
    store().addImage({
      src: 'blob:logo',
      assetId: 'asset-123',
      name: 'logo.png',
      width: 900,
      height: 900,
    });
    store().setSide('collar');
    store().addText({ content: 'COL' });

    const config = store().serialize();
    expect(config.version).toBe(3);
    expect(config.profileId).toBe('dtf');
    expect(config.elements.map((el) => el.side).sort()).toEqual(['collar', 'front', 'left-sleeve']);
    const image = config.elements.find((el) => el.type === 'image');
    expect(image).toMatchObject({ assetId: 'asset-123', side: 'left-sleeve' });
    // L'object URL de session n'est jamais persisté.
    expect(JSON.stringify(config)).not.toContain('blob:');
  });

  it('recharge une configuration v3 avec ses zones et son procédé', () => {
    const result = store().loadConfig({
      version: 3,
      productId: DEFAULT_PRODUCT_ID,
      color: '#1F2A44',
      side: 'right-sleeve',
      profileId: 'flex',
      elements: [
        {
          id: 'image-001',
          type: 'image',
          name: 'logo.png',
          width: 500,
          height: 500,
          x: 0.1,
          y: 0.1,
          scale: 1,
          rotation: 15,
          side: 'right-sleeve',
          z: 2,
          visible: true,
          assetId: 'asset-abc',
        },
        {
          id: 'text-001',
          type: 'text',
          content: 'COL',
          fontId: 'bangers',
          fontSize: 40,
          color: '#FFFFFF',
          side: 'collar',
          z: 1,
          visible: true,
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(store().profileId).toBe('flex');
    expect(store().side).toBe('right-sleeve');
    const image = store().elements.find((el) => el.id === 'image-001');
    expect(image).toMatchObject({ side: 'right-sleeve', assetId: 'asset-abc', rotation: 15 });
    expect(store().elements.find((el) => el.id === 'text-001')).toMatchObject({ side: 'collar' });
  });

  it('ré-attache l’URL d’une image restaurée depuis IndexedDB', () => {
    store().loadConfig({
      version: 3,
      productId: DEFAULT_PRODUCT_ID,
      color: '#F4F3EF',
      side: 'front',
      profileId: 'dtf',
      elements: [
        {
          id: 'image-001',
          type: 'image',
          name: 'logo.png',
          width: 500,
          height: 500,
          assetId: 'asset-abc',
          side: 'front',
        },
      ],
    });
    expect(store().elements[0]).toMatchObject({ src: '' });
    store().setImageSource('image-001', 'blob:restaure');
    expect(store().elements[0]).toMatchObject({ src: 'blob:restaure' });
  });

  it('accepte une ancienne configuration v2 sans procédé (repli dtf)', () => {
    const result = store().loadConfig({
      version: 2,
      productId: DEFAULT_PRODUCT_ID,
      color: '#FFFFFF',
      side: 'back',
      elements: [{ id: 'text-001', type: 'text', content: 'V2', fontId: 'montserrat', fontSize: 80 }],
    });
    expect(result.ok).toBe(true);
    expect(store().profileId).toBe('dtf');
    expect(store().side).toBe('back');
    expect(store().elements[0].side).toBe('back');
    expect(store().serialize().version).toBe(3);
  });

  it('replie une zone inconnue du produit sur une zone valide, avec avertissement', () => {
    store().setProduct('tshirt-alt');
    const result = store().loadConfig({
      version: 3,
      productId: 'tshirt-alt',
      color: '#FFFFFF',
      side: 'left-sleeve',
      profileId: 'dtf',
      elements: [{ id: 'text-001', type: 'text', content: 'X', side: 'left-sleeve' }],
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.join(' ')).toContain('absente');
    expect(store().side).toBe('front');
    expect(store().elements[0].side).toBe('front');
  });
});
