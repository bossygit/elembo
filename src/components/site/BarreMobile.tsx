'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { lienWhatsApp, MESSAGES_WHATSAPP } from '@/lib/site/marque';

import { Bag, Chat, Grid, Home, Plus } from './Icons';

/**
 * Barre de navigation basse, sur téléphone et tablette : les quatre destinations qui comptent
 * et « Créer » au centre, sous le pouce. Il n'y a pas de panier sur Elembo : la commande se
 * fait dans l'atelier de création, d'où l'accès direct.
 */
const ONGLETS = [
  { href: '/', label: 'Accueil', Icone: Home },
  { href: '/univers', label: 'Univers', Icone: Grid },
  { href: '/boutique', label: 'Boutique', Icone: Bag },
] as const;

function actif(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BarreMobile() {
  const pathname = usePathname() ?? '/';
  if (pathname.startsWith('/admin')) return null;

  const classeOnglet = (estActif: boolean) =>
    `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide transition-colors ${
      estActif ? 'text-orange' : 'text-creme/70'
    }`;

  return (
    <>
      {/* Réserve la hauteur de la barre pour qu'elle ne recouvre jamais la fin de page. */}
      <div aria-hidden className="h-[4.5rem] bg-encre lg:hidden" />
      <nav
        aria-label="Navigation rapide"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-creme/10 bg-encre/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-xl items-stretch px-2">
          {ONGLETS.slice(0, 2).map(({ href, label, Icone }) => (
            <Link key={href} href={href} aria-current={actif(pathname, href) ? 'page' : undefined} className={classeOnglet(actif(pathname, href))}>
              <Icone className="h-5 w-5" />
              {label}
            </Link>
          ))}

          <Link
            href="/personnalisation"
            aria-current={actif(pathname, '/personnalisation') ? 'page' : undefined}
            className="flex flex-1 flex-col items-center justify-end gap-1 pb-2 text-[10px] font-semibold tracking-wide text-creme"
          >
            <span className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-orange text-encre shadow-[0_8px_24px_-6px_rgba(255,90,18,0.7)] transition-transform active:scale-95">
              <Plus className="h-6 w-6" />
            </span>
            Créer
          </Link>

          {ONGLETS.slice(2).map(({ href, label, Icone }) => (
            <Link key={href} href={href} aria-current={actif(pathname, href) ? 'page' : undefined} className={classeOnglet(actif(pathname, href))}>
              <Icone className="h-5 w-5" />
              {label}
            </Link>
          ))}
          <a
            href={lienWhatsApp(MESSAGES_WHATSAPP.general)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Aide sur WhatsApp (s’ouvre dans WhatsApp)"
            className={classeOnglet(false)}
          >
            <Chat className="h-5 w-5" />
            Aide
          </a>
        </div>
      </nav>
    </>
  );
}
