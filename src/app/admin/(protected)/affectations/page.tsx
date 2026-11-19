import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, EnTete, Flash, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import { dateCourte, fcfa } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import {
  OBJETS_AFFECTATION,
  STATUTS_AFFECTATION,
  estStatutAffectation,
  libelleSourceTarif,
  statutAffectation,
} from '@/lib/partenaires/affectations';
import { exigerAcces } from '@/server/admin/acces';
import { listerAffectations, type LigneAffectation } from '@/server/admin/affectations';
import { annulerAffectationAction, relancerAffectationAction } from './actions';

export const metadata: Metadata = { title: 'Affectations' };
export const dynamic = 'force-dynamic';

const MESSAGES = {
  annulee: 'Affectation annulée. La tâche ou la banderole est libérée.',
  relancee: 'Proposition relancée (trace d’audit ; l’e-mail part avec les notifications du Lot 2.4).',
} as const;

function lienTravail(a: LigneAffectation): string | null {
  if (a.objet === 'TACHE_PRODUCTION' && a.commande_id) return `/admin/production/${a.commande_id}`;
  if (a.objet === 'BANDEROLE' && a.devis_id) return `/admin/banderoles/${a.devis_id}`;
  return null;
}

function travail(a: LigneAffectation): string {
  if (a.objet === 'BANDEROLE') return 'Banderole';
  return a.tache?.etape ?? 'Tâche de production';
}

export default async function PageAffectations({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; objet?: string; retard?: string; ok?: string; erreur?: string }>;
}) {
  const staff = await exigerAcces('affectations.voir');
  const params = await searchParams;
  const statut = estStatutAffectation(params.statut) ? params.statut : null;
  const objet = OBJETS_AFFECTATION.some((o) => o.id === params.objet) ? params.objet : null;
  const retard = params.retard === '1';

  let lignes: LigneAffectation[] = [];
  let erreur = '';
  try {
    lignes = await listerAffectations({ statut, objet, retard });
  } catch {
    erreur = 'La liste des affectations est indisponible (migration 0013 appliquée ?).';
  }

  const voirCouts = peut(staff.role, 'affectations.couts');
  const peutAnnuler = peut(staff.role, 'affectations.annuler');
  const peutRelancer = peut(staff.role, 'affectations.gerer');
  const maintenant = Date.now();

  return (
    <div>
      <EnTete
        surtitre="Elembo Partners"
        titre="Affectations"
        description="Propositions de travaux aux ateliers partenaires. La proposition se fait depuis un dossier de production ou une fiche banderole."
        actions={
          <Link href="/admin/production" className={bouton('secondaire', 'sm')}>
            Atelier
          </Link>
        }
      />

      <Flash ok={params.ok} erreur={params.erreur} messages={MESSAGES} />
      {erreur ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{erreur}</p> : null}

      <form className="mb-4 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto_auto]" role="search">
        <label className={libelle}>
          Statut
          <select name="statut" defaultValue={statut ?? ''} className={champ}>
            <option value="">Tous</option>
            {STATUTS_AFFECTATION.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className={libelle}>
          Objet
          <select name="objet" defaultValue={objet ?? ''} className={champ}>
            <option value="">Tous</option>
            {OBJETS_AFFECTATION.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm text-neutral-700">
          <input type="checkbox" name="retard" value="1" defaultChecked={retard} className="size-4 rounded border-neutral-300" />
          En retard de réponse
        </label>
        <div className="flex items-end">
          <button type="submit" className={bouton('primaire')}>
            Filtrer
          </button>
        </div>
      </form>

      <div className={tableau.conteneur}>
        <table className={tableau.table}>
          <thead className={tableau.thead}>
            <tr>
              <th className={tableau.th}>Référence</th>
              <th className={tableau.th}>Travail</th>
              <th className={tableau.th}>Atelier</th>
              <th className={tableau.th}>Statut</th>
              <th className={tableau.th}>Échéance</th>
              {voirCouts ? <th className={`${tableau.th} text-right`}>Montant</th> : null}
              <th className={tableau.th}>Actions</th>
            </tr>
          </thead>
          <tbody className={tableau.tbody}>
            {lignes.map((a) => {
              const badge = estStatutAffectation(a.statut) ? statutAffectation(a.statut) : { label: a.statut, ton: 'neutre' as const };
              const enRetard = a.statut === 'PROPOSEE' && new Date(a.date_limite_reponse).getTime() < maintenant;
              const href = lienTravail(a);
              return (
                <tr key={a.id} className={tableau.tr}>
                  <td className={tableau.td}>
                    <p className="font-medium tabular-nums">{a.reference}</p>
                    <p className="text-xs text-neutral-500">{dateCourte(a.cree_le)}</p>
                  </td>
                  <td className={tableau.td}>
                    {href ? (
                      <Link href={href} className="font-medium hover:underline">
                        {a.commande?.reference ?? travail(a)}
                      </Link>
                    ) : (
                      <span className="font-medium">{a.commande?.reference ?? travail(a)}</span>
                    )}
                    <p className="text-xs text-neutral-500">
                      {travail(a)}
                      {a.support ? ` · ${a.support}` : ''}
                      {a.surface_m2 ? ` · ${a.surface_m2} m²` : ''}
                    </p>
                  </td>
                  <td className={tableau.td}>
                    {a.partenaire ? (
                      <Link href={`/admin/partenaires/${a.partenaire.id}`} className="hover:underline">
                        {a.partenaire.nom}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={tableau.td}>
                    <Badge ton={badge.ton}>{badge.label}</Badge>
                    {a.priorite === 'URGENTE' ? <p className="mt-1 text-xs text-orange-800">Urgente</p> : null}
                  </td>
                  <td className={tableau.td}>
                    <span className={enRetard ? 'font-medium text-red-700' : ''}>{dateCourte(a.date_limite_reponse)}</span>
                    {enRetard ? <p className="text-xs font-medium text-red-700">En retard</p> : null}
                  </td>
                  {voirCouts ? (
                    <td className={`${tableau.nombre}`}>
                      {fcfa(a.montant_fcfa)}
                      <p className="text-xs font-normal text-neutral-500">{libelleSourceTarif(a.tarif_source)}</p>
                    </td>
                  ) : null}
                  <td className={tableau.td}>
                    <div className="flex flex-col gap-2">
                      {peutRelancer && a.statut === 'PROPOSEE' ? (
                        <form action={relancerAffectationAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className={bouton('secondaire', 'sm')}>
                            Relancer
                          </button>
                        </form>
                      ) : null}
                      {peutAnnuler && (a.statut === 'PROPOSEE' || a.statut === 'ACCEPTEE') ? (
                        <form action={annulerAffectationAction} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={a.id} />
                          <label className="sr-only" htmlFor={`motif-${a.id}`}>
                            Motif d’annulation
                          </label>
                          <input
                            id={`motif-${a.id}`}
                            name="motif"
                            required
                            maxLength={1000}
                            placeholder="Motif"
                            className="w-36 rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                          />
                          <button type="submit" className={bouton('danger', 'sm')}>
                            Annuler
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!erreur && lignes.length === 0 ? (
          <Vide>
            Aucune affectation ne correspond. Proposez un travail depuis un dossier de production ou une fiche banderole.
          </Vide>
        ) : null}
      </div>
    </div>
  );
}
