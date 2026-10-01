'use client';

// Réglages du visuel : échelle, rotation, recentrage, qualité d'impression et export.
// La qualité réutilise les fonctions pures déjà testées du studio 2D
// (src/lib/printQuality.ts) : aucune formule dupliquée.

import { useMemo, useState } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById } from '../../lib/products/catalog';
import { compositionSize, designRect, printedCm, PRINT_DPI, productionTextureSize } from '../../lib/canvas/design-canvas';
import { downloadBlob, renderPrintPng } from '../../lib/canvas/export';
import { assessPrintQuality, computeDpi } from '../../lib/printQuality';
import { useDesignImage } from './useDesignImage';

const LEVEL_CLASS: Record<string, string> = {
  photo: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  bonne: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  faible: 'border-amber-200 bg-amber-50 text-amber-800',
  insuffisant: 'border-red-200 bg-red-50 text-red-700',
};

export default function DesignControls() {
  const productId = useConfiguratorStore((s) => s.productId);
  const side = useConfiguratorStore((s) => s.side);
  const design = useConfiguratorStore((s) => s.design);
  const transform = useConfiguratorStore((s) => s.transform);
  const setTransform = useConfiguratorStore((s) => s.setTransform);
  const resetTransform = useConfiguratorStore((s) => s.resetTransform);
  const showGuides = useConfiguratorStore((s) => s.showGuides);
  const setShowGuides = useConfiguratorStore((s) => s.setShowGuides);

  const image = useDesignImage(design);
  const [exporting, setExporting] = useState(false);

  const area = getPrintArea(getProductById(productId), side);

  const quality = useMemo(() => {
    if (!area || !design) return null;
    const space = compositionSize(area);
    const rect = designRect(transform, area, space, { w: design.width, h: design.height });
    const cm = printedCm(rect, area, space);
    return assessPrintQuality(computeDpi(design.width, design.height, cm.w, cm.h));
  }, [area, design, transform]);

  async function handleExport() {
    if (!area || !image) return;
    setExporting(true);
    try {
      const blob = await renderPrintPng({ area, transform, image });
      if (blob) downloadBlob(blob, `elembo-print-${productId}-${side}.png`);
    } finally {
      setExporting(false);
    }
  }

  const out = area ? productionTextureSize(area) : null;

  return (
    <div className={`flex flex-col gap-4 ${design ? '' : 'opacity-50'}`} aria-disabled={!design}>
      <div>
        <label htmlFor="cfg-scale" className="flex justify-between text-sm font-medium text-neutral-800">
          <span>Taille</span>
          <span className="text-neutral-500">{Math.round(transform.scale * 100)} %</span>
        </label>
        <input
          id="cfg-scale"
          type="range"
          min={0.2}
          max={2}
          step={0.05}
          value={transform.scale}
          disabled={!design}
          onChange={(e) => setTransform({ scale: Number(e.target.value) })}
          className="mt-2 w-full accent-[#E85F00]"
        />
      </div>

      <div>
        <label htmlFor="cfg-rotation" className="flex justify-between text-sm font-medium text-neutral-800">
          <span>Rotation</span>
          <span className="text-neutral-500">{transform.rotation}°</span>
        </label>
        <input
          id="cfg-rotation"
          type="range"
          min={-180}
          max={180}
          step={5}
          value={transform.rotation}
          disabled={!design}
          onChange={(e) => setTransform({ rotation: Number(e.target.value) })}
          className="mt-2 w-full accent-[#E85F00]"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!design}
          onClick={resetTransform}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
        >
          Recentrer
        </button>
        <label className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={showGuides}
            onChange={(e) => setShowGuides(e.target.checked)}
            className="accent-[#E85F00]"
          />
          Repères de zone
        </label>
      </div>

      {quality && (
        <div role="status" aria-live="polite" className={`rounded-lg border px-3 py-2 text-xs ${LEVEL_CLASS[quality.level]}`}>
          <span className="font-semibold">
            {Math.round(quality.dpi)} dpi — {quality.level === 'photo' ? 'qualité photo' : quality.level}
          </span>{' '}
          <span className="opacity-90">{quality.message}</span>
        </div>
      )}

      <button
        type="button"
        disabled={!design || exporting}
        onClick={handleExport}
        className="rounded-xl bg-[#200233] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E85F00] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {exporting ? 'Préparation…' : 'Télécharger le visuel d’impression'}
      </button>
      {out && (
        <p className="text-xs text-neutral-500">
          Fichier haute résolution recadré sur la zone ({out.w}×{out.h} px, {PRINT_DPI} dpi). L’original n’est jamais
          réduit.
        </p>
      )}
    </div>
  );
}
