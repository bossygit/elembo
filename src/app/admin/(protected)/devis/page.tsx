import type { Metadata } from 'next';
import Link from 'next/link';

import { listerDevis } from '@/server/devis/repository';

export const metadata: Metadata = { title: 'Devis — Elembo' };
export const dynamic = 'force-dynamic';

function dateCourte(valeur: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(valeur),
  );
}

export default async function PageDevisAdmin() {
  let devis: Awaited<ReturnType<typeof listerDevis>> = [];
  let erreur = '';
  try {
    devis = await listerDevis({ limite: 100 });
  } catch {
    erreur = 'La liste des devis est indisponible. Vérifiez la configuration Supabase.';
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            Demandes
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Devis</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {devis.length} demande(s) affichée(s). Les transitions sont tracées en base.
          </p>
        </div>
      </div>

      {erreur ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {erreur}
        </p>
      ) : null}

      <div className="mt-8 overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Référence</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Famille</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Montant</th>
              <th className="px-4 py-3">Créé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {devis.map((d) => (
              <tr key={d.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/admin/devis/${d.id}`} className="underline">
                    {d.reference}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {String((d.contact_snapshot as { nom?: unknown }).nom ?? '—')}
                </td>
                <td className="px-4 py-3">{d.famille}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium">
                    {d.statut}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {d.montant_propose_fcfa === null
                    ? '—'
                    : `${d.montant_propose_fcfa.toLocaleString('fr-FR')} FCFA`}
                </td>
                <td className="px-4 py-3 text-neutral-500">{dateCourte(d.cree_le)}</td>
              </tr>
            ))}
            {devis.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                  Aucune demande pour le moment.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
