import type { Metadata } from 'next';

import { EnTeteRubrique, Ligne, Pastille, PageDossier } from '@/components/partenaire/affichage';
import { Alerte } from '@/components/partenaire/ui';
import { dateCourte } from '@/lib/admin/format';
import { OBJETS_AFFECTATION, estStatutAffectation, statutAffectation } from '@/lib/partenaires/affectations';
import { peutPartenaire } from '@/lib/partenaires/droits';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { mesAffectations, type AffectationPortail } from '@/server/partenaires/travaux';

export const metadata: Metadata = { title: 'Mes travaux' };
export const dynamic = 'force-dynamic';

const TONS = {
  attente: 'attente',
  succes: 'succes',
  alerte: 'alerte',
  danger: 'alerte',
  production: 'succes',
  info: 'neutre',
  neutre: 'neutre',
} as const;

function objet(a: AffectationPortail): string {
  return OBJETS_AFFECTATION.find((o) => o.id === a.objet)?.label ?? a.objet;
}

function resume(a: AffectationPortail, montantVisible: boolean): string {
  const morceaux = [objet(a)];
  if (a.surface_m2) morceaux.push(`${a.surface_m2} m²`);
  else if (a.quantite) morceaux.push(`${a.quantite} ${a.unite ?? 'pièce(s)'}`);
  if (a.priorite === 'URGENTE') morceaux.push('urgent');
  if (a.statut === 'PROPOSEE') morceaux.push(`réponse avant le ${dateCourte(a.date_limite_reponse)}`);
  else if (a.date_fin_prevue) morceaux.push(`fin prévue le ${dateCourte(a.date_fin_prevue)}`);
  if (montantVisible && a.montant_fcfa !== null) morceaux.push(`${a.montant_fcfa.toLocaleString('fr-FR')} FCFA`);
  return morceaux.join(' · ');
}

function pastilles(a: AffectationPortail) {
  const badge = estStatutAffectation(a.statut) ? statutAffectation(a.statut) : { label: a.statut, ton: 'neutre' as const };
  return (
    <>
      <Pastille ton={TONS[badge.ton]}>{badge.label}</Pastille>
      {a.priorite === 'URGENTE' ? <Pastille ton="alerte">Urgent</Pastille> : null}
    </>
  );
}

function Section({ titre, affectations, montantVisible }: { titre: string; affectations: AffectationPortail[]; montantVisible: boolean }) {
  if (!affectations.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-attenue">
        {titre} ({affectations.length})
      </h2>
      <ul className="space-y-3">
        {affectations.map((a) => (
          <Ligne
            key={a.id}
            href={`/partenaire/travaux/${a.id}`}
            titre={a.libelle}
            sousTitre={`${a.commande_reference ? `${a.commande_reference} · ` : ''}${resume(a, montantVisible)}`}
            pastilles={pastilles(a)}
          />
        ))}
      </ul>
    </section>
  );
}

export default async function PageTravaux({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const session = await exigerPartenaire('travaux.voir');
  const { erreur } = await searchParams;
  const affectations = await mesAffectations();
  const montantVisible = peutPartenaire(session.role, 'travaux.montant', session.statutPartenaire);
  const aRepondre = affectations.filter((a) => a.statut === 'PROPOSEE');
  const enCours = affectations.filter((a) => a.statut === 'ACCEPTEE');
  const historique = affectations.filter((a) => a.statut !== 'PROPOSEE' && a.statut !== 'ACCEPTEE');

  return (
    <PageDossier>
      <EnTeteRubrique
        titre="Mes travaux"
        intro="Les travaux que Smart Vision vous propose ou vous a confiés. Vous confirmez ou refusez une proposition ; une fois acceptée, vous pouvez signaler la fin du travail."
      />
      {erreur ? <Alerte ton="erreur">{erreur}</Alerte> : null}
      {affectations.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-filet p-6 text-sm text-attenue">
          Aucun travail pour l’instant. Une proposition apparaîtra ici et vous sera signalée par e-mail.
        </p>
      ) : (
        <>
          <Section titre="À confirmer" affectations={aRepondre} montantVisible={montantVisible} />
          <Section titre="En cours" affectations={enCours} montantVisible={montantVisible} />
          <Section titre="Historique" affectations={historique} montantVisible={montantVisible} />
        </>
      )}
    </PageDossier>
  );
}
