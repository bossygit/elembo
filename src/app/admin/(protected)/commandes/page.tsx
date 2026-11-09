import type { Metadata } from 'next';
import Link from 'next/link';

import { listerCommandes, MODES_PAIEMENT, STATUTS_COMMANDE } from '@/server/commandes/repository';

export const metadata: Metadata = { title: 'Commandes — Elembo' };
export const dynamic = 'force-dynamic';

function dateCourte(valeur: string | null): string {
  if (!valeur) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(valeur),
  );
}

function libelleStatut(statut: string): string {
  return STATUTS_COMMANDE.find((s) => s.id === statut)?.label ?? statut;
}

function libelleMode(mode: string): string {
  return MODES_PAIEMENT.find((m) => m.id === mode)?.label ?? mode;
}

export default async function PageCommandesAdmin({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const { statut } = await searchParams;
  let commandes: Awaited<ReturnType<typeof listerCommandes>> = [];
  let erreur = '';
  try {
    commandes = await listerCommandes({ statut, limite: 100 });
  } catch {
    erreur = 'La liste des commandes est indisponible. Vérifiez la configuration Supabase.';
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            Atelier
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Commandes</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {commandes.length} commande(s) affichée(s). La production ne démarre jamais sans paiement confirmé.
          </p>
        </div>
        <Link href="/admin/devis" className="rounded-xl border border-neutral-300 px-3 py-2 text-sm">
          Voir les devis
        </Link>
      </div>

      <nav className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="Filtrer les commandes">
        <Link
          href="/admin/commandes"
          className={`rounded-full border px-3 py-1.5 ${!statut ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'}`}
        >
          Toutes
        </Link>
        {STATUTS_COMMANDE.map((s) => (
          <Link
            key={s.id}
            href={`/admin/commandes?statut=${s.id}`}
            className={`rounded-full border px-3 py-1.5 ${statut === s.id ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'}`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

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
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Montant</th>
              <th className="px-4 py-3">Paiement</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Créée</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {commandes.map((c) => {
              const contact = c.contact_snapshot as { nom?: unknown };
              return (
                <tr key={c.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/admin/commandes/${c.id}`} className="underline">
                      {c.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{String(contact.nom ?? '—')}</td>
                  <td className="px-4 py-3 text-neutral-600">{libelleMode(c.mode_paiement)}</td>
                  <td className="px-4 py-3">{c.total_fcfa.toLocaleString('fr-FR')} FCFA</td>
                  <td className="px-4 py-3">{c.statut_paiement}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium">
                      {libelleStatut(c.statut)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{dateCourte(c.cree_le)}</td>
                </tr>
              );
            })}
            {commandes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                  Aucune commande pour le moment.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
