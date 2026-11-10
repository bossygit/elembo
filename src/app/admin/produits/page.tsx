import type { Metadata } from 'next';
import Link from 'next/link';

import { listerProduits } from '@/server/produits/repository';
import { creerProduitAction, basculerProduitAction } from './actions';

export const metadata: Metadata = { title: 'Produits — Elembo' };
export const dynamic = 'force-dynamic';

export default async function PageProduits({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  const produits = await listerProduits().catch(() => []);

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Catalogue</p>
        <h1 className="mt-2 text-3xl font-semibold">Produits</h1>
      </div>

      {erreur ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Champs manquants.</p> : null}

      <form action={creerProduitAction} className="mb-8 rounded-2xl border border-neutral-200 bg-white p-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">ID (slug)
          <input name="id" required className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">Nom
          <input name="nom" required className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">Famille
          <select name="famille" required className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2">
            <option value="TEXTILE">Textile</option>
            <option value="TABLEAU">Tableau</option>
            <option value="IMPRESSION">Impression</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">Description
          <input name="description" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">Statut prix
          <select name="statut_prix" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2">
            <option value="PROVISOIRE">Provisoire</option>
            <option value="TEST">Test</option>
            <option value="VALIDE">Validé</option>
          </select>
        </label>
        <label className="text-sm">Prix FCFA
          <input name="prix_fcfa" type="number" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">Coût FCFA
          <input name="cout_fcfa" type="number" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">Délai (jours)
          <input name="delai_jours" type="number" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm">Quantité min
          <input name="quantite_min" type="number" defaultValue={1} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
        </label>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" name="disponible" defaultChecked /> Disponible
        </label>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" name="actif" defaultChecked /> Actif
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          <button type="submit" className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white">Créer le produit</button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Famille</th>
              <th className="px-4 py-3">Prix</th>
              <th className="px-4 py-3">Statut prix</th>
              <th className="px-4 py-3">Dispo</th>
              <th className="px-4 py-3">Actif</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {produits.map((p) => (
              <tr key={p.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/admin/produits/${p.id}`} className="underline">{p.id}</Link>
                </td>
                <td className="px-4 py-3">{p.nom}</td>
                <td className="px-4 py-3">{p.famille}</td>
                <td className="px-4 py-3">{p.prix_fcfa === null ? '—' : `${p.prix_fcfa.toLocaleString('fr-FR')} FCFA`}</td>
                <td className="px-4 py-3">{p.statut_prix}</td>
                <td className="px-4 py-3">
                  <form action={basculerProduitAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="champ" value="disponible" />
                    <input type="hidden" name="valeur" value={String(!p.disponible)} />
                    <button type="submit" className="rounded-full border px-2.5 py-1 text-xs">{p.disponible ? 'Oui' : 'Non'}</button>
                  </form>
                </td>
                <td className="px-4 py-3">
                  <form action={basculerProduitAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="champ" value="actif" />
                    <input type="hidden" name="valeur" value={String(!p.actif)} />
                    <button type="submit" className="rounded-full border px-2.5 py-1 text-xs">{p.actif ? 'Oui' : 'Non'}</button>
                  </form>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/produits/${p.id}`} className="text-xs underline">Détail</Link>
                </td>
              </tr>
            ))}
            {produits.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-neutral-500">Aucun produit.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
