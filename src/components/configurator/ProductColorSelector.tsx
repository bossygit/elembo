'use client';

// Sélecteur de couleur du produit — les options viennent du catalogue, jamais d'un
// composant en dur.

import { useConfiguratorStore } from '../../stores/configurator-store';
import { getProductById } from '../../lib/products/catalog';

export default function ProductColorSelector() {
  const productId = useConfiguratorStore((s) => s.productId);
  const color = useConfiguratorStore((s) => s.color);
  const setColor = useConfiguratorStore((s) => s.setColor);
  const product = getProductById(productId);

  if (!product) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {product.colors.map((c) => {
        const selected = c.hex.toLowerCase() === color.toLowerCase();
        return (
          <button
            key={c.hex}
            type="button"
            title={c.name}
            aria-label={`Couleur ${c.name}`}
            aria-pressed={selected}
            onClick={() => setColor(c.hex)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              selected ? 'border-[#E85F00] bg-[#E85F00]/10 text-neutral-900' : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
            }`}
          >
            <span
              className="h-4 w-4 rounded-full border border-neutral-300"
              style={{ backgroundColor: c.hex }}
              aria-hidden
            />
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
