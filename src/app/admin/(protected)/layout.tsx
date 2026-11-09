import Link from 'next/link';
import { redirect } from 'next/navigation';

import { utilisateurStaff } from '@/server/auth/session';
import { devisConfigure } from '@/lib/devis/configuration';
import { deconnexion } from '../connexion/actions';

export default async function LayoutAdminProtege({ children }: { children: React.ReactNode }) {
  if (!devisConfigure) redirect('/');
  const staff = await utilisateurStaff();
  if (!staff) redirect('/admin/connexion');

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/admin/devis" className="font-semibold">
              Elembo · Back-office
            </Link>
            <Link href="/admin/devis" className="text-sm text-neutral-600 hover:text-black">
              Devis
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-neutral-500">
              {staff.claims.email ?? staff.claims.sub} · {staff.role}
            </span>
            <form action={deconnexion}>
              <button type="submit" className="underline">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
