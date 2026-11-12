'use client';

// Liste des calques de la zone active : sélection, visibilité, ordre d'empilement,
// duplication et suppression. L'ordre vient du champ `z` de chaque élément, ce qui
// permettra un glisser-déposer sans changer le modèle de données.
//
// La zone est rappelée en titre : on ne mélange jamais les calques de deux zones.

import { useConfiguratorStore } from '../../stores/configurator-store';
import type { DesignElement } from '../../types/configurator';
import { SIDE_LABELS } from '../../types/configurator';
import { getProductById, productSides } from '../../lib/products/catalog';
import { ChevronDown, ChevronUp, Eye, EyeOff, ImageIcon, TextIcon, Trash } from '../site/Icons';

function labelFor(el: DesignElement): string {
  if (el.type === 'text') {
    const premiere = el.content.split('\n')[0].trim();
    return premiere || '(texte vide)';
  }
  return el.name;
}

export default function DesignPanel() {
  const productId = useConfiguratorStore((s) => s.productId);
  const elements = useConfiguratorStore((s) => s.elements);
  const side = useConfiguratorStore((s) => s.side);
  const selectedId = useConfiguratorStore((s) => s.selectedId);
  const selectElement = useConfiguratorStore((s) => s.selectElement);
  const removeElement = useConfiguratorStore((s) => s.removeElement);
  const duplicateElement = useConfiguratorStore((s) => s.duplicateElement);
  const toggleElementVisible = useConfiguratorStore((s) => s.toggleElementVisible);
  const moveElement = useConfiguratorStore((s) => s.moveElement);
  const setSide = useConfiguratorStore((s) => s.setSide);

  const product = getProductById(productId);
  const zones = productSides(product);
  const face = elements.filter((el) => el.side === side).sort((a, b) => b.z - a.z);
  const autres = zones
    .filter((zone) => zone !== side)
    .map((zone) => ({ zone, nombre: elements.filter((el) => el.side === zone).length }))
    .filter((entree) => entree.nombre > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-attenue">
          Calques · {SIDE_LABELS[side]}
        </h3>
        <span className="text-[11px] text-attenue">{face.length} élément(s)</span>
      </div>

      {face.length === 0 ? (
        <p className="rounded-lg bg-sable/50 px-3 py-2 text-xs text-attenue">
          Cette zone est vierge. Ajoutez une image ou un texte ci-dessus.
        </p>
      ) : (
        <ul data-testid="element-list" className="flex flex-col gap-1">
          {face.map((el) => (
            <li
              key={el.id}
              className={`flex items-center gap-0.5 rounded-xl border py-0.5 pl-2.5 pr-0.5 ${
                el.id === selectedId ? 'border-orange bg-orange/5' : 'border-encre/15 bg-white'
              }`}
            >
              <button
                type="button"
                data-testid={`element-${el.id}`}
                onClick={() => selectElement(el.id)}
                aria-pressed={el.id === selectedId}
                className={`flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm ${
                  el.visible ? 'text-encre' : 'text-attenue line-through'
                }`}
              >
                {el.type === 'text' ? (
                  <TextIcon className="h-3.5 w-3.5 shrink-0 text-attenue" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-attenue" />
                )}
                <span className="truncate">{labelFor(el)}</span>
              </button>
              <button
                type="button"
                aria-label={el.visible ? `Masquer ${labelFor(el)}` : `Afficher ${labelFor(el)}`}
                onClick={() => toggleElementVisible(el.id)}
                className="grid h-7 w-7 place-items-center rounded-lg text-attenue hover:bg-sable hover:text-encre"
              >
                {el.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                aria-label={`Monter ${labelFor(el)}`}
                onClick={() => moveElement(el.id, 'up')}
                className="grid h-7 w-6 place-items-center rounded-lg text-attenue hover:bg-sable hover:text-encre"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Descendre ${labelFor(el)}`}
                onClick={() => moveElement(el.id, 'down')}
                className="grid h-7 w-6 place-items-center rounded-lg text-attenue hover:bg-sable hover:text-encre"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Dupliquer ${labelFor(el)}`}
                onClick={() => duplicateElement(el.id)}
                className="grid h-7 w-7 place-items-center rounded-lg text-attenue hover:bg-sable hover:text-encre"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="12" height="12" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
              </button>
              <button
                type="button"
                aria-label={`Supprimer ${labelFor(el)}`}
                onClick={() => removeElement(el.id)}
                className="grid h-7 w-7 place-items-center rounded-lg text-attenue hover:bg-red-50 hover:text-red-600"
              >
                <Trash className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {autres.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {autres.map(({ zone, nombre }) => (
            <button
              key={zone}
              type="button"
              data-testid={`switch-zone-${zone}`}
              onClick={() => setSide(zone)}
              className="rounded-full border border-encre/15 px-2.5 py-1 text-[11px] text-attenue hover:border-encre hover:text-encre"
            >
              {nombre} sur {SIDE_LABELS[zone]} →
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
