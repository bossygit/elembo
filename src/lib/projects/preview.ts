// Aperçu d'un projet sauvegardé (panier, « mes créations »).
//
// L'aperçu n'est PAS une capture du modèle 3D : c'est la composition 2D de la zone
// principale, fond couleur du vêtement + silhouette du patron + visuels. Même moteur de
// dessin que l'éditeur et l'export : ce qui est montré est ce qui sera imprimé.
//
// Le résultat est un data URL JPEG compact (≤ ~40 Ko) : il tient dans localStorage à côté
// de plusieurs projets sans le saturer.

import type { ConfiguratorConfig, DesignElement, Side } from '../../types/configurator';
import { SIDES } from '../../types/configurator';
import { getPrintArea, getProductById } from '../products/catalog';
import { profilParId } from '../products/production';
import { compositionSize, drawComposition, elementsOfSide } from '../canvas/design-canvas';
import type { Measurer } from '../canvas/design-canvas';
import { gabaritUrl } from '../zone-assets';

/** Largeur de l'aperçu (assez pour une carte, assez léger pour localStorage). */
const APERCU_LARGEUR = 420;

function chargerImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** Zone la plus représentative du projet : la première qui porte un visuel visible. */
export function zonePrincipale(config: ConfiguratorConfig): Side | null {
  const sides = SIDES.filter((side) => elementsOfSide(config.elements as DesignElement[], side).some((el) => el.visible !== false));
  if (sides.includes('front')) return 'front';
  return sides[0] ?? null;
}

export type ApercuParams = {
  config: ConfiguratorConfig;
  elements: DesignElement[];
  /** Images déjà décodées, indexées par identifiant d'élément. */
  images: Map<string, HTMLImageElement>;
  measure?: Measurer;
};

/**
 * Compose l'aperçu d'un projet. `null` si la zone n'est pas calculable (produit inconnu,
 * profil sans zone…) : l'interface affiche alors une vignette de repli.
 */
export async function apercuProjet({ config, elements, images, measure }: ApercuParams): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const product = getProductById(config.productId);
  if (!product) return null;
  const profil = profilParId(config.profileId);
  const side = zonePrincipale(config) ?? config.side;
  const area = getPrintArea(product, side, profil.id);
  if (!area) return null;

  const space = compositionSize(area, APERCU_LARGEUR);

  // 1. la composition, transparente, sur un canvas hors écran ;
  const composition = document.createElement('canvas');
  composition.width = space.width;
  composition.height = space.height;
  const ctxComposition = composition.getContext('2d');
  if (!ctxComposition) return null;
  drawComposition(ctxComposition, {
    size: space.width,
    height: space.height,
    area,
    elements: elementsOfSide(elements, side).map((element) => ({
      element,
      image: images.get(element.id) ?? null,
    })),
    baseColor: null,
    showGuides: false,
    measure,
  });

  // 2. le fond : couleur du vêtement + silhouette du patron en filigrane ;
  const canvas = document.createElement('canvas');
  canvas.width = space.width;
  canvas.height = space.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = config.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gabarit = await chargerImage(gabaritUrl(side));
  if (gabarit) {
    ctx.globalAlpha = 0.22;
    ctx.drawImage(gabarit, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(composition, 0, 0);

  try {
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}
