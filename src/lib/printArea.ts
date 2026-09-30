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

/**
 * Placement final du design à l'écran : part du rect de référence (contain/cover/
 * stretch) et applique l'échelle utilisateur puis le décalage, exprimé en fraction
 * de la zone (1 = une largeur/hauteur de zone, donc indépendant de la résolution
 * du canvas). Le design reste centré sur le rect de référence quand scale = 1 et
 * que le décalage est nul.
 */
export function computePlacement(
  rect: Rect,
  zone: Zone,
  canvasW: number,
  canvasH: number,
  scale: number,
  offset: { x: number; y: number },
): Rect {
  const zw = zone.w * canvasW;
  const zh = zone.h * canvasH;
  const w = rect.w * scale;
  const h = rect.h * scale;
  return {
    x: rect.x + (rect.w - w) / 2 + offset.x * zw,
    y: rect.y + (rect.h - h) / 2 + offset.y * zh,
    w,
    h,
  };
}
