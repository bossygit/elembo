// Export du visuel pour l'impression.
//
// Deux niveaux bien distincts (§17) :
//   APERÇU      → PREVIEW_TEXTURE_SIZE (1024), dessiné dans la texture 3D
//   PRODUCTION  → fichier recadré sur la zone d'impression, à 300 dpi de la taille
//                 physique réelle (ex. 21 × 30 cm → 2480 × 3543 px)
//
// Le fichier d'origine de l'utilisateur n'est jamais réduit : il reste en mémoire
// (object URL) et c'est lui qui est rééchantillonné ici, à la demande.

import type { DesignTransform } from '../../types/configurator';
import type { PrintArea } from '../products/catalog';
import { compositionSize, designRect, printAreaRect, productionTextureSize } from './design-canvas';

/** Espace de composition interne pour l'export (assez grand pour ne pas interpoler deux fois). */
const COMPOSE_SPACE = 2048;

export type RenderPrintParams = {
  area: PrintArea;
  transform: DesignTransform;
  image: HTMLImageElement | null;
  /** Taille d'impression souhaitée en pixels ; par défaut 300 dpi sur la zone physique. */
  size?: { w: number; h: number };
};

/** Compose le fichier d'impression (PNG, fond transparent, sans repères de calage). */
export async function renderPrintPng(params: RenderPrintParams): Promise<Blob | null> {
  const { area, transform, image } = params;
  if (!image) return null;

  const target = params.size ?? productionTextureSize(area);
  // L'espace de composition doit avoir le format de la zone (sinon le visuel exporté
  // serait étiré), puis on recadre sur la zone : le fichier de production est exactement
  // la zone d'impression, à 300 dpi de sa taille physique.
  const space = compositionSize(area, COMPOSE_SPACE);
  const zone = printAreaRect(area, space);
  const rect = designRect(transform, area, space, { w: image.naturalWidth, h: image.naturalHeight });

  const ratio = target.w / zone.w;
  const canvas = document.createElement('canvas');
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

  ctx.beginPath();
  ctx.rect(zone.x, zone.y, zone.w, zone.h);
  ctx.clip();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  if (transform.rotation !== 0) ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.drawImage(image, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
  ctx.restore();

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
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
