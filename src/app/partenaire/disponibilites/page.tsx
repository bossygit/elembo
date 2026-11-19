import type { Metadata } from 'next';

import { Champ, Choix, Formulaire, ZoneTexte } from '@/components/partenaire/Formulaire';
import { EnTeteRubrique, MessageOk, PageDossier, Pastille } from '@/components/partenaire/affichage';
import { Carte } from '@/components/partenaire/ui';
import { dateCourte } from '@/lib/admin/format';
import { STATUTS_DISPONIBILITE } from '@/lib/partenaires/catalogue';
import { peutPartenaire } from '@/lib/partenaires/droits';
import { disponibiliteCourante } from '@/lib/partenaires/formulaires';
import { exigerPartenaire } from '@/server/partenaires/acces';
import { mesDisponibilites } from '@/server/partenaires/dossier';
import { declarerDisponibiliteAction } from '../dossier-actions';

export const metadata: Metadata = { title: 'Mes disponibilités' };
export const dynamic = 'force-dynamic';

const nomStatut = (id: string) => STATUTS_DISPONIBILITE.find((s) => s.id === id)?.nom ?? id;

export default async function PageDisponibilites({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const session = await exigerPartenaire('disponibilites.voir');
  const { ok } = await searchParams;
  const declarations = await mesDisponibilites();
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const courante = disponibiliteCourante(declarations, aujourdhui);
  const declarer = peutPartenaire(session.role, 'disponibilites.declarer', session.statutPartenaire);

  return (
    <PageDossier>
      <EnTeteRubrique
        titre="Mes disponibilités"
        intro="Prévenez Smart Vision de votre charge : atelier saturé, maintenance, congés… Une nouvelle déclaration remplace la précédente ; l’historique est conservé."
      />
      <MessageOk code={ok} messages={{ declaree: 'Disponibilité enregistrée.' }} />

      <Carte titre="En ce moment">
        {courante ? (
          <div className="space-y-1">
            <Pastille ton={courante.statut === 'DISPONIBLE' || courante.statut === 'ACTIVITE_NORMALE' ? 'succes' : 'alerte'}>
              {nomStatut(courante.statut)}
            </Pastille>
            <p className="text-sm text-attenue">
              Depuis le {dateCourte(courante.debut_periode)}
              {courante.fin_periode ? `, jusqu’au ${dateCourte(courante.fin_periode)}` : ''}
              {courante.delai_moyen_jours !== null ? ` · délai moyen ${courante.delai_moyen_jours} jours` : ''}
            </p>
            {courante.commentaire ? <p className="text-sm">{courante.commentaire}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-attenue">Aucune disponibilité déclarée pour aujourd’hui.</p>
        )}
      </Carte>

      {declarer ? (
        <Carte titre="Déclarer ma disponibilité">
          <Formulaire action={declarerDisponibiliteAction} envoyer="Enregistrer">
            <Choix nom="statut" libelle="Situation" defaut="" vide="Choisir…" options={STATUTS_DISPONIBILITE.map((s) => ({ valeur: s.id, libelle: s.nom }))} />
            <div className="grid gap-5 sm:grid-cols-2">
              <Champ nom="debut_periode" libelle="À partir du" type="date" defaut={aujourdhui} max={10} />
              <Champ nom="fin_periode" libelle="Jusqu’au" type="date" max={10} aide="Laissez vide si vous ne savez pas encore." />
            </div>
            <Champ nom="delai_moyen_jours" libelle="Délai moyen actuel" mode="numeric" max={3} suffixe="jours" />
            <ZoneTexte nom="commentaire" libelle="Commentaire" max={1000} />
          </Formulaire>
        </Carte>
      ) : null}

      {declarations.length > 0 ? (
        <Carte titre="Historique">
          <ul className="divide-y divide-filet">
            {declarations.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                <span className="font-medium">{nomStatut(d.statut)}</span>
                <span className="text-attenue">
                  {dateCourte(d.debut_periode)}
                  {d.fin_periode ? ` → ${dateCourte(d.fin_periode)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}
    </PageDossier>
  );
}
