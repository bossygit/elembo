import Link from 'next/link';
import { redirect } from 'next/navigation';

import { utilisateurStaff } from '@/server/auth/session';
import { devisConfigure } from '@/lib/devis/configuration';
import { deconnexion } from '../connexion/actions';

const NAVIGATION = [
  { href: '/admin', label: 'Tableau de bord' },
  { href: '/admin/commandes', label: 'Commandes' },
  { href: '/admin/devis', label: 'Devis' },
  { href: '/admin/produits', label: 'Produits' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/production', label: 'Atelier / Production' },
];

export default async function LayoutAdminProtege({ children }: { children: React.ReactNode }) {
  if (!devisConfigure) redirect('/');
  const staff = await utilisateurStaff();
  if (!staff) redirect('/admin/connexion');

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-6 rounded-2xl border border-neutral-200 bg-white p-4">
            <Link href="/admin" className="block font-semibold">
              Elembo · Back-office
            </Link>
            <p className="mt-1 text-xs text-neutral-500">
              {staff.claims.email ?? staff.claims.sub} · {staff.role}
            </p>
            <nav className="mt-4 space-y-1 text-sm" aria-label="Navigation back-office">
              {NAVIGATION.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-lg px-3 py-2 text-neutral-700 hover:bg-neutral-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <form action={deconnexion} className="mt-4">
              <button type="submit" className="text-xs text-neutral-500 underline">
                Déconnexion
              </button>
            </form>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 lg:hidden">
            <Link href="/admin" className="font-semibold">
              Elembo · Back-office
            </Link>
            <nav className="flex flex-wrap gap-2 text-xs">
              {NAVIGATION.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-full border border-neutral-300 px-2.5 py-1">
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
