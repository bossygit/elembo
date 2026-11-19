import type { Metadata } from 'next';

import { ChampsMachine } from '@/components/partenaire/ChampsDossier';
import { Formulaire } from '@/components/partenaire/Formulaire';
import { EnTeteRubrique, PageDossier } from '@/components/partenaire/affichage';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { enregistrerMachine } from '../../dossier-actions';

export const metadata: Metadata = { title: 'Ajouter une machine' };

export default async function PageNouvelleMachine() {
  await exigerPartenaire('machines.modifier');
  return (
    <PageDossier>
      <EnTeteRubrique titre="Ajouter une machine" retour={{ href: '/partenaire/machines', libelle: 'Mes machines' }} />
      <Formulaire action={enregistrerMachine} envoyer="Ajouter la machine">
        <ChampsMachine />
      </Formulaire>
    </PageDossier>
  );
}
