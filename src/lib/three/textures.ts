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

const cache = new Map<string, PanelEntry>();

function createEntry(key: string, size: number): PanelEntry {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
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

/** Obtient (ou crée) le couple canvas + texture d'un panneau. */
export function getPanelEntry(key: string, size: number): PanelEntry {
  const existing = cache.get(key);
  if (existing && existing.canvas.width === size) return existing;
  if (existing) disposeEntry(existing);
  return createEntry(key, size);
}

/** Redessine le panneau et marque la texture comme modifiée (sans la recréer). */
export function updatePanelTexture(key: string, params: Omit<DrawParams, 'size'> & { size: number }): THREE.CanvasTexture {
  const entry = getPanelEntry(key, params.size);
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
