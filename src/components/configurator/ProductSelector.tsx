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
      <p className="text-xs text-attenue">
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
          className={`min-h-10 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 ${
            p.id === productId ? 'bg-orange text-encre' : 'border border-encre/20 bg-white text-encre hover:border-encre'
          }`}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
