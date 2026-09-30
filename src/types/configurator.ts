// Types du configurateur 3D — une seule source de vérité, partagée par le Canvas 2D
// (éditeur) et par Three.js (rendu), conformément à l'architecture visée.

export type Side = 'front' | 'back';

/**
 * Transformation du visuel dans la zone d'impression.
 *  - x, y      : décalage du centre, en fraction de la taille de la zone (1 = une
 *                largeur (resp. hauteur) de zone). Borné pour que le visuel ne
 *                sorte pas de la zone d'impression.
 *  - scale     : 1 = le visuel occupe la zone au mieux (contain), borné 0.2..2.
 *  - rotation  : degrés, borné -180..180.
 */
export type DesignTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

/** Visuel utilisateur. `originalUrl` est un object URL de session (blob:), jamais persisté. */
export type DesignAsset = {
  originalUrl: string;
  name: string;
  width: number;
  height: number;
};

/** Configuration sérialisable : permet de reconstruire le visuel, pas seulement une image. */
export type ConfiguratorConfig = {
  version: 1;
  productId: string;
  color: string;
  side: Side;
  design: {
    imageUrl: string;
    name: string;
    width: number;
    height: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
  } | null;
};

export const TRANSFORM_LIMITS = {
  scaleMin: 0.2,
  scaleMax: 2,
  rotationMin: -180,
  rotationMax: 180,
} as const;
