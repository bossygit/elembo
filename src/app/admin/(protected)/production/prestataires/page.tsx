import type { Metadata } from 'next';

import { Badge, Carte, EnTete, Flash, Vide, bouton, champ, libelle } from '@/components/admin/ui';
import { fcfa } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { SUPPORTS, libelleSupport } from '@/lib/grand-format/catalogue';
import { exigerAcces } from '@/server/admin/acces';
import { listerPartenaires, type Partenaire } from '@/server/admin/production';
import { creerPartenaireAction, modifierPartenaireAction } from '../actions';

export const metadata: Metadata = { title: 'Prestataires' };
export const dynamic = 'force-dynamic';

const metres = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));

function Champs({ p, tarifs }: { p?: Partenaire; tarifs: boolean }) {
  return (
    <>
      <label className={libelle}>
        Entreprise
        <input name="nom" required minLength={2} maxLength={120} defaultValue={p?.nom} className={champ} />
      </label>
      <label className={libelle}>
        Spécialité
        <input name="specialite" required minLength={2} maxLength={120} defaultValue={p?.specialite} placeholder="Grand format, DTF, broderie…" className={champ} />
      </label>
      <label className={libelle}>
        Contact
        <input name="contact_nom" maxLength={120} defaultValue={p?.contact_nom ?? ''} placeholder="Nom de l’interlocuteur" className={champ} />
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
        Adresse
        <input name="adresse" maxLength={300} defaultValue={p?.adresse ?? ''} className={champ} />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className={libelle}>Types d’impression maîtrisés</legend>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {SUPPORTS.filter((s) => s.id !== 'AUTRE').map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="types_impression" value={s.id} defaultChecked={p?.types_impression.includes(s.id)} />
              {s.nom}
            </label>
          ))}
        </div>
      </fieldset>
      <label className={libelle}>
        Largeur max. d’impression (m)
        <input name="largeur_max_m" inputMode="decimal" defaultValue={metres(p?.largeur_max_m ?? null)} placeholder="3,2" className={champ} />
      </label>
      <label className={libelle}>
        Longueur max. (m)
        <input name="longueur_max_m" inputMode="decimal" defaultValue={metres(p?.longueur_max_m ?? null)} placeholder="50" className={champ} />
      </label>
      <label className={libelle}>
        Délai habituel (jours)
        <input type="number" name="delai_jours" min={0} max={365} defaultValue={p?.delai_jours ?? ''} className={champ} />
      </label>
      <label className={libelle}>
        Notes
        <input name="notes" maxLength={2000} defaultValue={p?.notes ?? ''} className={champ} />
      </label>
      {tarifs ? (
        <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 sm:col-span-2 sm:grid-cols-[1fr_2fr]">
          <p className="text-xs font-medium text-amber-900 sm:col-span-2">Tarifs négociés — confidentiels (admin, finance)</p>
          <label className={libelle}>
            Prix d’achat au m² (FCFA)
            <input type="number" name="tarif_prix_m2_fcfa" min={0} defaultValue={p?.tarifs.prix_m2_fcfa ?? ''} className={champ} />
          </label>
          <label className={libelle}>
            Conditions
            <input name="tarif_conditions" maxLength={2000} defaultValue={p?.tarifs.conditions ?? ''} placeholder="Œillets inclus, minimum de commande, remise volume…" className={champ} />
          </label>
        </div>
      ) : null}
    </>
  );
}

export default async function PagePrestataires({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  const staff = await exigerAcces('partenaires.gerer');
  const tarifs = peut(staff.role, 'grand_format.couts');
  const messages = await searchParams;
  const partenaires = await listerPartenaires();

  return (
    <div>
      <EnTete
        retour={{ href: '/admin/production', label: 'Atelier' }}
        surtitre="Production"
        titre="Prestataires"
        description="Sous-traitants et imprimeurs partenaires (dont grand format) affectables aux étapes de fabrication. Le client ne voit jamais leur identité ni leurs tarifs."
      />
      <Flash ok={messages.ok} erreur={messages.erreur} messages={{ cree: 'Prestataire ajouté.', modifie: 'Prestataire mis à jour.' }} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Carte titre={`${partenaires.length} prestataire(s)`}>
          {partenaires.length === 0 ? <Vide>Aucun prestataire enregistré.</Vide> : null}
          <ul className="divide-y divide-neutral-100">
            {partenaires.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {p.nom} {!p.actif ? <Badge>Inactif</Badge> : null}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {[p.specialite, p.contact_nom, p.telephone, p.email, p.delai_jours !== null ? `${p.delai_jours} j` : null].filter(Boolean).join(' · ')}
                    </p>
                    {p.adresse ? <p className="text-xs text-neutral-500">{p.adresse}</p> : null}
                    {p.types_impression.length || p.largeur_max_m ? (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {p.types_impression.map((t) => (
                          <Badge key={t} ton="info">
                            {libelleSupport(t)}
                          </Badge>
                        ))}
                        {p.largeur_max_m ? <Badge>Laize {metres(p.largeur_max_m)} m</Badge> : null}
                        {p.longueur_max_m ? <Badge>Long. {metres(p.longueur_max_m)} m</Badge> : null}
                      </p>
                    ) : null}
                    {tarifs && (p.tarifs.prix_m2_fcfa || p.tarifs.conditions) ? (
                      <p className="mt-1 text-xs text-amber-900">
                        Achat : {p.tarifs.prix_m2_fcfa ? `${fcfa(p.tarifs.prix_m2_fcfa)} / m²` : '—'}
                        {p.tarifs.conditions ? ` · ${p.tarifs.conditions}` : ''}
                      </p>
                    ) : null}
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
                    <Champs p={p} tarifs={tarifs} />
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
            <Champs tarifs={tarifs} />
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
