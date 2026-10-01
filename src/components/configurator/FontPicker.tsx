'use client';

// Sélecteur de police : 17 familles classées par usage (sans serif, display, script,
// serif). Chaque option est affichée DANS sa propre police — l'aperçu est donc immédiat.
// Les fichiers sont locaux et ne se téléchargent qu'à l'usage.

import { fontsByCategory } from '../../lib/fonts';
import type { FontCategory } from '../../lib/fonts';

export default function FontPicker({
  value,
  onChange,
  onFocusFont,
}: {
  value: string;
  onChange: (fontId: string) => void;
  /** Prévient l'appelant qu'une police est sur le point d'être utilisée (chargement). */
  onFocusFont?: (fontId: string) => void;
}) {
  return (
    <select
      id="text-font"
      data-testid="text-font"
      value={value}
      onFocus={() => onFocusFont?.(value)}
      onChange={(e) => {
        onFocusFont?.(e.target.value);
        onChange(e.target.value);
      }}
      className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-800"
    >
      {fontsByCategory().map((groupe: { category: FontCategory; label: string; fonts: { id: string; name: string }[] }) => (
        <optgroup key={groupe.category} label={groupe.label}>
          {groupe.fonts.map((font) => (
            <option key={font.id} value={font.id} style={{ fontFamily: `'${font.name}'` }}>
              {font.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
