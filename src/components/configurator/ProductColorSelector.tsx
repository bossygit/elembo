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
    <div className="flex flex-wrap gap-3">
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
            className="group flex flex-col items-center gap-1.5 text-xs font-medium text-encre"
          >
            {/* Pastille : l'anneau orange marque la sélection (jamais la couleur seule). */}
            <span
              className={`grid h-12 w-12 place-items-center rounded-full border-2 transition-[border-color,transform] duration-200 group-active:scale-95 ${
                selected ? 'border-orange' : 'border-transparent group-hover:border-encre/30'
              }`}
            >
              <span
                className="h-9 w-9 rounded-full border border-encre/20"
                style={{ backgroundColor: c.hex }}
                aria-hidden
              />
            </span>
            <span className={selected ? 'font-semibold' : 'text-attenue'}>{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}
