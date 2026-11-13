import type { Metadata } from 'next';

import { Badge, Carte, EnTete, Flash, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import { peut } from '@/lib/admin/permissions';
import { FAMILLES, libelleFamille } from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { listerCategories, type Categorie } from '@/server/admin/produits';
import { enregistrerCategorieAction } from '../actions';

export const metadata: Metadata = { title: 'Catégories' };
export const dynamic = 'force-dynamic';

function Champs({ c }: { c?: Categorie }) {
  return (
    <>
      <label className={libelle}>
        Nom
        <input name="nom" required minLength={2} maxLength={80} defaultValue={c?.nom} className={champ} />
      </label>
      <label className={libelle}>
        Famille
        <select name="famille" defaultValue={c?.famille ?? 'TEXTILE'} className={champ}>
          {FAMILLES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label className={libelle}>
        Ordre d’affichage
        <input name="ordre" type="number" min={0} defaultValue={c?.ordre ?? 0} className={champ} />
      </label>
      <label className={libelle}>
        Description
        <input name="description" maxLength={500} defaultValue={c?.description ?? ''} className={champ} />
      </label>
    </>
  );
}

export default async function PageCategories({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  const staff = await exigerAcces('produits.voir');
  const messages = await searchParams;
  const categories = await listerCategories();
  const modifier = peut(staff.role, 'produits.modifier');

  return (
    <div>
      <EnTete
        retour={{ href: '/admin/produits', label: 'Produits' }}
        surtitre="Catalogue"
        titre="Catégories"
        description="Rayons commerciaux. Ils servent aussi aux « ventes par catégorie » du tableau de bord."
      />
      <Flash ok={messages.ok} erreur={messages.erreur} messages={{ cree: 'Catégorie créée.', modifie: 'Catégorie mise à jour.' }} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className={tableau.conteneur}>
          <table className={tableau.table}>
            <thead className={tableau.thead}>
              <tr>
                <th className={tableau.th}>Catégorie</th>
                <th className={tableau.th}>Famille</th>
                <th className={`${tableau.th} text-right`}>Produits</th>
                <th className={tableau.th}>État</th>
              </tr>
            </thead>
            <tbody className={tableau.tbody}>
              {categories.map((c) => (
                <tr key={c.id} className={!c.actif ? 'opacity-60' : undefined}>
                  <td className={tableau.td}>
                    <p className="font-medium">{c.nom}</p>
                    <p className="font-mono text-[11px] text-neutral-500">{c.id}</p>
                    {modifier ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-neutral-500">Modifier</summary>
                        <form action={enregistrerCategorieAction} className="mt-2 grid min-w-[20rem] gap-2 sm:grid-cols-2">
                          <input type="hidden" name="id" value={c.id} />
                          <Champs c={c} />
                          <button type="submit" className={`${bouton('primaire', 'sm')} sm:col-span-2`}>
                            Enregistrer
                          </button>
                        </form>
                      </details>
                    ) : null}
                  </td>
                  <td className={tableau.td}>{libelleFamille(c.famille)}</td>
                  <td className={tableau.nombre}>{c.nb_produits}</td>
                  <td className={tableau.td}>
                    {modifier ? (
                      <form action={enregistrerCategorieAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="actif" value={String(!c.actif)} />
                        <button type="submit" className={bouton('discret')}>
                          {c.actif ? 'Désactiver' : 'Réactiver'}
                        </button>
                      </form>
                    ) : (
                      <Badge ton={c.actif ? 'succes' : 'neutre'}>{c.actif ? 'Active' : 'Inactive'}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {categories.length === 0 ? <Vide>Aucune catégorie.</Vide> : null}
        </div>
        {modifier ? (
          <Carte titre="Nouvelle catégorie">
            <form action={enregistrerCategorieAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="nouvelle" value="1" />
              <label className={libelle}>
                Identifiant
                <input name="id" required pattern="[a-z0-9][a-z0-9_\-]{1,63}" placeholder="polos" className={champ} />
              </label>
              <Champs />
              <div className="sm:col-span-2">
                <button type="submit" className={bouton('primaire')}>
                  Créer
                </button>
              </div>
            </form>
          </Carte>
        ) : null}
      </div>
    </div>
  );
}
