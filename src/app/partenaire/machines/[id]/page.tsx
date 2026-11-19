import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ChampsEtatMachine, ChampsMachine } from '@/components/partenaire/ChampsDossier';
import { Cache, Formulaire } from '@/components/partenaire/Formulaire';
import { Galerie } from '@/components/partenaire/Galerie';
import { BadgeValidation, Definitions, EnTeteRubrique, MessageOk, MotifRefus, PageDossier, metres } from '@/components/partenaire/affichage';
import { Carte } from '@/components/partenaire/ui';
import { ETATS_MACHINE, nomFamille, nomTypeMachine } from '@/lib/partenaires/catalogue';
import { peutPartenaire } from '@/lib/partenaires/droits';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { maMachine } from '@/server/partenaires/dossier';
import { mesFichiers } from '@/server/partenaires/fichiers';
import { archiverMachineAction, enregistrerEtatMachine, enregistrerMachine } from '../../dossier-actions';

export const metadata: Metadata = { title: 'Machine' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PageMachine({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const session = await exigerPartenaire('machines.voir');
  const [{ id }, { ok }] = await Promise.all([params, searchParams]);
  // Lecture sous RLS : une machine d'une autre entreprise est introuvable (404).
  const m = UUID.test(id) ? await maMachine(id) : null;
  if (!m || m.archive) notFound();
  const photos = await mesFichiers({ type: 'MACHINE', machineId: m.id });

  const complet = peutPartenaire(session.role, 'machines.modifier', session.statutPartenaire);
  const etat = peutPartenaire(session.role, 'machines.etat', session.statutPartenaire);

  return (
    <PageDossier>
      <EnTeteRubrique
        titre={m.nom}
        intro={`${nomFamille(m.famille)} · ${nomTypeMachine(m.type_machine)}`}
        retour={{ href: '/partenaire/machines', libelle: 'Mes machines' }}
        action={<BadgeValidation statut={m.statut_validation} />}
      />
      <MessageOk code={ok} messages={{ etat: 'État de la machine mis à jour.' }} />
      <MotifRefus statut={m.statut_validation} motif={m.motif_refus} />

      <Carte titre="Photos">
        <Galerie
          fichiers={photos}
          type="MACHINE"
          machineId={m.id}
          modifiable={etat}
          libelleAjout="Ajouter des photos"
          vide="Une photo de la machine et de sa plaque signalétique facilite sa validation."
        />
      </Carte>

      {complet ? (
        <>
          <Formulaire action={enregistrerMachine} envoyer="Enregistrer les modifications">
            <Cache nom="id" valeur={m.id} />
            <ChampsMachine m={m} />
          </Formulaire>
          <Carte titre="Retirer cette machine">
            <p className="mb-4 text-sm text-attenue">
              Machine vendue ou hors d’usage définitif : elle disparaît de votre liste et des capacités qui l’utilisent. L’historique est conservé.
            </p>
            <Formulaire action={archiverMachineAction} envoyer="Retirer la machine" attente="Retrait…" variante="secondaire">
              <Cache nom="id" valeur={m.id} />
            </Formulaire>
          </Carte>
        </>
      ) : (
        <>
          <Carte>
            <Definitions
              elements={[
                ['Marque', m.marque],
                ['Modèle', m.modele],
                ['Technologie', m.technologie],
                ['Quantité', String(m.quantite)],
                ['Largeur maximale', metres(m.largeur_max_mm)],
                ['Longueur maximale', metres(m.longueur_max_mm)],
                ['Supports', m.supports_compatibles.join(', ')],
                ['État', ETATS_MACHINE.find((e) => e.id === m.etat)?.nom ?? m.etat],
              ]}
            />
          </Carte>
          {etat ? (
            <Carte titre="Signaler l’état de la machine">
              <Formulaire action={enregistrerEtatMachine} envoyer="Mettre à jour l’état">
                <Cache nom="id" valeur={m.id} />
                <ChampsEtatMachine m={m} />
              </Formulaire>
            </Carte>
          ) : null}
        </>
      )}
    </PageDossier>
  );
}
