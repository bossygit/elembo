// Textures des panneaux — un seul canvas et une seule CanvasTexture par face,
// créés une fois puis REDESSINÉS. On ne recrée jamais la texture ni le canvas à
// chaque changement d'état : c'est la première cause de fuite mémoire et de
// saccades dans ce genre de configurateur (§16).

import * as THREE from 'three';
import { drawComposition } from '../canvas/design-canvas';
import type { DrawParams } from '../canvas/design-canvas';

type PanelEntry = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
};

export type PanelSpace = { width: number; height: number };

const cache = new Map<string, PanelEntry>();

function createEntry(key: string, space: PanelSpace): PanelEntry {
  const canvas = document.createElement('canvas');
  canvas.width = space.width;
  canvas.height = space.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible pour la texture du panneau');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // La texture est réutilisée en aperçu : on veut une image nette et non retournée.
  texture.flipY = true;
  texture.needsUpdate = true;
  const entry = { canvas, ctx, texture };
  cache.set(key, entry);
  return entry;
}

/** Obtient (ou crée) le couple canvas + texture d'un panneau, au format demandé. */
export function getPanelEntry(key: string, space: number | PanelSpace): PanelEntry {
  const dims: PanelSpace = typeof space === 'number' ? { width: space, height: space } : space;
  const existing = cache.get(key);
  if (existing && existing.canvas.width === dims.width && existing.canvas.height === dims.height) {
    return existing;
  }
  if (existing) disposeEntry(existing);
  return createEntry(key, dims);
}

/** Redessine le panneau et marque la texture comme modifiée (sans la recréer). */
export function updatePanelTexture(
  key: string,
  params: Omit<DrawParams, 'size' | 'height'> & { size: number; height?: number },
): THREE.CanvasTexture {
  const entry = getPanelEntry(key, { width: params.size, height: params.height ?? params.size });
  drawComposition(entry.ctx, params);
  entry.texture.needsUpdate = true;
  return entry.texture;
}

function disposeEntry(entry: PanelEntry) {
  entry.texture.dispose();
  entry.canvas.width = 0;
  entry.canvas.height = 0;
}

/** Libère les textures (montage/démontage du configurateur). */
export function disposePanelTextures(): void {
  for (const entry of cache.values()) disposeEntry(entry);
  cache.clear();
}

/** Clé de cache par face, pour ne pas mélanger avant et arrière. */
export function panelKey(side: 'front' | 'back'): string {
  return `panel:${side}`;
}

/**
 * Albédo NEUTRALISÉ d'un vêtement fournisseur.
 *
 * Les modèles achetés arrivent avec la couleur de l'artiste (ici un T-shirt bleu-teal,
 * moyenne 27/154/177). Teinter directement cette texture avec la couleur choisie donne
 * des teintes fausses et troubles. On désature donc l'albédo en conservant sa luminance
 * relative (grain du tissu, coutures, plis), la couleur étant ensuite portée par le
 * matériau. Le résultat est mis en cache par image source : le calcul n'a lieu qu'une fois.
 */
const neutralCache = new WeakMap<CanvasImageSource, Map<number, THREE.CanvasTexture>>();

export function neutralAlbedoTexture(image: CanvasImageSource, width = 1024): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const perSize = neutralCache.get(image) ?? new Map<number, THREE.CanvasTexture>();
  const cached = perSize.get(width);
  if (cached) return cached;

  const source = image as { width?: number; height?: number };
  const srcW = source.width ?? width;
  const srcH = source.height ?? width;
  const height = Math.max(1, Math.round((width * srcH) / srcW));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);
  const data = pixels.data;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = luma;
    sum += luma;
    count++;
  }
  // On recale la moyenne autour de 0,82 : un T-shirt blanc reste blanc (la texture
  // fournisseur est souvent mate ou sombre) tout en gardant les nuances du tissu.
  const mean = count ? sum / count : 128;
  const gain = mean > 1 ? Math.min(3, (0.82 * 255) / mean) : 1;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = Math.min(255, data[i] * gain);
  }
  ctx.putImageData(pixels, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.flipY = false; // même convention que les textures glTF (origine en haut à gauche)
  texture.needsUpdate = true;

  perSize.set(width, texture);
  neutralCache.set(image, perSize);
  return texture;
}
