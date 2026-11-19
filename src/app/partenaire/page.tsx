import type { Metadata } from 'next';
import Link from 'next/link';

import { Formulaire } from '@/components/partenaire/Formulaire';
import { Alerte, Carte } from '@/components/partenaire/ui';
import { dateCourte } from '@/lib/admin/format';
import { ROLES_PARTENAIRE, peutPartenaire } from '@/lib/partenaires/droits';
import { soumissionPossible, statutPartenaire } from '@/lib/partenaires/statuts';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { resumeDossier } from '@/server/partenaires/dossier';
import { soumettreDossierAction } from './dossier-actions';

// La page partage le segment du layout : le modèle de titre du layout ne s'y applique pas.
export const metadata: Metadata = { title: { absolute: 'Mon dossier · Espace partenaires Elembo' } };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  bienvenue: 'Votre compte est actif. Complétez maintenant le dossier de votre atelier.',
  mot_de_passe: 'Votre mot de passe a été modifié.',
  soumis: 'Dossier soumis. Smart Vision va l’examiner et vous prévenir de sa décision.',
};

const TONS_STATUT = {
  neutre: 'bg-sable text-encre',
  attente: 'bg-amber-100 text-amber-900',
  succes: 'bg-emerald-100 text-emerald-900',
  alerte: 'bg-orange-100 text-orange-900',
  danger: 'bg-red-100 text-red-900',
  info: 'bg-sable text-encre',
  production: 'bg-sable text-encre',
} as const;

/** Rubriques du dossier ; celles sans lien s'ouvrent aux sous-lots 1.4 (tarifs) et 1.6 (utilisateurs). */
const RUBRIQUES: { titre: string; texte: string; href?: string }[] = [
  { titre: 'Mon entreprise', texte: 'Identité, coordonnées, conditions de travail.', href: '/partenaire/entreprise' },
  { titre: 'Mes machines', texte: 'Équipements, dimensions maximales, état de fonctionnement.', href: '/partenaire/machines' },
  { titre: 'Mes capacités', texte: 'Ce que vous produisez, en quelles quantités et quels délais.', href: '/partenaire/capacites' },
  { titre: 'Mes services', texte: 'Impression, finition, pose, livraison…', href: '/partenaire/services' },
  { titre: 'Mes disponibilités', texte: 'Votre charge du moment.', href: '/partenaire/disponibilites' },
  { titre: 'Mes tarifs', texte: 'Vos prix pour Smart Vision, confidentiels.' },
  { titre: 'Mes utilisateurs', texte: 'Les personnes de votre atelier qui ont un accès.' },
];

export default async function PageDossierPartenaire({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; refus?: string }>;
}) {
  const session = await exigerPartenaire('entreprise.voir');
  const { ok, refus } = await searchParams;
  const dossier = await resumeDossier(session);
  const statut = statutPartenaire(session.statutPartenaire);
  const role = ROLES_PARTENAIRE.find((r) => r.id === session.role)?.label ?? session.role;

  const etapes = dossier
    ? [
        { fait: Boolean(dossier.fiche.telephone), libelle: 'Téléphone de contact', href: '/partenaire/entreprise' },
        { fait: dossier.machines > 0, libelle: 'Au moins une machine déclarée', href: '/partenaire/machines' },
        { fait: dossier.capacites > 0, libelle: 'Au moins une capacité de production', href: '/partenaire/capacites' },
      ]
    : [];
  const pret = etapes.length > 0 && etapes.every((e) => e.fait);
  const peutSoumettre = soumissionPossible(session.statutPartenaire) && peutPartenaire(session.role, 'validation.soumettre', session.statutPartenaire);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:py-10">
      <div>
        <p className="text-sm text-attenue">
          {role} · {session.email}
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{session.nomPartenaire}</h1>
      </div>

      {ok && MESSAGES[ok] ? <Alerte ton="succes">{MESSAGES[ok]}</Alerte> : null}
      {refus ? <Alerte ton="attention">Votre rôle ne permet pas cette action. Adressez-vous au responsable de votre atelier.</Alerte> : null}

      <Carte titre="État du dossier">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${TONS_STATUT[statut.ton]}`}>{statut.label}</span>
          {dossier?.fiche.soumis_le && session.statutPartenaire === 'EN_ATTENTE_VALIDATION' ? (
            <span className="text-sm text-attenue">soumis le {dateCourte(dossier.fiche.soumis_le)}</span>
          ) : null}
          {dossier?.fiche.valide_le && session.statutPartenaire === 'VALIDE' ? (
            <span className="text-sm text-attenue">validé le {dateCourte(dossier.fiche.valide_le)}</span>
          ) : null}
        </div>

        {dossier?.fiche.motif_decision && (session.statutPartenaire === 'REFUSE' || session.statutPartenaire === 'BROUILLON') ? (
          <div className="mt-4">
            <Alerte ton="attention">
              <strong className="block">Message de Smart Vision</strong>
              {dossier.fiche.motif_decision}
            </Alerte>
          </div>
        ) : null}

        {session.statutPartenaire === 'EN_ATTENTE_VALIDATION' ? (
          <p className="mt-4 text-sm leading-relaxed text-attenue">
            Smart Vision examine votre dossier. Vous serez prévenu par e-mail de la décision. Vous pouvez encore compléter vos
            informations en attendant.
          </p>
        ) : null}

        {peutSoumettre ? (
          <div className="mt-5">
            <p className="text-sm font-medium">Pour soumettre votre dossier :</p>
            <ul className="mt-3 space-y-2">
              {etapes.map((e) => (
                <li key={e.libelle} className="flex items-center gap-3 text-sm">
                  <span
                    aria-hidden
                    className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${e.fait ? 'bg-emerald-600 text-white' : 'border border-filet bg-white text-bordure'}`}
                  >
                    {e.fait ? '✓' : ''}
                  </span>
                  <Link href={e.href} className={`underline-offset-4 hover:underline ${e.fait ? 'text-encre' : 'text-attenue'}`}>
                    {e.libelle}
                    <span className="sr-only">{e.fait ? ' : fait' : ' : à faire'}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-5">
              {pret ? (
                <Formulaire action={soumettreDossierAction} envoyer="Soumettre mon dossier" attente="Envoi…">
                  <p className="text-sm text-attenue">
                    Smart Vision vérifiera vos informations, peut-être lors d’une visite de l’atelier. Vous pourrez encore compléter
                    votre dossier pendant l’examen.
                  </p>
                </Formulaire>
              ) : (
                <p className="text-sm text-attenue">Complétez les points ci-dessus pour pouvoir soumettre votre dossier.</p>
              )}
            </div>
          </div>
        ) : null}
      </Carte>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RUBRIQUES.map((r) =>
          r.href ? (
            <Link key={r.titre} href={r.href} className="rounded-2xl border border-filet bg-white p-5 transition-colors hover:border-encre">
              <p className="font-semibold">{r.titre}</p>
              <p className="mt-1 text-sm leading-relaxed text-attenue">{r.texte}</p>
            </Link>
          ) : (
            <div key={r.titre} className="rounded-2xl border border-dashed border-filet p-5">
              <p className="font-semibold">{r.titre}</p>
              <p className="mt-1 text-sm leading-relaxed text-attenue">{r.texte}</p>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-bordure">Bientôt disponible</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
