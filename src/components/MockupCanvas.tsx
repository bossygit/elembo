'use client';

// MockupCanvas : composition canvas 2D — photo de mockup en fond, design dessiné
// dans la zone d'impression prédéfinie (computePrintRect + computePlacement), avec
// échelle, décalage en fraction de zone, ROTATION autour du centre du design, et
// clippage à la zone (ce qui dépasse ne s'imprime pas, sémantique Printful).
// Affiche aussi la qualité d'impression réelle (dpi) pour éviter les tirages flous.

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { computePrintRect, computePlacement } from '../lib/printArea';
import type { FitMode } from '../lib/printArea';
import { printedSizeCm, computeDpi, assessPrintQuality } from '../lib/printQuality';
import type { PrintQuality } from '../lib/printQuality';
import type { ProductDef } from '../lib/products';
import type { Design } from './UploadZone';

type Props = {
  product: ProductDef;
  design: Design | null;
  scale: number; // 0.5..1.5 (multiplicateur du rect fit)
  fitMode: FitMode;
  offset: { x: number; y: number }; // décalage en fraction de la taille de zone
  rotation: number; // degrés, -180..180
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

const BADGE: Record<PrintQuality['level'], string> = {
  photo: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  bonne: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  faible: 'bg-amber-50 text-amber-800 border-amber-200',
  insuffisant: 'bg-red-50 text-red-700 border-red-200',
};

const BADGE_LABEL: Record<PrintQuality['level'], string> = {
  photo: 'Qualité photo',
  bonne: 'Bonne qualité',
  faible: 'Qualité faible',
  insuffisant: 'Rendu flou',
};

export default function MockupCanvas({
  product,
  design,
  scale,
  fitMode,
  offset,
  rotation,
  showZones,
  canvasRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: Props) {
  const [quality, setQuality] = useState<PrintQuality | null>(null);

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
          const p = computePlacement(rect, product.zone, W, H, scale, offset);

          // Mouvement libre, clip à la zone : ce qui dépasse la zone ne s'imprime pas
          ctx.save();
          ctx.beginPath();
          ctx.rect(zx, zy, zw, zh);
          ctx.clip();
          ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
          if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
          ctx.drawImage(des, -p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();

          // Qualité réelle : densité du visuel sur la surface imprimée
          const cm = printedSizeCm(p, { w: zw, h: zh }, product.zoneCm, 1);
          setQuality(assessPrintQuality(computeDpi(des.width, des.height, cm.w, cm.h)));
        } else {
          setQuality(null);
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
  }, [product, design, scale, fitMode, offset, rotation, showZones, canvasRef]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={`Mockup ${product.label} avec votre design`}
        className="w-full cursor-grab touch-none rounded-xl border border-neutral-200 bg-neutral-100 active:cursor-grabbing"
      />
      {!design && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg bg-white/90 px-4 py-2 text-sm text-neutral-600">
            Uploadez un design pour le voir apparaître sur le {product.label.toLowerCase()}
          </p>
        </div>
      )}

      {design && quality && (
        <div
          role="status"
          aria-live="polite"
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${BADGE[quality.level]}`}
        >
          <span className="font-semibold">
            {BADGE_LABEL[quality.level]} — {Math.round(quality.dpi)} dpi
          </span>{' '}
          <span className="opacity-90">{quality.message}</span>
        </div>
      )}
    </div>
  );
}
