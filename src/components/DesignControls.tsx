'use client';

// DesignControls : échelle (0,5×–1,5×), mode d'ajustement (3 modes réels, dont
// « remplir » qui ne déforme PAS le visuel), rotation, réinitialisation.

import type { FitMode } from '../lib/printArea';

type Props = {
  scale: number;
  onScale: (v: number) => void;
  fitMode: FitMode;
  onFitMode: (v: FitMode) => void;
  rotation: number;
  onRotation: (v: number) => void;
  onReset: () => void;
  disabled: boolean;
};

const MODES: { mode: FitMode; label: string; hint: string }[] = [
  { mode: 'contain', label: 'Ajuster dans la zone', hint: 'ratio conservé, visuel entier' },
  { mode: 'cover', label: 'Remplir la zone', hint: 'ratio conservé, bords rognés' },
  { mode: 'stretch', label: 'Étirer', hint: 'remplit tout — déforme le visuel' },
];

export default function DesignControls({
  scale,
  onScale,
  fitMode,
  onFitMode,
  rotation,
  onRotation,
  onReset,
  disabled,
}: Props) {
  const active = MODES.find((m) => m.mode === fitMode) ?? MODES[0];

  return (
    <div className={`flex flex-col gap-4 ${disabled ? 'opacity-40' : ''}`} aria-disabled={disabled}>
      <div>
        <label htmlFor="scale" className="flex justify-between text-sm font-medium text-neutral-800">
          <span>Taille</span>
          <span className="text-neutral-500">{Math.round(scale * 100)} %</span>
        </label>
        <input
          id="scale"
          type="range"
          min={0.5}
          max={1.5}
          step={0.05}
          value={scale}
          disabled={disabled}
          onChange={(e) => onScale(Number(e.target.value))}
          className="mt-2 w-full accent-[#E85F00]"
        />
      </div>

      <div>
        <label htmlFor="rotation" className="flex justify-between text-sm font-medium text-neutral-800">
          <span>Rotation</span>
          <span className="text-neutral-500">{rotation}°</span>
        </label>
        <input
          id="rotation"
          type="range"
          min={-180}
          max={180}
          step={5}
          value={rotation}
          disabled={disabled}
          onChange={(e) => onRotation(Number(e.target.value))}
          className="mt-2 w-full accent-[#E85F00]"
        />
      </div>

      <div>
        <span className="text-sm font-medium text-neutral-800">Ajustement</span>
        <div className="mt-2 flex flex-col gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              disabled={disabled}
              aria-pressed={fitMode === m.mode}
              onClick={() => onFitMode(m.mode)}
              className={`rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                fitMode === m.mode
                  ? 'bg-[#E85F00] text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-neutral-500">{active.hint}</p>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onReset}
        className="w-fit rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
      >
        Réinitialiser
      </button>
    </div>
  );
}
