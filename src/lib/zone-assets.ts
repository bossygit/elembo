// Ressources publiques des zones d'impression.
//
// Les gabarits `public/zones/<zone>.png` sont les patrons générés avec le modèle 3D
// (silhouette, maillage, grille en cm, sens de lecture). Ils servent de repère visuel dans
// l'éditeur et les vignettes : ils ne sont JAMAIS imprimés, ni inclus dans les textures.

import type { Side } from '../types/configurator';

/** Chemin public du gabarit d'une zone, préfixé par le basePath du déploiement. */
export function gabaritUrl(side: Side, basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''): string {
  return `${basePath}/zones/${side}.png`;
}
