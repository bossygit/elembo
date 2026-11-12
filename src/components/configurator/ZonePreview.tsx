'use client';

// Aperçu 2D d'une zone d'impression : couleur du vêtement, gabarit de la pièce (optionnel)
// et visuels composés. Sert aux vignettes de navigation et aux récapitulatifs.
//
// Le dessin passe par `drawComposition` — la MÊME fonction que l'éditeur, la texture 3D et
// les fichiers de production. Une vignette ne peut donc pas montrer autre chose que ce qui
// sera imprimé.

import { useEffect, useRef } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById } from '../../lib/products/catalog';
import {
  compositionSize,
  drawComposition,
  elementsOfSide,
} from '../../lib/canvas/design-canvas';
import type { Side } from '../../types/configurator';
import { useElementImages, useTextFonts } from './useElementImages';
import { gabaritUrl } from '../../lib/zone-assets';

/** Largeur de composition des vignettes : assez nette, assez légère pour cinq zones. */
const PREVIEW_BASE = 480;


export default function ZonePreview({
  side,
  gabarit = false,
  height,
  className = '',
}: {
  side: Side;
  /** Affiche la silhouette du patron en filigrane derrière le visuel. */
  gabarit?: boolean;
  /** Hauteur imposée (vignettes de navigation) ; sinon la largeur du parent décide. */
  height?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const productId = useConfiguratorStore((s) => s.productId);
  const profileId = useConfiguratorStore((s) => s.profileId);
  const elements = useConfiguratorStore((s) => s.elements);
  const measure = useConfiguratorStore((s) => s.measure);
  const color = useConfiguratorStore((s) => s.color);
  const images = useElementImages(elements);
  const fontesVersion = useTextFonts(elements);

  const product = getProductById(productId);
  const area = getPrintArea(product, side, profileId);
  const space = area ? compositionSize(area, PREVIEW_BASE) : { width: PREVIEW_BASE, height: PREVIEW_BASE };
  const deLaZone = elementsOfSide(elements, side);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !area) return;
    canvas.width = space.width;
    canvas.height = space.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawComposition(ctx, {
      size: space.width,
      height: space.height,
      area,
      elements: deLaZone.map((element) => ({ element, image: images.get(element.id) ?? null })),
      baseColor: null,
      showGuides: false,
      measure,
    });
    // `fontesVersion` force un redessin quand une police vient d'être chargée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, space.width, space.height, elements, side, images, measure, fontesVersion]);

  if (!area) return null;

  return (
    <div
      className={`relative shrink-0 overflow-hidden ${className}`}
      style={{
        aspectRatio: `${space.width} / ${space.height}`,
        backgroundColor: color,
        ...(height ? { height, width: 'auto' } : {}),
      }}
    >
      {gabarit && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={gabaritUrl(side)}
          alt=""
          aria-hidden
          loading={height ? 'eager' : 'lazy'}
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill opacity-45"
        />
      )}
      <canvas ref={canvasRef} aria-hidden className="relative block h-full w-full" />
    </div>
  );
}
