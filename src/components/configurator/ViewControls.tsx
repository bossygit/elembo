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

  const base = 'rounded-lg px-3 py-1.5 text-sm transition-colors';
  const idle = 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200';
  const active = 'bg-[#E85F00] text-white';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
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
        <button
          type="button"
          onClick={() => {
            setSide('front');
            onResetCamera();
          }}
          className={`${base} border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50`}
        >
          Vue initiale
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        Glissez pour tourner le produit · molette ou pincement pour zoomer.
        {!hasBack && ' Ce produit n’a pas de face arrière.'}
      </p>
    </div>
  );
}
