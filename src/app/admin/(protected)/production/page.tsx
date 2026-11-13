import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, EnTete, Vide, bouton, champ, libelle } from '@/components/admin/ui';
import { aujourdhui, dateCourte, estUuid, libelleEtape } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import {
  STATUTS_ATELIER,
  estStatutCommande,
  libelleCommande,
  libelleProduction,
  transitionsPossibles,
  type StatutCommande,
} from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import {
  commandesAtelier,
  listerPartenaires,
  quantiteTotale,
  quantitesParTailleCouleur,
  type CommandeAtelier,
  type Partenaire,
} from '@/server/admin/production';
import { changerStatutCommande } from '../commandes/actions';

export const metadata: Metadata = { title: 'Atelier' };
export const dynamic = 'force-dynamic';

/** Étape « suivante » proposée en un clic depuis la vue atelier (sens de la fabrication). */
const SUIVANTE: Partial<Record<StatutCommande, StatutCommande>> = {
  PAYEE: 'A_PRODUIRE',
  A_PRODUIRE: 'EN_PRODUCTION',
  EN_PRODUCTION: 'CONTROLE_QUALITE',
  CONTROLE_QUALITE: 'PRETE',
  PRETE: 'EN_LIVRAISON',
};

function enRetard(c: CommandeAtelier, jour: string): boolean {
  if (c.livraison_prevue_le && c.livraison_prevue_le < jour && c.statut !== 'PRETE') return true;
  return c.travaux.some((t) => t.date_prevue && t.date_prevue < jour && ['A_FAIRE', 'EN_COURS', 'BLOQUE'].includes(t.statut));
}

export default async function PageAtelier({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; prestataire?: string; retard?: string; ok?: string; erreur?: string }>;
}) {
  const staff = await exigerAcces('production.voir');
  const params = await searchParams;
  const statut = estStatutCommande(params.statut) && STATUTS_ATELIER.includes(params.statut) ? params.statut : null;
  const prestataire = estUuid(params.prestataire) ? params.prestataire : null;
  const jour = aujourdhui();

  let commandes: CommandeAtelier[] = [];
  let partenaires: Partenaire[] = [];
  let erreur = '';
  try {
    [commandes, partenaires] = await Promise.all([
      commandesAtelier({ statut, partenaireId: prestataire }),
      listerPartenaires(),
    ]);
  } catch {
    erreur = 'La vue atelier est indisponible.';
  }
  if (params.retard === '1') commandes = commandes.filter((c) => enRetard(c, jour));

  const parStatut = new Map<string, number>();
  for (const c of commandes) parStatut.set(c.statut, (parStatut.get(c.statut) ?? 0) + 1);
  const peutModifier = peut(staff.role, 'production.modifier');
  const peutDossier = peut(staff.role, 'production.fichiers');

  return (
    <div>
      <EnTete
        surtitre="Production"
        titre="Atelier"
        description="Commandes payées à lancer et commandes en fabrication. La production ne démarre jamais sans paiement confirmé."
        actions={
          peut(staff.role, 'partenaires.gerer') ? (
            <Link href="/admin/production/prestataires" className={bouton('secondaire', 'sm')}>
              Prestataires
            </Link>
          ) : null
        }
      />

      {params.erreur ? (
        <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{params.erreur}</p>
      ) : params.ok ? (
        <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">Statut mis à jour.</p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <nav className="flex flex-wrap gap-1.5 text-xs" aria-label="Filtrer par étape">
          <Link
            href="/admin/production"
            aria-current={!statut && params.retard !== '1' ? 'true' : undefined}
            className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${!statut && params.retard !== '1' ? 'bg-encre text-white ring-encre' : 'bg-white ring-neutral-300'}`}
          >
            Tout
          </Link>
          {STATUTS_ATELIER.map((s) => (
            <Link
              key={s}
              href={`/admin/production?statut=${s}`}
              aria-current={statut === s ? 'true' : undefined}
              className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${statut === s ? 'bg-encre text-white ring-encre' : 'bg-white ring-neutral-300'}`}
            >
              {libelleCommande(s).label}
              {!statut ? <span className="ml-1 tabular-nums opacity-60">{parStatut.get(s) ?? 0}</span> : null}
            </Link>
          ))}
          <Link
            href="/admin/production?retard=1"
            className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${params.retard === '1' ? 'bg-red-700 text-white ring-red-700' : 'bg-white text-red-700 ring-red-200'}`}
          >
            En retard
          </Link>
        </nav>
        <form className="ml-auto flex items-end gap-2">
          {statut ? <input type="hidden" name="statut" value={statut} /> : null}
          <label className={libelle}>
            Prestataire
            <select name="prestataire" defaultValue={prestataire ?? ''} className={champ}>
              <option value="">Tous</option>
              {partenaires.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={bouton('secondaire')}>
            Filtrer
          </button>
        </form>
      </div>

      {erreur ? <p role="alert" className="text-sm text-red-700">{erreur}</p> : null}
      {!erreur && commandes.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white">
          <Vide>Rien à produire pour ce filtre.</Vide>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {commandes.map((c) => {
          const s = libelleCommande(c.statut);
          const contact = c.contact_snapshot as { nom?: unknown };
          const quantites = quantitesParTailleCouleur(c.lignes, c.design_snapshot);
          const retard = enRetard(c, jour);
          const suivante = SUIVANTE[c.statut];
          const suivanteAutorisee = suivante && transitionsPossibles(c.statut, staff.role).includes(suivante);
          const visuels = c.fichiers.filter((f) => f.type_fichier === 'VISUEL_IMPRESSION').length;
          const fiches = c.fichiers.filter((f) => f.type_fichier === 'FICHE_PRODUCTION').length;
          return (
            <article key={c.id} className={`flex flex-col rounded-xl border bg-white ${retard ? 'border-red-300' : 'border-neutral-200'}`}>
              <header className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold">{c.reference}</p>
                  <p className="truncate text-sm text-neutral-700">
                    {String(contact.nom ?? '—')}
                    {c.ville ? <span className="text-neutral-500"> · {c.ville}</span> : null}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge ton={s.ton}>{s.label}</Badge>
                  {retard ? <Badge ton="danger">En retard</Badge> : null}
                </div>
              </header>

              <div className="flex-1 space-y-3 px-4 py-3 text-sm">
                <div>
                  <p className="text-xs text-neutral-500">
                    {quantiteTotale(c.lignes)} pièce(s) · livraison prévue {c.livraison_prevue_le ? dateCourte(c.livraison_prevue_le) : 'non fixée'}
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {quantites.map((q) => (
                      <li key={`${q.taille}-${q.couleur}`} className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs">
                        <span className="font-semibold tabular-nums">{q.quantite}</span>
                        {q.taille !== '—' ? <> × {q.taille}</> : ' pièce(s)'}
                        {q.couleur !== '—' ? <span className="text-neutral-600"> · {q.couleur}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>

                <ul className="space-y-1.5">
                  {c.travaux.length === 0 ? <li className="text-xs text-neutral-500">Aucune tâche planifiée.</li> : null}
                  {c.travaux.map((t) => {
                    const st = libelleProduction(t.statut);
                    const tacheRetard = t.date_prevue && t.date_prevue < jour && ['A_FAIRE', 'EN_COURS', 'BLOQUE'].includes(t.statut);
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{libelleEtape(t.etape)}</span>
                          <span className="text-neutral-500"> · {t.partenaire?.nom ?? 'interne'}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {t.date_prevue ? (
                            <span className={tacheRetard ? 'font-medium text-red-700' : 'text-neutral-500'}>{dateCourte(t.date_prevue)}</span>
                          ) : null}
                          <Badge ton={st.ton}>{st.label}</Badge>
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <p className="text-xs text-neutral-500">
                  {visuels} visuel(s) HD · {fiches} fiche(s) technique(s)
                  {visuels === 0 ? <span className="ml-1 font-medium text-amber-700">— fichiers manquants</span> : null}
                </p>
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 px-4 py-2.5">
                {peutDossier ? (
                  <Link href={`/admin/production/${c.id}`} className={bouton('secondaire', 'sm')}>
                    Dossier de production
                  </Link>
                ) : (
                  <Link href={`/admin/commandes/${c.id}`} className={bouton('secondaire', 'sm')}>
                    Voir la commande
                  </Link>
                )}
                {peutModifier && suivante && suivanteAutorisee ? (
                  <form action={changerStatutCommande}>
                    <input type="hidden" name="commande_id" value={c.id} />
                    <input type="hidden" name="statut" value={suivante} />
                    <input type="hidden" name="retour" value="/admin/production" />
                    <button type="submit" className={bouton('primaire', 'sm')}>
                      → {libelleCommande(suivante).label}
                    </button>
                  </form>
                ) : null}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
