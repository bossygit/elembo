'use client';

// Contrôles de vue : avant / arrière / vue initiale, plus le rappel des gestes.

import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById } from '../../lib/products/catalog';

export default function ViewControls({ onResetCamera }: { onResetCamera: () => void }) {
  const productId = useConfiguratorStore((s) => s.productId);
  const side = useConfiguratorStore((s) => s.side);
  const setSide = useConfiguratorStore((s) => s.setSide);
  const product = getProductById(productId);
  const hasBack = Boolean(getPrintArea(product, 'back'));

  const base = 'min-h-10 flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 sm:flex-none';
  const idle = 'text-encre/70 hover:text-encre';
  const active = 'bg-encre text-creme';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Sélecteur de face : un seul contrôle segmenté. */}
        <div className="flex flex-1 rounded-full border border-encre/20 bg-white p-1 sm:flex-none" role="group" aria-label="Face du produit">
          <button
            type="button"
            aria-pressed={side === 'front'}
            onClick={() => setSide('front')}
            className={`${base} ${side === 'front' ? active : idle}`}
          >
            Vue avant
          </button>
          <button
            type="button"
            disabled={!hasBack}
            aria-pressed={side === 'back'}
            onClick={() => setSide('back')}
            className={`${base} ${side === 'back' ? active : idle} disabled:opacity-40`}
          >
            Vue arrière
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setSide('front');
            onResetCamera();
          }}
          className="min-h-10 rounded-full border border-encre/20 bg-white px-4 py-2 text-sm font-semibold text-encre transition-colors duration-200 hover:border-encre"
        >
          Vue initiale
        </button>
      </div>
      <p className="hidden text-xs text-attenue sm:block">
        Glissez pour tourner le produit · molette ou pincement pour zoomer.
        {!hasBack && ' Ce produit n’a pas de face arrière.'}
      </p>
    </div>
  );
}
