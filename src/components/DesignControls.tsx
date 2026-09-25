'use client';

// DesignControls : échelle (0,5×–1,5×), mode fit (contain/stretch), réinitialisation.

type Props = {
  scale: number;
  onScale: (v: number) => void;
  fitMode: 'contain' | 'stretch';
  onFitMode: (v: 'contain' | 'stretch') => void;
  onReset: () => void;
  disabled: boolean;
};

export default function DesignControls({
  scale,
  onScale,
  fitMode,
  onFitMode,
  onReset,
  disabled,
}: Props) {
  return (
    <div className={`flex flex-col gap-4 ${disabled ? 'opacity-40' : ''}`} aria-disabled={disabled}>
      <div>
        <label htmlFor="scale" className="flex justify-between text-sm font-medium text-neutral-800">
          <span>Échelle du design</span>
          <span className="text-neutral-500">{scale.toFixed(2)}×</span>
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
        <span className="text-sm font-medium text-neutral-800">Ajustement</span>
        <div className="mt-2 flex gap-2">
          {(['contain', 'stretch'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => onFitMode(m)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                fitMode === m
                  ? 'bg-[#E85F00] text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {m === 'contain' ? 'Conserver le ratio' : 'Remplir la zone'}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onReset}
        className="w-fit rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
      >
        Réinitialiser la position
      </button>
    </div>
  );
}
