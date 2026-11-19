/**
 * Galerie des fichiers d'une rubrique (composant serveur). Les URL sont signées pour 10 minutes ;
 * le bouton « Retirer » n'apparaît que si le rôle peut retirer ce type de fichier.
 */

import { retirerFichierAction } from '@/app/partenaire/fichiers-actions';
import type { TypeFichierPartenaire } from '@/lib/partenaires/catalogue';
import { QUOTAS } from '@/lib/partenaires/fichiers';
import type { FichierAffiche } from '@/server/partenaires/fichiers';
import { EnvoiFichier } from './EnvoiFichier';
import { Cache, Formulaire } from './Formulaire';

export function Galerie({
  fichiers,
  type,
  machineId,
  modifiable,
  libelleAjout,
  vide,
}: {
  fichiers: FichierAffiche[];
  type: TypeFichierPartenaire;
  machineId?: string;
  modifiable: boolean;
  libelleAjout: string;
  vide: string;
}) {
  const plein = type !== 'LOGO' && fichiers.length >= QUOTAS[type];
  return (
    <div className="space-y-4">
      {fichiers.length === 0 ? (
        <p className="text-sm text-attenue">{vide}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fichiers.map((f) => (
            <li key={f.id} className="overflow-hidden rounded-xl border border-filet bg-white">
              {f.url && f.type_mime.startsWith('image/') ? (
                // URL signée de courte durée, hors domaine configuré pour next/image : <img> simple.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt={f.nom_original ?? 'Photo'} loading="lazy" className="aspect-square w-full object-cover" />
              ) : (
                <a href={f.url ?? '#'} target="_blank" rel="noreferrer" className="grid aspect-square place-items-center bg-sable p-3 text-center text-xs">
                  {f.nom_original ?? 'Document PDF'}
                </a>
              )}
              {modifiable ? (
                <div className="p-2">
                  <Formulaire action={retirerFichierAction} envoyer="Retirer" attente="Retrait…" variante="secondaire" pleineLargeur={false}>
                    <Cache nom="id" valeur={f.id} />
                  </Formulaire>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {modifiable && !plein ? <EnvoiFichier type={type} machineId={machineId} libelle={libelleAjout} plusieurs={type !== 'LOGO'} /> : null}
      {modifiable && plein ? <p className="text-sm text-attenue">Limite de {QUOTAS[type]} fichiers atteinte.</p> : null}
    </div>
  );
}
