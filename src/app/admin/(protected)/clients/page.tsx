import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, EnTete, Pagination, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import { dateCourte, fcfa } from '@/lib/admin/format';
import { TYPES_CLIENT, estProfessionnel, estTypeClient, libelleTypeClient } from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { rechercherClients, type ClientListe } from '@/server/admin/clients';

export const metadata: Metadata = { title: 'Clients' };
export const dynamic = 'force-dynamic';

const PAR_PAGE = 50;

export default async function PageClients({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  await exigerAcces('clients.voir');
  const params = await searchParams;
  const type = estTypeClient(params.type) ? params.type : null;
  const texte = (params.q ?? '').trim().slice(0, 120);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(params.page ?? '1', 10) || 1));

  let clients: ClientListe[] = [];
  let total = 0;
  let erreur = '';
  try {
    ({ clients, total } = await rechercherClients({ texte, type, limite: PAR_PAGE, decalage: (page - 1) * PAR_PAGE }));
  } catch {
    erreur = 'La liste des clients est indisponible (migration 0010 appliquée ?).';
  }

  return (
    <div>
      <EnTete
        surtitre="Relation client"
        titre="Clients"
        description="Montant dépensé = commandes payées uniquement. Les fiches sont créées automatiquement à la première commande ou au premier devis."
      />

      <form className="mb-4 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-[2fr_1fr_auto]" role="search">
        <label className={libelle}>
          Recherche
          <input type="search" name="q" defaultValue={texte} placeholder="Nom, société, téléphone, email, ville" className={champ} />
        </label>
        <label className={libelle}>
          Type
          <select name="type" defaultValue={type ?? ''} className={champ}>
            <option value="">Tous</option>
            {TYPES_CLIENT.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.professionnel ? ' (pro)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className={bouton('primaire')}>
            Filtrer
          </button>
        </div>
      </form>

      {erreur ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{erreur}</p> : null}

      <div className={tableau.conteneur}>
        <table className={tableau.table}>
          <thead className={tableau.thead}>
            <tr>
              <th className={tableau.th}>Client</th>
              <th className={tableau.th}>Type</th>
              <th className={tableau.th}>Contact</th>
              <th className={`${tableau.th} text-right`}>Commandes</th>
              <th className={`${tableau.th} text-right`}>Montant dépensé</th>
              <th className={tableau.th}>Dernière commande</th>
            </tr>
          </thead>
          <tbody className={tableau.tbody}>
            {clients.map((c) => (
              <tr key={c.id} className={tableau.tr}>
                <td className={tableau.td}>
                  <Link href={`/admin/clients/${c.id}`} className="font-medium hover:underline">
                    {c.nom}
                  </Link>
                  {c.societe ? <p className="text-xs text-neutral-500">{c.societe}</p> : null}
                </td>
                <td className={tableau.td}>
                  <Badge ton={estProfessionnel(c.type_client) ? 'info' : 'neutre'}>{libelleTypeClient(c.type_client)}</Badge>
                </td>
                <td className={tableau.td}>
                  <p>{c.telephone}</p>
                  <p className="text-xs text-neutral-500">{[c.email, c.ville].filter(Boolean).join(' · ')}</p>
                </td>
                <td className={tableau.nombre}>{c.nb_commandes}</td>
                <td className={`${tableau.nombre} font-medium`}>{fcfa(c.montant_depense_fcfa)}</td>
                <td className={`${tableau.td} whitespace-nowrap text-neutral-600`}>{dateCourte(c.derniere_commande_le)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!erreur && clients.length === 0 ? <Vide>Aucun client ne correspond.</Vide> : null}
      </div>
      <Pagination total={total} page={page} parPage={PAR_PAGE} chemin="/admin/clients" params={{ q: texte || undefined, type: type ?? undefined }} />
    </div>
  );
}
