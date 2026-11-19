import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ChampsCapacite, libelleMachine } from '@/components/partenaire/ChampsDossier';
import { Cache, Formulaire } from '@/components/partenaire/Formulaire';
import { BadgeValidation, Definitions, EnTeteRubrique, MotifRefus, PageDossier, metres, nombre } from '@/components/partenaire/affichage';
import { Carte } from '@/components/partenaire/ui';
import { FINITIONS_PRODUCTION, UNITES_CAPACITE, nomFamille, nomPrestation } from '@/lib/partenaires/catalogue';
import { peutPartenaire } from '@/lib/partenaires/droits';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { maCapacite, mesMachines } from '@/server/partenaires/dossier';
import { basculerCapaciteAction, enregistrerCapacite } from '../../dossier-actions';

export const metadata: Metadata = { title: 'Capacité' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PageCapacite({ params }: { params: Promise<{ id: string }> }) {
  const session = await exigerPartenaire('capacites.voir');
  const { id } = await params;
  const [c, machines] = await Promise.all([UUID.test(id) ? maCapacite(id) : null, mesMachines()]);
  if (!c) notFound();
  const modifiable = peutPartenaire(session.role, 'capacites.modifier', session.statutPartenaire);
  const unite = UNITES_CAPACITE.find((u) => u.id === c.unite_capacite);

  return (
    <PageDossier>
      <EnTeteRubrique
        titre={c.nom}
        intro={`${nomFamille(c.categorie)} · ${nomPrestation(c.prestation)}${c.actif ? '' : ' · en pause'}`}
        retour={{ href: '/partenaire/capacites', libelle: 'Mes capacités' }}
        action={<BadgeValidation statut={c.statut_validation} />}
      />
      <MotifRefus statut={c.statut_validation} motif={c.motif_refus} />

      {modifiable ? (
        <>
          <Formulaire action={enregistrerCapacite} envoyer="Enregistrer les modifications">
            <Cache nom="id" valeur={c.id} />
            <ChampsCapacite c={c} machines={machines} />
          </Formulaire>
          <Carte titre={c.actif ? 'Mettre en pause' : 'Réactiver'}>
            <p className="mb-4 text-sm text-attenue">
              {c.actif
                ? 'Vous ne faites plus cette prestation pour le moment : elle ne vous sera plus proposée. Vous pourrez la réactiver.'
                : 'La prestation vous sera de nouveau proposée.'}
            </p>
            <Formulaire action={basculerCapaciteAction} envoyer={c.actif ? 'Mettre en pause' : 'Réactiver'} variante="secondaire">
              <Cache nom="id" valeur={c.id} />
              <Cache nom="actif" valeur={c.actif ? 'false' : 'true'} />
            </Formulaire>
          </Carte>
        </>
      ) : (
        <Carte>
          <Definitions
            elements={[
              ['Capacité par jour', c.capacite_journaliere !== null ? `${nombre(c.capacite_journaliere)} ${unite?.parJour ?? ''}` : null],
              ['Largeur maximale', metres(c.largeur_max_mm)],
              ['Longueur maximale', metres(c.longueur_max_mm)],
              ['Délai habituel', c.delai_jours !== null ? `${c.delai_jours} jours` : null],
              ['Finitions', c.finitions.map((f) => FINITIONS_PRODUCTION.find((x) => x.id === f)?.nom ?? f).join(', ')],
              ['Machines', machines.filter((m) => c.machines.includes(m.id)).map(libelleMachine).join(', ')],
            ]}
          />
        </Carte>
      )}
    </PageDossier>
  );
}
