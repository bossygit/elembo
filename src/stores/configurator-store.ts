'use client';

// État unique du configurateur (Zustand). Le Canvas 2D et Three.js lisent le MÊME état :
// aucune duplication, aucune divergence entre l'aperçu et le modèle 3D.
//
// Un design est une LISTE D'ÉLÉMENTS (image ou texte), chacun indépendant, avec sa face,
// son calque, sa position, son échelle et sa rotation. Toute modification passe par
// `clampElement()` : un élément ne peut donc jamais être poussé hors de la zone
// d'impression, quelle que soit l'action (glisser, redimensionner, tourner, changer de
// face ou de produit).

import { create } from 'zustand';
import type {
  ConfiguratorConfig,
  DesignElement,
  ImageElement,
  SerializedElement,
  Side,
  TextElement,
} from '../types/configurator';
import { ELEMENT_LIMITS } from '../types/configurator';
import { CATALOG, DEFAULT_PRODUCT_ID, getPrintArea, getProductById } from '../lib/products/catalog';
import type { Product } from '../lib/products/catalog';
import {
  clampElement,
  compositionSize,
  elementsOfSide,
  nextElementId,
  nextZ,
  roughMeasurer,
  spaceScale,
  elementRect,
  printAreaRect,
} from '../lib/canvas/design-canvas';
import type { Measurer } from '../lib/canvas/design-canvas';
import { DEFAULT_FONT_ID, fontByName, fontById, resolveFont } from '../lib/fonts';

/** Contenu et style par défaut d'un texte ajouté par l'utilisateur. */
export const DEFAULT_TEXT: Pick<
  TextElement,
  'content' | 'fontId' | 'fontSize' | 'fontWeight' | 'fontStyle' | 'letterSpacing' | 'lineHeight' | 'align'
> = {
  content: 'VOTRE TEXTE',
  fontId: DEFAULT_FONT_ID,
  fontSize: 132,
  fontWeight: 700,
  fontStyle: 'normal',
  letterSpacing: 0,
  lineHeight: 1.15,
  align: 'center',
};

/** Couleur de texte lisible sur le vêtement choisi (clair → noir, sombre → blanc). */
export function readableTextColor(garmentHex: string): string {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(garmentHex)?.[1] ?? 'ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.5 ? '#1A1A1A' : '#FFFFFF';
}

/** Champs d'état suffisants pour reconstruire une configuration. */
export type SerializableSlice = {
  productId: string;
  color: string;
  side: Side;
  elements: DesignElement[];
};

/**
 * Sérialisation pure de la configuration — UNE SEULE définition, partagée par le store et
 * par l'interface (le panneau JSON affiche exactement ce que le store produirait).
 *
 * Les images ne sont pas embarquées (`src` est un object URL de session) : la
 * configuration décrit la mise en page, pas les fichiers. Le texte, lui, est décrit
 * entièrement : il peut être recréé à l'identique, y compris en haute résolution.
 */
export function serializeConfig(slice: SerializableSlice): ConfiguratorConfig {
  return {
    version: 2,
    productId: slice.productId,
    color: slice.color,
    side: slice.side,
    elements: [...slice.elements]
      .sort((a, b) => a.z - b.z)
      .map<SerializedElement>((el) =>
        el.type === 'image'
          ? {
              id: el.id,
              type: 'image',
              name: el.name,
              width: el.width,
              height: el.height,
              x: el.x,
              y: el.y,
              scale: el.scale,
              rotation: el.rotation,
              side: el.side,
              z: el.z,
              visible: el.visible,
            }
          : { ...el, fontFamily: resolveFont(el.fontId).name },
      ),
  };
}

export type ConfiguratorState = {
  productId: string;
  color: string;
  side: Side;
  elements: DesignElement[];
  selectedId: string | null;
  showGuides: boolean;
  /** Mesureur typographique : remplacé par celui du canvas réel pour un bornage exact. */
  measure: Measurer;

  product: () => Product | undefined;
  selected: () => DesignElement | undefined;
  /** Éléments d'une face (par défaut la face courante), du calque le plus bas au plus haut. */
  elementsForSide: (side?: Side) => DesignElement[];

  setProduct: (id: string) => void;
  setColor: (hex: string) => void;
  setSide: (side: Side) => void;
  setShowGuides: (on: boolean) => void;
  setMeasurer: (measure: Measurer) => void;

  addText: (patch?: Partial<TextElement>) => string;
  addImage: (asset: Omit<ImageElement, 'id' | 'type' | 'x' | 'y' | 'scale' | 'rotation' | 'side' | 'z' | 'visible'>) => string;
  updateElement: (id: string, patch: Partial<DesignElement>) => void;
  removeElement: (id: string) => void;
  selectElement: (id: string | null) => void;
  setElementSide: (id: string, side: Side) => void;
  moveElement: (id: string, direction: 'up' | 'down') => void;
  toggleElementVisible: (id: string) => void;
  nudge: (id: string, dx: number, dy: number) => void;
  clearElements: () => void;

  reset: () => void;
  serialize: () => ConfiguratorConfig;
  /** `warnings` : points non bloquants (image à recharger), affichés sans refuser le reste. */
  loadConfig: (config: unknown) => { ok: boolean; errors: string[]; warnings: string[] };
};

const initialProduct = getProductById(DEFAULT_PRODUCT_ID) ?? CATALOG[0];

/** Applique le bornage métier à un élément, selon sa propre face. */
function clampFor(state: { productId: string; measure: Measurer }, el: DesignElement): DesignElement {
  const area = getPrintArea(getProductById(state.productId), el.side);
  return clampElement(el, area, area ? compositionSize(area) : { width: 1024, height: 1024 }, state.measure);
}

/** Borne une liste entière (après un changement de produit ou de mesure). */
function clampAll(state: { productId: string; measure: Measurer }, elements: DesignElement[]): DesignElement[] {
  return elements.map((el) => clampFor(state, el));
}

export const useConfiguratorStore = create<ConfiguratorState>()((set, get) => ({
  productId: initialProduct.id,
  color: initialProduct.colors[0].hex,
  side: 'front',
  elements: [],
  selectedId: null,
  showGuides: true,
  measure: roughMeasurer,

  product: () => getProductById(get().productId),
  selected: () => get().elements.find((el) => el.id === get().selectedId),
  elementsForSide: (side) => elementsOfSide(get().elements, side ?? get().side),

  setProduct: (id) => {
    const product = getProductById(id);
    if (!product) return;
    const hasBack = Boolean(getPrintArea(product, 'back'));
    const side: Side = get().side === 'back' && !hasBack ? 'front' : get().side;
    // Un produit sans zone arrière ne peut pas porter d'élément au dos : on les ramène
    // devant plutôt que de les perdre silencieusement.
    const elements = get().elements.map((el) =>
      !hasBack && el.side === 'back' ? { ...el, side: 'front' as Side } : el,
    );
    const base = { productId: product.id, measure: get().measure };
    set({
      productId: product.id,
      color: product.colors[0].hex,
      side,
      elements: clampAll(base, elements),
      selectedId: null,
    });
  },

  setColor: (hex) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    set({ color: hex });
  },

  setSide: (side) => {
    if (!getPrintArea(getProductById(get().productId), side)) return;
    // Les zones avant/arrière n'ont pas la même taille : les éléments sont revalidés.
    set({ side, elements: clampedOnSide(get(), side) });
  },

  setShowGuides: (on) => set({ showGuides: on }),
  setMeasurer: (measure) => set({ measure, elements: clampAll({ productId: get().productId, measure }, get().elements) }),

  addText: (patch) => {
    const state = get();
    const id = nextElementId(state.elements, 'text');
    const element: TextElement = {
      ...DEFAULT_TEXT,
      ...patch,
      id,
      type: 'text',
      color: patch?.color ?? readableTextColor(state.color),
      x: patch?.x ?? 0,
      y: patch?.y ?? 0,
      scale: patch?.scale ?? 1,
      rotation: patch?.rotation ?? 0,
      side: patch?.side ?? state.side,
      z: nextZ(state.elements, patch?.side ?? state.side),
      visible: true,
    };
    set({
      elements: [...state.elements, clampFor(state, element)],
      selectedId: id,
    });
    return id;
  },

  addImage: (asset) => {
    const state = get();
    const id = nextElementId(state.elements, 'image');
    const element: ImageElement = {
      ...asset,
      id,
      type: 'image',
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      side: state.side,
      z: nextZ(state.elements, state.side),
      visible: true,
    };
    set({ elements: [...state.elements, clampFor(state, element)], selectedId: id });
    return id;
  },

  updateElement: (id, patch) => {
    const state = get();
    set({
      elements: state.elements.map((el) =>
        el.id === id ? clampFor(state, { ...el, ...patch, id: el.id, type: el.type } as DesignElement) : el,
      ),
    });
  },

  removeElement: (id) => {
    const state = get();
    set({
      elements: state.elements.filter((el) => el.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    });
  },

  selectElement: (id) => set({ selectedId: id && get().elements.some((el) => el.id === id) ? id : null }),

  setElementSide: (id, side) => {
    const state = get();
    if (!getPrintArea(getProductById(state.productId), side)) return;
    const cible = state.elements.find((el) => el.id === id);
    if (!cible) return;
    set({
      elements: state.elements.map((el) =>
        el.id === id
          ? clampFor(state, { ...el, side, z: nextZ(state.elements.filter((e) => e.id !== id), side) })
          : el,
      ),
      side, // on suit l'élément : on voit immédiatement où il vient d'être posé
    });
  },

  moveElement: (id, direction) => {
    const state = get();
    const cible = state.elements.find((el) => el.id === id);
    if (!cible) return;
    const face = state.elements
      .filter((el) => el.side === cible.side)
      .sort((a, b) => a.z - b.z)
      .map((el) => el.id);
    const index = face.indexOf(id);
    const cibleIndex = direction === 'up' ? index + 1 : index - 1;
    if (cibleIndex < 0 || cibleIndex >= face.length) return;
    [face[index], face[cibleIndex]] = [face[cibleIndex], face[index]];
    const z = new Map(face.map((elementId, i) => [elementId, i + 1]));
    set({
      elements: state.elements.map((el) => (z.has(el.id) ? { ...el, z: z.get(el.id)! } : el)),
    });
  },

  toggleElementVisible: (id) => {
    const state = get();
    set({ elements: state.elements.map((el) => (el.id === id ? { ...el, visible: !el.visible } : el)) });
  },

  nudge: (id, dx, dy) => {
    const state = get();
    set({
      elements: state.elements.map((el) =>
        el.id === id
          ? clampFor(state, { ...el, x: el.x + dx * ELEMENT_LIMITS.nudge, y: el.y + dy * ELEMENT_LIMITS.nudge })
          : el,
      ),
    });
  },

  clearElements: () => set({ elements: [], selectedId: null }),

  reset: () => set({ elements: [], selectedId: null }),

  serialize: () => serializeConfig(get()),

  loadConfig: (config) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const c = config as Partial<ConfiguratorConfig> & { design?: unknown; transform?: unknown } | null;
    if (!c || typeof c !== 'object') return { ok: false, errors: ['configuration illisible'], warnings };

    const product = c.productId ? getProductById(String(c.productId)) : undefined;
    if (!product) errors.push(`produit inconnu : ${String(c.productId)}`);

    const side: Side = c.side === 'back' ? 'back' : 'front';
    if (product && !getPrintArea(product, side)) errors.push(`le produit n'a pas de zone « ${side} »`);

    const hex = /^#[0-9a-fA-F]{6}$/.test(String(c.color)) ? String(c.color) : product?.colors[0].hex;
    if (!hex) errors.push('couleur invalide');
    if (errors.length) return { ok: false, errors, warnings };

    const brut = Array.isArray(c.elements)
      ? c.elements
      : c.design
        ? [legacyElement(c.design, side)]
        : [];

    const state = { productId: product!.id, measure: get().measure };
    const elements: DesignElement[] = [];
    brut.forEach((item, index) => {
      const el = normalizeElement(item, index, side, errors, warnings);
      if (el) elements.push(clampFor(state, el));
    });
    if (brut.length && !elements.length) return { ok: false, errors, warnings };

    set({
      productId: product!.id,
      side,
      color: hex!,
      elements,
      selectedId: elements[0]?.id ?? null,
    });
    return { ok: errors.length === 0, errors, warnings };
  },
}));

/** Revalide les éléments de la face nouvellement active (zones de tailles différentes). */
function clampedOnSide(state: { productId: string; measure: Measurer; elements: DesignElement[] }, side: Side): DesignElement[] {
  return state.elements.map((el) => {
    if (el.side !== side) return el;
    const area = getPrintArea(getProductById(state.productId), side);
    return clampElement(el, area, area ? compositionSize(area) : { width: 1024, height: 1024 }, state.measure);
  });
}

/** Convertit l'ancienne configuration (v1 : un visuel + une transformation) en éléments. */
function legacyElement(design: unknown, side: Side): unknown {
  const d = design as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  return {
    id: 'image-001',
    type: 'image',
    name: String(d.name ?? 'visuel'),
    width: Number(d.width ?? 0) || 1,
    height: Number(d.height ?? 0) || 1,
    x: Number(d.x ?? 0) || 0,
    y: Number(d.y ?? 0) || 0,
    scale: Number(d.scale ?? 1) || 1,
    rotation: Number(d.rotation ?? 0) || 0,
    side,
    z: 1,
    visible: true,
  };
}

/**
 * Valide un élément venu du JSON. Tolérant sur la forme (une configuration écrite à la
 * main doit rester éditable) mais strict sur les valeurs sensibles.
 */
function normalizeElement(
  item: unknown,
  index: number,
  side: Side,
  errors: string[],
  warnings: string[],
): DesignElement | null {
  const raw = item as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') {
    errors.push(`élément ${index} illisible`);
    return null;
  }
  const type = raw.type === 'text' ? 'text' : raw.type === 'image' ? 'image' : null;
  if (!type) {
    errors.push(`élément ${index} : type inconnu (${String(raw.type)})`);
    return null;
  }
  const base = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `${type}-${String(index + 1).padStart(3, '0')}`,
    x: Number(raw.x ?? 0) || 0,
    y: Number(raw.y ?? 0) || 0,
    scale: Number(raw.scale ?? 1) || 1,
    rotation: Number(raw.rotation ?? 0) || 0,
    side: raw.side === 'back' ? ('back' as Side) : side,
    z: Number(raw.z ?? index + 1) || index + 1,
    visible: raw.visible !== false,
  };
  if (type === 'text') {
    const fontId =
      fontById(String(raw.fontId ?? ''))?.id ??
      fontByName(String(raw.fontFamily ?? ''))?.id ??
      DEFAULT_FONT_ID;
    return {
      ...base,
      type: 'text',
      content: String(raw.content ?? '').slice(0, 400) || DEFAULT_TEXT.content,
      fontId,
      fontSize: Number(raw.fontSize ?? DEFAULT_TEXT.fontSize) || DEFAULT_TEXT.fontSize,
      color: /^#[0-9a-fA-F]{6}$/.test(String(raw.color)) ? String(raw.color) : '#000000',
      fontWeight: Number(raw.fontWeight ?? DEFAULT_TEXT.fontWeight) || DEFAULT_TEXT.fontWeight,
      fontStyle: raw.fontStyle === 'italic' ? 'italic' : 'normal',
      letterSpacing: Number(raw.letterSpacing ?? 0) || 0,
      lineHeight: Number(raw.lineHeight ?? DEFAULT_TEXT.lineHeight) || DEFAULT_TEXT.lineHeight,
      align: raw.align === 'left' || raw.align === 'right' ? raw.align : 'center',
    };
  }
  const src = typeof raw.src === 'string' ? raw.src : '';
  // Une image n'est jamais embarquée dans la configuration : son absence n'est pas une
  // erreur, juste un fichier à recharger (le texte, lui, est toujours restauré).
  if (!src) warnings.push(`image « ${String(raw.name ?? index + 1)} » à recharger`);
  return {
    ...base,
    type: 'image',
    src,
    name: String(raw.name ?? 'visuel'),
    width: Number(raw.width ?? 1) || 1,
    height: Number(raw.height ?? 1) || 1,
  };
}

/** Sélecteur pratique : boîte d'un élément dans l'espace de composition courant. */
export function elementRectFor(product: Product | undefined, el: DesignElement, measure: Measurer = roughMeasurer) {
  const area = getPrintArea(product, el.side);
  if (!area) return null;
  const space = compositionSize(area);
  return {
    area,
    space,
    rect: elementRect(el, area, space, measure),
    zone: printAreaRect(area, space),
    scale: spaceScale(space),
  };
}
