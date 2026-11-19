import type { Metadata } from 'next';

import { ChampsTarif } from '@/components/partenaire/ChampsDossier';
import { Formulaire } from '@/components/partenaire/Formulaire';
import { EnTeteRubrique, PageDossier } from '@/components/partenaire/affichage';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { mesCapacites, mesServices } from '@/server/partenaires/dossier';
import { proposerTarifAction } from '../../tarifs-actions';

export const metadata: Metadata = { title: 'Proposer un tarif' };

export default async function PageNouveauTarif() {
  await exigerPartenaire('tarifs.proposer');
  const [capacites, services] = await Promise.all([mesCapacites(), mesServices()]);
  return (
    <PageDossier>
      <EnTeteRubrique
        titre="Proposer un tarif"
        intro="Un tarif par prestation ou supplément : impression au m², pose d’œillets à la pièce, livraison…"
        retour={{ href: '/partenaire/tarifs', libelle: 'Mes tarifs' }}
      />
      <Formulaire action={proposerTarifAction} envoyer="Proposer ce tarif">
        <ChampsTarif capacites={capacites} services={services} />
      </Formulaire>
    </PageDossier>
  );
}
