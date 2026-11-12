'use client';

// Couleur du T-shirt : palette du catalogue (jamais codée en dur ici) + sélecteur libre
// HEX. La couleur est portée par les matériaux du TISSU uniquement : les visuels imprimés
// ne sont jamais teintés (exigence de la mission).

import { useState } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getProductById } from '../../lib/products/catalog';

function HexField({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) {
  const [saisie, setSaisie] = useState(value);
  const [dernier, setDernier] = useState(value);

  // La saisie suit la couleur de l'état (sélection dans la palette, pipette).
  if (value !== dernier) {
    setDernier(value);
    setSaisie(value);
  }

  function commit() {
    const propre = saisie.startsWith('#') ? saisie : `#${saisie}`;
    if (/^#[0-9a-fA-F]{6}$/.test(propre)) {
      onCommit(propre.toUpperCase());
      setSaisie(propre.toUpperCase());
    } else {
      setSaisie(value);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="couleur-libre"
        className="relative grid h-9 w-9 cursor-pointer place-items-center overflow-hidden rounded-full border border-encre/20"
        style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000' }}
        title="Couleur personnalisée"
      >
        <span className="sr-only">Couleur personnalisée</span>
        <input
          id="couleur-libre"
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={(e) => onCommit(e.target.value.toUpperCase())}
          data-testid="product-color-picker"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-attenue">HEX</span>
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          aria-label="Code hexadécimal de la couleur du vêtement"
          data-testid="product-color-hex"
          className="w-[88px] rounded-lg border border-encre/25 px-2 py-1 font-mono text-xs uppercase text-encre focus:border-encre"
        />
      </div>
    </div>
  );
}

export default function ProductColorSelector() {
  const productId = useConfiguratorStore((s) => s.productId);
  const color = useConfiguratorStore((s) => s.color);
  const setColor = useConfiguratorStore((s) => s.setColor);
  const product = getProductById(productId);

  if (!product) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Couleur du vêtement">
        {product.colors.map((c) => {
          const selected = c.hex.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={c.hex}
              type="button"
              title={c.name}
              aria-label={`Couleur ${c.name}`}
              aria-pressed={selected}
              data-testid={`couleur-${c.name.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => setColor(c.hex)}
              className="group flex w-[52px] flex-col items-center gap-1 text-[10px] font-medium text-encre"
            >
              <span
                className={`grid h-10 w-10 place-items-center rounded-full border-2 transition-[border-color,transform] duration-200 group-active:scale-95 ${
                  selected ? 'border-orange' : 'border-transparent group-hover:border-encre/25'
                }`}
              >
                <span
                  className="h-7 w-7 rounded-full border border-encre/15 shadow-inner"
                  style={{ backgroundColor: c.hex }}
                  aria-hidden
                />
              </span>
              <span className={`text-center leading-tight ${selected ? 'font-semibold' : 'text-attenue'}`}>
                {c.name}
              </span>
            </button>
          );
        })}
      </div>
      <HexField value={color} onCommit={setColor} />
      <p className="text-[11px] leading-snug text-attenue">
        La couleur du tissu ne modifie jamais les visuels imprimés : ils restent tels qu’ils
        ont été composés.
      </p>
    </div>
  );
}
