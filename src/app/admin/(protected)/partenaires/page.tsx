import type { Metadata } from 'next';
import Link from 'next/link';

import { BadgePartenaire } from '@/components/admin/partenaires';
import { EnTete, Pagination, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import { dateCourte } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { STATUTS_PARTENAIRE, estStatutPartenaire } from '@/lib/partenaires/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { rechercherPartenaires, type PartenaireListe } from '@/server/admin/partenaires';

export const metadata: Metadata = { title: 'Partenaires' };
export const dynamic = 'force-dynamic';

const PAR_PAGE = 50;

export default async function PagePartenaires({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; page?: string }>;
}) {
  const staff = await exigerAcces('partenaires.voir');
  const params = await searchParams;
  const statut = estStatutPartenaire(params.statut) ? params.statut : null;
  const texte = (params.q ?? '').trim().slice(0, 80);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(params.page ?? '1', 10) || 1));

  let partenaires: PartenaireListe[] = [];
  let total = 0;
  let erreur = '';
  try {
    ({ partenaires, total } = await rechercherPartenaires({ texte, statut, limite: PAR_PAGE, decalage: (page - 1) * PAR_PAGE }));
  } catch {
    erreur = 'La liste des partenaires est indisponible (migration 0012 appliquée ?).';
  }

  return (
    <div>
      <EnTete
        surtitre="Elembo Partners"
        titre="Partenaires"
        description="Imprimeurs et ateliers partenaires. Seuls les partenaires validés et actifs peuvent recevoir des travaux."
        actions={
          <>
            {peut(staff.role, 'partenaires.valider') || peut(staff.role, 'partenaires.tarifs_valider') ? (
              <Link href="/admin/partenaires/validation" className={bouton('primaire', 'sm')}>
                À valider
              </Link>
            ) : null}
            {peut(staff.role, 'partenaires.gerer') ? (
              <Link href="/admin/partenaires/nouveau" className={bouton('secondaire', 'sm')}>
                Nouveau partenaire
              </Link>
            ) : null}
          </>
        }
      />

      <form className="mb-4 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-[2fr_1fr_auto]" role="search">
        <label className={libelle}>
          Recherche
          <input type="search" name="q" defaultValue={texte} placeholder="Nom, ville, téléphone, e-mail, spécialité" className={champ} />
        </label>
        <label className={libelle}>
          Statut
          <select name="statut" defaultValue={statut ?? ''} className={champ}>
            <option value="">Tous</option>
            {STATUTS_PARTENAIRE.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
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
              <th className={tableau.th}>Partenaire</th>
              <th className={tableau.th}>Statut</th>
              <th className={tableau.th}>Contact</th>
              <th className={`${tableau.th} text-right`}>Machines</th>
              <th className={`${tableau.th} text-right`}>Capacités</th>
              <th className={tableau.th}>Origine</th>
            </tr>
          </thead>
          <tbody className={tableau.tbody}>
            {partenaires.map((p) => (
              <tr key={p.id} className={tableau.tr}>
                <td className={tableau.td}>
                  <Link href={`/admin/partenaires/${p.id}`} className="font-medium hover:underline">
                    {p.nom}
                  </Link>
                  <p className="text-xs text-neutral-500">{p.specialite}</p>
                </td>
                <td className={tableau.td}>
                  <BadgePartenaire statut={p.statut} actif={p.actif} />
                  {p.statut === 'EN_ATTENTE_VALIDATION' && p.soumis_le ? <p className="mt-1 text-xs text-neutral-500">soumis le {dateCourte(p.soumis_le)}</p> : null}
                </td>
                <td className={tableau.td}>
                  <p>{p.telephone}</p>
                  <p className="text-xs text-neutral-500">{p.ville}</p>
                </td>
                <td className={tableau.nombre}>{p.machines}</td>
                <td className={tableau.nombre}>{p.capacites}</td>
                <td className={`${tableau.td} text-xs text-neutral-600`}>{p.origine === 'INSCRIPTION' ? 'Inscription' : 'Back-office'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!erreur && partenaires.length === 0 ? <Vide>Aucun partenaire ne correspond.</Vide> : null}
      </div>
      <Pagination total={total} page={page} parPage={PAR_PAGE} chemin="/admin/partenaires" params={{ q: texte || undefined, statut: statut ?? undefined }} />
    </div>
  );
}
