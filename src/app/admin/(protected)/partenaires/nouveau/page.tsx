import type { Metadata } from 'next';

import { ChampsFiche } from '@/components/admin/partenaires';
import { Carte, EnTete, Flash, bouton } from '@/components/admin/ui';
import { exigerAcces } from '@/server/admin/acces';
import { enregistrerPartenaireAction } from '../actions';

export const metadata: Metadata = { title: 'Nouveau partenaire' };

export default async function PageNouveauPartenaire({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  await exigerAcces('partenaires.gerer');
  const { erreur } = await searchParams;
  return (
    <div>
      <EnTete
        retour={{ href: '/admin/partenaires', label: 'Partenaires' }}
        surtitre="Elembo Partners"
        titre="Nouveau partenaire"
        description="Atelier connu de Smart Vision (visite, partenaire historique). La fiche est validée d’emblée. Ses tarifs peuvent être saisis depuis sa fiche ; ses comptes pourront y être rattachés par invitation (prochaine mise à jour)."
      />
      <Flash erreur={erreur} />
      <Carte>
        <form action={enregistrerPartenaireAction} className="space-y-4">
          <ChampsFiche />
          <button type="submit" className={bouton('primaire')}>
            Créer le partenaire
          </button>
        </form>
      </Carte>
    </div>
  );
}
