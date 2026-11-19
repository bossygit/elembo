import { useId, type CSSProperties, type ReactNode } from 'react';

import type { FinitionId } from '@/lib/grand-format/catalogue';
import type { ModeleBanderole, Motif, RoleLigne } from '@/lib/grand-format/modeles';

/**
 * Aperçu d'une banderole aux proportions réelles (largeur × hauteur), avec sa finition :
 * œillets, ourlets, fourreaux. Rendu 100 % CSS/SVG : léger, net à toute taille, sans image.
 *
 * La typographie est exprimée en unités de conteneur (cqh / cqw) : le même modèle reste lisible
 * sur une banderole de 5 × 1 m comme sur un roll-up de 0,85 × 2 m.
 *
 * Composant sans état ni effet : utilisable côté serveur comme dans le parcours client.
 */

type Props = {
  modele: ModeleBanderole;
  largeurM?: number;
  hauteurM?: number;
  finition?: FinitionId;
  /** Proportion de la zone d'affichage (largeur / hauteur). La banderole y est centrée. */
  cadre?: number;
  /** Mur, cordes et ombre portée : la banderole « accrochée ». */
  scene?: boolean;
  className?: string;
  /** Texte alternatif ; par défaut le nom du modèle et son format. */
  label?: string;
};

const TAILLES: Record<'h' | 'v', Record<RoleLigne, string>> = {
  h: {
    surtitre: 'min(7cqh, 2.4cqw)',
    titre: 'min(17cqh, 6.2cqw)',
    citation: 'min(7.2cqh, 2.5cqw)',
    detail: 'min(6.8cqh, 2.4cqw)',
    signature: 'min(5.6cqh, 2cqw)',
  },
  v: {
    surtitre: 'min(2.8cqh, 6cqw)',
    titre: 'min(7.5cqh, 13cqw)',
    citation: 'min(3.1cqh, 6.4cqw)',
    detail: 'min(2.9cqh, 6cqw)',
    signature: 'min(2.4cqh, 5cqw)',
  },
};

function MotifSvg({ motif, couleur }: { motif: Motif; couleur: string }) {
  const halo = `halo-${useId().replace(/:/g, '')}`;
  const commun = { viewBox: '0 0 100 100', className: 'h-full w-full', 'aria-hidden': true } as const;
  switch (motif) {
    case 'croix':
      return (
        <svg {...commun}>
          <defs>
            <radialGradient id={halo}>
              <stop offset="0" stopColor={couleur} stopOpacity="0.55" />
              <stop offset="1" stopColor={couleur} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill={`url(#${halo})`} />
          <rect x="44" y="14" width="12" height="72" rx="2" fill={couleur} />
          <rect x="26" y="32" width="48" height="12" rx="2" fill={couleur} />
        </svg>
      );
    case 'anneaux':
      return (
        <svg {...commun}>
          <circle cx="38" cy="54" r="22" fill="none" stroke={couleur} strokeWidth="6" />
          <circle cx="62" cy="54" r="22" fill="none" stroke={couleur} strokeWidth="6" />
          <path d="M58 20 l4 -8 l4 8 l-4 6 z" fill={couleur} />
        </svg>
      );
    case 'ruban':
      return (
        <svg {...commun}>
          <path
            d="M50 12 C 32 12 30 34 40 48 L 22 88 L 34 90 L 50 60 L 66 90 L 78 88 L 60 48 C 70 34 68 12 50 12 Z M50 24 C 58 24 58 36 50 46 C 42 36 42 24 50 24 Z"
            fill={couleur}
            fillRule="evenodd"
          />
        </svg>
      );
    case 'eclat':
      return (
        <svg {...commun}>
          <polygon
            points="50,4 58,30 84,16 70,42 96,50 70,58 84,84 58,70 50,96 42,70 16,84 30,58 4,50 30,42 16,16 42,30"
            fill={couleur}
          />
        </svg>
      );
    case 'bougie':
      return (
        <svg {...commun}>
          <path d="M50 10 C 58 22 60 30 50 40 C 40 30 42 22 50 10 Z" fill={couleur} />
          <rect x="40" y="44" width="20" height="46" rx="3" fill={couleur} opacity="0.85" />
          <rect x="49" y="38" width="2" height="7" fill={couleur} />
        </svg>
      );
    case 'etoile':
      return (
        <svg {...commun}>
          <path d="M50 4 C 54 38 62 46 96 50 C 62 54 54 62 50 96 C 46 62 38 54 4 50 C 38 46 46 38 50 4 Z" fill={couleur} />
        </svg>
      );
  }
}

function Portrait({ accent }: { accent: string }) {
  const fond = `fond-${useId().replace(/:/g, '')}`;
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[50%]"
      style={{ boxShadow: `0 0 0 0.6cqh ${accent}, 0 0 0 1.4cqh rgba(0,0,0,0.35)` }}
      aria-hidden
    >
      <svg viewBox="0 0 80 100" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={fond} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d6d2cc" />
            <stop offset="1" stopColor="#8f8a84" />
          </linearGradient>
        </defs>
        <rect width="80" height="100" fill={`url(#${fond})`} />
        <circle cx="40" cy="40" r="17" fill="#3c3833" />
        <path d="M8 100 C 10 72 24 62 40 62 C 56 62 70 72 72 100 Z" fill="#3c3833" />
      </svg>
    </div>
  );
}

/** Positions des œillets : environ tous les 50 cm, aux quatre coins au minimum. */
function positionsOeillets(longueurM: number): number[] {
  const n = Math.max(2, Math.min(14, Math.round(longueurM / 0.5) + 1));
  return Array.from({ length: n }, (_, i) => i / (n - 1));
}

export default function ApercuBanderole({
  modele,
  largeurM = modele.format.largeurM,
  hauteurM = modele.format.hauteurM,
  finition = 'OEILLETS',
  cadre = 16 / 10,
  scene = false,
  className = '',
  label,
}: Props) {
  const ratio = Math.max(0.05, largeurM / hauteurM);
  const horizontal = ratio >= 1;
  const tailles = TAILLES[horizontal ? 'h' : 'v'];
  // Marge de la scène pour laisser voir les cordes et l'ombre.
  const occupation = scene ? 0.86 : 1;
  const largeurPct = Math.min(1, ratio / cadre) * 100 * occupation;
  const oeillets = finition === 'OEILLETS' || finition === 'OURLETS_OEILLETS';
  const ourlets = finition === 'OURLETS' || finition === 'OURLETS_OEILLETS';
  const fourreaux = finition === 'FOURREAUX';
  const tailleOeillet = 'min(3.4cqh, 1.4cqw, 9px)';
  const visuel = modele.portrait || modele.motif;

  const ligne = (texte: string, role: RoleLigne, i: number): ReactNode => {
    const style: CSSProperties = { fontSize: tailles[role] };
    const base = 'block max-w-full text-balance';
    switch (role) {
      case 'surtitre':
        return (
          <span key={i} className={`${base} font-semibold uppercase tracking-[0.18em]`} style={{ ...style, color: modele.palette.accent }}>
            {texte}
          </span>
        );
      case 'titre':
        return (
          <span
            key={i}
            className={`${base} leading-[0.98] ${modele.police === 'accent' ? 'font-accent italic' : 'font-display font-extrabold tracking-[-0.03em]'}`}
            style={{ ...style, margin: '0.12em 0 0.14em' }}
          >
            {texte}
          </span>
        );
      case 'citation':
        return (
          <span key={i} className={`${base} font-accent italic opacity-90`} style={style}>
            {texte}
          </span>
        );
      case 'detail':
        return (
          <span key={i} className={`${base} font-semibold`} style={{ ...style, marginTop: '0.35em' }}>
            {texte}
          </span>
        );
      case 'signature':
        return (
          <span key={i} className={`${base} font-medium opacity-80`} style={{ ...style, marginTop: '0.45em' }}>
            {texte}
          </span>
        );
    }
  };

  const banderole = (
    <div
      role="img"
      aria-label={label ?? `${modele.nom} — banderole ${String(largeurM).replace('.', ',')} × ${String(hauteurM).replace('.', ',')} m`}
      className="relative overflow-hidden"
      style={{
        width: `${largeurPct}%`,
        aspectRatio: `${largeurM} / ${hauteurM}`,
        containerType: 'size',
        background: modele.palette.fond,
        color: modele.palette.texte,
        boxShadow: scene
          ? '0 18px 30px -12px rgba(17,13,21,0.45), 0 2px 4px rgba(17,13,21,0.2)'
          : '0 1px 2px rgba(17,13,21,0.12)',
      }}
    >
      {/* Reflet du PVC. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(105deg, transparent 18%, rgba(255,255,255,0.10) 32%, transparent 46%, transparent 62%, rgba(255,255,255,0.06) 72%, transparent 84%)',
        }}
      />
      {modele.palette.filet ? (
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{ inset: horizontal ? '7cqh 2.4cqw' : '2.4cqh 5cqw', border: `max(1px, 0.5cqh) solid ${modele.palette.filet}`, opacity: 0.55 }}
        />
      ) : null}
      {ourlets ? (
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{ inset: 'min(2.2cqh, 1cqw)', border: '1px dashed rgba(255,255,255,0.45)', mixBlendMode: 'difference', opacity: 0.6 }}
        />
      ) : null}
      {fourreaux ? (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0" style={{ height: '7cqh', background: 'rgba(0,0,0,0.22)', borderBottom: '1px dashed rgba(255,255,255,0.45)' }} />
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: '7cqh', background: 'rgba(0,0,0,0.22)', borderTop: '1px dashed rgba(255,255,255,0.45)' }} />
        </>
      ) : null}

      <div
        className={`relative flex h-full w-full items-center justify-center ${horizontal ? 'flex-row' : 'flex-col'}`}
        style={{ padding: horizontal ? '9cqh 6cqw' : '7cqh 9cqw', gap: horizontal ? 'min(6cqw, 10cqh)' : '4cqh' }}
      >
        {visuel ? (
          <div
            className="shrink-0"
            style={
              horizontal
                ? { height: modele.portrait ? '72cqh' : '58cqh', width: modele.portrait ? '58cqh' : '58cqh', maxWidth: '24cqw' }
                : { width: '46cqw', height: modele.portrait ? '56cqw' : '46cqw', maxHeight: '22cqh' }
            }
          >
            {modele.portrait ? <Portrait accent={modele.palette.accent} /> : <MotifSvg motif={modele.motif!} couleur={modele.palette.accent} />}
          </div>
        ) : null}
        <div className={`flex min-w-0 flex-col ${visuel && horizontal ? 'items-start text-left' : 'items-center text-center'}`}>
          {modele.lignes.map((l, i) => ligne(l.texte, l.role, i))}
        </div>
      </div>

      {oeillets ? (
        <span aria-hidden className="pointer-events-none absolute" style={{ inset: 'min(3cqh, 1.3cqw)' }}>
          {positionsOeillets(largeurM).flatMap((x) =>
            [0, 1].map((y) => (
              <span
                key={`h-${x}-${y}`}
                className="absolute rounded-full"
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: tailleOeillet,
                  height: tailleOeillet,
                  transform: 'translate(-50%, -50%)',
                  background: 'radial-gradient(circle, #2a2a2a 0 32%, #e7e3dc 36% 58%, #9c978f 64% 100%)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
                }}
              />
            )),
          )}
          {positionsOeillets(hauteurM)
            .slice(1, -1)
            .flatMap((y) =>
              [0, 1].map((x) => (
                <span
                  key={`v-${x}-${y}`}
                  className="absolute rounded-full"
                  style={{
                    left: `${x * 100}%`,
                    top: `${y * 100}%`,
                    width: tailleOeillet,
                    height: tailleOeillet,
                    transform: 'translate(-50%, -50%)',
                    background: 'radial-gradient(circle, #2a2a2a 0 32%, #e7e3dc 36% 58%, #9c978f 64% 100%)',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
                  }}
                />
              )),
            )}
        </span>
      ) : null}
    </div>
  );

  return (
    <div
      className={`relative flex items-center justify-center ${scene ? 'overflow-hidden' : ''} ${className}`}
      style={{
        aspectRatio: String(cadre),
        background: scene
          ? 'radial-gradient(120% 90% at 50% 0%, #f4efe4 0%, #e6dccb 60%, #d8ccb6 100%)'
          : undefined,
      }}
    >
      {scene && oeillets ? (
        // Cordes tendues depuis les œillets du haut vers les points d'attache hors cadre.
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          {(() => {
            const demiLargeur = largeurPct / 2;
            const hauteurBanderole = (largeurPct / ratio) * cadre;
            const haut = 50 - hauteurBanderole / 2 + 1.5;
            const gauche = 50 - demiLargeur + 1;
            const droite = 50 + demiLargeur - 1;
            return (
              <g stroke="#5d5048" strokeWidth="0.35" fill="none" vectorEffect="non-scaling-stroke">
                <path d={`M${gauche} ${haut} L0 ${Math.max(0, haut - 14)}`} />
                <path d={`M${droite} ${haut} L100 ${Math.max(0, haut - 14)}`} />
                <path d={`M${gauche} ${50 + hauteurBanderole / 2 - 1.5} L0 ${Math.min(100, 50 + hauteurBanderole / 2 + 10)}`} />
                <path d={`M${droite} ${50 + hauteurBanderole / 2 - 1.5} L100 ${Math.min(100, 50 + hauteurBanderole / 2 + 10)}`} />
              </g>
            );
          })()}
        </svg>
      ) : null}
      {banderole}
    </div>
  );
}
