'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type EntreeNav = { href: string; label: string; badge?: number };

function actif(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Menu latéral (bureau) et barre défilante (mobile). Les entrées sont déjà filtrées par rôle. */
export function NavAdmin({ entrees, variante }: { entrees: EntreeNav[]; variante: 'laterale' | 'mobile' }) {
  const pathname = usePathname();
  if (variante === 'mobile') {
    return (
      <nav aria-label="Navigation du back-office" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {entrees.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            aria-current={actif(pathname, e.href) ? 'page' : undefined}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
              actif(pathname, e.href) ? 'bg-white text-encre' : 'bg-white/10 text-white/80'
            }`}
          >
            {e.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Navigation du back-office" className="space-y-0.5">
      {entrees.map((e) => {
        const courant = actif(pathname, e.href);
        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={courant ? 'page' : undefined}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
              courant ? 'bg-white/10 font-medium text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span>{e.label}</span>
            {e.badge ? (
              <span className="rounded-full bg-orange px-1.5 text-[11px] font-semibold tabular-nums text-encre">{e.badge}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
