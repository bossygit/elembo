import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, EnTete, Pagination, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import { bornesDates, dateCourte, dateHeure, estDateIso, fcfa } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import {
  STATUTS_COMMANDE,
  STATUTS_PAIEMENT,
  estStatutCommande,
  estStatutPaiement,
  libelleCommande,
  libelleMode,
  libellePaiement,
} from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { compterParStatut, rechercherCommandes, type CommandeListe } from '@/server/admin/commandes';

export const metadata: Metadata = { title: 'Commandes' };
export const dynamic = 'force-dynamic';

const PAR_PAGE = 50;

type Params = { q?: string; statut?: string; paiement?: string; du?: string; au?: string; page?: string };

export default async function PageCommandes({ searchParams }: { searchParams: Promise<Params> }) {
  const staff = await exigerAcces('commandes.voir');
  const params = await searchParams;
  const statut = estStatutCommande(params.statut) ? params.statut : null;
  const paiement = estStatutPaiement(params.paiement) ? params.paiement : null;
  const du = estDateIso(params.du) ? params.du : undefined;
  const au = estDateIso(params.au) ? params.au : undefined;
  const texte = (params.q ?? '').trim().slice(0, 120);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(params.page ?? '1', 10) || 1));
  const { debut, fin } = bornesDates(du, au);
  const voitMarges = peut(staff.role, 'marges.voir');
  const voitCoordonnees = peut(staff.role, 'clients.coordonnees');

  let commandes: CommandeListe[] = [];
  let total = 0;
  let comptes: Record<string, number> = {};
  let erreur = '';
  try {
    [{ commandes, total }, comptes] = await Promise.all([
      rechercherCommandes({ texte, statut, paiement, debut, fin, limite: PAR_PAGE, decalage: (page - 1) * PAR_PAGE }),
      compterParStatut(),
    ]);
  } catch {
    erreur = 'La liste des commandes est indisponible. Vérifiez la base (migration 0010).';
  }

  const filtres = { q: texte || undefined, statut: statut ?? undefined, paiement: paiement ?? undefined, du, au };
  const export_ = new URLSearchParams(Object.entries(filtres).filter(([, v]) => v) as [string, string][]);
  const lienStatut = (s?: string) => {
    const q = new URLSearchParams(Object.entries({ ...filtres, statut: s }).filter(([, v]) => v) as [string, string][]);
    return `/admin/commandes${q.size ? `?${q}` : ''}`;
  };
  const filtresActifs = Boolean(texte || paiement || du || au);

  return (
    <div>
      <EnTete
        surtitre="Ventes"
        titre="Commandes"
        description="Une commande payée reste « payée » tant que l’atelier ne l’a pas lancée : paiement et production sont deux étapes distinctes."
        actions={
          peut(staff.role, 'commandes.exporter') ? (
            <>
              <a href={`/admin/commandes/export?${export_}`} className={bouton('secondaire', 'sm')}>
                Exporter (CSV)
              </a>
              <a href={`/admin/commandes/export?${export_}${export_.size ? '&' : ''}format=lignes`} className={bouton('secondaire', 'sm')}>
                Exporter le détail des lignes
              </a>
            </>
          ) : null
        }
      />

      <form className="mb-4 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]" role="search">
        {statut ? <input type="hidden" name="statut" value={statut} /> : null}
        <label className={libelle}>
          Recherche
          <input
            type="search"
            name="q"
            defaultValue={texte}
            placeholder={voitCoordonnees ? 'Référence, nom, téléphone, email…' : 'Référence ou nom'}
            className={champ}
          />
        </label>
        <label className={libelle}>
          Paiement
          <select name="paiement" defaultValue={paiement ?? ''} className={champ}>
            <option value="">Tous</option>
            {STATUTS_PAIEMENT.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className={libelle}>
          Créée du
          <input type="date" name="du" defaultValue={du} className={champ} />
        </label>
        <label className={libelle}>
          au
          <input type="date" name="au" defaultValue={au} className={champ} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={bouton('primaire')}>
            Filtrer
          </button>
          {filtresActifs ? (
            <Link href={statut ? `/admin/commandes?statut=${statut}` : '/admin/commandes'} className={bouton('discret')}>
              Effacer
            </Link>
          ) : null}
        </div>
      </form>

      <nav className="mb-4 flex flex-wrap gap-1.5 text-xs" aria-label="Filtrer par statut">
        <Link href={lienStatut()} aria-current={!statut ? 'true' : undefined} className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${!statut ? 'bg-encre text-white ring-encre' : 'bg-white ring-neutral-300 hover:bg-neutral-50'}`}>
          Toutes
        </Link>
        {STATUTS_COMMANDE.map((s) => (
          <Link
            key={s.id}
            href={lienStatut(s.id)}
            aria-current={statut === s.id ? 'true' : undefined}
            className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${statut === s.id ? 'bg-encre text-white ring-encre' : 'bg-white ring-neutral-300 hover:bg-neutral-50'}`}
          >
            {s.label}
            <span className="ml-1 tabular-nums opacity-60">{comptes[s.id] ?? 0}</span>
          </Link>
        ))}
      </nav>

      {erreur ? (
        <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          {erreur}
        </p>
      ) : null}

      <div className={tableau.conteneur}>
        <table className={tableau.table}>
          <thead className={tableau.thead}>
            <tr>
              <th className={tableau.th}>Référence</th>
              <th className={tableau.th}>Client</th>
              <th className={tableau.th}>Statut</th>
              <th className={tableau.th}>Paiement</th>
              <th className={`${tableau.th} text-right`}>Total</th>
              {voitMarges ? <th className={`${tableau.th} text-right`}>Marge</th> : null}
              <th className={tableau.th}>Créée</th>
              <th className={tableau.th}>Livraison prévue</th>
            </tr>
          </thead>
          <tbody className={tableau.tbody}>
            {commandes.map((c) => {
              const contact = c.contact_snapshot as { nom?: unknown; societe?: unknown; telephone?: unknown };
              const s = libelleCommande(c.statut);
              const p = libellePaiement(c.statut_paiement);
              return (
                <tr key={c.id} className={tableau.tr}>
                  <td className={tableau.td}>
                    <Link href={`/admin/commandes/${c.id}`} className="font-mono text-xs font-medium underline-offset-2 hover:underline">
                      {c.reference}
                    </Link>
                    <p className="text-[11px] text-neutral-500">{c.devis_id ? 'Sur devis' : 'Directe'} · {libelleMode(c.mode_paiement)}</p>
                  </td>
                  <td className={tableau.td}>
                    <p>{String(contact.nom ?? '—')}</p>
                    <p className="text-[11px] text-neutral-500">
                      {[contact.societe, voitCoordonnees ? contact.telephone : null, c.ville].filter(Boolean).join(' · ')}
                    </p>
                  </td>
                  <td className={tableau.td}>
                    <Badge ton={s.ton}>{s.label}</Badge>
                  </td>
                  <td className={tableau.td}>
                    <Badge ton={p.ton}>{p.label}</Badge>
                  </td>
                  <td className={tableau.nombre}>{fcfa(c.total_fcfa)}</td>
                  {voitMarges ? (
                    <td className={`${tableau.nombre} ${c.cout_fcfa === 0 ? 'text-neutral-400' : c.marge_fcfa < 0 ? 'text-red-700' : ''}`}>
                      {c.cout_fcfa === 0 ? 'coût ?' : fcfa(c.marge_fcfa)}
                    </td>
                  ) : null}
                  <td className={`${tableau.td} whitespace-nowrap text-neutral-600`}>{dateHeure(c.cree_le)}</td>
                  <td className={`${tableau.td} whitespace-nowrap text-neutral-600`}>{dateCourte(c.livraison_prevue_le)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!erreur && commandes.length === 0 ? <Vide>Aucune commande ne correspond à ces critères.</Vide> : null}
      </div>
      <Pagination total={total} page={page} parPage={PAR_PAGE} chemin="/admin/commandes" params={filtres} />
    </div>
  );
}
