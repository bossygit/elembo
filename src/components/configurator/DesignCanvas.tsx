'use client';

// Éditeur 2D : aperçu du panneau (couleur du produit + repères de zone) et pilotage
// du visuel à la souris ou au doigt (déplacement). Les valeurs sont écrites dans le
// store : la 3D se met à jour immédiatement, sans état parallèle.

import { useEffect, useRef } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById } from '../../lib/products/catalog';
import { drawComposition, printAreaRect } from '../../lib/canvas/design-canvas';
import { useDesignImage } from './useDesignImage';

const EDITOR_SIZE = 720;

export default function DesignCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  const productId = useConfiguratorStore((s) => s.productId);
  const side = useConfiguratorStore((s) => s.side);
  const color = useConfiguratorStore((s) => s.color);
  const design = useConfiguratorStore((s) => s.design);
  const transform = useConfiguratorStore((s) => s.transform);
  const showGuides = useConfiguratorStore((s) => s.showGuides);
  const setTransform = useConfiguratorStore((s) => s.setTransform);
  const image = useDesignImage(design);

  const product = getProductById(productId);
  const area = getPrintArea(product, side);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !area) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawComposition(ctx, {
      size: EDITOR_SIZE,
      area,
      transform,
      design: image,
      assetSize: design ? { w: design.width, h: design.height } : undefined,
      baseColor: color,
      showGuides,
    });
  }, [area, transform, image, design, color, showGuides]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!design) return;
    try {
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    } catch {
      // capture optionnelle
    }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    const canvas = canvasRef.current;
    if (!d || d.id !== e.pointerId || !canvas || !area) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;

    // px écran → px texture → fraction de zone (le store borne ensuite).
    const zone = printAreaRect(area, EDITOR_SIZE);
    const ratio = EDITOR_SIZE / (canvas.clientWidth || EDITOR_SIZE);
    setTransform({
      x: transform.x + (dx * ratio) / zone.w,
      y: transform.y + (dy * ratio) / zone.h,
    });
  }

  function endDrag(e: React.PointerEvent<HTMLCanvasElement>) {
    if (drag.current?.id === e.pointerId) {
      try {
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
      } catch {
        // capture optionnelle
      }
      drag.current = null;
    }
  }

  if (!area) {
    return <p className="text-sm text-neutral-500">Ce produit n’a pas de zone d’impression sur cette face.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={EDITOR_SIZE}
        height={EDITOR_SIZE}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label={`Zone d’impression ${side === 'front' ? 'avant' : 'arrière'}`}
        className={`w-full touch-none rounded-xl border border-neutral-200 ${
          design ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
        }`}
      />
      <p className="text-xs text-neutral-500">
        {design
          ? 'Glissez le visuel dans le cadre pointillé (zone d’impression).'
          : 'Zone d’impression : le visuel reste borné à ce cadre.'}
      </p>
    </div>
  );
}
