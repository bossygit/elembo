// Export du design pour l'impression.
//
// Deux niveaux bien distincts (§17) :
//   APERÇU      → PREVIEW_TEXTURE_SIZE (1024), dessiné dans la texture 3D
//   PRODUCTION  → fichier recadré sur la zone d'impression, à 300 dpi de la taille
//                 physique réelle (ex. 21 × 30 cm → 2480 × 3543 px)
//
// Le fichier d'impression est RECOMPOSÉ à partir des paramètres des éléments : le texte
// est redessiné à la résolution cible (jamais agrandi depuis l'aperçu), et les images sont
// rééchantillonnées depuis leur fichier d'origine, jamais réduites plus tôt.

import type { PrintArea } from '../products/catalog';
import { compositionSize, drawComposition, printAreaRect, productionTextureSize } from './design-canvas';
import type { DrawElement, Measurer } from './design-canvas';

/** Espace de composition interne pour l'export (assez grand pour ne pas interpoler deux fois). */
const COMPOSE_SPACE = 2048;

export type RenderPrintParams = {
  area: PrintArea;
  /** Éléments de la face à imprimer, dans l'ordre des calques. */
  elements: DrawElement[];
  /** Taille d'impression souhaitée en pixels ; par défaut 300 dpi sur la zone physique. */
  size?: { w: number; h: number };
  /** Mesureur typographique (celui du canvas d'édition, pour une mise en page identique). */
  measure?: Measurer;
  /** Canvas fourni (tests) — sinon un canvas hors écran est créé. */
  canvas?: HTMLCanvasElement;
};

/** Compose le fichier d'impression (PNG, fond transparent, sans repères de calage). */
export async function renderPrintPng(params: RenderPrintParams): Promise<Blob | null> {
  const { area, elements, measure } = params;
  if (!elements.some((item) => item.element.visible !== false)) return null;

  const target = params.size ?? productionTextureSize(area);
  // L'espace de composition doit avoir le format de la zone (sinon le design exporté
  // serait étiré), puis on recadre sur la zone : le fichier de production est exactement
  // la zone d'impression, à 300 dpi de sa taille physique.
  const space = compositionSize(area, COMPOSE_SPACE);
  const zone = printAreaRect(area, space);
  const ratio = target.w / zone.w;

  const canvas = params.canvas ?? document.createElement('canvas');
  canvas.width = Math.round(zone.w * ratio);
  canvas.height = Math.round(zone.h * ratio);

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.save();
  // La zone d'impression coïncide avec le coin haut-gauche du fichier de sortie.
  ctx.scale(ratio, ratio);
  ctx.translate(-zone.x, -zone.y);
  drawComposition(ctx, {
    size: space.width,
    height: space.height,
    area,
    elements,
    baseColor: null,
    showGuides: false,
    measure,
  });
  ctx.restore();

  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/** Déclenche le téléchargement d'un blob côté navigateur. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
