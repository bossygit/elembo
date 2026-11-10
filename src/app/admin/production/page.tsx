import type { Metadata } from 'next';
import Link from 'next/link';

import { supabaseAdmin } from '@/server/supabase/client';

export const metadata: Metadata = { title: 'Atelier / Production — Elembo' };
export const dynamic = 'force-dynamic';

export default async function PageProduction() {
  const admin = supabaseAdmin();
  const { data: travaux } = await admin
    .from('travaux_production')
    .select('*, commande:commandes(reference, statut, statut_paiement, client_id), partenaire:partenaires(nom, specialite)')
    .order('date_prevue', { ascending: true, nullsFirst: false });

  const liste = travaux ?? [];

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Atelier</p>
        <h1 className="mt-2 text-3xl font-semibold">Production</h1>
        <p className="mt-1 text-sm text-neutral-600">{liste.length} tâche(s) de production.</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Commande</th>
              <th className="px-4 py-3">Étape</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Prestataire</th>
              <th className="px-4 py-3">Date prévue</th>
              <th className="px-4 py-3">Quantités / instructions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {liste.map((t) => {
              const commande = t.commande as { reference?: string; statut?: string; statut_paiement?: string } | null;
              const partenaire = t.partenaire as { nom?: string; specialite?: string } | null;
              return (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-mono text-xs">
                    {commande?.reference ? (
                      <Link href={`/admin/commandes/${t.commande_id}`} className="underline">{commande.reference}</Link>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">{t.etape}</td>
                  <td className="px-4 py-3">{t.statut}</td>
                  <td className="px-4 py-3">{partenaire?.nom ?? (t.interne ? 'Interne' : '—')}</td>
                  <td className="px-4 py-3">{t.date_prevue ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    <p className="whitespace-pre-wrap">{t.instructions ?? '—'}</p>
                    {t.cout_fcfa ? <p className="mt-1">Coût : {Number(t.cout_fcfa).toLocaleString('fr-FR')} FCFA</p> : null}
                  </td>
                </tr>
              );
            })}
            {liste.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-neutral-500">Aucune tâche de production.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-neutral-500">
        Le dossier de production (fichiers PNG haute résolution, fiches techniques) est accessible via la fiche commande et les fichiers de production.
      </p>
    </div>
  );
}
