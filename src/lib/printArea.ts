// Mapping print-area (fonction pure, testée) : convertit une zone normalisée en
// rectangle pixels canvas et calcule la taille/position du design selon le mode.
//  - contain  : ratio préservé, design entièrement DANS la zone, centré (défaut)
//  - cover    : ratio préservé, zone remplie — le rect peut DÉPASSER la zone,
//               l'appelant doit clipper au dessin (ctx.clip) — YAGNI au MVP
//  - stretch  : remplit la zone sans préserver le ratio

import type { Zone } from './products';

export type FitMode = 'contain' | 'cover' | 'stretch';
export type Rect = { x: number; y: number; w: number; h: number };

export function computePrintRect(
  designW: number,
  designH: number,
  canvasW: number,
  canvasH: number,
  zone: Zone,
  mode: FitMode = 'contain',
): Rect {
  if (designW <= 0 || designH <= 0) {
    throw new RangeError('designW et designH doivent être > 0');
  }
  if (canvasW <= 0 || canvasH <= 0) {
    throw new RangeError('canvasW et canvasH doivent être > 0');
  }

  const zx = zone.x * canvasW;
  const zy = zone.y * canvasH;
  const zw = zone.w * canvasW;
  const zh = zone.h * canvasH;

  if (mode === 'stretch') {
    return { x: zx, y: zy, w: zw, h: zh };
  }

  const scale =
    mode === 'cover'
      ? Math.max(zw / designW, zh / designH)
      : Math.min(zw / designW, zh / designH);

  const w = designW * scale;
  const h = designH * scale;
  return {
    x: zx + (zw - w) / 2,
    y: zy + (zh - h) / 2,
    w,
    h,
  };
}
