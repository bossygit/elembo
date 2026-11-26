import { Badge, Carte, Confirmation, bouton } from '@/components/admin/ui';
import { dateHeure } from '@/lib/admin/format';
import type { SupportStudio } from '@/lib/banner/model';
import { choisirProfil } from '@/lib/banner/profils';
import { listerProfils } from '@/server/banner/profils';
import { urlApercu, visuelsDuDevis } from '@/server/banner/repository';

import { telechargerFichier } from '@/app/admin/(protected)/devis/[id]/actions';
import { archiverVisuelAction, regenererVisuelAction } from '@/app/admin/(protected)/banderoles/actions';

const STATUTS = {
  EN_COURS: { label: 'Rendu en cours', ton: 'info' },
  RENDU: { label: 'Prêt pour l’impression', ton: 'succes' },
  A_REVOIR: { label: 'À revoir', ton: 'danger' },
  ECHEC: { label: 'Échec du rendu', ton: 'danger' },
  ARCHIVE: { label: 'Remplacé', ton: 'neutre' },
} as const;

type Alerte = { code?: string; severite: string; message: string };

/**
 * Visuel Banner Studio d'une demande (audit §5.3) : aperçu, état, points signalés, fichiers, profil
 * appliqué, versions, régénération. Rien ici n'est montré au client.
 */
export async function CarteVisuelBanner(props: {
  devisId: string;
  support: string;
  partenaireId: string | null;
  statutDevis: string;
  commande: boolean;
  peutRegenerer: boolean;
  peutTelecharger: boolean;
  fichiers: { id: string; nom: string; verifie: boolean; statut_analyse: string }[];
}) {
  const visuels = await visuelsDuDevis(props.devisId);
  if (!visuels.length) return null;
  const v = visuels.find((x) => x.statut !== 'ARCHIVE' && x.statut !== 'ECHEC' && x.statut !== 'EN_COURS') ?? visuels[0];
  const s = STATUTS[v.statut as keyof typeof STATUTS] ?? STATUTS.ECHEC;
  const alertes = (Array.isArray(v.avertissements) ? v.avertissements : []) as Alerte[];
  const profilApplique = (v.preflight?.profil ?? null) as { id: string | null; nom: string; version: number; statut: string } | null;
  const support = props.support as SupportStudio;
  const profilActuel = props.support === 'AUTRE' ? null : choisirProfil(support, props.partenaireId, await listerProfils({ support, actifs: true }));
  const perime = profilActuel && profilApplique && (profilActuel.id !== profilApplique.id || profilActuel.version !== profilApplique.version);
  const regenerable = props.peutRegenerer && ['NOUVEAU', 'EN_ANALYSE', 'PROPOSE', 'ACCEPTE'].includes(props.statutDevis);

  // Un visuel à revoir n'a pas d'aperçu propre : on montre le dernier disponible, en le disant.
  const avecApercu = v.apercu_chemin ? v : visuels.find((x) => x.apercu_chemin);
  const apercu = avecApercu?.apercu_chemin ? await urlApercu(avecApercu.apercu_chemin) : null;
  const fichiers = [
    ['PDF d’impression', v.fichier_production_id],
    ['Fiche de production', v.fichier_fiche_id],
    ['Projet (JSON)', v.fichier_projet_id],
  ].flatMap(([nom, id]) => {
    const f = props.fichiers.find((x) => x.id === id);
    return f ? [{ nom: nom as string, f }] : [];
  });

  return (
    <Carte
      id="visuel"
      titre={`Visuel Banner Studio · version ${v.version}`}
      description={`${v.origine === 'STAFF' ? 'Régénéré par l’équipe' : 'Envoyé par le client'} le ${dateHeure(v.rendu_le ?? v.cree_le)}`}
      action={<Badge ton={s.ton}>{s.label}</Badge>}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          {apercu ? (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL signée de 5 minutes, hors optimisation d'image */}
              <img src={apercu} alt={`Aperçu du visuel, version ${avecApercu!.version}`} className="w-full rounded-lg border border-neutral-200 bg-neutral-50 object-contain" />
              {avecApercu!.id !== v.id ? <figcaption className="mt-1 text-xs text-neutral-500">Aperçu de la version {avecApercu!.version} : la composition est la même.</figcaption> : null}
            </figure>
          ) : <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-500">Pas d’aperçu.</p>}
          {fichiers.length && props.peutTelecharger ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {fichiers.map(({ nom, f }) => (
                <form key={f.id} action={telechargerFichier}>
                  <input type="hidden" name="devis_id" value={props.devisId} />
                  <input type="hidden" name="fichier_id" value={f.id} />
                  <button type="submit" className={bouton(nom === 'PDF d’impression' ? 'primaire' : 'secondaire', 'sm')}>{nom}</button>
                </form>
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <h3 className="text-xs font-medium text-neutral-500">Profil appliqué</h3>
            <p>{profilApplique ? `${profilApplique.nom}, version ${profilApplique.version} — ${profilApplique.statut === 'VALIDE' ? 'validé' : 'à valider'}` : 'Profil intégré (base indisponible au rendu)'}</p>
            {perime ? (
              <p className="mt-1 rounded-md bg-amber-50 p-2 text-xs text-amber-900" data-testid="visuel-perime">
                Le profil applicable a changé ({profilActuel!.nom}, version {profilActuel!.version}) : régénérez le visuel.
              </p>
            ) : null}
          </div>
          {v.erreur ? <p className="rounded-md bg-red-50 p-2 text-xs text-red-800">Dernier incident : {v.erreur}</p> : null}
          <div>
            <h3 className="text-xs font-medium text-neutral-500">Points signalés</h3>
            {alertes.filter((a) => a.severite !== 'info').length ? (
              <ul className="mt-1 space-y-1" data-testid="visuel-alertes">
                {alertes.filter((a) => a.severite !== 'info').map((a, i) => (
                  <li key={i} className={a.severite === 'critique' ? 'text-red-800' : 'text-amber-800'}>
                    {a.severite === 'critique' ? 'Bloquant : ' : ''}{a.message}
                  </li>
                ))}
              </ul>
            ) : <p className="text-neutral-500">Aucun.</p>}
          </div>
          {regenerable ? (
            <Confirmation resume={<span className={bouton(perime || v.statut !== 'RENDU' ? 'primaire' : 'secondaire', 'sm')}>Régénérer le visuel</span>}>
              <form action={regenererVisuelAction} className="space-y-2">
                <input type="hidden" name="devis_id" value={props.devisId} />
                <p className="text-xs text-neutral-600">Même composition, contraintes du profil applicable. Une nouvelle version est créée ; les précédentes restent consultables.</p>
                <button type="submit" data-testid="regenerer" className={bouton('primaire', 'sm')}>Lancer le rendu</button>
              </form>
            </Confirmation>
          ) : null}
          {props.commande && v.statut === 'RENDU' && props.peutRegenerer ? (
            <form action={archiverVisuelAction}>
              <input type="hidden" name="devis_id" value={props.devisId} />
              <button type="submit" className={bouton('discret', 'sm')}>Recopier dans la commande</button>
            </form>
          ) : null}
        </div>
      </div>
      {visuels.length > 1 ? (
        <details className="mt-4 border-t border-neutral-100 pt-3 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-neutral-500">Versions ({visuels.length})</summary>
          <ol className="mt-2 space-y-1">
            {visuels.map((x) => (
              <li key={x.id} className="flex flex-wrap gap-2">
                <span className="font-medium">v{x.version}</span>
                <span>{STATUTS[x.statut as keyof typeof STATUTS]?.label ?? x.statut}</span>
                <span className="text-neutral-500">{x.origine === 'STAFF' ? 'équipe' : 'client'} · {dateHeure(x.rendu_le ?? x.cree_le)}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </Carte>
  );
}
