'use client';

// MockupCanvas : composition canvas 2D — photo de mockup en fond, design dessiné
// dans la zone d'impression prédéfinie (computePrintRect), échelle + décalage,
// rectangle de zone en mode debug. Re-render sur chaque changement d'état.

import { useEffect } from 'react';
import type { RefObject } from 'react';
import { computePrintRect } from '../lib/printArea';
import type { ProductDef } from '../lib/products';
import type { Design } from './UploadZone';

type Props = {
  product: ProductDef;
  design: Design | null;
  scale: number; // 0.5..1.5 (multiplicateur du rect fit)
  fitMode: 'contain' | 'stretch';
  offset: { x: number; y: number }; // décalage en fraction de la taille de zone
  showZones: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`chargement impossible : ${src}`));
    img.src = src;
  });
}

export default function MockupCanvas({
  product,
  design,
  scale,
  fitMode,
  offset,
  showZones,
  canvasRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: Props) {
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    Promise.all([loadImage(product.mockup), design ? loadImage(design.url) : null])
      .then(([mock, des]) => {
        if (cancelled || !canvasRef.current) return;
        const W = Math.min(mock.naturalWidth, 1400);
        const H = Math.round((mock.naturalHeight / mock.naturalWidth) * W);
        canvas.width = W;
        canvas.height = H;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(mock, 0, 0, W, H);

        const zx = product.zone.x * W;
        const zy = product.zone.y * H;
        const zw = product.zone.w * W;
        const zh = product.zone.h * H;

        if (des) {
          const rect = computePrintRect(des.width, des.height, W, H, product.zone, fitMode);
          const w = rect.w * scale;
          const h = rect.h * scale;
          const x = rect.x + (rect.w - w) / 2 + offset.x * zw;
          const y = rect.y + (rect.h - h) / 2 + offset.y * zh;
          // Mouvement libre, clip à la zone : ce qui dépasse la zone ne s'imprime pas
          // (sémantique Printful — la zone d'impression définit ce qui est imprimé)
          ctx.save();
          ctx.beginPath();
          ctx.rect(zx, zy, zw, zh);
          ctx.clip();
          ctx.drawImage(des, x, y, w, h);
          ctx.restore();
        }

        if (showZones) {
          ctx.save();
          ctx.strokeStyle = 'rgba(232, 95, 0, 0.95)';
          ctx.lineWidth = Math.max(2, W / 300);
          ctx.setLineDash([10, 7]);
          ctx.strokeRect(zx, zy, zw, zh);
          ctx.restore();
        }
      })
      .catch(() => {
        // photo de mockup absente : canvas laissé vide, l'UI affiche l'état
      });

    return () => {
      cancelled = true;
    };
  }, [product, design, scale, fitMode, offset, showZones, canvasRef]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label={`Mockup ${product.label} avec votre design`}
        className="w-full rounded-xl border border-neutral-200 bg-neutral-100"
      />
      {!design && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg bg-white/90 px-4 py-2 text-sm text-neutral-600">
            Uploadez un design pour le voir apparaître sur le {product.label.toLowerCase()}
          </p>
        </div>
      )}
    </div>
  );
}
