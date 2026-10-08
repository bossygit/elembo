// Export d'un visuel SEUL (sans la photo d'ambiance), au format physique du support.
//
// Pourquoi : un tableau s'imprime plein cadre — l'atelier n'a pas besoin du mockup, il lui faut
// le visuel au bon ratio et à la bonne résolution. On redessine donc le visuel à la taille
// d'impression demandée (150 dpi par défaut : le repère courant pour une toile regardée à
// distance), fond transparent, sans repère de calage.

import type { Zone } from '../products/studio';
import { computePrintRect, computePlacement } from '../printArea';
import type { FitMode } from '../printArea';

export type DesignSource = { url: string; width: number; height: number };

export type ExportVisuelParams = {
  design: DesignSource;
  /** Zone d'impression dans le mockup (fractions), et sa taille physique. */
  zone: Zone;
  zoneCm: { w: number; h: number };
  scale: number;
  fitMode: FitMode;
  rotation: number;
  offset: { x: number; y: number };
  /** Résolution du fichier de sortie, en points par pouce de la zone physique. */
  dpi?: number;
};

export const DPI_IMPRESSION_CANVAS = 150;

/** Dimensions en pixels du fichier d'impression pour une zone physique donnée. */
export function tailleImpressionPx(zoneCm: { w: number; h: number }, dpi = DPI_IMPRESSION_CANVAS) {
  return {
    w: Math.round((zoneCm.w / 2.54) * dpi),
    h: Math.round((zoneCm.h / 2.54) * dpi),
  };
}

/**
 * Compose le visuel au format d'impression. Le même calcul que l'aperçu (contain/cover,
 * échelle, décalage, rotation) est rejoué — le fichier correspond donc exactement à ce que
 * le client a validé à l'écran.
 */
export async function renderVisuelPng(params: ExportVisuelParams): Promise<Blob | null> {
  const dpi = params.dpi ?? DPI_IMPRESSION_CANVAS;
  const { w: W, h: H } = tailleImpressionPx(params.zoneCm, dpi);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const plein: Zone = { x: 0, y: 0, w: 1, h: 1 };
  const rect = computePrintRect(params.design.width, params.design.height, W, H, plein, params.fitMode);
  const p = computePlacement(rect, plein, W, H, params.scale, params.offset);

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`visuel illisible : ${params.design.url}`));
    img.src = params.design.url;
  });

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  if (params.rotation !== 0) ctx.rotate((params.rotation * Math.PI) / 180);
  ctx.drawImage(image, -p.w / 2, -p.h / 2, p.w, p.h);

  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/** Nom de fichier normalisé du visuel d'impression. */
export function nomFichierImpression(commande: string, formatId: string): string {
  return `${commande}-tableau-${formatId}.png`;
}
