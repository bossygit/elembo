import Link from 'next/link';
import type { ReactNode } from 'react';

export type Variante = 'primaire' | 'secondaire' | 'accent' | 'clair';

/**
 * Boutons : une pilule, quatre rôles.
 * Le texte sur un aplat orange est toujours `encre` (contraste) — jamais blanc.
 */
export const stylesBouton: Record<Variante, string> = {
  // Noir : l'action principale sur fond clair.
  primaire: 'bg-encre text-creme hover:bg-orange hover:text-encre',
  // Contour : l'action secondaire, sans concurrencer la principale.
  secondaire: 'border border-encre text-encre hover:bg-encre hover:text-creme',
  // Orange signature : LE geste de la marque (« Créer mon design »).
  accent: 'bg-orange text-encre hover:bg-encre hover:text-creme',
  // Sur fond sombre.
  clair: 'bg-creme text-encre hover:bg-orange hover:text-encre',
};

/** Base commune à tous les boutons-liens du site (pilule, pressé au toucher). */
export const baseBouton =
  'group/bouton inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition-[background-color,color,transform] duration-300 ease-sortie active:scale-[0.97]';

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
    <Link href={href} aria-label={ariaLabel} className={`${baseBouton} ${stylesBouton[variante]} ${className}`}>
      {children}
    </Link>
  );
}

/** Étiquette : petit libellé en capitales, précédé d'un point orange. */
export function Etiquette({ children, sombre = false }: { children: ReactNode; sombre?: boolean }) {
  return (
    <span
      className={`surtitre inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${
        sombre ? 'border-creme/25 text-creme' : 'border-encre/20 text-encre'
      }`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-orange" />
      {children}
    </span>
  );
}

/** Surtitre numéroté d'une section : « 02 — Les collections ». */
export function Surtitre({
  numero,
  children,
  sombre = false,
}: {
  numero?: string;
  children: ReactNode;
  sombre?: boolean;
}) {
  return (
    <p className={`surtitre flex items-center gap-3 ${sombre ? 'text-orange' : 'text-orange-action'}`}>
      {numero && <span className="font-mono tracking-normal">{numero}</span>}
      <span aria-hidden className={`h-px w-8 ${sombre ? 'bg-creme/30' : 'bg-encre/25'}`} />
      {children}
    </p>
  );
}

export function Filet({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`block h-px w-full bg-filet ${className}`} />;
}
