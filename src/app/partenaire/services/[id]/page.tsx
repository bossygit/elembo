import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ChampsService } from '@/components/partenaire/ChampsDossier';
import { Cache, Formulaire } from '@/components/partenaire/Formulaire';
import { BadgeValidation, Definitions, EnTeteRubrique, MotifRefus, PageDossier } from '@/components/partenaire/affichage';
import { Carte } from '@/components/partenaire/ui';
import { CATEGORIES_SERVICE } from '@/lib/partenaires/catalogue';
import { peutPartenaire } from '@/lib/partenaires/droits';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { mesCapacites, monService } from '@/server/partenaires/dossier';
import { basculerServiceAction, enregistrerService } from '../../dossier-actions';

export const metadata: Metadata = { title: 'Service' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PageService({ params }: { params: Promise<{ id: string }> }) {
  const session = await exigerPartenaire('services.voir');
  const { id } = await params;
  const [s, capacites] = await Promise.all([UUID.test(id) ? monService(id) : null, mesCapacites()]);
  if (!s) notFound();
  const modifiable = peutPartenaire(session.role, 'services.modifier', session.statutPartenaire);
  const categorie = CATEGORIES_SERVICE.find((c) => c.id === s.categorie)?.nom ?? s.categorie;

  return (
    <PageDossier>
      <EnTeteRubrique
        titre={s.nom}
        intro={`${categorie}${s.actif ? '' : ' · en pause'}`}
        retour={{ href: '/partenaire/services', libelle: 'Mes services' }}
        action={<BadgeValidation statut={s.statut_validation} />}
      />
      <MotifRefus statut={s.statut_validation} motif={s.motif_refus} />

      {modifiable ? (
        <>
          <Formulaire action={enregistrerService} envoyer="Enregistrer les modifications">
            <Cache nom="id" valeur={s.id} />
            <ChampsService s={s} capacites={capacites} />
          </Formulaire>
          <Carte titre={s.actif ? 'Mettre en pause' : 'Réactiver'}>
            <Formulaire action={basculerServiceAction} envoyer={s.actif ? 'Mettre en pause' : 'Réactiver'} variante="secondaire">
              <Cache nom="id" valeur={s.id} />
              <Cache nom="actif" valeur={s.actif ? 'false' : 'true'} />
            </Formulaire>
          </Carte>
        </>
      ) : (
        <Carte>
          <Definitions
            elements={[
              ['Type', categorie],
              ['Capacité associée', capacites.find((c) => c.id === s.capacite_id)?.nom],
              ['Délai habituel', s.delai_jours !== null ? `${s.delai_jours} jours` : null],
              ['Description', s.description],
              ['Réalisé avec un autre atelier', s.realise_par_tiers ? s.tiers_precision : null],
            ]}
          />
        </Carte>
      )}
    </PageDossier>
  );
}
