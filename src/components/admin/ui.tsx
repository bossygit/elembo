/**
 * Kit d'interface du back-office. Composants serveur sans état : sobres, denses, lisibles.
 * Volontairement distinct du site public (pas de typographie éditoriale ni d'animations).
 */

import Link from 'next/link';

import type { Ton } from '@/lib/admin/statuts';

export const champ =
  'mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-encre shadow-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-encre focus:ring-2 focus:ring-encre/10 disabled:bg-neutral-100 disabled:text-neutral-500';

export const libelle = 'block text-xs font-medium text-neutral-600';

const BOUTONS = {
  primaire: 'bg-encre text-white hover:bg-neutral-800',
  secondaire: 'border border-neutral-300 bg-white text-encre hover:bg-neutral-50',
  danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  succes: 'bg-emerald-700 text-white hover:bg-emerald-800',
  discret: 'text-neutral-600 underline underline-offset-2 hover:text-encre',
} as const;

export function bouton(variante: keyof typeof BOUTONS = 'primaire', taille: 'sm' | 'md' = 'md'): string {
  const dimensions = variante === 'discret' ? 'text-sm' : taille === 'sm' ? 'rounded-md px-2.5 py-1.5 text-xs' : 'rounded-lg px-3.5 py-2 text-sm';
  return `inline-flex items-center justify-center gap-1.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-encre disabled:opacity-50 ${dimensions} ${BOUTONS[variante]}`;
}

export function EnTete({
  surtitre,
  titre,
  description,
  actions,
  retour,
}: {
  surtitre?: string;
  titre: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  retour?: { href: string; label: string };
}) {
  return (
    <header className="mb-6">
      {retour ? (
        <Link href={retour.href} className="mb-3 inline-block text-xs text-neutral-500 hover:text-encre">
          ← {retour.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {surtitre ? <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{surtitre}</p> : null}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-encre">{titre}</h1>
          {description ? <div className="mt-1 text-sm text-neutral-600">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Carte({
  titre,
  description,
  action,
  children,
  className = '',
  id,
}: {
  titre?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-xl border border-neutral-200 bg-white ${className}`}>
      {titre ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-encre">{titre}</h2>
            {description ? <p className="mt-0.5 text-xs text-neutral-500">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

const TONS: Record<Ton, string> = {
  neutre: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  attente: 'bg-amber-50 text-amber-800 ring-amber-200',
  succes: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  alerte: 'bg-orange-50 text-orange-800 ring-orange-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
  production: 'bg-violet-50 text-violet-800 ring-violet-200',
};

export function Badge({ ton = 'neutre', children }: { ton?: Ton; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONS[ton]}`}>
      {children}
    </span>
  );
}

export function Indicateur({
  label,
  valeur,
  detail,
  href,
  alerte = false,
}: {
  label: string;
  valeur: React.ReactNode;
  detail?: React.ReactNode;
  href?: string;
  alerte?: boolean;
}) {
  const contenu = (
    <>
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${alerte ? 'text-orange-action' : 'text-encre'}`}>
        {typeof valeur === 'string' && valeur.endsWith(' FCFA') ? (
          // L'unité en retrait : un montant à 6 chiffres tient sur une ligne dans une tuile étroite.
          <>
            {valeur.slice(0, -5)}
            <span className="ml-1 text-sm font-medium tracking-normal text-neutral-500">FCFA</span>
          </>
        ) : (
          valeur
        )}
      </p>
      {detail ? <p className="mt-1 text-xs text-neutral-500">{detail}</p> : null}
    </>
  );
  const classes = 'block rounded-xl border border-neutral-200 bg-white px-4 py-3.5';
  return href ? (
    <Link href={href} className={`${classes} transition-colors hover:border-neutral-400`}>
      {contenu}
    </Link>
  ) : (
    <div className={classes}>{contenu}</div>
  );
}

/** Message de retour d'une action (paramètres `ok` / `erreur` de l'URL). */
export function Flash({ ok, erreur, messages = {} }: { ok?: string; erreur?: string; messages?: Record<string, string> }) {
  if (erreur) {
    return (
      <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
        {messages[erreur] ?? erreur}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
        {messages[ok] ?? 'Modification enregistrée.'}
      </p>
    );
  }
  return null;
}

export function Vide({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-neutral-500">{children}</p>;
}

export const tableau = {
  conteneur: 'overflow-x-auto rounded-xl border border-neutral-200 bg-white',
  table: 'min-w-full text-left text-sm',
  thead: 'border-b border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-500',
  th: 'whitespace-nowrap px-4 py-2.5 font-medium',
  tbody: 'divide-y divide-neutral-100',
  tr: 'hover:bg-neutral-50/70',
  td: 'px-4 py-2.5 align-top',
  nombre: 'whitespace-nowrap px-4 py-2.5 text-right tabular-nums align-top',
};

export function Pagination({
  total,
  page,
  parPage,
  chemin,
  params,
}: {
  total: number;
  page: number;
  parPage: number;
  chemin: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / parPage));
  if (pages <= 1) return null;
  const lien = (p: number) => {
    const q = new URLSearchParams();
    for (const [cle, valeur] of Object.entries(params)) if (valeur) q.set(cle, valeur);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `${chemin}?${s}` : chemin;
  };
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
      <p className="text-neutral-500">
        Page {page} sur {pages} · {total.toLocaleString('fr-FR')} résultat(s)
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={lien(page - 1)} className={bouton('secondaire', 'sm')}>
            ← Précédente
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={lien(page + 1)} className={bouton('secondaire', 'sm')}>
            Suivante →
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

/** Liste de définitions compacte (fiches). */
export function Definitions({ elements }: { elements: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {elements.map(([terme, valeur]) => (
        <div key={terme} className="min-w-0">
          <dt className="text-xs text-neutral-500">{terme}</dt>
          <dd className="mt-0.5 break-words text-encre">{valeur === null || valeur === undefined || valeur === '' ? '—' : valeur}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Bouton de confirmation natif (sans JavaScript) pour les actions sensibles. */
export function Confirmation({
  resume,
  children,
  className = '',
}: {
  resume: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="cursor-pointer list-none">{resume}</summary>
      <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">{children}</div>
    </details>
  );
}
