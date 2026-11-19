import type { Metadata } from 'next';

import { ChampsService } from '@/components/partenaire/ChampsDossier';
import { Formulaire } from '@/components/partenaire/Formulaire';
import { EnTeteRubrique, PageDossier } from '@/components/partenaire/affichage';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { mesCapacites } from '@/server/partenaires/dossier';
import { enregistrerService } from '../../dossier-actions';

export const metadata: Metadata = { title: 'Ajouter un service' };

export default async function PageNouveauService() {
  await exigerPartenaire('services.modifier');
  const capacites = await mesCapacites();
  return (
    <PageDossier>
      <EnTeteRubrique titre="Ajouter un service" retour={{ href: '/partenaire/services', libelle: 'Mes services' }} />
      <Formulaire action={enregistrerService} envoyer="Ajouter le service">
        <ChampsService capacites={capacites} />
      </Formulaire>
    </PageDossier>
  );
}
