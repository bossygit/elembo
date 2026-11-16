/**
 * Kit d'interface du portail partenaire. Pensé pour le téléphone d'abord (CDC §11.3, §19.1) :
 * champs en 16 px (pas de zoom automatique sur iOS), cibles tactiles de 48 px, un seul niveau
 * de lecture. Couleurs du design system Elembo (crème, encre, orange d'action).
 */

import Link from 'next/link';

export const champ =
  'mt-1.5 block h-12 w-full rounded-xl border border-filet bg-white px-3.5 text-base text-encre outline-none transition-colors placeholder:text-bordure focus:border-encre focus:ring-2 focus:ring-encre/10 disabled:bg-sable';

export const libelle = 'block text-sm font-medium text-encre';

export const aide = 'mt-1 block text-xs text-attenue';

const BOUTONS = {
  primaire: 'bg-orange-action text-white hover:bg-encre',
  secondaire: 'border border-encre/20 bg-white text-encre hover:border-encre',
  discret: 'text-encre underline underline-offset-4 hover:text-orange-action',
} as const;

export function bouton(variante: keyof typeof BOUTONS = 'primaire'): string {
  const base =
    variante === 'discret'
      ? 'inline-flex items-center text-sm font-medium'
      : 'inline-flex h-12 items-center justify-center rounded-xl px-5 text-base font-semibold';
  return `${base} transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-encre disabled:cursor-not-allowed disabled:opacity-50 ${BOUTONS[variante]}`;
}

export function Carte({ titre, children, action }: { titre?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-filet bg-white p-5 sm:p-6">
      {titre || action ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          {titre ? <h2 className="text-base font-semibold text-encre">{titre}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const TONS = {
  erreur: 'border-red-200 bg-red-50 text-red-900',
  succes: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  info: 'border-filet bg-sable text-encre',
  attention: 'border-amber-200 bg-amber-50 text-amber-900',
} as const;

export function Alerte({ ton = 'info', children }: { ton?: keyof typeof TONS; children: React.ReactNode }) {
  return (
    <p role={ton === 'erreur' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${TONS[ton]}`}>
      {children}
    </p>
  );
}

/** Page d'accès (connexion, inscription, mot de passe) : une colonne étroite centrée. */
export function PageAcces({
  titre,
  intro,
  children,
  pied,
}: {
  titre: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  pied?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-encre sm:text-4xl">{titre}</h1>
      {intro ? <div className="mt-3 text-base leading-relaxed text-attenue">{intro}</div> : null}
      <div className="mt-8">{children}</div>
      {pied ? <div className="mt-8 space-y-2 text-sm text-attenue">{pied}</div> : null}
    </div>
  );
}

export function LienTexte({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-encre underline underline-offset-4 hover:text-orange-action">
      {children}
    </Link>
  );
}
