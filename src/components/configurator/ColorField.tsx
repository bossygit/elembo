'use client';

// Choix d'une couleur : palette rapide, sélecteur libre et saisie hexadécimale.
// La valeur vit dans l'état du design (store) : aucune couleur n'est stockée en local.

import { useState } from 'react';
import { TEXT_COLORS } from '../../types/configurator';

export default function ColorField({
  value,
  onChange,
  label = 'Couleur',
}: {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}) {
  const [saisie, setSaisie] = useState(value);
  const [dernier, setDernier] = useState(value);

  // La saisie libre suit la couleur de l'état (changement de palette, sélection).
  if (value !== dernier) {
    setDernier(value);
    setSaisie(value);
  }

  function commit(hex: string) {
    const propre = hex.startsWith('#') ? hex : `#${hex}`;
    if (/^#[0-9a-fA-F]{6}$/.test(propre)) {
      onChange(propre.toUpperCase());
      setSaisie(propre.toUpperCase());
    } else {
      setSaisie(value);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-neutral-800">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {TEXT_COLORS.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={`Couleur ${hex}`}
            aria-pressed={value.toUpperCase() === hex}
            onClick={() => commit(hex)}
            style={{ backgroundColor: hex }}
            className={`h-7 w-7 rounded-full border transition-transform hover:scale-110 ${
              value.toUpperCase() === hex ? 'border-[#E85F00] ring-2 ring-[#E85F00]/40' : 'border-neutral-300'
            }`}
          />
        ))}
        <label className="ml-1 flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-neutral-300 px-2 text-xs text-neutral-700">
          🎨
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
            onChange={(e) => commit(e.target.value)}
            aria-label="Couleur personnalisée"
            data-testid="text-color-picker"
            className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500">HEX</span>
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onBlur={() => commit(saisie)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(saisie);
          }}
          aria-label="Code hexadécimal"
          data-testid="text-color-hex"
          className="w-24 rounded-lg border border-neutral-300 px-2 py-1 font-mono text-xs uppercase text-neutral-800"
        />
      </div>
    </div>
  );
}
