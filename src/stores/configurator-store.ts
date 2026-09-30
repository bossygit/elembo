'use client';

// État unique du configurateur (Zustand). Le Canvas 2D et Three.js lisent le MÊME
// état : aucune duplication, aucune divergence entre l'aperçu et le modèle 3D.
//
// Règle métier centrale : toute modification de la transformation passe par
// `clampTransform()`, donc le visuel ne peut jamais sortir arbitrairement de la zone
// d'impression, quelle que soit l'action (glisser, échelle, rotation, changement de
// face ou de produit).

import { create } from 'zustand';
import type { ConfiguratorConfig, DesignAsset, DesignTransform, Side } from '../types/configurator';
import {
  CATALOG,
  DEFAULT_PRODUCT_ID,
  getPrintArea,
  getProductById,
} from '../lib/products/catalog';
import type { Product } from '../lib/products/catalog';
import { PREVIEW_TEXTURE_SIZE, areaForSide, clampTransform } from '../lib/canvas/design-canvas';

const IDENTITY: DesignTransform = { x: 0, y: 0, scale: 1, rotation: 0 };

/** Champs d'état suffisants pour reconstruire une configuration. */
export type SerializableSlice = {
  productId: string;
  color: string;
  side: Side;
  design: DesignAsset | null;
  transform: DesignTransform;
};

/**
 * Sérialisation pure de la configuration — UNE SEULE définition, partagée par le
 * store et par l'interface (le panneau JSON affiche exactement ce que le store
 * produirait, sans dupliquer la forme des données).
 *
 * Le visuel n'est pas embarqué : `imageUrl` est un object URL de session (blob:),
 * donc la configuration décrit où le visuel est placé, pas l'image elle-même.
 */
export function serializeConfig(slice: SerializableSlice): ConfiguratorConfig {
  return {
    version: 1,
    productId: slice.productId,
    color: slice.color,
    side: slice.side,
    design: slice.design
      ? {
          imageUrl: slice.design.originalUrl,
          name: slice.design.name,
          width: slice.design.width,
          height: slice.design.height,
          ...slice.transform,
        }
      : null,
  };
}

export type ConfiguratorState = {
  productId: string;
  color: string;
  side: Side;
  design: DesignAsset | null;
  transform: DesignTransform;
  showGuides: boolean;

  product: () => Product | undefined;
  setProduct: (id: string) => void;
  setColor: (hex: string) => void;
  setSide: (side: Side) => void;
  setDesign: (asset: DesignAsset | null) => void;
  setTransform: (patch: Partial<DesignTransform>) => void;
  resetTransform: () => void;
  setShowGuides: (on: boolean) => void;
  reset: () => void;
  serialize: () => ConfiguratorConfig;
  loadConfig: (config: unknown) => { ok: boolean; errors: string[] };
};

const initialProduct = getProductById(DEFAULT_PRODUCT_ID) ?? CATALOG[0];

/** Applique la borne métier en tenant compte du produit et du visuel courants. */
function clamped(
  state: Pick<ConfiguratorState, 'productId' | 'side' | 'design'>,
  transform: DesignTransform,
): DesignTransform {
  const area = getPrintArea(getProductById(state.productId), state.side);
  if (!area || !state.design) return transform;
  return clampTransform(transform, area, PREVIEW_TEXTURE_SIZE, {
    w: state.design.width,
    h: state.design.height,
  });
}

export const useConfiguratorStore = create<ConfiguratorState>()((set, get) => ({
  productId: initialProduct.id,
  color: initialProduct.colors[0].hex,
  side: 'front',
  design: null,
  transform: { ...IDENTITY },
  showGuides: true,

  product: () => getProductById(get().productId),

  setProduct: (id) => {
    const product = getProductById(id);
    if (!product) return;
    const side: Side = get().side === 'back' && !getPrintArea(product, 'back') ? 'front' : get().side;
    set({
      productId: product.id,
      color: product.colors[0].hex,
      side,
      transform: clamped({ ...get(), productId: product.id, side }, { ...IDENTITY }),
    });
  },

  setColor: (hex) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    set({ color: hex });
  },

  setSide: (side) => {
    if (!areaForSide(getProductById(get().productId), side)) return;
    // La transformation est revalidée : les zones avant/arrière n'ont pas la même taille.
    set({ side, transform: clamped({ ...get(), side }, get().transform) });
  },

  setDesign: (asset) => {
    set({
      design: asset,
      transform: clamped({ ...get(), design: asset }, { ...IDENTITY }),
    });
  },

  setTransform: (patch) => {
    const next = { ...get().transform, ...patch };
    set({ transform: clamped(get(), next) });
  },

  resetTransform: () => set({ transform: clamped(get(), { ...IDENTITY }) }),

  setShowGuides: (on) => set({ showGuides: on }),

  reset: () => set({ design: null, transform: { ...IDENTITY } }),

  serialize: () => serializeConfig(get()),
  loadConfig: (config) => {
    const errors: string[] = [];
    const c = config as Partial<ConfiguratorConfig> | null;
    if (!c || typeof c !== 'object') return { ok: false, errors: ['configuration illisible'] };
    if (c.version !== 1) errors.push(`version non supportée : ${String(c.version)}`);

    const product = c.productId ? getProductById(c.productId) : undefined;
    if (!product) errors.push(`produit inconnu : ${String(c.productId)}`);

    const side: Side = c.side === 'back' ? 'back' : 'front';
    if (product && !getPrintArea(product, side)) errors.push(`le produit n'a pas de zone « ${side} »`);

    const hex = /^#[0-9a-fA-F]{6}$/.test(String(c.color)) ? String(c.color) : product?.colors[0].hex;
    if (!hex) errors.push('couleur invalide');

    if (errors.length) return { ok: false, errors };

    const d = c.design;
    const design: DesignAsset | null =
      d && typeof d.imageUrl === 'string' && typeof d.width === 'number' && typeof d.height === 'number'
        ? { originalUrl: d.imageUrl, name: String(d.name ?? 'visuel'), width: d.width, height: d.height }
        : null;

    const transform: DesignTransform = {
      x: Number(d?.x ?? 0) || 0,
      y: Number(d?.y ?? 0) || 0,
      scale: Number(d?.scale ?? 1) || 1,
      rotation: Number(d?.rotation ?? 0) || 0,
    };

    const state = { productId: product!.id, side, design };
    set({
      productId: product!.id,
      side,
      color: hex!,
      design,
      transform: clamped(state, transform),
    });
    return { ok: true, errors: [] };
  },
}));
