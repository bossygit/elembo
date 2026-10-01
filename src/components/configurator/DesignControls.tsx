'use client';

// Impression : repères d'édition, qualité estimée et export du fichier d'impression.
// La qualité réutilise les fonctions pures déjà testées du studio 2D
// (src/lib/printQuality.ts) : aucune formule dupliquée.

import { useMemo, useState } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById } from '../../lib/products/catalog';
import {
  compositionSize,
  elementRect,
  elementsOfSide,
  printedCm,
  PRINT_DPI,
  productionTextureSize,
} from '../../lib/canvas/design-canvas';
import { downloadBlob, renderPrintPng } from '../../lib/canvas/export';
import { assessPrintQuality, computeDpi } from '../../lib/printQuality';
import { useElementImages } from './useElementImages';

const LEVEL_CLASS: Record<string, string> = {
  photo: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  bonne: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  faible: 'border-amber-200 bg-amber-50 text-amber-800',
  insuffisant: 'border-red-200 bg-red-50 text-red-700',
};

export default function DesignControls() {
  const productId = useConfiguratorStore((s) => s.productId);
  const side = useConfiguratorStore((s) => s.side);
  const elements = useConfiguratorStore((s) => s.elements);
  const selectedId = useConfiguratorStore((s) => s.selectedId);
  const measure = useConfiguratorStore((s) => s.measure);
  const showGuides = useConfiguratorStore((s) => s.showGuides);
  const setShowGuides = useConfiguratorStore((s) => s.setShowGuides);

  const images = useElementImages(elements);
  const [exporting, setExporting] = useState(false);

  const area = getPrintArea(getProductById(productId), side);
  const face = useMemo(() => elementsOfSide(elements, side), [elements, side]);

  // Qualité : on évalue l'image la plus contraignante de la face (celle dont la densité
  // effectivement imprimée est la plus faible), pas la première venue.
  const quality = useMemo(() => {
    if (!area) return null;
    const space = compositionSize(area);
    let pire: { dpi: number; level: string; message: string } | null = null;
    for (const el of face) {
      if (el.type !== 'image' || el.visible === false) continue;
      const rect = elementRect(el, area, space, measure);
      const cm = printedCm(rect, area, space);
      const dpi = computeDpi(el.width, el.height, cm.w, cm.h);
      const bilan = assessPrintQuality(dpi);
      if (!pire || bilan.dpi < pire.dpi) pire = bilan;
    }
    return pire;
  }, [area, face, measure]);

  async function handleExport() {
    if (!area) return;
    setExporting(true);
    try {
      const dessines = face.map((element) => ({ element, image: images.get(element.id) ?? null }));
      const blob = await renderPrintPng({ area, elements: dessines, measure });
      if (blob) downloadBlob(blob, `elembo-print-${productId}-${side}.png`);
    } finally {
      setExporting(false);
    }
  }

  const out = area ? productionTextureSize(area) : null;
  const aQuelqueChose = face.some((el) => el.visible !== false);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={showGuides}
          onChange={(e) => setShowGuides(e.target.checked)}
          className="accent-[#E85F00]"
        />
        Repères de zone d’impression
      </label>

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
        disabled={!aQuelqueChose || exporting}
        onClick={handleExport}
        data-testid="export-print"
        className="rounded-xl bg-[#200233] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E85F00] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {exporting ? 'Préparation…' : 'Télécharger le visuel d’impression'}
      </button>
      {out && (
        <p className="text-xs text-neutral-500">
          Fichier haute résolution recadré sur la zone ({out.w}×{out.h} px, {PRINT_DPI} dpi). Le texte est redessiné à
          cette résolution, les images d’origine ne sont jamais réduites.
        </p>
      )}
      {selectedId && (
        <p className="text-xs text-neutral-400">
          L’export contient toute la face {side === 'front' ? 'avant' : 'arrière'} ({face.length} élément
          {face.length > 1 ? 's' : ''}).
        </p>
      )}
    </div>
  );
}
