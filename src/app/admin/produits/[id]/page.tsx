import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { produitParId, variantesDuProduit } from '@/server/produits/repository';
import { ajouterVarianteAction } from '../actions';

export const metadata: Metadata = { title: 'Produit — Elembo' };
export const dynamic = 'force-dynamic';

export default async function PageProduitDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const produit = await produitParId(id);
  if (!produit) notFound();
  const variantes = await variantesDuProduit(id);

  return (
    <div>
      <Link href="/admin/produits" className="text-sm text-neutral-500 underline">← Produits</Link>
      <h1 className="mt-4 text-3xl font-semibold">{produit.nom}</h1>
      <p className="mt-1 text-sm text-neutral-600">{produit.id} · {produit.famille} · {produit.statut_prix}</p>

      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Variantes (tailles / couleurs)</h2>
        <form action={ajouterVarianteAction} className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <input type="hidden" name="produit_id" value={id} />
          <input name="taille" placeholder="Taille" className="rounded-xl border border-neutral-300 px-3 py-2 text-sm" />
          <input name="couleur" placeholder="Couleur" className="rounded-xl border border-neutral-300 px-3 py-2 text-sm" />
          <input name="sku" placeholder="SKU" className="rounded-xl border border-neutral-300 px-3 py-2 text-sm" />
          <input name="stock" type="number" placeholder="Stock" className="rounded-xl border border-neutral-300 px-3 py-2 text-sm" />
          <input name="seuil_alerte" type="number" placeholder="Seuil" className="rounded-xl border border-neutral-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white">Ajouter</button>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Taille</th>
                <th className="px-3 py-2">Couleur</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Stock</th>
                <th className="px-3 py-2">Seuil</th>
                <th className="px-3 py-2">Actif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {variantes.map((v) => (
                <tr key={v.id}>
                  <td className="px-3 py-2">{v.taille ?? '—'}</td>
                  <td className="px-3 py-2">{v.couleur ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{v.sku ?? '—'}</td>
                  <td className="px-3 py-2">{v.stock}</td>
                  <td className="px-3 py-2">{v.seuil_alerte}</td>
                  <td className="px-3 py-2">{v.actif ? 'Oui' : 'Non'}</td>
                </tr>
              ))}
              {variantes.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">Aucune variante.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
