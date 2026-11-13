import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, EnTete, Indicateur, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import { dateCourte, dateHeure, fcfa, pourcentage, tauxMarge } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { USAGES, formatDimensions, libelleDelai, libellePrestation, libelleSupport, libelleUsage } from '@/lib/grand-format/catalogue';
import { ETATS, estEtat, etatGrandFormat } from '@/lib/grand-format/suivi';
import { exigerAcces } from '@/server/admin/acces';
import { listerDemandes, type DemandeGrandFormat } from '@/server/grand-format/repository';

export const metadata: Metadata = { title: 'Banderoles' };
export const dynamic = 'force-dynamic';

function correspond(d: DemandeGrandFormat, texte: string): boolean {
  if (!texte) return true;
  const c = d.devis.contact_snapshot as Record<string, unknown>;
  const t = texte.toLowerCase();
  return [d.devis.reference, d.commande?.reference, c.nom, c.societe, c.telephone, c.email]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(t));
}

export default async function PageBanderolesAdmin({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string; usage?: string; q?: string }>;
}) {
  const staff = await exigerAcces('grand_format.voir');
  const params = await searchParams;
  const etat = estEtat(params.etat) ? params.etat : null;
  const usage = USAGES.some((u) => u.id === params.usage) ? params.usage! : null;
  const texte = (params.q ?? '').trim().slice(0, 120);
  const couts = peut(staff.role, 'grand_format.couts');

  let demandes: DemandeGrandFormat[] = [];
  let erreur = '';
  try {
    demandes = await listerDemandes({ limite: 500 });
  } catch {
    erreur = 'La liste des demandes est indisponible.';
  }

  const avecEtat = demandes.map((d) => ({ d, e: etatGrandFormat(d.devis.statut, d.commande?.statut) }));
  const comptes = Object.fromEntries(ETATS.map((x) => [x.id, avecEtat.filter((a) => a.e.id === x.id).length]));
  const visibles = avecEtat.filter((a) => (!etat || a.e.id === etat) && (!usage || a.d.usage === usage) && correspond(a.d, texte));

  // Rentabilité des commandes encaissées (payées → livrées).
  const encaissees = avecEtat.filter((a) => ['PAYEE', 'EN_PRODUCTION', 'CONTROLE_QUALITE', 'PRETE', 'LIVREE'].includes(a.e.id) && a.d.commande);
  const ventes = encaissees.reduce((s, a) => s + (a.d.commande?.total_fcfa ?? 0), 0);
  const coutTotal = encaissees.reduce((s, a) => s + (a.d.commande?.cout_fcfa ?? 0), 0);
  const aTraiter = (comptes.NOUVELLE ?? 0) + (comptes.EN_VALIDATION ?? 0);
  const urgentes = avecEtat.filter((a) => a.d.delai === 'EXPRESS' && ['NOUVELLE', 'EN_VALIDATION', 'DEVIS_TRANSMIS'].includes(a.e.id)).length;

  const lien = (p: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ etat, usage, q: texte || null, ...p })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/admin/banderoles?${s}` : '/admin/banderoles';
  };

  return (
    <div>
      <EnTete
        surtitre="Ventes"
        titre="Banderoles & grand format"
        description="Demandes reçues, chiffrage, devis, production chez l’imprimeur partenaire, rentabilité."
        actions={
          <>
            {peut(staff.role, 'grand_format.tarifs') ? (
              <Link href="/admin/banderoles/tarifs" className={bouton('secondaire', 'sm')}>
                Grille d’estimation
              </Link>
            ) : null}
            {peut(staff.role, 'partenaires.gerer') ? (
              <Link href="/admin/production/prestataires" className={bouton('secondaire', 'sm')}>
                Imprimeurs partenaires
              </Link>
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicateur label="À traiter" valeur={String(aTraiter)} detail="Nouvelles et en validation" href={lien({ etat: 'NOUVELLE' })} alerte={aTraiter > 0} />
        <Indicateur label="Urgentes en cours" valeur={String(urgentes)} detail="Délai 48 à 72 h demandé" alerte={urgentes > 0} />
        {couts ? (
          <>
            <Indicateur label="Ventes encaissées" valeur={fcfa(ventes)} detail={`${encaissees.length} commande(s), livraison comprise`} />
            <Indicateur
              label="Marge brute"
              valeur={fcfa(ventes - coutTotal)}
              detail={ventes ? `${pourcentage(tauxMarge(ventes - coutTotal, ventes))} des ventes` : 'Aucune vente encaissée'}
            />
          </>
        ) : (
          <>
            <Indicateur label="Devis transmis" valeur={String(comptes.DEVIS_TRANSMIS ?? 0)} href={lien({ etat: 'DEVIS_TRANSMIS' })} />
            <Indicateur label="En production" valeur={String((comptes.EN_PRODUCTION ?? 0) + (comptes.CONTROLE_QUALITE ?? 0))} href={lien({ etat: 'EN_PRODUCTION' })} />
          </>
        )}
      </div>

      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filtrer par état">
        <Link
          href={lien({ etat: null })}
          aria-current={!etat ? 'true' : undefined}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${!etat ? 'border-encre bg-encre text-white' : 'border-neutral-200 bg-white hover:border-neutral-400'}`}
        >
          Toutes · {demandes.length}
        </Link>
        {ETATS.map((x) => (
          <Link
            key={x.id}
            href={lien({ etat: x.id })}
            aria-current={etat === x.id ? 'true' : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${etat === x.id ? 'border-encre bg-encre text-white' : 'border-neutral-200 bg-white hover:border-neutral-400'}`}
          >
            {x.label} · {comptes[x.id] ?? 0}
          </Link>
        ))}
      </nav>

      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4" role="search">
        {etat ? <input type="hidden" name="etat" value={etat} /> : null}
        <label className={`${libelle} min-w-56 flex-1`}>
          Recherche
          <input type="search" name="q" defaultValue={texte} placeholder="Référence, nom, organisation, téléphone" className={champ} />
        </label>
        <label className={`${libelle} w-56`}>
          Utilisation
          <select name="usage" defaultValue={usage ?? ''} className={champ}>
            <option value="">Toutes</option>
            {USAGES.map((u) => (
              <option key={u.id} value={u.id}>
                {u.titre}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={bouton('primaire')}>
          Filtrer
        </button>
      </form>

      {erreur ? <p role="alert" className="mb-4 text-sm text-red-700">{erreur}</p> : null}

      <div className={tableau.conteneur}>
        <table className={tableau.table}>
          <thead className={tableau.thead}>
            <tr>
              <th className={tableau.th}>Demande</th>
              <th className={tableau.th}>Client</th>
              <th className={tableau.th}>Banderole</th>
              <th className={tableau.th}>Délai</th>
              <th className={tableau.th}>État</th>
              <th className={`${tableau.th} text-right`}>Prix</th>
              {couts ? <th className={`${tableau.th} text-right`}>Marge</th> : null}
              <th className={tableau.th}>Imprimeur</th>
            </tr>
          </thead>
          <tbody className={tableau.tbody}>
            {visibles.map(({ d, e }) => {
              const c = d.devis.contact_snapshot as Record<string, unknown>;
              const prix = d.commande?.total_fcfa ?? d.devis.montant_propose_fcfa ?? d.prix_vente_fcfa;
              const marge = d.commande
                ? d.commande.total_fcfa - d.commande.cout_fcfa
                : d.prix_vente_fcfa !== null && d.cout_estime_total_fcfa !== null
                  ? d.prix_vente_fcfa - d.cout_estime_total_fcfa
                  : null;
              return (
                <tr key={d.devis_id} className={tableau.tr}>
                  <td className={tableau.td}>
                    <Link href={`/admin/banderoles/${d.devis_id}`} className="font-mono text-xs font-medium hover:underline">
                      {d.devis.reference}
                    </Link>
                    <span className="block text-xs text-neutral-500">{dateHeure(d.cree_le)}</span>
                  </td>
                  <td className={tableau.td}>
                    {String(c.nom ?? '—')}
                    {c.societe ? <span className="block text-xs text-neutral-500">{String(c.societe)}</span> : null}
                  </td>
                  <td className={tableau.td}>
                    <span className="whitespace-nowrap">
                      {libelleSupport(d.support)} {formatDimensions(d.largeur_m, d.hauteur_m)} × {d.quantite}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {libelleUsage(d.usage)} · {libellePrestation(d.prestation)}
                    </span>
                  </td>
                  <td className={`${tableau.td} whitespace-nowrap`}>
                    {d.delai === 'EXPRESS' ? <Badge ton="alerte">Urgent</Badge> : d.delai === 'DATE' && d.date_souhaitee ? `Pour le ${dateCourte(d.date_souhaitee)}` : libelleDelai(d.delai)}
                  </td>
                  <td className={tableau.td}>
                    <Badge ton={e.ton}>{e.label}</Badge>
                    {e.detail ? <span className="mt-1 block text-[11px] text-neutral-500">{e.detail}</span> : null}
                  </td>
                  <td className={tableau.nombre}>
                    {fcfa(prix)}
                    {prix === null && d.estimation_fcfa !== null ? (
                      <span className="block text-[11px] text-neutral-500">estimé {fcfa(d.estimation_fcfa)}</span>
                    ) : null}
                  </td>
                  {couts ? (
                    <td className={`${tableau.nombre} ${marge !== null && marge < 0 ? 'text-red-700' : ''}`}>
                      {fcfa(marge)}
                      {marge !== null ? <span className="block text-[11px] text-neutral-500">{d.commande ? 'réelle' : 'estimée'}</span> : null}
                    </td>
                  ) : null}
                  <td className={tableau.td}>{d.partenaire?.nom ?? <span className="text-neutral-400">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!erreur && visibles.length === 0 ? <Vide>Aucune demande pour ce filtre.</Vide> : null}
      </div>
    </div>
  );
}
