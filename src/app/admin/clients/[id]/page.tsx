import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { clientParId, commandesDuClient } from '@/server/clients/repository';

export const metadata: Metadata = { title: 'Client — Elembo' };
export const dynamic = 'force-dynamic';

export default async function PageClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await clientParId(id);
  if (!client) notFound();
  const commandes = await commandesDuClient(id);
  const totalDepense = commandes.reduce((acc, c) => acc + (Number(c.total_fcfa) || 0), 0);

  return (
    <div>
      <Link href="/admin/clients" className="text-sm text-neutral-500 underline">← Clients</Link>
      <h1 className="mt-4 text-3xl font-semibold">{client.nom}</h1>
      <p className="mt-1 text-sm text-neutral-600">{client.type_client} · {client.societe ?? '—'} · {client.ville ?? '—'}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">Commandes</p>
          <p className="mt-2 text-xl font-semibold">{commandes.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">Montant dépensé</p>
          <p className="mt-2 text-xl font-semibold">{totalDepense.toLocaleString('fr-FR')} FCFA</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">Téléphone</p>
          <p className="mt-2 text-sm font-semibold">{client.telephone}</p>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Coordonnées</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div><dt className="text-neutral-500">Email</dt><dd>{client.email ?? '—'}</dd></div>
          <div><dt className="text-neutral-500">Adresse</dt><dd>{(client as Record<string, unknown>).adresse as string ?? '—'}</dd></div>
          <div><dt className="text-neutral-500">Notes commerciales</dt><dd className="whitespace-pre-wrap">{client.notes ?? '—'}</dd></div>
        </dl>
      </section>

      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Historique des commandes</h2>
        <ul className="mt-3 divide-y divide-neutral-100 text-sm">
          {commandes.map((c) => (
            <li key={String(c.id)} className="py-2 flex justify-between">
              <Link href={`/admin/commandes/${c.id}`} className="font-mono text-xs underline">{String(c.reference)}</Link>
              <span>{Number(c.total_fcfa).toLocaleString('fr-FR')} FCFA · {String(c.statut)}</span>
            </li>
          ))}
          {commandes.length === 0 ? <li className="py-2 text-neutral-500">Aucune commande.</li> : null}
        </ul>
      </section>
    </div>
  );
}
