import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ChampsTarif } from '@/components/partenaire/ChampsDossier';
import { Cache, Formulaire } from '@/components/partenaire/Formulaire';
import { EnTeteRubrique, MessageOk, PageDossier, Pastille } from '@/components/partenaire/affichage';
import { Alerte, Carte } from '@/components/partenaire/ui';
import { dateCourte } from '@/lib/admin/format';
import { resumeVersion } from '@/lib/partenaires/paliers';
import { statutTarif, type StatutTarif } from '@/lib/partenaires/statuts';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { mesCapacites, mesServices } from '@/server/partenaires/dossier';
import { maLigneeTarif } from '@/server/partenaires/tarifs';
import { proposerTarifAction, retirerPropositionAction } from '../../tarifs-actions';

export const metadata: Metadata = { title: 'Tarif' };
export const dynamic = 'force-dynamic';

const TON: Record<string, 'succes' | 'attente' | 'alerte' | 'neutre'> = {
  succes: 'succes',
  attente: 'attente',
  alerte: 'alerte',
  danger: 'alerte',
};

export default async function PageTarif({
  params,
  searchParams,
}: {
  params: Promise<{ lignee: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  await exigerPartenaire('tarifs.voir');
  const [{ lignee }, { ok }] = await Promise.all([params, searchParams]);
  // Lecture sous RLS : un tarif d'une autre entreprise est introuvable (404).
  const [l, capacites, services] = await Promise.all([maLigneeTarif(lignee), mesCapacites(), mesServices()]);
  if (!l) notFound();

  // Le formulaire part de la proposition en cours, sinon de la version en vigueur (nouvelle version).
  const base = l.enCours ?? l.enVigueur ?? l.historique[0];
  const titreFormulaire = l.enCours
    ? l.enCours.statut === 'MODIFICATION_DEMANDEE'
      ? 'Corriger la proposition'
      : 'Modifier la proposition'
    : l.enVigueur
      ? 'Proposer un nouveau prix'
      : 'Proposer à nouveau';

  return (
    <PageDossier>
      <EnTeteRubrique titre={l.nom} retour={{ href: '/partenaire/tarifs', libelle: 'Mes tarifs' }} />
      <MessageOk
        code={ok}
        messages={{ propose: 'Proposition enregistrée. Smart Vision va l’examiner.', retire: 'Proposition retirée.' }}
      />

      <Carte titre="En vigueur">
        {l.enVigueur ? (
          <div className="space-y-1 text-sm">
            <p className="text-base font-semibold">{resumeVersion(l.enVigueur)}</p>
            <p className="text-attenue">
              Validé depuis le {dateCourte(l.enVigueur.valide_du)}
              {l.enVigueur.valide_jusquau ? `, jusqu’au ${dateCourte(l.enVigueur.valide_jusquau)}` : ''}
            </p>
            {l.enVigueur.conditions ? <p>{l.enVigueur.conditions}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-attenue">Aucun prix validé pour ce tarif.</p>
        )}
      </Carte>

      {l.enCours ? (
        <Carte titre="Proposition en cours">
          <div className="space-y-3">
            <p className="text-sm">
              <Pastille ton={l.enCours.statut === 'MODIFICATION_DEMANDEE' ? 'alerte' : 'attente'}>{statutTarif(l.enCours.statut as StatutTarif).label}</Pastille>{' '}
              {resumeVersion(l.enCours)}
            </p>
            {l.enCours.statut === 'MODIFICATION_DEMANDEE' && l.enCours.motif_decision ? (
              <Alerte ton="attention">
                <strong className="block">Demande de Smart Vision</strong>
                {l.enCours.motif_decision}
              </Alerte>
            ) : null}
            <Formulaire action={retirerPropositionAction} envoyer="Retirer cette proposition" attente="Retrait…" variante="secondaire">
              <Cache nom="lignee_id" valeur={l.ligneeId} />
            </Formulaire>
          </div>
        </Carte>
      ) : null}

      <div>
        <h2 className="mb-3 text-lg font-semibold">{titreFormulaire}</h2>
        <Formulaire action={proposerTarifAction} envoyer="Envoyer à Smart Vision">
          <Cache nom="lignee_id" valeur={l.ligneeId} />
          <ChampsTarif v={base} capacites={capacites} services={services} />
        </Formulaire>
      </div>

      <Carte titre="Historique">
        <ul className="divide-y divide-filet">
          {l.historique.map((v) => {
            const s = statutTarif(v.statut as StatutTarif);
            return (
              <li key={v.id} className="space-y-1 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Version {v.version}</span>
                  <Pastille ton={TON[s.ton] ?? 'neutre'}>{s.label}</Pastille>
                  <span className="text-attenue">
                    {v.origine === 'SMART_VISION' ? 'saisie par Smart Vision' : 'proposée par l’atelier'} · {dateCourte(v.cree_le)}
                  </span>
                </div>
                <p>{resumeVersion(v)}</p>
                {v.motif_decision && (v.statut === 'REFUSE' || v.statut === 'MODIFICATION_DEMANDEE') ? (
                  <p className="text-attenue">Motif : {v.motif_decision}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Carte>
    </PageDossier>
  );
}
