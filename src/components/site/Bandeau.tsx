import type { ReactNode } from 'react';

/**
 * Bandeau défilant (CSS pur). Le contenu est rendu deux fois ; la seconde copie est masquée
 * aux lecteurs d'écran. Survol = pause. `prefers-reduced-motion` = figé.
 */
export default function Bandeau({
  elements,
  className = '',
  separateur = '✦',
  duree = 38,
}: {
  elements: ReactNode[];
  className?: string;
  separateur?: string;
  /** Durée d'un tour complet, en secondes. */
  duree?: number;
}) {
  const serie = (masque: boolean) => (
    <ul aria-hidden={masque || undefined} className="flex shrink-0 items-center">
      {elements.map((element, i) => (
        <li key={i} className="flex items-center whitespace-nowrap">
          <span className="px-5 sm:px-8">{element}</span>
          <span aria-hidden className="text-orange">
            {separateur}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={`overflow-hidden ${className}`}>
      <div className="defilant" style={{ '--duree-defile': `${duree}s` } as React.CSSProperties}>
        {serie(false)}
        {serie(true)}
      </div>
    </div>
  );
}
