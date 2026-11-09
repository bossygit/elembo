'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { devisConfigure } from '@/lib/devis/configuration';
import { ArrowRight, Close, Menu } from './Icons';

const LIENS = [
  { href: '/', label: 'Accueil' },
  { href: '/boutique', label: 'Boutique' },
  { href: '/personnalisation', label: 'Personnalisation' },
  { href: '/impression', label: 'Impression graphique' },
  { href: '/entreprises', label: 'Entreprises' },
  { href: '/comment-ca-marche', label: 'Comment ça marche' },
  { href: '/contact', label: 'Contact' },
];

function estActif(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Header() {
  const pathname = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const lienDevis = devisConfigure ? '/devis' : '/contact';
  const libelleDevis = devisConfigure ? 'Demander un devis' : 'Nous contacter';

  useEffect(() => {
    if (!ouvert) return;
    const precedent = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const fermer = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') setOuvert(false);
    };
    window.addEventListener('keydown', fermer);
    return () => {
      document.body.style.overflow = precedent;
      window.removeEventListener('keydown', fermer);
    };
  }, [ouvert]);

  return (
    <header className="sticky top-0 z-50 border-b border-filet bg-creme">
      <div className="bg-encre text-creme">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-2 text-[11px] font-medium tracking-wide sm:px-6">
          <p>Atelier à Brazzaville · Fabrication locale</p>
          <div className="hidden items-center gap-4 sm:flex">
            <span className="text-creme/70">MTN Mobile Money</span>
            <span className="text-creme/30" aria-hidden>·</span>
            <span className="text-creme/70">Livraison Brazzaville & Pointe-Noire</span>
          </div>
          <Link href={lienDevis} className="inline-flex items-center gap-1.5 text-orange hover:text-orange-action">
            {libelleDevis}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link href="/" className="group flex shrink-0 items-baseline gap-2" aria-label="Elembo, accueil">
          <span className="text-[28px] font-bold leading-none tracking-tight text-encre">
            elembo<span className="text-orange">.</span>
          </span>
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-attenue sm:inline">
            par Smart Vision
          </span>
        </Link>

        <nav className="hidden items-center gap-4 lg:flex xl:gap-5" aria-label="Navigation principale">
          {LIENS.map((lien) => {
            const actif = estActif(pathname, lien.href);
            return (
              <Link
                key={lien.href}
                href={lien.href}
                aria-current={actif ? 'page' : undefined}
                className={`relative whitespace-nowrap py-1 text-[12.5px] font-medium transition-colors duration-200 hover:text-orange-action ${
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
            href={lienDevis}
            className="hidden items-center gap-2 rounded-full bg-encre px-4 py-2.5 text-sm font-semibold text-creme transition-colors duration-200 hover:bg-orange hover:text-encre xl:inline-flex"
          >
            {libelleDevis}
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
        <div
          id="menu-mobile"
          className="fixed inset-0 z-[60] overflow-y-auto bg-creme lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu mobile"
        >
          <div className="flex items-center justify-between border-b border-filet px-4 py-4 sm:px-6">
            <Link href="/" onClick={() => setOuvert(false)} className="text-[28px] font-bold leading-none tracking-tight text-encre">
              elembo<span className="text-orange">.</span>
            </Link>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              aria-label="Fermer le menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-filet text-encre"
            >
              <Close className="h-5 w-5" />
            </button>
          </div>
          <nav className="mx-auto flex w-full max-w-7xl flex-col px-4 py-3 sm:px-6" aria-label="Navigation mobile">
            {LIENS.map((lien, index) => {
              const actif = estActif(pathname, lien.href);
              return (
                <Link
                  key={lien.href}
                  href={lien.href}
                  onClick={() => setOuvert(false)}
                  aria-current={actif ? 'page' : undefined}
                  className="flex items-center justify-between border-b border-filet py-4 text-lg font-medium text-encre last:border-b-0"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="font-mono text-[10px] text-orange-action">0{index + 1}</span>
                    {lien.label}
                  </span>
                  <ArrowRight className={`h-4 w-4 ${actif ? 'text-orange-action' : 'text-attenue'}`} />
                </Link>
              );
            })}
            <Link
              href={lienDevis}
              onClick={() => setOuvert(false)}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-encre px-5 py-3.5 text-sm font-semibold text-creme"
            >
              {libelleDevis}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-5 pb-3 text-center text-xs text-attenue">
              Atelier à Brazzaville · Paiement MTN MoMo · Livraison locale
            </p>
          </nav>
        </div>
      )}
    </header>
  );
}
