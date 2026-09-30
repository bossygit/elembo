'use client';

// Sélecteur de produit : lit le catalogue. Aujourd'hui un seul T-shirt ; ajouter un
// hoodie ou un tote bag se fait dans src/lib/products/catalog.ts, sans toucher ici.

import { useConfiguratorStore } from '../../stores/configurator-store';
import { CATALOG } from '../../lib/products/catalog';

export default function ProductSelector() {
  const productId = useConfiguratorStore((s) => s.productId);
  const setProduct = useConfiguratorStore((s) => s.setProduct);

  if (CATALOG.length < 2) {
    return (
      <p className="text-xs text-neutral-500">
        Catalogue : {CATALOG.length} produit (extensible — hoodie, tote bag, casquette sans modifier le configurateur).
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {CATALOG.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={p.id === productId}
          onClick={() => setProduct(p.id)}
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
            p.id === productId ? 'bg-[#E85F00] text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
