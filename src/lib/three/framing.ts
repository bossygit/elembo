// Cadrage automatique de la caméra sur un modèle.
//
// Pourquoi c'est indispensable : un modèle fournisseur arrive dans SES propres unités et
// avec son propre décalage d'origine (le T-shirt raglan mesure 28 unités de haut et son
// origine est 37 unités sous le vêtement). Une caméra fixe réglée pour un autre modèle
// ne montre donc rien du tout. On calcule ici le cadrage à partir de la boîte englobante
// réelle — fonctions pures, testables sans WebGL.

export type Box = { min: [number, number, number]; max: [number, number, number] };

export type Framing = {
  /** Centre de la boîte — cible des contrôles orbitaux. */
  center: [number, number, number];
  /** Distance caméra ↔ centre pour contenir le modèle entier. */
  distance: number;
  /** Rayon de la sphère englobante. */
  radius: number;
  /** Hauteur du modèle (pour l'échelle des ombres et l'inclinaison initiale). */
  height: number;
  minDistance: number;
  maxDistance: number;
  /** Position au sol, pour poser les ombres de contact. */
  groundY: number;
  /** Échelle du plan d'ombre. */
  shadowScale: number;
};

/**
 * Cadrage pour tenir le modèle entier dans le champ, à la distance la plus proche
 * possible (le côté le plus contraignant l'emporte : hauteur ou largeur selon le format
 * de la vue).
 */
export function framingFor(box: Box, fovDeg: number, aspect = 1, margin = 1.06): Framing {
  const size: [number, number, number] = [0, 1, 2].map((i) => Math.max(1e-6, box.max[i] - box.min[i])) as [
    number,
    number,
    number,
  ];
  const center: [number, number, number] = [0, 1, 2].map((i) => (box.min[i] + box.max[i]) / 2) as [
    number,
    number,
    number,
  ];

  const halfFov = (fovDeg * Math.PI) / 180 / 2;
  const tanV = Math.tan(halfFov);
  const tanH = tanV * Math.max(0.2, aspect);

  const distanceVertical = size[1] / 2 / tanV;
  const distanceHorizontal = size[0] / 2 / tanH;
  const distance = Math.max(distanceVertical, distanceHorizontal) * margin + size[2] / 2;

  const radius = Math.hypot(size[0], size[1], size[2]) / 2;

  return {
    center,
    distance,
    radius,
    height: size[1],
    minDistance: Math.max(distance * 0.25, radius * 0.35),
    maxDistance: distance * 4,
    groundY: box.min[1] - size[1] * 0.02,
    shadowScale: Math.max(size[0], size[1]) * 2.4,
  };
}
