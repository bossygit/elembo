import Link from 'next/link';
import type { ReactNode } from 'react';

export type Variante = 'primaire' | 'secondaire' | 'accent' | 'clair';

export const stylesBouton: Record<Variante, string> = {
  // Violet profond : le contraste le plus sûr pour un bouton principal.
  primaire: 'bg-encre text-creme hover:bg-orange hover:text-encre',
  // Contour : pour les actions secondaires, sans concurrencer le CTA principal.
  secondaire: 'border border-encre text-encre hover:bg-encre hover:text-creme',
  // Orange de marque : réservé aux grands boutons, texte violet pour le contraste.
  accent: 'bg-orange text-encre hover:bg-encre hover:text-creme',
  // Sur fond violet.
  clair: 'bg-creme text-encre hover:bg-orange hover:text-encre',
};

export function BoutonLien({
  href,
  children,
  variante = 'primaire',
  className = '',
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  variante?: Variante;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-colors duration-200 ${stylesBouton[variante]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Etiquette({ children, sombre = false }: { children: ReactNode; sombre?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
        sombre ? 'bg-creme/10 text-creme' : 'bg-encre/5 text-encre'
      }`}
    >
      {children}
    </span>
  );
}

export function Filet({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`block h-px w-full bg-filet ${className}`} />;
}
