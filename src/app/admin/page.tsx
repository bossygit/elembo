import Link from 'next/link';
import type { Metadata } from 'next';

import { supabaseAdmin } from '@/server/supabase/client';

export const metadata: Metadata = { title: 'Tableau de bord — Elembo' };
export const dynamic = 'force-dynamic';

function formatFcfa(valeur: number): string {
  return `${valeur.toLocaleString('fr-FR')} FCFA`;
}

export default async function PageTableauDeBord() {
  const admin = supabaseAdmin();

  const [
    { count: nbCommandes },
    { count: nbPayees },
    { count: nbEnProduction },
    { count: nbLivrees },
    { count: nbDevis },
    { data: commandes },
    { data: produits },
    { data: variantes },
  ] = await Promise.all([
    admin.from('commandes').select('*', { count: 'exact', head: true }),
    admin.from('commandes').select('*', { count: 'exact', head: true }).eq('statut_paiement', 'PAYE'),
    admin.from('commandes').select('*', { count: 'exact', head: true }).in('statut', ['A_PRODUIRE', 'EN_PRODUCTION', 'CONTROLE_QUALITE']),
    admin.from('commandes').select('*', { count: 'exact', head: true }).eq('statut', 'LIVREE'),
    admin.from('devis').select('*', { count: 'exact', head: true }),
    admin.from('commandes').select('total_fcfa, cout_fcfa, marge_fcfa, cree_le'),
    admin.from('produits').select('id, nom, famille, disponible, actif'),
    admin.from('variantes_produit').select('produit_id, stock, seuil_alerte'),
  ]);

  const ca = (commandes ?? []).reduce((acc, c) => acc + (Number(c.total_fcfa) || 0), 0);
  const cout = (commandes ?? []).reduce((acc, c) => acc + (Number(c.cout_fcfa) || 0), 0);
  const marge = (commandes ?? []).reduce((acc, c) => acc + (Number(c.marge_fcfa) || 0), 0);

  const alertesStock = (variantes ?? []).filter((v) => Number(v.stock) <= Number(v.seuil_alerte));

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Vue d&apos;ensemble</p>
        <h1 className="mt-2 text-3xl font-semibold">Tableau de bord</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Chiffre d’affaires', formatFcfa(ca)],
          ['Commandes reçues', String(nbCommandes ?? 0)],
          ['Commandes payées', String(nbPayees ?? 0)],
          ['Commandes en production', String(nbEnProduction ?? 0)],
          ['Commandes livrées', String(nbLivrees ?? 0)],
          ['Demandes de devis', String(nbDevis ?? 0)],
          ['Marge cumulée', formatFcfa(marge)],
          ['Coût cumulé', formatFcfa(cout)],
        ].map(([label, valeur]) => (
          <div key={label} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="mt-2 text-xl font-semibold">{valeur}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Alertes de stock</h2>
          {alertesStock.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">Aucune alerte.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-100 text-sm">
              {alertesStock.slice(0, 10).map((v, i) => (
                <li key={i} className="py-2 flex justify-between">
                  <span>{v.produit_id}</span>
                  <span className="text-amber-700">stock {v.stock} (seuil {v.seuil_alerte})</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Produits</h2>
          <ul className="mt-3 divide-y divide-neutral-100 text-sm">
            {(produits ?? []).slice(0, 8).map((p) => (
              <li key={p.id} className="py-2 flex justify-between">
                <span>{p.nom}</span>
                <span className="text-neutral-500">{p.famille} · {p.actif ? 'actif' : 'inactif'}</span>
              </li>
            ))}
            {(produits ?? []).length === 0 ? <li className="py-2 text-neutral-500">Aucun produit.</li> : null}
          </ul>
          <Link href="/admin/produits" className="mt-3 inline-block text-sm underline">Gérer les produits</Link>
        </section>
      </div>
    </div>
  );
}
