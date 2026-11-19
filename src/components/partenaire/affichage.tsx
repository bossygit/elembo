/**
 * Éléments d'affichage partagés des rubriques du dossier partenaire (composants serveur).
 */

import Link from 'next/link';

import { FAMILLES, PRESTATIONS, TYPES_MACHINE } from '@/lib/partenaires/catalogue';
import { statutValidation, type StatutValidation } from '@/lib/partenaires/statuts';
import type { Groupe } from './Formulaire';
import { Alerte } from './ui';

const TONS = {
  attente: 'bg-amber-100 text-amber-900',
  succes: 'bg-emerald-100 text-emerald-900',
  alerte: 'bg-orange-100 text-orange-900',
  neutre: 'bg-sable text-encre',
} as const;

export function Pastille({ ton = 'neutre', children }: { ton?: keyof typeof TONS; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONS[ton]}`}>{children}</span>;
}

export function BadgeValidation({ statut }: { statut: StatutValidation }) {
  const s = statutValidation(statut);
  const ton = s.ton === 'succes' ? 'succes' : s.ton === 'alerte' ? 'alerte' : 'attente';
  return <Pastille ton={ton}>{s.label}</Pastille>;
}

/** Motif d'un refus de validation, à corriger par le partenaire. */
export function MotifRefus({ statut, motif }: { statut: StatutValidation; motif: string | null }) {
  if (statut !== 'REFUSEE' || !motif) return null;
  return (
    <Alerte ton="attention">
      <strong className="block">Refusé par Smart Vision</strong>
      {motif}
    </Alerte>
  );
}

export function EnTeteRubrique({
  titre,
  intro,
  retour = { href: '/partenaire', libelle: 'Mon dossier' },
  action,
}: {
  titre: string;
  intro?: React.ReactNode;
  retour?: { href: string; libelle: string };
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <Link href={retour.href} className="inline-flex min-h-11 items-center text-sm text-attenue hover:text-encre">
        ← {retour.libelle}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{titre}</h1>
          {intro ? <p className="mt-2 max-w-2xl text-base leading-relaxed text-attenue">{intro}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export function MessageOk({ code, messages }: { code?: string; messages: Record<string, string> }) {
  return code && messages[code] ? <Alerte ton="succes">{messages[code]}</Alerte> : null;
}

/** Conteneur de page du dossier. */
export function PageDossier({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:py-10">{children}</div>;
}

/** Élément de liste cliquable (machine, capacité, service). */
export function Ligne({ href, titre, sousTitre, pastilles }: { href: string; titre: string; sousTitre?: string; pastilles?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="block rounded-2xl border border-filet bg-white p-4 transition-colors hover:border-encre sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-semibold">{titre}</p>
          <div className="flex flex-wrap gap-1.5">{pastilles}</div>
        </div>
        {sousTitre ? <p className="mt-1 text-sm text-attenue">{sousTitre}</p> : null}
      </Link>
    </li>
  );
}

/** Menu « type de machine » groupé par famille (valeur `FAMILLE:CODE`). */
export const GROUPES_MACHINES: Groupe[] = FAMILLES.map((f) => ({
  libelle: f.nom,
  options: TYPES_MACHINE[f.id].map((t) => ({ valeur: `${f.id}:${t.id}`, libelle: t.nom })),
}));

/** Menu « prestation » groupé par famille (valeur `FAMILLE:CODE`). */
export const GROUPES_PRESTATIONS: Groupe[] = FAMILLES.map((f) => ({
  libelle: f.nom,
  options: PRESTATIONS[f.id].map((p) => ({ valeur: `${f.id}:${p.id}`, libelle: p.nom })),
}));

/** Dimension en mm → « 3,2 m ». */
export function metres(mm: number | null): string | null {
  return mm === null ? null : `${String(mm / 1000).replace('.', ',')} m`;
}

export function nombre(n: number | null): string | null {
  return n === null ? null : n.toLocaleString('fr-FR');
}

export function Definitions({ elements }: { elements: [string, React.ReactNode][] }) {
  const visibles = elements.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!visibles.length) return null;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {visibles.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs uppercase tracking-wide text-attenue">{k}</dt>
          <dd className="mt-0.5 text-sm">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
