'use client';

// État unique du configurateur (Zustand). Le Canvas 2D et Three.js lisent le MÊME état :
// aucune duplication, aucune divergence entre l'aperçu et le modèle 3D.
//
// Un design est une LISTE D'ÉLÉMENTS (image ou texte), chacun indépendant, avec sa ZONE
// (avant, dos, manches, col), son calque, sa position, son échelle et sa rotation. Toute
// modification passe par `clampElement()` : un élément ne peut donc jamais être poussé hors
// de la zone imprimable du procédé choisi, quelle que soit l'action (glisser, redimensionner,
// tourner, changer de zone, changer de procédé ou de produit).
//
// Le store porte aussi l'HISTORIQUE (annuler/rétablir) : chaque action de conception pousse
// un instantané complet de l'état sérialisable. Les actions continues (glisser, curseurs)
// sont fusionnées sur une courte fenêtre pour qu'un seul geste = un seul « annuler ».

import { create } from 'zustand';
import type {
  ConfiguratorConfig,
  DesignElement,
  ImageElement,
  SerializedElement,
  Side,
  TextElement,
} from '../types/configurator';
import { ELEMENT_LIMITS, isSide } from '../types/configurator';
import { CATALOG, DEFAULT_PRODUCT_ID, getPrintArea, getProductById, productSides } from '../lib/products/catalog';
import type { Product } from '../lib/products/catalog';
import { PROFIL_PAR_DEFAUT, profilParDefautDuProduit, profilParId } from '../lib/products/production';
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
  profileId?: string;
  elements: DesignElement[];
};

/** Version courante du format de configuration (v3 : zones multiples + procédé). */
export const CONFIG_VERSION = 3;

/**
 * Sérialisation pure de la configuration — UNE SEULE définition, partagée par le store et
 * par l'interface.
 *
 * Les images ne sont pas embarquées (leur `src` est un object URL de session) : la
 * configuration décrit la mise en page, pas les fichiers. `assetId` désigne en revanche le
 * fichier d'origine conservé sur l'appareil (IndexedDB), ce qui permet de retrouver le
 * projet après un rechargement ou depuis le panier.
 */
export function serializeConfig(slice: SerializableSlice): ConfiguratorConfig {
  return {
    version: CONFIG_VERSION,
    productId: slice.productId,
    color: slice.color,
    side: slice.side,
    profileId: slice.profileId ?? PROFIL_PAR_DEFAUT.id,
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
              ...(el.assetId ? { assetId: el.assetId } : {}),
            }
          : { ...el, fontFamily: resolveFont(el.fontId).name },
      ),
  };
}

/** Instantané d'historique : tout ce qu'un « annuler » doit restaurer. */
type HistoryEntry = {
  color: string;
  side: Side;
  profileId: string;
  elements: DesignElement[];
  /** Action d'origine et horodatage : servent à fusionner un geste continu. */
  cle?: string;
  at?: number;
};

const HISTORY_MAX = 60;
/** Fenêtre de fusion des actions continues (glisser, curseur de couleur). */
const HISTORY_FUSION_MS = 600;

export type ConfiguratorState = {
  productId: string;
  color: string;
  side: Side;
  /** Procédé de production choisi — pilote les dimensions réellement imprimables. */
  profileId: string;
  elements: DesignElement[];
  selectedId: string | null;
  showGuides: boolean;
  /** Mesureur typographique : remplacé par celui du canvas réel pour un bornage exact. */
  measure: Measurer;
  past: HistoryEntry[];
  future: HistoryEntry[];

  product: () => Product | undefined;
  selected: () => DesignElement | undefined;
  /** Éléments d'une zone (par défaut la zone courante), du calque le plus bas au plus haut. */
  elementsForSide: (side?: Side) => DesignElement[];
  canUndo: () => boolean;
  canRedo: () => boolean;

  setProduct: (id: string) => void;
  setColor: (hex: string) => void;
  setSide: (side: Side) => void;
  setProfile: (id: string) => void;
  setShowGuides: (on: boolean) => void;
  setMeasurer: (measure: Measurer) => void;

  addText: (patch?: Partial<TextElement>) => string;
  addImage: (
    asset: Omit<ImageElement, 'id' | 'type' | 'x' | 'y' | 'scale' | 'rotation' | 'side' | 'z' | 'visible'>,
  ) => string;
  updateElement: (id: string, patch: Partial<DesignElement>) => void;
  removeElement: (id: string) => void;
  duplicateElement: (id: string) => string | null;
  selectElement: (id: string | null) => void;
  setElementSide: (id: string, side: Side) => void;
  /** Renseigne l'URL d'une image restaurée depuis son fichier local (IndexedDB). */
  setImageSource: (id: string, src: string) => void;
  moveElement: (id: string, direction: 'up' | 'down') => void;
  toggleElementVisible: (id: string) => void;
  nudge: (id: string, dx: number, dy: number) => void;
  clearElements: () => void;
  /** Vide une seule zone (les autres personnalisations sont conservées). */
  clearSide: (side: Side) => void;

  undo: () => void;
  redo: () => void;

  reset: () => void;
  serialize: () => ConfiguratorConfig;
  /** `warnings` : points non bloquants (image à recharger), affichés sans refuser le reste. */
  loadConfig: (config: unknown) => { ok: boolean; errors: string[]; warnings: string[] };
};

const initialProduct = getProductById(DEFAULT_PRODUCT_ID) ?? CATALOG[0];

/**
 * Applique le bornage métier à un élément, selon sa propre zone ET le procédé courant :
 * c'est la zone réellement imprimable du procédé qui borne le visuel, pas la pièce 3D
 * entière (sinon on laisserait composer un visuel que la presse ne peut pas produire).
 */
function clampFor(
  state: { productId: string; profileId: string; measure: Measurer },
  el: DesignElement,
): DesignElement {
  const area = getPrintArea(getProductById(state.productId), el.side, state.profileId);
  return clampElement(el, area, area ? compositionSize(area) : { width: 1024, height: 1024 }, state.measure);
}

/** Borne une liste entière (après un changement de produit, de procédé ou de mesure). */
function clampAll(
  state: { productId: string; profileId: string; measure: Measurer },
  elements: DesignElement[],
): DesignElement[] {
  return elements.map((el) => clampFor(state, el));
}

/** Zone de repli quand un produit ne propose pas la zone demandée. */
function zoneDeRepli(product: Product | undefined): Side {
  return productSides(product)[0] ?? 'front';
}

export const useConfiguratorStore = create<ConfiguratorState>()((set, get) => ({
  productId: initialProduct.id,
  color: initialProduct.colors[0].hex,
  side: 'front',
  profileId: PROFIL_PAR_DEFAUT.id,
  elements: [],
  selectedId: null,
  showGuides: true,
  measure: roughMeasurer,
  past: [],
  future: [],

  product: () => getProductById(get().productId),
  selected: () => get().elements.find((el) => el.id === get().selectedId),
  elementsForSide: (side) => elementsOfSide(get().elements, side ?? get().side),
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  setProduct: (id) => {
    const product = getProductById(id);
    if (!product) return;
    const disponibles = productSides(product);
    if (!disponibles.length) return;
    const side: Side = disponibles.includes(get().side) ? get().side : disponibles[0];
    // Un produit qui n'expose pas une zone ne peut pas porter d'élément dessus : on les
    // ramène sur la première zone disponible plutôt que de les perdre silencieusement.
    const elements = get().elements.map((el) =>
      disponibles.includes(el.side) ? el : { ...el, side: zoneDeRepli(product) },
    );
    // Le procédé doit s'appliquer au produit (un mug ne se presse pas en DTF textile) :
    // on garde celui en cours s'il convient, sinon le procédé par défaut du produit.
    const profileId = profilParId(get().profileId, product).id;
    const base = { productId: product.id, profileId, measure: get().measure };
    // Changer de produit = nouveau projet : l'historique du précédent n'a plus de sens.
    set({
      productId: product.id,
      profileId,
      color: product.colors[0].hex,
      side,
      elements: clampAll(base, elements),
      selectedId: null,
      past: [],
      future: [],
    });
  },

  setColor: (hex) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    const state = get();
    set({ ...pushHistory(state, 'color'), color: hex });
  },

  setSide: (side) => {
    const product = getProductById(get().productId);
    if (!productSides(product).includes(side)) return;
    // Les zones n'ont ni la même taille ni le même ratio : les éléments sont revalidés.
    set({ side, elements: clampedOnSide(get(), side) });
  },

  setProfile: (id) => {
    // Seuls les procédés du produit courant sont acceptés.
    const profil = profilParId(id, getProductById(get().productId));
    if (profil.id === get().profileId) return;
    const state = get();
    const historique = pushHistory(state, 'profile');
        const next = { ...state, profileId: profil.id };
    // Le procédé change la zone imprimable : on revalide TOUS les éléments. Un visuel
    // posé sur une zone que ce procédé ne couvre pas n'est pas supprimé — il est ramené
    // dans la surface de sa pièce, et l'interface signale la zone non commandable.
    set({
      ...historique,
      profileId: profil.id,
      elements: clampAll(next, state.elements),
      selectedId: state.selectedId && state.elements.some((el) => el.id === state.selectedId) ? state.selectedId : null,
    });
  },

  setShowGuides: (on) => set({ showGuides: on }),
  setMeasurer: (measure) =>
    set({
      measure,
      elements: clampAll(
        { productId: get().productId, profileId: get().profileId, measure },
        get().elements,
      ),
    }),

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
    set({ ...pushHistory(state, 'add'), elements: [...state.elements, clampFor(state, element)], selectedId: id });
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
    set({ ...pushHistory(state, 'add'), elements: [...state.elements, clampFor(state, element)], selectedId: id });
    return id;
  },

  updateElement: (id, patch) => {
    const state = get();
    const cible = state.elements.find((el) => el.id === id);
    if (!cible) return;
    // Les curseurs et le glisser appellent cette action des dizaines de fois : on fusionne
    // les écritures du même champ pour qu'un geste = un seul « annuler ».
    set({
      ...pushHistory(state, `update:${id}:${Object.keys(patch).sort().join(',')}`),
      elements: state.elements.map((el) =>
        el.id === id ? clampFor(state, { ...el, ...patch, id: el.id, type: el.type } as DesignElement) : el,
      ),
    });
  },

  removeElement: (id) => {
    const state = get();
    set({
      ...pushHistory(state, `remove:${id}`),
      elements: state.elements.filter((el) => el.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    });
  },

  duplicateElement: (id) => {
    const state = get();
    const source = state.elements.find((el) => el.id === id);
    if (!source) return null;
    const nouvelId = nextElementId(state.elements, source.type);
    const copie = clampFor(state, {
      ...source,
      id: nouvelId,
      x: Math.min(0.4, source.x + 0.04),
      y: Math.min(0.4, source.y + 0.04),
      z: nextZ(state.elements, source.side),
      visible: true,
    } as DesignElement);
    set({ ...pushHistory(state, `duplicate:${id}`), elements: [...state.elements, copie], selectedId: nouvelId });
    return nouvelId;
  },

  selectElement: (id) => set({ selectedId: id && get().elements.some((el) => el.id === id) ? id : null }),

  setElementSide: (id, side) => {
    const state = get();
    const product = getProductById(state.productId);
    if (!productSides(product).includes(side)) return;
    const cible = state.elements.find((el) => el.id === id);
    if (!cible) return;
    set({
      ...pushHistory(state, `side:${id}`),
      elements: state.elements.map((el) =>
        el.id === id
          ? clampFor(state, { ...el, side, z: nextZ(state.elements.filter((e) => e.id !== id), side) })
          : el,
      ),
      side, // on suit l'élément : on voit immédiatement où il vient d'être posé
    });
  },

  setImageSource: (id, src) => {
    if (!src) return;
    set({
      elements: get().elements.map((el) =>
        el.id === id && el.type === 'image' ? { ...el, src } : el,
      ),
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
      ...pushHistory(state, `layer:${id}`),
      elements: state.elements.map((el) => (z.has(el.id) ? { ...el, z: z.get(el.id)! } : el)),
    });
  },

  toggleElementVisible: (id) => {
    const state = get();
    set({
      ...pushHistory(state, `visible:${id}`),
      elements: state.elements.map((el) => (el.id === id ? { ...el, visible: !el.visible } : el)),
    });
  },

  nudge: (id, dx, dy) => {
    const state = get();
    set({
      ...pushHistory(state, `nudge:${id}`),
      elements: state.elements.map((el) =>
        el.id === id
          ? clampFor(state, { ...el, x: el.x + dx * ELEMENT_LIMITS.nudge, y: el.y + dy * ELEMENT_LIMITS.nudge })
          : el,
      ),
    });
  },

  clearElements: () => {
    const state = get();
    if (!state.elements.length) return;
    set({ ...pushHistory(state, 'clear'), elements: [], selectedId: null });
  },

  clearSide: (side) => {
    const state = get();
    const restants = state.elements.filter((el) => el.side !== side);
    if (restants.length === state.elements.length) return;
    set({
      ...pushHistory(state, `clear:${side}`),
      elements: restants,
      selectedId: state.elements.some((el) => el.id === state.selectedId && el.side === side)
        ? null
        : state.selectedId,
    });
  },

  undo: () => {
    const state = get();
    const precedent = state.past[state.past.length - 1];
    if (!precedent) return;
    const futur = [...state.future, snapshot(state)];
    const restaure = restore(state, precedent);
    set({ ...restaure, past: state.past.slice(0, -1), future: futur });
  },

  redo: () => {
    const state = get();
    const suivant = state.future[state.future.length - 1];
    if (!suivant) return;
    const passe = [...state.past, snapshot(state)];
    const restaure = restore(state, suivant);
    set({ ...restaure, past: passe, future: state.future.slice(0, -1) });
  },

  reset: () => set({ elements: [], selectedId: null, past: [], future: [] }),

  serialize: () => serializeConfig(get()),

  loadConfig: (config) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const c = config as (Partial<ConfiguratorConfig> & { design?: unknown; transform?: unknown }) | null;
    if (!c || typeof c !== 'object') return { ok: false, errors: ['configuration illisible'], warnings };

    const product = c.productId ? getProductById(String(c.productId)) : undefined;
    if (!product) errors.push(`produit inconnu : ${String(c.productId)}`);

    const disponibles = productSides(product);
    const sideBrute: Side = isSide(c.side) ? c.side : 'front';
    const side: Side = disponibles.includes(sideBrute) ? sideBrute : (disponibles[0] ?? 'front');
    if (product && !disponibles.includes(sideBrute)) {
      warnings.push(`zone « ${sideBrute} » absente de ce produit : repli sur « ${side} »`);
    }

    const hex = /^#[0-9a-fA-F]{6}$/.test(String(c.color)) ? String(c.color) : product?.colors[0].hex;
    if (!hex) errors.push('couleur invalide');
    if (errors.length) return { ok: false, errors, warnings };

    const profil = c.profileId ? profilParId(c.profileId, product) : profilParDefautDuProduit(product);
    if (c.profileId && profil.id !== c.profileId) {
      warnings.push(`procédé « ${c.profileId} » non applicable à ce produit : repli sur « ${profil.nom} »`);
    }

    const brut = Array.isArray(c.elements)
      ? c.elements
      : c.design
        ? [legacyElement(c.design, side)]
        : [];

    const state = { productId: product!.id, profileId: profil.id, measure: get().measure };
    const elements: DesignElement[] = [];
    brut.forEach((item, index) => {
      const el = normalizeElement(item, index, side, disponibles, errors, warnings);
      if (el) elements.push(clampFor(state, el));
    });
    if (brut.length && !elements.length) return { ok: false, errors, warnings };

    set({
      productId: product!.id,
      side,
      color: hex!,
      profileId: profil.id,
      elements,
      selectedId: elements[0]?.id ?? null,
      past: [],
      future: [],
    });
    return { ok: errors.length === 0, errors, warnings };
  },
}));

/* --------------------------------------------------------------- historique ------ */

/** Instantané de l'état sérialisable courant. */
function snapshot(state: ConfiguratorState): HistoryEntry {
  return {
    color: state.color,
    side: state.side,
    profileId: state.profileId,
    elements: state.elements.map((el) => ({ ...el })),
  };
}

/**
 * Instantané AVANT une mutation, prêt à être passé à `set`. `cle` identifie l'action :
 * deux écritures de la même clé dans la fenêtre de fusion ne produisent qu'une seule
 * entrée (curseurs, glisser). Renvoie `{}` quand il n'y a rien à empiler.
 */
function pushHistory(state: ConfiguratorState, cle: string): Partial<ConfiguratorState> {
  const dernier = state.past[state.past.length - 1];
  const fusion = dernier?.cle === cle && Date.now() - (dernier.at ?? 0) < HISTORY_FUSION_MS;
  // Même en fusion, une nouvelle écriture invalide la branche « rétablir ».
  if (fusion) return state.future.length ? { future: [] } : {};
  const past = [...state.past, { ...snapshot(state), cle, at: Date.now() }].slice(-HISTORY_MAX);
  return { past, future: [] };
}

/** Restaure un instantané en revalidant les éléments contre le procédé du moment. */
function restore(
  state: ConfiguratorState,
  entry: HistoryEntry,
): Pick<ConfiguratorState, 'color' | 'side' | 'profileId' | 'elements' | 'selectedId'> {
  const base = { productId: state.productId, profileId: entry.profileId, measure: state.measure };
  const elements = clampAll(base, entry.elements.map((el) => ({ ...el })));
  return {
    color: entry.color,
    side: entry.side,
    profileId: entry.profileId,
    elements,
    selectedId: state.selectedId && elements.some((el) => el.id === state.selectedId) ? state.selectedId : null,
  };
}

/* ------------------------------------------------------------- revalidation ------ */

/** Revalide les éléments d'une zone nouvellement active (zones de tailles différentes). */
function clampedOnSide(
  state: { productId: string; profileId: string; measure: Measurer; elements: DesignElement[] },
  side: Side,
): DesignElement[] {
  return state.elements.map((el) => {
    if (el.side !== side) return el;
    const area = getPrintArea(getProductById(state.productId), side, state.profileId);
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
  disponibles: Side[],
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
  const zoneBrute: Side = isSide(raw.side) ? raw.side : side;
  const zone: Side = disponibles.includes(zoneBrute) ? zoneBrute : (disponibles[0] ?? 'front');
  const base = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `${type}-${String(index + 1).padStart(3, '0')}`,
    x: Number(raw.x ?? 0) || 0,
    y: Number(raw.y ?? 0) || 0,
    scale: Number(raw.scale ?? 1) || 1,
    rotation: Number(raw.rotation ?? 0) || 0,
    side: zone,
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
  const assetId = typeof raw.assetId === 'string' && raw.assetId ? raw.assetId : undefined;
  // Une image n'est jamais embarquée dans la configuration : son absence n'est pas une
  // erreur, juste un fichier à recharger (le texte, lui, est toujours restauré). Un
  // `assetId` permet de la retrouver automatiquement sur l'appareil.
  if (!src && !assetId) warnings.push(`image « ${String(raw.name ?? index + 1)} » à recharger`);
  return {
    ...base,
    type: 'image',
    src,
    ...(assetId ? { assetId } : {}),
    name: String(raw.name ?? 'visuel'),
    width: Number(raw.width ?? 1) || 1,
    height: Number(raw.height ?? 1) || 1,
  };
}

/** Sélecteur pratique : boîte d'un élément dans l'espace de composition courant. */
export function elementRectFor(
  product: Product | undefined,
  el: DesignElement,
  measure: Measurer = roughMeasurer,
  profileId?: string,
) {
  const area = getPrintArea(product, el.side, profileId);
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
