import type { Metadata } from 'next';
import Link from 'next/link';

import { BadgeValidation, EnTeteRubrique, Ligne, MessageOk, PageDossier, Pastille, metres } from '@/components/partenaire/affichage';
import { bouton } from '@/components/partenaire/ui';
import { ETATS_MACHINE, machineProductive, nomFamille, nomTypeMachine, type EtatMachine } from '@/lib/partenaires/catalogue';
import { peutPartenaire } from '@/lib/partenaires/droits';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { mesMachines } from '@/server/partenaires/dossier';

export const metadata: Metadata = { title: 'Mes machines' };
export const dynamic = 'force-dynamic';

const MESSAGES = {
  ajoutee: 'Machine ajoutée. Smart Vision la vérifiera avec votre dossier.',
  modifiee: 'Machine enregistrée.',
  archivee: 'Machine retirée de votre liste.',
};

export default async function PageMachines({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const session = await exigerPartenaire('machines.voir');
  const { ok } = await searchParams;
  const machines = await mesMachines();
  const ajout = peutPartenaire(session.role, 'machines.modifier', session.statutPartenaire);

  return (
    <PageDossier>
      <EnTeteRubrique
        titre="Mes machines"
        intro="Les équipements de votre atelier. Une modification technique (dimensions, type, supports) est revérifiée par Smart Vision ; une panne ou une maintenance, non."
        action={
          ajout ? (
            <Link href="/partenaire/machines/nouvelle" className={bouton('primaire')}>
              Ajouter une machine
            </Link>
          ) : undefined
        }
      />
      <MessageOk code={ok} messages={MESSAGES} />

      {machines.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-filet p-6 text-sm text-attenue">
          Aucune machine déclarée pour l’instant.{ajout ? ' Commencez par votre machine principale.' : ''}
        </p>
      ) : (
        <ul className="space-y-3">
          {machines.map((m) => (
            <Ligne
              key={m.id}
              href={`/partenaire/machines/${m.id}`}
              titre={m.nom}
              sousTitre={[nomFamille(m.famille), nomTypeMachine(m.type_machine), m.quantite > 1 ? `× ${m.quantite}` : null, metres(m.largeur_max_mm)]
                .filter(Boolean)
                .join(' · ')}
              pastilles={
                <>
                  {!machineProductive(m.etat as EtatMachine) ? (
                    <Pastille ton="alerte">{ETATS_MACHINE.find((e) => e.id === m.etat)?.nom ?? m.etat}</Pastille>
                  ) : null}
                  <BadgeValidation statut={m.statut_validation} />
                </>
              }
            />
          ))}
        </ul>
      )}
    </PageDossier>
  );
}
