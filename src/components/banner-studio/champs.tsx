'use client';

import { useId, useState, type ReactNode } from 'react';

const TRACES = {
  annuler: 'M9 5 4 10l5 5M4 10h10a5 5 0 0 1 0 10h-4',
  retablir: 'm15 5 5 5-5 5M20 10H10a5 5 0 0 0 0 10h4',
  plus: 'M12 5v14M5 12h14',
  moins: 'M5 12h14',
  ajuster: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  texte: 'M5 5h14M12 5v14M9 19h6',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 6c5 0 8 3 8 6s-3 6-8 6-8-3-8-6 3-6 8-6z',
  ligne: 'M4 12h16',
  calques: 'm12 4 9 5-9 5-9-5zM3 14l9 5 9-5',
  format: 'M3 8h18v8H3zM7 8v3M11 8v4M15 8v3M19 8v4',
  controles: 'M12 4 2 20h20zM12 10v4M12 17v.5',
  oeil: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  cache: 'M3 3l18 18M10 5.2A10 10 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3 3.8M6 7a18 18 0 0 0-4 5s4 7 10 7a9 9 0 0 0 4-1',
  verrou: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  ouvert: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2',
  haut: 'm6 15 6-6 6 6',
  bas: 'm6 9 6 6 6-6',
  copier: 'M8 8h12v12H8zM4 16V4h12',
  supprimer: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  fermer: 'M6 6l12 12M18 6 6 18',
  reglages: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6',
  retour: 'm14 6-6 6 6 6',
} as const;
export type NomIcone = keyof typeof TRACES;

export function Icone({ nom }: { nom: NomIcone }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 overflow-visible">
      <path d={TRACES[nom]} />
    </svg>
  );
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-action';

export function Bouton({ icone, libelle, texte, actif, className = '', ...reste }: {
  icone?: NomIcone; libelle: string; texte?: ReactNode; actif?: boolean; className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <button
      type="button"
      aria-label={texte === libelle ? undefined : libelle}
      title={libelle}
      aria-pressed={actif}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-medium transition-colors hover:bg-sable disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-9 lg:min-w-9 ${actif ? 'bg-encre text-creme hover:bg-encre' : ''} ${FOCUS} ${className}`}
      {...reste}
    >
      {icone ? <Icone nom={icone} /> : null}
      {texte ? <span>{texte}</span> : null}
    </button>
  );
}

const SAISIE = `w-full rounded-lg border border-bordure bg-white px-2.5 py-2 text-base lg:py-1.5 lg:text-sm ${FOCUS} disabled:bg-sable disabled:text-attenue`;

/**
 * Nombre saisi librement, appliqué à la validation (Entrée ou sortie du champ) : taper « 12 »
 * pour « 120 » ne doit pas redimensionner à 12 au passage.
 */
export function ChampNombre({ libelle, valeur, unite, pas = 1, min, max, onValeur, disabled }: {
  libelle: string; valeur: number; unite?: string; pas?: number; min?: number; max?: number; onValeur: (v: number) => void; disabled?: boolean;
}) {
  const id = useId();
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const valider = () => {
    if (brouillon === null) return;
    const v = Number(brouillon.replace(',', '.'));
    setBrouillon(null);
    if (brouillon.trim() === '' || !Number.isFinite(v)) return;
    const borne = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    if (borne !== valeur) onValeur(borne);
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-attenue">{libelle}{unite ? ` (${unite})` : ''}</label>
      <input
        id={id}
        inputMode="decimal"
        className={`${SAISIE} tabular-nums`}
        value={brouillon ?? String(Math.round(valeur * 100) / 100).replace('.', ',')}
        disabled={disabled}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => {
          if (e.key === 'Enter') valider();
          else if (e.key === 'Escape') setBrouillon(null);
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            setBrouillon(null);
            const v = valeur + (e.key === 'ArrowUp' ? pas : -pas) * (e.shiftKey ? 10 : 1);
            onValeur(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
          }
        }}
      />
    </div>
  );
}

export function ChampTexte({ libelle, valeur, onValeur, maxLength, disabled }: { libelle: string; valeur: string; onValeur: (v: string) => void; maxLength?: number; disabled?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-attenue">{libelle}</label>
      <textarea id={id} rows={Math.min(5, Math.max(2, valeur.split('\n').length))} maxLength={maxLength} className={SAISIE} value={valeur} disabled={disabled} onChange={(e) => onValeur(e.target.value)} />
    </div>
  );
}

export function ChampChoix<T extends string | number>({ libelle, valeur, options, onValeur, disabled }: {
  libelle: string; valeur: T; options: { valeur: T; texte: string }[]; onValeur: (v: T) => void; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-attenue">{libelle}</label>
      <select id={id} className={SAISIE} value={String(valeur)} disabled={disabled} onChange={(e) => { const o = options.find((x) => String(x.valeur) === e.target.value); if (o) onValeur(o.valeur); }}>
        {options.map((o) => <option key={String(o.valeur)} value={String(o.valeur)}>{o.texte}</option>)}
      </select>
    </div>
  );
}

export function ChampCouleur({ libelle, valeur, onValeur, disabled }: { libelle: string; valeur: string; onValeur: (v: string) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-attenue">{libelle}</label>
      <div className="flex items-center gap-2">
        <input id={id} type="color" className={`h-11 w-14 cursor-pointer rounded-lg border border-bordure bg-white p-1 lg:h-9 ${FOCUS}`} value={valeur.toLowerCase()} disabled={disabled} onChange={(e) => onValeur(e.target.value.toUpperCase())} />
        <span className="font-mono text-xs text-attenue">{valeur.toUpperCase()}</span>
      </div>
    </div>
  );
}

export function Groupe({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="border-b border-filet px-4 py-4 last:border-b-0">
      <h3 className="mb-3 text-sm font-semibold">{titre}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
