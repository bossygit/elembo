import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Alerte, PageAcces } from '@/components/partenaire/ui';
import { accesPortail } from '@/lib/partenaires/statuts';
import { etatCompte } from '@/server/partenaires/acces';
import { motifSuspension } from '@/server/partenaires/dossier';

export const metadata: Metadata = { title: 'Accès suspendu' };

/** Entreprise suspendue ou archivée : plus aucune donnée n'est accessible (RLS comprise). */
export default async function PageAccesSuspendu() {
  const etat = await etatCompte();
  if (etat.type !== 'partenaire') redirect('/partenaire/connexion');
  if (accesPortail(etat.session.statutPartenaire) !== 'aucun') redirect('/partenaire');

  const suspendu = etat.session.statutPartenaire === 'SUSPENDU';
  const motif = suspendu ? await motifSuspension(etat.session.partenaireId) : null;

  return (
    <PageAcces
      titre={suspendu ? 'Accès suspendu' : 'Partenariat clôturé'}
      intro={
        suspendu
          ? `L’accès de ${etat.session.nomPartenaire} à l’espace partenaires est suspendu par Smart Vision.`
          : `Le partenariat de ${etat.session.nomPartenaire} avec Smart Vision est clôturé.`
      }
    >
      <div className="space-y-4">
        {motif ? (
          <Alerte ton="attention">
            <strong className="block">Motif communiqué</strong>
            {motif}
          </Alerte>
        ) : null}
        <p className="text-sm leading-relaxed text-attenue">
          Pour toute question, contactez directement votre interlocuteur chez Smart Vision Congo.
        </p>
      </div>
    </PageAcces>
  );
}
