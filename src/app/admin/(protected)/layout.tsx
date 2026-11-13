import Link from 'next/link';
import { redirect } from 'next/navigation';

import { NavAdmin, type EntreeNav } from '@/components/admin/NavAdmin';
import { LIBELLES_ROLES, peut, type Permission } from '@/lib/admin/permissions';
import { staffCourant } from '@/server/admin/acces';
import { deconnexion } from '../connexion/actions';

const NAVIGATION: (EntreeNav & { permission: Permission })[] = [
  { href: '/admin', label: 'Tableau de bord', permission: 'tableau_de_bord.voir' },
  { href: '/admin/commandes', label: 'Commandes', permission: 'commandes.voir' },
  { href: '/admin/devis', label: 'Devis', permission: 'devis.voir' },
  { href: '/admin/banderoles', label: 'Banderoles', permission: 'grand_format.voir' },
  { href: '/admin/production', label: 'Atelier', permission: 'production.voir' },
  { href: '/admin/produits', label: 'Produits', permission: 'produits.voir' },
  { href: '/admin/clients', label: 'Clients', permission: 'clients.voir' },
];

/**
 * Coque du back-office. Elle affiche le menu autorisé pour le rôle ; elle ne protège rien à
 * elle seule (les pages et actions appellent `exigerAcces`), mais évite d'afficher la coque à
 * un visiteur non connecté.
 */
export default async function LayoutAdminProtege({ children }: { children: React.ReactNode }) {
  const staff = await staffCourant();
  if (!staff) redirect('/admin/connexion');

  const entrees = NAVIGATION.filter((e) => peut(staff.role, e.permission)).map(({ href, label }) => ({ href, label }));
  const identite = (
    <div className="min-w-0">
      <p className="truncate text-sm text-white" title={staff.email ?? undefined}>
        {staff.email ?? 'Compte staff'}
      </p>
      <p className="text-xs text-white/50">{LIBELLES_ROLES[staff.role]}</p>
    </div>
  );
  const sortie = (
    <form action={deconnexion}>
      <button type="submit" className="text-xs text-white/60 underline underline-offset-2 hover:text-white">
        Se déconnecter
      </button>
    </form>
  );

  return (
    <div className="lg:flex">
      <aside className="hidden w-60 shrink-0 bg-encre lg:block print:hidden">
        <div className="sticky top-0 flex h-screen flex-col px-3 py-5">
          <Link href="/admin" className="px-3 text-white">
            <span className="block text-base font-semibold tracking-tight">Elembo</span>
            <span className="block text-[11px] uppercase tracking-[0.18em] text-white/50">Back-office</span>
          </Link>
          <div className="mt-6 flex-1 overflow-y-auto">
            <NavAdmin entrees={entrees} variante="laterale" />
          </div>
          <div className="space-y-3 border-t border-white/10 px-3 pt-4">
            {identite}
            <div className="flex items-center justify-between">
              {sortie}
              <Link href="/" className="text-xs text-white/40 hover:text-white/70">
                Voir le site ↗
              </Link>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 space-y-3 bg-encre px-4 pb-3 pt-3 lg:hidden print:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin" className="text-sm font-semibold text-white">
              Elembo · Back-office
            </Link>
            {sortie}
          </div>
          <NavAdmin entrees={entrees} variante="mobile" />
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
