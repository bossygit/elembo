// Composition du visuel en Canvas 2D — maths pures testables + rendu.
//
// Rôle : le Canvas 2D est responsable de la COMPOSITION du design ; Three.js est
// responsable de son AFFICHAGE. Ce module ne connaît donc ni Three.js ni React, et
// il est le seul endroit qui sait placer/borner un visuel dans une zone d'impression.

import type { DesignTransform, Side } from '../../types/configurator';
import { TRANSFORM_LIMITS } from '../../types/configurator';
import type { PrintArea, Product } from '../products/catalog';

/** Texture d'aperçu (écran) — volontairement limitée pour rester fluide. */
export const PREVIEW_TEXTURE_SIZE = 1024;
/** Densité cible du fichier d'impression. */
export const PRINT_DPI = 300;
/** Garde-fou : taille maximale du fichier de production. */
export const MAX_PRINT_TEXTURE_SIZE = 4096;

export type Rect = { x: number; y: number; w: number; h: number };

/** Zone d'impression exprimée en pixels de la texture (texture carrée). */
export function printAreaRect(area: PrintArea, textureSize: number): Rect {
  if (textureSize <= 0) throw new RangeError('textureSize doit être > 0');
  return {
    x: area.x * textureSize,
    y: area.y * textureSize,
    w: area.w * textureSize,
    h: area.h * textureSize,
  };
}

/** Boîte englobante d'un rectangle pivoté (pour borner correctement). */
export function rotatedBox(w: number, h: number, rotationDeg: number): { w: number; h: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { w: w * c + h * s, h: w * s + h * c };
}

/**
 * Rectangle du visuel dans la texture, en pixels, centré sur le centre de la zone
 * décalé par la transformation. Échelle 1 = le visuel occupe la zone au mieux
 * (contain), sans déformation.
 */
export function designRect(
  transform: DesignTransform,
  area: PrintArea,
  textureSize: number,
  assetSize: { w: number; h: number },
): Rect {
  if (assetSize.w <= 0 || assetSize.h <= 0) throw new RangeError('dimensions du visuel invalides');
  const zone = printAreaRect(area, textureSize);
  const fit = Math.min(zone.w / assetSize.w, zone.h / assetSize.h);
  const w = assetSize.w * fit * transform.scale;
  const h = assetSize.h * fit * transform.scale;
  const cx = zone.x + zone.w / 2 + transform.x * zone.w;
  const cy = zone.y + zone.h / 2 + transform.y * zone.h;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * Borne une transformation pour que le visuel ne puisse pas sortir arbitrairement de
 * la zone d'impression :
 *  - visuel plus petit que la zone → il reste entièrement dedans ;
 *  - visuel plus grand que la zone → il peut glisser tant qu'il recouvre la zone
 *    (ce qui dépasse est rogné, comme en impression réelle).
 */
export function clampTransform(
  transform: DesignTransform,
  area: PrintArea,
  textureSize: number,
  assetSize: { w: number; h: number },
): DesignTransform {
  const scale = Math.min(TRANSFORM_LIMITS.scaleMax, Math.max(TRANSFORM_LIMITS.scaleMin, transform.scale));
  const rotation = Math.min(
    TRANSFORM_LIMITS.rotationMax,
    Math.max(TRANSFORM_LIMITS.rotationMin, transform.rotation),
  );
  const zone = printAreaRect(area, textureSize);
  const rect = designRect({ ...transform, scale, rotation }, area, textureSize, assetSize);
  const box = rotatedBox(rect.w, rect.h, rotation);

  const maxX = Math.abs(zone.w - box.w) / 2 / zone.w;
  const maxY = Math.abs(zone.h - box.h) / 2 / zone.h;

  return {
    x: Math.min(maxX, Math.max(-maxX, transform.x)),
    y: Math.min(maxY, Math.max(-maxY, transform.y)),
    scale,
    rotation,
  };
}

export type DrawParams = {
  /** Côté de la texture carrée, en pixels. */
  size: number;
  area: PrintArea;
  transform: DesignTransform;
  /** Visuel déjà chargé (HTMLImageElement / ImageBitmap). null = rien à dessiner. */
  design?: CanvasImageSource | null;
  /** Taille naturelle du visuel — nécessaire pour le contain. */
  assetSize?: { w: number; h: number };
  /** Couleur du produit : si fournie, le panneau est rempli (mode aperçu éditeur). */
  baseColor?: string | null;
  /** Repères de calage (zone d'impression) — jamais dans la texture d'impression. */
  showGuides?: boolean;
};

/**
 * Compose le panneau : fond optionnel, puis le visuel rogné à la zone d'impression.
 * Sans `baseColor`, la texture est transparente hors du visuel : la couleur du
 * produit reste portée par le matériau 3D, ce qui préserve les propriétés PBR.
 */
export function drawComposition(ctx: CanvasRenderingContext2D, p: DrawParams): void {
  const zone = printAreaRect(p.area, p.size);
  ctx.clearRect(0, 0, p.size, p.size);

  if (p.baseColor) {
    ctx.fillStyle = p.baseColor;
    ctx.fillRect(0, 0, p.size, p.size);
  }

  if (p.design && p.assetSize) {
    const rect = designRect(p.transform, p.area, p.size, p.assetSize);
    ctx.save();
    ctx.beginPath();
    ctx.rect(zone.x, zone.y, zone.w, zone.h);
    ctx.clip();
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    if (p.transform.rotation !== 0) ctx.rotate((p.transform.rotation * Math.PI) / 180);
    ctx.drawImage(p.design, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
    ctx.restore();
  }

  if (p.showGuides) {
    ctx.save();
    ctx.strokeStyle = 'rgba(232, 95, 0, 0.95)';
    ctx.lineWidth = Math.max(1, p.size / 320);
    ctx.setLineDash([p.size / 60, p.size / 90]);
    ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
    ctx.restore();
  }
}

/** Taille en pixels du fichier de production, à la densité d'impression cible. */
export function productionTextureSize(area: PrintArea, dpi = PRINT_DPI): { w: number; h: number } {
  const px = (cm: number) => Math.round((cm / 2.54) * dpi);
  return {
    w: Math.min(MAX_PRINT_TEXTURE_SIZE, px(area.cmWidth)),
    h: Math.min(MAX_PRINT_TEXTURE_SIZE, px(area.cmHeight)),
  };
}

/** Zone d'impression d'un côté, ou null si le produit ne l'expose pas. */
export function areaForSide(product: Product | undefined, side: Side): PrintArea | null {
  return product?.printAreas?.[side] ?? null;
}

/**
 * Taille réellement imprimée du visuel (cm). Grâce à l'invariant isotrope du
 * catalogue, le ratio de la texture est celui de la zone physique — la conversion
 * ci-dessous est donc exacte dans les deux directions.
 */
export function printedCm(rect: Rect, area: PrintArea, textureSize: number): { w: number; h: number } {
  const zone = printAreaRect(area, textureSize);
  return { w: (rect.w / zone.w) * area.cmWidth, h: (rect.h / zone.h) * area.cmHeight };
}
