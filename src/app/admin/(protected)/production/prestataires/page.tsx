import type { Metadata } from 'next';

import { Badge, Carte, EnTete, Flash, Vide, bouton, champ, libelle } from '@/components/admin/ui';
import { exigerAcces } from '@/server/admin/acces';
import { listerPartenaires, type Partenaire } from '@/server/admin/production';
import { creerPartenaireAction, modifierPartenaireAction } from '../actions';

export const metadata: Metadata = { title: 'Prestataires' };
export const dynamic = 'force-dynamic';

function Champs({ p }: { p?: Partenaire }) {
  return (
    <>
      <label className={libelle}>
        Nom
        <input name="nom" required minLength={2} maxLength={120} defaultValue={p?.nom} className={champ} />
      </label>
      <label className={libelle}>
        Spécialité
        <input name="specialite" required minLength={2} maxLength={120} defaultValue={p?.specialite} placeholder="DTF, broderie, encadrement…" className={champ} />
      </label>
      <label className={libelle}>
        Téléphone
        <input name="telephone" maxLength={32} defaultValue={p?.telephone ?? ''} className={champ} />
      </label>
      <label className={libelle}>
        Email
        <input type="email" name="email" maxLength={254} defaultValue={p?.email ?? ''} className={champ} />
      </label>
      <label className={libelle}>
        Délai habituel (jours)
        <input type="number" name="delai_jours" min={0} max={365} defaultValue={p?.delai_jours ?? ''} className={champ} />
      </label>
      <label className={libelle}>
        Notes
        <input name="notes" maxLength={2000} defaultValue={p?.notes ?? ''} className={champ} />
      </label>
    </>
  );
}

export default async function PagePrestataires({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  await exigerAcces('partenaires.gerer');
  const messages = await searchParams;
  const partenaires = await listerPartenaires();

  return (
    <div>
      <EnTete
        retour={{ href: '/admin/production', label: 'Atelier' }}
        surtitre="Production"
        titre="Prestataires"
        description="Sous-traitants et partenaires d’impression affectables aux étapes de fabrication."
      />
      <Flash ok={messages.ok} erreur={messages.erreur} messages={{ cree: 'Prestataire ajouté.', modifie: 'Prestataire mis à jour.' }} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Carte titre={`${partenaires.length} prestataire(s)`}>
          {partenaires.length === 0 ? <Vide>Aucun prestataire enregistré.</Vide> : null}
          <ul className="divide-y divide-neutral-100">
            {partenaires.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {p.nom} {!p.actif ? <Badge>Inactif</Badge> : null}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {[p.specialite, p.telephone, p.email, p.delai_jours !== null ? `${p.delai_jours} j` : null].filter(Boolean).join(' · ')}
                    </p>
                    {p.notes ? <p className="mt-1 text-xs text-neutral-600">{p.notes}</p> : null}
                  </div>
                  <form action={modifierPartenaireAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="actif" value={String(!p.actif)} />
                    <button type="submit" className={bouton(p.actif ? 'secondaire' : 'succes', 'sm')}>
                      {p.actif ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </form>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-neutral-600">Modifier</summary>
                  <form action={modifierPartenaireAction} className="mt-2 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={p.id} />
                    <Champs p={p} />
                    <div className="sm:col-span-2">
                      <button type="submit" className={bouton('primaire', 'sm')}>
                        Enregistrer
                      </button>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </Carte>
        <Carte titre="Nouveau prestataire">
          <form action={creerPartenaireAction} className="grid gap-3 sm:grid-cols-2">
            <Champs />
            <div className="sm:col-span-2">
              <button type="submit" className={bouton('primaire')}>
                Ajouter
              </button>
            </div>
          </form>
        </Carte>
      </div>
    </div>
  );
}
