// Qualité d'impression (fonctions pures, testées).
//
// Pourquoi : un visuel de 500 px étiré sur une zone de 20 cm donne ~64 dpi, donc un
// tirage flou — c'est la première cause de bon à tirer raté en Print-on-Demand. On
// calcule la densité réelle du design sur le support imprimé (pixels de l'image par
// pouce de tissu) et on prévient le client AVANT la production.
//
// Repère métier : 150 dpi est le seuil couramment admis pour un textile imprimé
// correct ; 300 dpi est le repère « qualité photo ».

export const CM_PER_INCH = 2.54;
export const MIN_GOOD_DPI = 150;
export const PHOTO_DPI = 300;

export type PrintQualityLevel = 'photo' | 'bonne' | 'faible' | 'insuffisant';

export type PrintQuality = {
  dpi: number;
  level: PrintQualityLevel;
  message: string;
};

/**
 * Taille physique (cm) réellement imprimée, à partir du rect de placement en pixels
 * canvas, de la taille en pixels de la zone et de la taille physique de la zone.
 */
export function printedSizeCm(
  rect: { x: number; y: number; w: number; h: number },
  zonePx: { w: number; h: number },
  zoneCm: { w: number; h: number },
  scale = 1,
): { w: number; h: number } {
  if (zonePx.w <= 0 || zonePx.h <= 0) {
    throw new RangeError('la taille de zone en pixels doit être > 0');
  }
  return {
    w: ((rect.w * scale) / zonePx.w) * zoneCm.w,
    h: ((rect.h * scale) / zonePx.h) * zoneCm.h,
  };
}

/**
 * Densité du design sur le support : pixels de l'image par pouce imprimé.
 * On retient la direction la plus faible — c'est elle qui détermine la netteté
 * perçue (un visuel très allongé est limité par son petit côté).
 */
export function computeDpi(
  designW: number,
  designH: number,
  printedWCm: number,
  printedHCm: number,
): number {
  if (printedWCm <= 0 || printedHCm <= 0) {
    throw new RangeError('la taille imprimée doit être > 0');
  }
  const dpiX = designW / (printedWCm / CM_PER_INCH);
  const dpiY = designH / (printedHCm / CM_PER_INCH);
  return Math.min(dpiX, dpiY);
}

/** Message lisible et conseil concret selon la densité obtenue. */
export function assessPrintQuality(dpi: number): PrintQuality {
  if (!Number.isFinite(dpi) || dpi < 100) {
    const val = Number.isFinite(dpi) ? Math.round(dpi) : 0;
    return {
      dpi,
      level: 'insuffisant',
      message: `Rendu flou à l'impression (${val} dpi) : visez au moins ${MIN_GOOD_DPI} dpi — réduisez la taille du visuel sur le support ou partez d'une image plus grande.`,
    };
  }
  if (dpi < MIN_GOOD_DPI) {
    return {
      dpi,
      level: 'faible',
      message: `Qualité faible (${Math.round(dpi)} dpi) : le tirage peut paraître légèrement doux. ${MIN_GOOD_DPI} dpi ou plus est recommandé.`,
    };
  }
  if (dpi < PHOTO_DPI) {
    return {
      dpi,
      level: 'bonne',
      message: `Bonne qualité d'impression (${Math.round(dpi)} dpi).`,
    };
  }
  return {
    dpi,
    level: 'photo',
    message: `Qualité photo (${Math.round(dpi)} dpi) : aucun risque de flou.`,
  };
}
