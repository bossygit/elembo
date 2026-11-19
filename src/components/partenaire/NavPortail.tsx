'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type EntreeNav = { href: string; libelle: string };

/**
 * Navigation du dossier partenaire : un ruban horizontal défilant sur téléphone. N'affiche que
 * les rubriques fournies par le layout (déjà filtrées selon le statut) ; ne protège rien.
 */
export function NavPortail({ entrees }: { entrees: EntreeNav[] }) {
  const chemin = usePathname();
  return (
    <nav aria-label="Rubriques du dossier" className="border-b border-filet bg-creme">
      <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 [scrollbar-width:none]">
        {entrees.map((e) => {
          const actif = e.href === '/partenaire' ? chemin === e.href : chemin === e.href || chemin.startsWith(`${e.href}/`);
          return (
            <li key={e.href} className="shrink-0">
              <Link
                href={e.href}
                aria-current={actif ? 'page' : undefined}
                className={`inline-flex min-h-12 items-center border-b-2 px-3 text-sm font-medium transition-colors ${
                  actif ? 'border-orange-action text-encre' : 'border-transparent text-attenue hover:text-encre'
                }`}
              >
                {e.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
