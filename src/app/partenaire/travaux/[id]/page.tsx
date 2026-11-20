import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Definitions, EnTeteRubrique, MessageOk, PageDossier, Pastille } from '@/components/partenaire/affichage';
import { Alerte, Carte, bouton, champ, libelle } from '@/components/partenaire/ui';
import { dateCourte, dateHeure, estUuid } from '@/lib/admin/format';
import { OBJETS_AFFECTATION, estStatutAffectation, statutAffectation } from '@/lib/partenaires/affectations';
import { peutPartenaire } from '@/lib/partenaires/droits';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { monAffectation } from '@/server/partenaires/travaux';
import { accepterAffectationAction, refuserAffectationAction, terminerAffectationAction } from '../actions';

export const metadata: Metadata = { title: 'Travail' };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  acceptee: 'Travail accepté. Smart Vision est prévenu.',
  refusee: 'Refus enregistré. Smart Vision va réaffecter le travail.',
  terminee: 'Fin signalée. Smart Vision contrôlera le travail avant de clôturer.',
};

const TONS = {
  attente: 'attente',
  succes: 'succes',
  alerte: 'alerte',
  danger: 'alerte',
  production: 'succes',
  info: 'neutre',
  neutre: 'neutre',
} as const;

const ACTEURS: Record<string, string> = {
  STAFF: 'Smart Vision',
  PARTENAIRE: 'Votre atelier',
  SYSTEME: 'Système',
};

export default async function PageTravail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const session = await exigerPartenaire('travaux.voir');
  const [{ id }, messages] = await Promise.all([params, searchParams]);
  if (!estUuid(id)) notFound();
  const a = await monAffectation(id);
  if (!a) notFound();

  const badge = estStatutAffectation(a.statut) ? statutAffectation(a.statut) : { label: a.statut, ton: 'neutre' as const };
  const objet = OBJETS_AFFECTATION.find((o) => o.id === a.objet)?.label ?? a.objet;
  const montantVisible = peutPartenaire(session.role, 'travaux.montant', session.statutPartenaire);
  const peutDecider = peutPartenaire(session.role, 'travaux.decider', session.statutPartenaire);
  const peutExecuter = peutPartenaire(session.role, 'travaux.executer', session.statutPartenaire);

  return (
    <PageDossier>
      <EnTeteRubrique
        titre={a.libelle}
        intro={
          <span className="flex flex-wrap items-center gap-2">
            <Pastille ton={TONS[badge.ton]}>{badge.label}</Pastille>
            <span className="tabular-nums">{a.reference}</span>
            <span>·</span>
            <span>{objet}</span>
            {a.priorite === 'URGENTE' ? <Pastille ton="alerte">Urgent</Pastille> : null}
          </span>
        }
        retour={{ href: '/partenaire/travaux', libelle: 'Mes travaux' }}
      />
      <MessageOk code={messages.ok} messages={MESSAGES} />
      {messages.erreur ? <Alerte ton="erreur">{messages.erreur}</Alerte> : null}

      <Carte titre="Le travail demandé">
        <Definitions
          elements={[
            ['Commande', a.commande_reference],
            ['Support', a.support],
            ['Quantité', a.quantite],
            ['Surface', a.surface_m2 !== null ? `${a.surface_m2} m²` : null],
            ['Début prévu', a.date_debut_prevue ? dateCourte(a.date_debut_prevue) : null],
            ['Fin prévue', a.date_fin_prevue ? dateCourte(a.date_fin_prevue) : null],
            ['Réponse attendue avant', a.statut === 'PROPOSEE' ? dateHeure(a.date_limite_reponse) : null],
            ['Proposé le', dateCourte(a.cree_le)],
          ]}
        />
        {a.instructions ? (
          <div className="mt-4 border-t border-filet pt-4">
            <p className="text-xs uppercase tracking-wide text-attenue">Instructions</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{a.instructions}</p>
          </div>
        ) : null}
        {montantVisible && a.montant_fcfa !== null ? (
          <div className="mt-4 border-t border-filet pt-4">
            <p className="text-xs uppercase tracking-wide text-attenue">Montant convenu</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{a.montant_fcfa.toLocaleString('fr-FR')} FCFA</p>
            <p className="text-xs text-attenue">
              {a.tarif_nom ?? 'Tarif négocié'}
              {a.tarif_version ? ` · version ${a.tarif_version}` : ''}
            </p>
          </div>
        ) : null}
      </Carte>

      {a.statut === 'PROPOSEE' ? (
        <Carte titre="Répondre à la proposition">
          {peutDecider ? (
            <div className="space-y-4">
              <p className="text-sm text-attenue">
                En acceptant, vous vous engagez sur cette échéance et ce montant. En cas de refus, Smart Vision réaffectera le travail.
              </p>
              <form action={accepterAffectationAction}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className={bouton('primaire')}>
                  Accepter le travail
                </button>
              </form>
              <details className="rounded-xl border border-filet p-4">
                <summary className="cursor-pointer text-sm font-medium">Refuser ce travail</summary>
                <form action={refuserAffectationAction} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={a.id} />
                  <label className={libelle}>
                    Motif du refus
                    <textarea name="motif" required maxLength={1000} rows={3} className={champ} />
                  </label>
                  <button type="submit" className={bouton('secondaire')}>
                    Envoyer le refus
                  </button>
                </form>
              </details>
            </div>
          ) : (
            <p className="text-sm text-attenue">Seul le responsable de l’atelier peut accepter ou refuser une proposition.</p>
          )}
        </Carte>
      ) : null}

      {a.statut === 'ACCEPTEE' ? (
        <Carte titre="Exécution">
          <p className="text-sm leading-relaxed text-attenue">
            Le travail est accepté. Lorsqu’il est terminé, signalez-le : Smart Vision contrôlera puis clôturera la commande.
          </p>
          {peutExecuter ? (
            <form action={terminerAffectationAction} className="mt-4">
              <input type="hidden" name="id" value={a.id} />
              <button type="submit" className={bouton('primaire')}>
                Signaler le travail terminé
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-attenue">Seul un membre de production ou le responsable peut signaler la fin.</p>
          )}
        </Carte>
      ) : null}

      {a.fichiers.length ? (
        <Carte titre="Fichiers partagés">
          <ul className="space-y-3">
            {a.fichiers.map((f) => (
              <li key={f.fichier_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-filet pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{f.nom}</p>
                  <p className="text-xs text-attenue">
                    {f.type_mime} · {(f.taille_octets / 1024 / 1024).toFixed(2)} Mo
                  </p>
                </div>
                <a href={`/partenaire/travaux/${a.id}/fichiers/${f.fichier_id}`} className={bouton('secondaire')}>
                  Télécharger
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-attenue">Lien sécurisé valable 60 secondes ; chaque téléchargement est journalisé.</p>
        </Carte>
      ) : null}

      {a.motif_refus ? <Alerte ton="attention">Refus : {a.motif_refus}</Alerte> : null}
      {a.motif_annulation ? <Alerte ton="attention">Annulation : {a.motif_annulation}</Alerte> : null}

      <Carte titre="Historique">
        {a.evenements.length === 0 ? (
          <p className="text-sm text-attenue">Aucun événement.</p>
        ) : (
          <ol className="space-y-3">
            {a.evenements.map((e, i) => {
              const s = estStatutAffectation(e.statut) ? statutAffectation(e.statut).label : e.statut;
              return (
                <li key={`${e.cree_le}-${i}`} className="border-l-2 border-filet pl-3">
                  <p className="text-sm font-medium">{s}</p>
                  <p className="text-xs text-attenue">
                    {ACTEURS[e.acteur_type] ?? e.acteur_type} · {dateHeure(e.cree_le)}
                  </p>
                  {e.motif ? <p className="mt-1 text-sm">{e.motif}</p> : null}
                </li>
              );
            })}
          </ol>
        )}
      </Carte>
    </PageDossier>
  );
}
