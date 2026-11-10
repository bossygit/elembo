import type { Metadata } from 'next';
import Link from 'next/link';

import { listerClients } from '@/server/clients/repository';

export const metadata: Metadata = { title: 'Clients — Elembo' };
export const dynamic = 'force-dynamic';

export default async function PageClients() {
  const clients = await listerClients().catch(() => []);
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Relation client</p>
        <h1 className="mt-2 text-3xl font-semibold">Clients</h1>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Société</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Téléphone</th>
              <th className="px-4 py-3">Ville</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/clients/${c.id}`} className="underline">{c.nom}</Link>
                </td>
                <td className="px-4 py-3">{c.type_client}</td>
                <td className="px-4 py-3">{c.societe ?? '—'}</td>
                <td className="px-4 py-3">{c.email ?? '—'}</td>
                <td className="px-4 py-3">{c.telephone}</td>
                <td className="px-4 py-3">{c.ville ?? '—'}</td>
              </tr>
            ))}
            {clients.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-neutral-500">Aucun client.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
