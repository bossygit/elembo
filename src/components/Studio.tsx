'use client';

// Studio : orchestrateur du MVP — produit + design + contrôles + canvas + download.
// 100 % client-side : le design reste en mémoire navigateur, rien n'est stocké.

import { useRef, useState } from 'react';
import { PRODUCTS } from '../lib/products';
import type { ProductDef } from '../lib/products';
import UploadZone, { type Design } from './UploadZone';
import MockupCanvas from './MockupCanvas';
import DesignControls from './DesignControls';
import DownloadButton from './DownloadButton';

export default function Studio() {
  const [product, setProduct] = useState<ProductDef>(PRODUCTS[0]);
  const [design, setDesign] = useState<Design | null>(null);
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState<'contain' | 'stretch'>('contain');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [showZones, setShowZones] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ id: number; lastX: number; lastY: number } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!design) return;
    try {
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    } catch {
      // capture optionnelle : ne doit pas empêcher le glisser
    }
    dragRef.current = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId || !design) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    const zoneW = product.zone.w * canvas.width;
    const zoneH = product.zone.h * canvas.height;
    const zoneScale = canvas.width / (canvas.clientWidth || canvas.width); // px canvas par px CSS
    setOffset((o) => ({
      // offset en fraction de zone, borné pour ne jamais perdre le design
      x: Math.min(1.5, Math.max(-1.5, o.x + (dx * zoneScale) / zoneW)),
      y: Math.min(1.5, Math.max(-1.5, o.y + (dy * zoneScale) / zoneH)),
    }));
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.id === e.pointerId) {
      try {
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
      } catch {
        // capture optionnelle
      }
      dragRef.current = null;
    }
  }

  return (
    <section id="studio" className="mx-auto w-full max-w-5xl px-4 py-12">
      <div className="grid gap-8 md:grid-cols-[280px_1fr_220px]">
        {/* Colonne gauche : produit + upload */}
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              1. Choisissez le produit
            </h2>
            <div className="flex flex-col gap-2">
              {PRODUCTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProduct(p);
                    setOffset({ x: 0, y: 0 });
                  }}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                    product.id === p.id
                      ? 'border-[#E85F00] bg-[#E85F00]/10 text-neutral-900'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                  }`}
                >
                  {p.label}
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: p.accent }}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              2. Uploadez votre design
            </h2>
            <UploadZone onDesign={setDesign} />
          </div>
        </div>

        {/* Colonne centrale : mockup */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            3. Votre mockup en direct
          </h2>
          <MockupCanvas
            product={product}
            design={design}
            scale={scale}
            fitMode={fitMode}
            offset={offset}
            showZones={showZones}
            canvasRef={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          <label className="mt-3 flex w-fit items-center gap-2 text-xs text-neutral-500">
            <input
              type="checkbox"
              checked={showZones}
              onChange={(e) => setShowZones(e.target.checked)}
              className="accent-[#E85F00]"
            />
            Afficher la zone d'impression (calage)
          </label>
        </div>

        {/* Colonne droite : contrôles + download */}
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              4. Ajustez
            </h2>
            <DesignControls
              scale={scale}
              onScale={setScale}
              fitMode={fitMode}
              onFitMode={setFitMode}
              onReset={() => setOffset({ x: 0, y: 0 })}
              disabled={!design}
            />
          </div>
          <DownloadButton
            canvasRef={canvasRef}
            filename={`elembo-mockup-${product.id}.png`}
            disabled={!design}
          />
        </div>
      </div>
    </section>
  );
}
