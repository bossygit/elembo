'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { devisConfigure } from '@/lib/devis/configuration';
import { lienWhatsApp, MARQUE, MESSAGES_WHATSAPP, WHATSAPP } from '@/lib/site/marque';
import { ArrowRight, ArrowUpRight, Chat, Close, Menu } from './Icons';

const LIENS = [
  { href: '/', label: 'Accueil' },
  { href: '/univers', label: 'Univers' },
  { href: '/boutique', label: 'Boutique' },
  { href: '/univers/evenements', label: 'Événements' },
  { href: '/createurs', label: 'Créateurs' },
  { href: '/entreprises', label: 'Entreprises' },
  { href: '/contact', label: 'Contact' },
];

function correspond(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Le lien le plus précis gagne : sur /univers/evenements, seul « Événements » est actif. */
function lienActif(pathname: string): string | undefined {
  return LIENS.map((l) => l.href)
    .filter((href) => correspond(pathname, href))
    .sort((a, b) => b.length - a.length)[0];
}

const WHATSAPP_HREF = lienWhatsApp(MESSAGES_WHATSAPP.general);

export default function Header() {
  const pathname = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const lienDevis = devisConfigure ? '/devis' : '/contact';
  const libelleDevis = devisConfigure ? 'Demander un devis' : 'Nous contacter';
  const actif = lienActif(pathname);

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
    <header className="sticky top-0 z-50 border-b border-encre/10">
      {/*
        Le fond flouté est un calque à part : `backdrop-filter` posé sur l'en-tête lui-même
        en ferait le bloc conteneur du menu mobile (position fixe), qui serait alors rogné.
      */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-creme/90 backdrop-blur-md" />
      <div className="bg-encre text-creme">
        <div className="mx-auto flex w-full max-w-[90rem] items-center justify-between gap-4 px-4 py-2 text-[11px] font-medium tracking-wide sm:px-8">
          <p className="truncate">
            <span className="text-orange">✦</span> Création congolaise · Fabriqué à Brazzaville
          </p>
          <p className="hidden text-creme/60 md:block">Prix en FCFA · Paiement MTN MoMo</p>
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-creme transition-colors hover:text-orange"
          >
            <Chat className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">WhatsApp {WHATSAPP.affichage}</span>
            <span className="sm:hidden">WhatsApp</span>
          </a>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[90rem] items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link href="/" className="shrink-0" aria-label="Elembo, accueil">
          <span className="font-display text-[30px] font-extrabold leading-none tracking-[-0.06em] text-encre">
            elembo<span className="text-orange">.</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex xl:gap-8" aria-label="Navigation principale">
          {LIENS.slice(1).map((lien) => {
            const estActif = actif === lien.href;
            return (
              <Link
                key={lien.href}
                href={lien.href}
                aria-current={estActif ? 'page' : undefined}
                className={`group relative whitespace-nowrap py-1 text-[13px] font-medium transition-colors duration-200 ${
                  estActif ? 'text-encre' : 'text-encre/65 hover:text-encre'
                }`}
              >
                {lien.label}
                <span
                  aria-hidden
                  className={`absolute -bottom-0.5 left-0 h-0.5 w-full origin-left bg-orange transition-transform duration-300 ease-sortie ${
                    estActif ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/personnalisation"
            className="group inline-flex items-center gap-2 rounded-full bg-orange px-4 py-2.5 text-sm font-semibold text-encre transition-colors duration-300 hover:bg-encre hover:text-creme sm:px-5"
          >
            <span className="sm:hidden">Créer</span>
            <span className="hidden sm:inline">Créer mon design</span>
            <ArrowUpRight className="h-4 w-4 transition-transform duration-300 ease-sortie group-hover:rotate-45" />
          </Link>
          <button
            type="button"
            onClick={() => setOuvert((o) => !o)}
            aria-expanded={ouvert}
            aria-controls="menu-mobile"
            aria-label={ouvert ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-encre/20 text-encre transition-colors duration-200 hover:border-encre lg:hidden"
          >
            {ouvert ? <Close className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {ouvert && (
        <div
          id="menu-mobile"
          className="trame fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-encre text-creme lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="flex items-center justify-between px-4 py-4 sm:px-8">
            <Link
              href="/"
              onClick={() => setOuvert(false)}
              className="font-display text-[30px] font-extrabold leading-none tracking-[-0.06em]"
            >
              elembo<span className="text-orange">.</span>
            </Link>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              aria-label="Fermer le menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-creme/25"
            >
              <Close className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex flex-1 flex-col justify-center px-4 py-4 sm:px-8" aria-label="Navigation mobile">
            {LIENS.map((lien, index) => {
              const estActif = actif === lien.href;
              return (
                <Link
                  key={lien.href}
                  href={lien.href}
                  onClick={() => setOuvert(false)}
                  aria-current={estActif ? 'page' : undefined}
                  className="ligne border-b border-creme/10 py-2.5"
                >
                  <span style={{ '--i': index } as React.CSSProperties} className="flex items-baseline gap-3">
                    <span className="font-mono text-[10px] text-orange">0{index + 1}</span>
                    <span
                      className={`titre-geant text-[clamp(2rem,9.5vw,3.2rem)] ${estActif ? 'text-orange' : 'text-creme'}`}
                    >
                      {lien.label}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="grid gap-3 px-4 pb-8 pt-4 sm:px-8">
            <Link
              href="/personnalisation"
              onClick={() => setOuvert(false)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-orange px-5 py-4 text-sm font-semibold text-encre"
            >
              Créer mon design
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <div className="grid grid-cols-2 gap-3">
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOuvert(false)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-creme/30 px-4 py-3.5 text-sm font-semibold"
              >
                <Chat className="h-4 w-4" />
                WhatsApp
              </a>
              <Link
                href={lienDevis}
                onClick={() => setOuvert(false)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-creme/30 px-4 py-3.5 text-sm font-semibold"
              >
                {libelleDevis}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="pt-2 text-center font-accent text-lg italic text-creme/70">{MARQUE.signature}</p>
          </div>
        </div>
      )}
    </header>
  );
}
