import type { Metadata } from 'next';
import Link from 'next/link';

import { EnTeteRubrique, Ligne, MessageOk, PageDossier, Pastille } from '@/components/partenaire/affichage';
import { bouton } from '@/components/partenaire/ui';
import { resumeVersion } from '@/lib/partenaires/paliers';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { mesTarifs } from '@/server/partenaires/tarifs';

export const metadata: Metadata = { title: 'Mes tarifs' };
export const dynamic = 'force-dynamic';

export default async function PageTarifs({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  // Confidentiel : responsable seulement (les autres rôles sont renvoyés au tableau de bord).
  await exigerPartenaire('tarifs.voir');
  const { ok } = await searchParams;
  const lignees = await mesTarifs();

  return (
    <PageDossier>
      <EnTeteRubrique
        titre="Mes tarifs"
        intro="Vos prix pour Smart Vision. Ils restent confidentiels : ni les clients ni les autres ateliers ne les voient. Un prix n’est utilisé qu’après validation par Smart Vision."
        action={
          <Link href="/partenaire/tarifs/nouveau" className={bouton('primaire')}>
            Proposer un tarif
          </Link>
        }
      />
      <MessageOk code={ok} messages={{ propose: 'Tarif proposé. Smart Vision va l’examiner.' }} />

      {lignees.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-filet p-6 text-sm text-attenue">Aucun tarif proposé pour l’instant.</p>
      ) : (
        <ul className="space-y-3">
          {lignees.map((l) => {
            const reference = l.enVigueur ?? l.enCours ?? l.historique[0];
            return (
              <Ligne
                key={l.ligneeId}
                href={`/partenaire/tarifs/${l.ligneeId}`}
                titre={l.nom}
                sousTitre={l.enVigueur ? `En vigueur : ${resumeVersion(l.enVigueur)}` : resumeVersion(reference)}
                pastilles={
                  <>
                    {l.enVigueur ? <Pastille ton="succes">Validé</Pastille> : null}
                    {l.enCours?.statut === 'PROPOSE' ? <Pastille ton="attente">{l.enVigueur ? 'Nouveau prix proposé' : 'Proposé'}</Pastille> : null}
                    {l.enCours?.statut === 'MODIFICATION_DEMANDEE' ? <Pastille ton="alerte">Modification demandée</Pastille> : null}
                    {!l.enVigueur && !l.enCours ? <Pastille>{reference.statut === 'REFUSE' ? 'Refusé' : 'Retiré'}</Pastille> : null}
                  </>
                }
              />
            );
          })}
        </ul>
      )}
    </PageDossier>
  );
}
