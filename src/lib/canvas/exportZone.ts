// Génération du fichier d'IMPRESSION d'un tableau (visuel seul, sans décor).
//
// Le fichier doit correspondre exactement à la commande — c'est le point où une erreur se paie
// en toile perdue :
//   • toile seule     : le fichier est au format fini ;
//   • tableau monté   : le fichier comprend le DÉBORD nécessaire à l'enveloppe du châssis
//     (voir lib/products/impression.ts) ;
//   • bord galerie    : le visuel est prolongé jusque dans les débords (pixels des bords étirés),
//     pour que l'image continue sur les côtés du châssis ;
//   • bord encadrement: les débords restent sans encre (toile blanche), ils servent à envelopper
//     et agrafer.
//
// La FACE visible (celle que le client a validée à l'écran) n'est jamais recadrée : elle est
// reproduite à l'identique, et c'est AUTOUR d'elle qu'on ajoute de la matière.

import type { Zone } from '../products/studio';
import type { TableauFormat, TableauSupport } from '../products/tableaux';
import type { ModeBord } from '../products/impression';
import { DPI_IMPRESSION, dimensionsImprimeesCm, rectVisuelPx, tailleFichierPx } from '../products/impression';
import { computePrintRect, computePlacement } from '../printArea';
import type { FitMode } from '../printArea';

export type DesignSource = { url: string; width: number; height: number };

export type ExportVisuelParams = {
  design: DesignSource;
  format: TableauFormat;
  support: TableauSupport;
  bord: ModeBord;
  /** Placement choisi par le client dans l'aperçu. */
  scale: number;
  fitMode: FitMode;
  rotation: number;
  offset: { x: number; y: number };
  /** Résolution du fichier de production (150 dpi : repère courant pour une toile). */
  dpi?: number;
};

/** Nom du fichier de production — jamais celui de l'aperçu (qui contient le décor). */
export function nomFichierImpression(commande: string, formatId: string, support: TableauSupport): string {
  return `${commande}-IMPRESSION-${formatId}-${support}.png`;
}

function chargerImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`visuel illisible : ${src}`));
    img.src = src;
  });
}

/**
 * Compose le fichier d'impression. `canvasFourni` sert aux tests hors navigateur.
 */
export async function renderVisuelPng(
  params: ExportVisuelParams,
  canvasFourni?: HTMLCanvasElement,
): Promise<Blob | null> {
  const dpi = params.dpi ?? DPI_IMPRESSION;
  const dims = dimensionsImprimeesCm(params.format, params.support);
  const { w: W, h: H } = tailleFichierPx(dims, dpi);
  const face = rectVisuelPx({ format: params.format, support: params.support, bord: params.bord, dpi });

  const canvas = canvasFourni ?? document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const c = ctx; // capture non nulle : la fermeture ci-dessous ne peut pas voir le rétrécissement

  const image = await chargerImage(params.design.url);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Placement du visuel DANS LA FACE, avec exactement les mêmes calculs que l'aperçu : le
  // client retrouve ce qu'il a validé, sans recadrage surprise.
  const faceZone: Zone = { x: 0, y: 0, w: 1, h: 1 };
  const base = computePrintRect(params.design.width, params.design.height, face.w, face.h, faceZone, params.fitMode);
  const place = computePlacement(base, faceZone, face.w, face.h, params.scale, params.offset);

  function dessinerVisuel() {
    c.translate(face.x + place.x + place.w / 2, face.y + place.y + place.h / 2);
    if (params.rotation !== 0) c.rotate((params.rotation * Math.PI) / 180);
    c.drawImage(image, -place.w / 2, -place.h / 2, place.w, place.h);
  }

  ctx.save();
  if (params.support === 'chassis' && params.bord === 'galerie') {
    // 1. la face, strictement comme dans l'aperçu ;
    ctx.save();
    ctx.beginPath();
    ctx.rect(face.x, face.y, face.w, face.h);
    ctx.clip();
    dessinerVisuel();
    ctx.restore();

    // 2. les débords, remplis en étirant les pixels des bords de la face : l'image « continue »
    //    sur les côtés du châssis sans jamais recadrer la face.
    const bordG = face.x;
    const bordD = W - (face.x + face.w);
    const bordH = face.y;
    const bordB = H - (face.y + face.h);
    if (bordG > 0) ctx.drawImage(canvas, face.x, face.y, 1, face.h, 0, face.y, bordG, face.h);
    if (bordD > 0) {
      ctx.drawImage(canvas, face.x + face.w - 1, face.y, 1, face.h, face.x + face.w, face.y, bordD, face.h);
    }
    if (bordH > 0) ctx.drawImage(canvas, 0, face.y, W, 1, 0, 0, W, bordH);
    if (bordB > 0) {
      ctx.drawImage(canvas, 0, face.y + face.h - 1, W, 1, 0, face.y + face.h, W, bordB);
    }
  } else {
    // Toile seule, ou bord encadrement : le visuel occupe la face, les débords restent sans
    // encre (toile blanche).
    dessinerVisuel();
  }
  ctx.restore();

  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
