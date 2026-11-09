'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { devisConfigure } from '@/lib/devis/configuration';
import { ArrowRight, Close, Menu } from './Icons';

const LIENS = [
  { href: '/boutique', label: 'Boutique' },
  { href: '/personnalisation', label: 'Personnalisation' },
  { href: '/impression', label: 'Impression' },
  { href: '/entreprises', label: 'Entreprises' },
  { href: '/devis', label: 'Devis' },
  { href: '/comment-ca-marche', label: 'Comment ça marche' },
];

const LIENS_VISIBLES = LIENS.filter((lien) => devisConfigure || !lien.href.startsWith('/devis'));

function estActif(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Header() {
  const pathname = usePathname();
  const [ouvert, setOuvert] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-filet bg-creme/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link href="/" className="group flex items-baseline gap-2" aria-label="Elembo, accueil">
          <span className="text-[26px] font-bold leading-none tracking-tight text-encre">
            elembo<span className="text-orange">.</span>
          </span>
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-attenue sm:inline">
            par Smart Vision
          </span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Navigation principale">
          {LIENS_VISIBLES.map((lien) => {
            const actif = estActif(pathname, lien.href);
            return (
              <Link
                key={lien.href}
                href={lien.href}
                aria-current={actif ? 'page' : undefined}
                className={`relative py-1 text-sm font-medium transition-colors duration-200 hover:text-orange-action ${
                  actif ? 'text-encre' : 'text-attenue'
                }`}
              >
                {lien.label}
                {actif && (
                  <span aria-hidden className="absolute -bottom-0.5 left-0 h-0.5 w-full bg-orange" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/contact"
            className="hidden items-center gap-2 rounded-full bg-encre px-4 py-2.5 text-sm font-semibold text-creme transition-colors duration-200 hover:bg-orange hover:text-encre sm:inline-flex"
          >
            Parler de mon projet
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => setOuvert((o) => !o)}
            aria-expanded={ouvert}
            aria-controls="menu-mobile"
            aria-label={ouvert ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-filet text-encre transition-colors duration-200 hover:border-encre lg:hidden"
          >
            {ouvert ? <Close className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {ouvert && (
        <div id="menu-mobile" className="border-t border-filet bg-creme lg:hidden">
          <nav className="mx-auto flex w-full max-w-7xl flex-col px-4 py-3" aria-label="Navigation mobile">
            {LIENS_VISIBLES.map((lien) => (
              <Link
                key={lien.href}
                href={lien.href}
                onClick={() => setOuvert(false)}
                aria-current={estActif(pathname, lien.href) ? 'page' : undefined}
                className="flex items-center justify-between border-b border-filet py-3.5 text-base font-medium text-encre last:border-b-0"
              >
                {lien.label}
                <ArrowRight className="h-4 w-4 text-attenue" />
              </Link>
            ))}
            <Link
              href="/contact"
              onClick={() => setOuvert(false)}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-encre px-5 py-3 text-sm font-semibold text-creme"
            >
              Parler de mon projet
              <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
