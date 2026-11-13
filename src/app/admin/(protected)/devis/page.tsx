import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, EnTete, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import { dateHeure, fcfa } from '@/lib/admin/format';
import { STATUTS_DEVIS, estStatutDevis, libelleCommande, libelleDevis, libelleFamille, libellePaiement } from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { compterDevisParStatut, rechercherDevis, type DevisListe } from '@/server/admin/devis';

export const metadata: Metadata = { title: 'Devis' };
export const dynamic = 'force-dynamic';

export default async function PageDevis({ searchParams }: { searchParams: Promise<{ statut?: string; q?: string }> }) {
  await exigerAcces('devis.voir');
  const params = await searchParams;
  const statut = estStatutDevis(params.statut) ? params.statut : null;
  const texte = (params.q ?? '').trim().slice(0, 120);

  let devis: DevisListe[] = [];
  let comptes: Record<string, number> = {};
  let erreur = '';
  try {
    [devis, comptes] = await Promise.all([rechercherDevis({ statut, texte }), compterDevisParStatut()]);
  } catch {
    erreur = 'La liste des devis est indisponible.';
  }

  return (
    <div>
      <EnTete
        surtitre="Ventes"
        titre="Devis"
        description="Réception → analyse → proposition → prix validé → acceptation → commande → paiement."
      />

      <nav className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Étapes du pipeline">
        <Link
          href="/admin/devis"
          aria-current={!statut ? 'true' : undefined}
          className={`rounded-xl border px-3 py-2.5 ${!statut ? 'border-encre bg-encre text-white' : 'border-neutral-200 bg-white hover:border-neutral-400'}`}
        >
          <span className="block text-xs opacity-70">Tous</span>
          <span className="text-lg font-semibold tabular-nums">{Object.values(comptes).reduce((a, b) => a + b, 0)}</span>
        </Link>
        {STATUTS_DEVIS.map((s) => (
          <Link
            key={s.id}
            href={`/admin/devis?statut=${s.id}`}
            aria-current={statut === s.id ? 'true' : undefined}
            className={`rounded-xl border px-3 py-2.5 ${statut === s.id ? 'border-encre bg-encre text-white' : 'border-neutral-200 bg-white hover:border-neutral-400'}`}
          >
            <span className="block text-xs opacity-70">{s.label}</span>
            <span className="text-lg font-semibold tabular-nums">{comptes[s.id] ?? 0}</span>
          </Link>
        ))}
      </nav>

      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4" role="search">
        {statut ? <input type="hidden" name="statut" value={statut} /> : null}
        <label className={`${libelle} min-w-64 flex-1`}>
          Recherche
          <input type="search" name="q" defaultValue={texte} placeholder="Référence, nom, société, téléphone, email" className={champ} />
        </label>
        <button type="submit" className={bouton('primaire')}>
          Rechercher
        </button>
      </form>

      {erreur ? <p role="alert" className="mb-4 text-sm text-red-700">{erreur}</p> : null}

      <div className={tableau.conteneur}>
        <table className={tableau.table}>
          <thead className={tableau.thead}>
            <tr>
              <th className={tableau.th}>Référence</th>
              <th className={tableau.th}>Client</th>
              <th className={tableau.th}>Famille</th>
              <th className={tableau.th}>Étape</th>
              <th className={`${tableau.th} text-right`}>Montant</th>
              <th className={tableau.th}>Commande / paiement</th>
              <th className={tableau.th}>Reçu</th>
            </tr>
          </thead>
          <tbody className={tableau.tbody}>
            {devis.map((d) => {
              const contact = d.contact_snapshot as { nom?: unknown; societe?: unknown };
              const s = libelleDevis(d.statut);
              return (
                <tr key={d.id} className={tableau.tr}>
                  <td className={tableau.td}>
                    <Link href={`/admin/devis/${d.id}`} className="font-mono text-xs font-medium hover:underline">
                      {d.reference}
                    </Link>
                  </td>
                  <td className={tableau.td}>
                    {String(contact.nom ?? '—')}
                    {contact.societe ? <span className="block text-xs text-neutral-500">{String(contact.societe)}</span> : null}
                  </td>
                  <td className={tableau.td}>
                    {libelleFamille(d.famille)}
                    {d.quantite ? <span className="block text-xs text-neutral-500">{d.quantite} u.</span> : null}
                  </td>
                  <td className={tableau.td}>
                    <Badge ton={s.ton}>{s.label}</Badge>
                    {d.montant_propose_fcfa !== null && d.statut !== 'ACCEPTE' ? (
                      <span className="mt-1 block text-[11px] text-neutral-500">{d.prix_valide ? 'Prix validé' : 'Prix à valider'}</span>
                    ) : null}
                  </td>
                  <td className={tableau.nombre}>{fcfa(d.montant_propose_fcfa)}</td>
                  <td className={tableau.td}>
                    {d.commande ? (
                      <Link href={`/admin/commandes/${d.commande.id}`} className="flex flex-wrap gap-1 hover:opacity-80">
                        <Badge ton={libelleCommande(d.commande.statut).ton}>{libelleCommande(d.commande.statut).label}</Badge>
                        <Badge ton={libellePaiement(d.commande.statut_paiement).ton}>{libellePaiement(d.commande.statut_paiement).label}</Badge>
                      </Link>
                    ) : d.statut === 'ACCEPTE' ? (
                      <span className="text-xs font-medium text-amber-700">À transformer en commande</span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className={`${tableau.td} whitespace-nowrap text-neutral-600`}>{dateHeure(d.cree_le)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!erreur && devis.length === 0 ? <Vide>Aucune demande pour ce filtre.</Vide> : null}
      </div>
    </div>
  );
}
