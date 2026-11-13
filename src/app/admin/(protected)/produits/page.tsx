import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, Carte, EnTete, Flash, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import { fcfa, pourcentage, tauxMarge } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { FAMILLES, libelleFamille } from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { listerCategories, listerProduits } from '@/server/admin/produits';
import { basculerProduitAction, creerProduitAction } from './actions';

export const metadata: Metadata = { title: 'Produits' };
export const dynamic = 'force-dynamic';

const TON_PRIX = { VALIDE: 'succes', PROVISOIRE: 'attente', TEST: 'neutre' } as const;
const LIBELLE_PRIX = { VALIDE: 'Validé', PROVISOIRE: 'Provisoire', TEST: 'Test' } as const;

export default async function PageProduits({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string; etat?: string; ok?: string; erreur?: string }>;
}) {
  const staff = await exigerAcces('produits.voir');
  const params = await searchParams;
  const etat = ['actifs', 'inactifs', 'indisponibles'].includes(params.etat ?? '') ? (params.etat as 'actifs') : null;
  const [produits, categories] = await Promise.all([
    listerProduits({ texte: params.q, categorie: params.categorie || null, etat }),
    listerCategories(),
  ]);
  const nomsCategories = new Map(categories.map((c) => [c.id, c.nom]));
  const modifier = peut(staff.role, 'produits.modifier');
  const prix = peut(staff.role, 'produits.prix');
  const marges = peut(staff.role, 'marges.voir');

  return (
    <div>
      <EnTete
        surtitre="Catalogue"
        titre="Produits"
        description="Un produit n’est vendable en ligne que s’il est actif, disponible et que son prix est validé."
        actions={
          <Link href="/admin/produits/categories" className={bouton('secondaire', 'sm')}>
            Catégories
          </Link>
        }
      />
      <Flash ok={params.ok} erreur={params.erreur} messages={{ actif: 'Activation mise à jour.', disponible: 'Disponibilité mise à jour.' }} />

      <form className="mb-4 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-[2fr_1fr_1fr_auto]" role="search">
        <label className={libelle}>
          Recherche
          <input type="search" name="q" defaultValue={params.q} placeholder="Nom ou identifiant" className={champ} />
        </label>
        <label className={libelle}>
          Catégorie
          <select name="categorie" defaultValue={params.categorie ?? ''} className={champ}>
            <option value="">Toutes</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
        <label className={libelle}>
          État
          <select name="etat" defaultValue={etat ?? ''} className={champ}>
            <option value="">Tous</option>
            <option value="actifs">Actifs</option>
            <option value="inactifs">Désactivés</option>
            <option value="indisponibles">Indisponibles</option>
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className={bouton('primaire')}>
            Filtrer
          </button>
        </div>
      </form>

      <div className={tableau.conteneur}>
        <table className={tableau.table}>
          <thead className={tableau.thead}>
            <tr>
              <th className={tableau.th}>Produit</th>
              <th className={tableau.th}>Catégorie</th>
              <th className={`${tableau.th} text-right`}>Prix</th>
              {marges ? <th className={`${tableau.th} text-right`}>Coût · marge</th> : null}
              <th className={tableau.th}>Délai</th>
              <th className={`${tableau.th} text-right`}>Stock</th>
              <th className={tableau.th}>Actif</th>
              <th className={tableau.th}>Disponible</th>
            </tr>
          </thead>
          <tbody className={tableau.tbody}>
            {produits.map((p) => {
              const marge = p.prix_fcfa !== null && p.cout_fcfa !== null ? p.prix_fcfa - p.cout_fcfa : null;
              return (
                <tr key={p.id} className={`${tableau.tr} ${!p.actif ? 'opacity-60' : ''}`}>
                  <td className={tableau.td}>
                    <Link href={`/admin/produits/${p.id}`} className="flex items-center gap-3 hover:underline">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" className="h-10 w-10 shrink-0 rounded-md border border-neutral-200 object-cover" />
                      ) : (
                        <span className="h-10 w-10 shrink-0 rounded-md border border-dashed border-neutral-300 bg-neutral-50" aria-hidden="true" />
                      )}
                      <span>
                        <span className="block font-medium">{p.nom}</span>
                        <span className="block font-mono text-[11px] text-neutral-500">{p.id}</span>
                      </span>
                    </Link>
                  </td>
                  <td className={tableau.td}>
                    {p.categorie_id ? nomsCategories.get(p.categorie_id) ?? p.categorie_id : <span className="text-neutral-400">—</span>}
                    <span className="block text-[11px] text-neutral-500">{libelleFamille(p.famille)}</span>
                  </td>
                  <td className={tableau.nombre}>
                    {fcfa(p.prix_fcfa)}
                    <span className="mt-0.5 block">
                      <Badge ton={TON_PRIX[p.statut_prix]}>{LIBELLE_PRIX[p.statut_prix]}</Badge>
                    </span>
                  </td>
                  {marges ? (
                    <td className={tableau.nombre}>
                      {fcfa(p.cout_fcfa)}
                      <span className="block text-[11px] text-neutral-500">
                        {marge !== null ? pourcentage(tauxMarge(marge, p.prix_fcfa ?? 0), 0) : '—'}
                      </span>
                    </td>
                  ) : null}
                  <td className={tableau.td}>{p.delai_jours !== null ? `${p.delai_jours} j` : '—'}</td>
                  <td className={tableau.nombre}>
                    {p.nb_variantes ? p.stock_total : '—'}
                    {p.alertes ? (
                      <span className="mt-0.5 block">
                        <Badge ton="alerte">{p.alertes} alerte(s)</Badge>
                      </span>
                    ) : null}
                  </td>
                  {(['actif', 'disponible'] as const).map((champ) => (
                    <td key={champ} className={tableau.td}>
                      {modifier ? (
                        <form action={basculerProduitAction}>
                          <input type="hidden" name="produit_id" value={p.id} />
                          <input type="hidden" name="champ" value={champ} />
                          <input type="hidden" name="valeur" value={String(!p[champ])} />
                          <button
                            type="submit"
                            aria-label={`${p[champ] ? 'Désactiver' : 'Activer'} « ${champ} » pour ${p.nom}`}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${p[champ] ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-neutral-100 text-neutral-600 ring-neutral-200'}`}
                          >
                            {p[champ] ? 'Oui' : 'Non'}
                          </button>
                        </form>
                      ) : p[champ] ? (
                        'Oui'
                      ) : (
                        'Non'
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {produits.length === 0 ? <Vide>Aucun produit.</Vide> : null}
      </div>

      {modifier ? (
        <Carte titre="Nouveau produit" className="mt-6" description="Le produit est créé actif mais indisponible : complétez variantes, images et prix avant de l’ouvrir à la vente.">
          <form action={creerProduitAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={libelle}>
              Identifiant (slug)
              <input name="id" required pattern="[a-z0-9][a-z0-9_\-]{2,63}" placeholder="polo-pique" className={champ} />
            </label>
            <label className={libelle}>
              Nom
              <input name="nom" required minLength={2} maxLength={160} className={champ} />
            </label>
            <label className={libelle}>
              Famille
              <select name="famille" required className={champ}>
                {FAMILLES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={libelle}>
              Catégorie
              <select name="categorie_id" className={champ}>
                <option value="">—</option>
                {categories.filter((c) => c.actif).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${libelle} sm:col-span-2`}>
              Description
              <input name="description" maxLength={2000} className={champ} />
            </label>
            <label className={libelle}>
              Délai de production (jours)
              <input name="delai_jours" type="number" min={0} max={365} className={champ} />
            </label>
            <label className={libelle}>
              Quantité minimale
              <input name="quantite_min" type="number" min={1} defaultValue={1} className={champ} />
            </label>
            {prix ? (
              <>
                <label className={libelle}>
                  Statut du prix
                  <select name="statut_prix" defaultValue="PROVISOIRE" className={champ}>
                    <option value="PROVISOIRE">Provisoire</option>
                    <option value="TEST">Test</option>
                    <option value="VALIDE">Validé</option>
                  </select>
                </label>
                <label className={libelle}>
                  Prix de vente (FCFA)
                  <input name="prix_fcfa" type="number" min={0} className={champ} />
                </label>
                <label className={libelle}>
                  Coût de production (FCFA)
                  <input name="cout_fcfa" type="number" min={0} className={champ} />
                </label>
              </>
            ) : (
              <p className="self-end text-xs text-neutral-500 sm:col-span-2">Prix et coût seront fixés par l’administration ou la finance.</p>
            )}
            <div className="flex items-end">
              <button type="submit" className={bouton('primaire')}>
                Créer le produit
              </button>
            </div>
          </form>
        </Carte>
      ) : null}
    </div>
  );
}
