'use client';

// Sélecteur de produit : lit le catalogue. Aujourd'hui un seul T-shirt ; ajouter un
// hoodie ou un tote bag se fait dans src/lib/products/catalog.ts, sans toucher ici.

import { useConfiguratorStore } from '../../stores/configurator-store';
import { CATALOG, getProductById } from '../../lib/products/catalog';

/**
 * `onChangerDeSupport` : passer d'un vêtement à un mug n'a pas de sens pour les éléments posés
 * (cinq zones de tissu → un pourtour de céramique). Dans ce cas le studio ouvre un projet
 * vierge et met le travail en cours de côté ; entre deux vêtements, les éléments suivent.
 */
export default function ProductSelector({ onChangerDeSupport }: { onChangerDeSupport?: (id: string) => void } = {}) {
  const productId = useConfiguratorStore((s) => s.productId);
  const setProduct = useConfiguratorStore((s) => s.setProduct);

  function choisir(id: string) {
    const actuel = getProductById(productId)?.support ?? 'textile';
    const cible = getProductById(id)?.support ?? 'textile';
    if (onChangerDeSupport && actuel !== cible) onChangerDeSupport(id);
    else setProduct(id);
  }

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
          data-testid={`produit-${p.id}`}
          onClick={() => choisir(p.id)}
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
