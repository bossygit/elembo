import type { Metadata } from 'next';

import { ChampsCapacite } from '@/components/partenaire/ChampsDossier';
import { Formulaire } from '@/components/partenaire/Formulaire';
import { EnTeteRubrique, PageDossier } from '@/components/partenaire/affichage';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { mesMachines } from '@/server/partenaires/dossier';
import { enregistrerCapacite } from '../../dossier-actions';

export const metadata: Metadata = { title: 'Ajouter une capacité' };

export default async function PageNouvelleCapacite() {
  await exigerPartenaire('capacites.modifier');
  const machines = await mesMachines();
  return (
    <PageDossier>
      <EnTeteRubrique
        titre="Ajouter une capacité"
        intro="Une capacité par prestation : par exemple « Banderoles PVC, 60 m² par jour, jusqu’à 3,20 m de large, œillets et ourlets »."
        retour={{ href: '/partenaire/capacites', libelle: 'Mes capacités' }}
      />
      <Formulaire action={enregistrerCapacite} envoyer="Ajouter la capacité">
        <ChampsCapacite machines={machines} />
      </Formulaire>
    </PageDossier>
  );
}
