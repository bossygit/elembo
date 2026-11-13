import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Badge, Carte, Confirmation, EnTete, Flash, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import { dateHeure, fcfa, pourcentage, tauxMarge } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { FAMILLES } from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { historiqueAudit } from '@/server/admin/audit';
import {
  ID_PRODUIT,
  imagesDuProduit,
  listerCategories,
  mouvementsDuProduit,
  produitParId,
  variantesDuProduit,
  type Variante,
} from '@/server/admin/produits';
import {
  ajouterImageAction,
  ajouterVarianteAction,
  basculerProduitAction,
  gererImageAction,
  modifierProduitAction,
  modifierVarianteAction,
  mouvementStockAction,
} from '../actions';

export const metadata: Metadata = { title: 'Produit' };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  cree: 'Produit créé. Ajoutez ses variantes et ses images.',
  modifie: 'Produit enregistré.',
  variante: 'Variante enregistrée.',
  stock: 'Mouvement de stock enregistré.',
  image: 'Images mises à jour.',
  actif: 'Activation mise à jour.',
  disponible: 'Disponibilité mise à jour.',
};

const ACTIONS: Record<string, string> = {
  PRODUIT_CREE: 'Produit créé',
  PRODUIT_MODIFIE: 'Produit modifié',
  VARIANTE_CREEE: 'Variante ajoutée',
  VARIANTE_MODIFIEE: 'Variante modifiée',
  STOCK_MOUVEMENT: 'Mouvement de stock',
  IMAGE_AJOUTEE: 'Image ajoutée',
  IMAGE_SUPPRIMEE: 'Image supprimée',
  IMAGE_PRINCIPALE: 'Image principale changée',
};

const MOUVEMENTS = { ENTREE: 'Entrée', SORTIE: 'Sortie', AJUSTEMENT: 'Inventaire', PERTE: 'Perte' } as const;

function libelleVariante(v: Pick<Variante, 'taille' | 'couleur'>): string {
  return [v.taille, v.couleur].filter(Boolean).join(' / ') || 'Unique';
}

function ChampsVariante({ v, prix, produitId }: { v?: Variante; prix: boolean; produitId: string }) {
  return (
    <>
      <input type="hidden" name="produit_id" value={produitId} />
      <label className={libelle}>
        Taille
        <input name="taille" maxLength={20} defaultValue={v?.taille ?? ''} placeholder="M, XL, 40x60…" className={champ} />
      </label>
      <label className={libelle}>
        Couleur
        <input name="couleur" maxLength={40} defaultValue={v?.couleur ?? ''} placeholder="Noir" className={champ} />
      </label>
      <label className={libelle}>
        SKU
        <input name="sku" maxLength={64} defaultValue={v?.sku ?? ''} className={champ} />
      </label>
      <label className={libelle}>
        Seuil d’alerte
        <input name="seuil_alerte" type="number" min={0} defaultValue={v?.seuil_alerte ?? 0} className={champ} />
      </label>
      {prix ? (
        <>
          <label className={libelle}>
            Prix spécifique (FCFA)
            <input name="prix_fcfa" type="number" min={0} defaultValue={v?.prix_fcfa ?? ''} placeholder="= produit" className={champ} />
          </label>
          <label className={libelle}>
            Coût spécifique (FCFA)
            <input name="cout_fcfa" type="number" min={0} defaultValue={v?.cout_fcfa ?? ''} placeholder="= produit" className={champ} />
          </label>
        </>
      ) : null}
    </>
  );
}

export default async function PageProduit({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const staff = await exigerAcces('produits.voir');
  const { id } = await params;
  if (!ID_PRODUIT.test(id)) notFound();
  const messages = await searchParams;
  const produit = await produitParId(id);
  if (!produit) notFound();
  const [variantes, images, categories, mouvements, historique] = await Promise.all([
    variantesDuProduit(id),
    imagesDuProduit(id),
    listerCategories(),
    mouvementsDuProduit(id),
    historiqueAudit('produit', id, 30),
  ]);

  const modifier = peut(staff.role, 'produits.modifier');
  const prix = peut(staff.role, 'produits.prix');
  const marges = peut(staff.role, 'marges.voir');
  const stock = peut(staff.role, 'stock.ajuster');
  const nomsVariantes = new Map(variantes.map((v) => [v.id, libelleVariante(v)]));
  const marge = produit.prix_fcfa !== null && produit.cout_fcfa !== null ? produit.prix_fcfa - produit.cout_fcfa : null;
  const vendable = produit.actif && produit.disponible && produit.statut_prix === 'VALIDE';

  return (
    <div>
      <EnTete
        retour={{ href: '/admin/produits', label: 'Produits' }}
        surtitre={produit.id}
        titre={produit.nom}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge ton={vendable ? 'succes' : 'neutre'}>{vendable ? 'Vendable en ligne' : 'Non vendable en ligne'}</Badge>
            <Badge ton={produit.statut_prix === 'VALIDE' ? 'succes' : 'attente'}>Prix {produit.statut_prix.toLowerCase()}</Badge>
            {produit.prix_valide_par_email ? (
              <span className="text-xs text-neutral-500">
                validé par {produit.prix_valide_par_email} le {dateHeure(produit.prix_valide_le)}
              </span>
            ) : null}
          </span>
        }
        actions={
          modifier ? (
            <>
              {(['actif', 'disponible'] as const).map((champNom) => (
                <form key={champNom} action={basculerProduitAction}>
                  <input type="hidden" name="produit_id" value={produit.id} />
                  <input type="hidden" name="champ" value={champNom} />
                  <input type="hidden" name="valeur" value={String(!produit[champNom])} />
                  <input type="hidden" name="retour" value="fiche" />
                  <button type="submit" className={bouton(produit[champNom] ? 'secondaire' : 'succes', 'sm')}>
                    {champNom === 'actif'
                      ? produit.actif
                        ? 'Désactiver'
                        : 'Activer'
                      : produit.disponible
                        ? 'Rendre indisponible'
                        : 'Rendre disponible'}
                  </button>
                </form>
              ))}
            </>
          ) : null
        }
      />
      <Flash ok={messages.ok} erreur={messages.erreur} messages={MESSAGES} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Carte titre="Informations, prix et délais" id="informations">
            <form action={modifierProduitAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="produit_id" value={produit.id} />
              <fieldset disabled={!modifier} className="contents">
                <label className={libelle}>
                  Nom
                  <input name="nom" required minLength={2} maxLength={160} defaultValue={produit.nom} className={champ} />
                </label>
                <label className={libelle}>
                  Famille
                  <select name="famille" defaultValue={produit.famille} className={champ}>
                    {FAMILLES.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={libelle}>
                  Catégorie
                  <select name="categorie_id" defaultValue={produit.categorie_id ?? ''} className={champ}>
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                        {!c.actif ? ' (inactive)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={libelle}>
                  Technique
                  <input name="technique" maxLength={200} defaultValue={produit.technique ?? ''} placeholder="DTF, sublimation, broderie…" className={champ} />
                </label>
                <label className={`${libelle} sm:col-span-2`}>
                  Description
                  <textarea name="description" rows={3} maxLength={2000} defaultValue={produit.description ?? ''} className={champ} />
                </label>
                <label className={libelle}>
                  Délai de production (jours)
                  <input name="delai_jours" type="number" min={0} max={365} defaultValue={produit.delai_jours ?? ''} className={champ} />
                </label>
                <label className={libelle}>
                  Quantité minimale
                  <input name="quantite_min" type="number" min={1} defaultValue={produit.quantite_min} className={champ} />
                </label>
              </fieldset>
              <fieldset disabled={!modifier || !prix} className="grid gap-3 rounded-lg border border-neutral-200 p-3 sm:col-span-2 sm:grid-cols-3">
                <legend className="px-1 text-xs font-medium text-neutral-600">
                  Prix et coût {!prix ? '— modifiables par l’administration ou la finance' : ''}
                </legend>
                <label className={libelle}>
                  Statut du prix
                  <select name="statut_prix" defaultValue={produit.statut_prix} className={champ}>
                    <option value="PROVISOIRE">Provisoire</option>
                    <option value="TEST">Test</option>
                    <option value="VALIDE">Validé (facturable)</option>
                  </select>
                </label>
                <label className={libelle}>
                  Prix de vente (FCFA)
                  <input name="prix_fcfa" type="number" min={0} defaultValue={produit.prix_fcfa ?? ''} className={champ} />
                </label>
                {marges ? (
                  <label className={libelle}>
                    Coût de production (FCFA)
                    <input name="cout_fcfa" type="number" min={0} defaultValue={produit.cout_fcfa ?? ''} className={champ} />
                  </label>
                ) : (
                  <input type="hidden" name="cout_fcfa" value={produit.cout_fcfa ?? ''} />
                )}
                {marges ? (
                  <p className="text-xs text-neutral-500 sm:col-span-3">
                    Marge unitaire : {marge !== null ? `${fcfa(marge)} (${pourcentage(tauxMarge(marge, produit.prix_fcfa ?? 0))})` : 'renseignez prix et coût'}.
                    Le coût est figé sur chaque commande au moment de sa création.
                  </p>
                ) : null}
              </fieldset>
              {modifier ? (
                <div className="sm:col-span-2">
                  <button type="submit" className={bouton('primaire')}>
                    Enregistrer
                  </button>
                </div>
              ) : null}
            </form>
          </Carte>

          <Carte titre="Variantes" id="variantes" description="Tailles, couleurs et stock. Un seuil d’alerte à 0 signifie « stock non suivi » (production à la demande).">
            <div className="-mx-5 overflow-x-auto">
              <table className={tableau.table}>
                <thead className={tableau.thead}>
                  <tr>
                    <th className={tableau.th}>Taille / couleur</th>
                    <th className={tableau.th}>SKU</th>
                    <th className={`${tableau.th} text-right`}>Stock</th>
                    <th className={`${tableau.th} text-right`}>Seuil</th>
                    <th className={`${tableau.th} text-right`}>Prix</th>
                    {marges ? <th className={`${tableau.th} text-right`}>Coût</th> : null}
                    <th className={tableau.th}>État</th>
                  </tr>
                </thead>
                <tbody className={tableau.tbody}>
                  {variantes.map((v) => {
                    const alerte = v.seuil_alerte > 0 && v.stock <= v.seuil_alerte;
                    return (
                      <tr key={v.id} className={!v.actif ? 'opacity-60' : undefined}>
                        <td className={tableau.td}>
                          <p className="font-medium">{libelleVariante(v)}</p>
                          {modifier ? (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-xs text-neutral-500">Modifier</summary>
                              <form action={modifierVarianteAction} className="mt-2 grid min-w-[22rem] gap-2 sm:grid-cols-2">
                                <input type="hidden" name="variante_id" value={v.id} />
                                <ChampsVariante v={v} prix={prix} produitId={produit.id} />
                                <button type="submit" className={`${bouton('primaire', 'sm')} sm:col-span-2`}>
                                  Enregistrer
                                </button>
                              </form>
                            </details>
                          ) : null}
                        </td>
                        <td className={`${tableau.td} font-mono text-xs`}>{v.sku ?? '—'}</td>
                        <td className={`${tableau.nombre} ${alerte ? 'font-semibold text-orange-action' : ''}`}>{v.stock}</td>
                        <td className={tableau.nombre}>{v.seuil_alerte || '—'}</td>
                        <td className={tableau.nombre}>{v.prix_fcfa !== null ? fcfa(v.prix_fcfa) : <span className="text-neutral-400">= produit</span>}</td>
                        {marges ? (
                          <td className={tableau.nombre}>{v.cout_fcfa !== null ? fcfa(v.cout_fcfa) : <span className="text-neutral-400">= produit</span>}</td>
                        ) : null}
                        <td className={tableau.td}>
                          {modifier ? (
                            <form action={modifierVarianteAction}>
                              <input type="hidden" name="produit_id" value={produit.id} />
                              <input type="hidden" name="variante_id" value={v.id} />
                              <input type="hidden" name="actif" value={String(!v.actif)} />
                              <button type="submit" className={bouton('discret')}>
                                {v.actif ? 'Désactiver' : 'Réactiver'}
                              </button>
                            </form>
                          ) : v.actif ? (
                            'Active'
                          ) : (
                            'Inactive'
                          )}
                          {alerte ? <span className="mt-1 block"><Badge ton={v.stock === 0 ? 'danger' : 'alerte'}>{v.stock === 0 ? 'Rupture' : 'Stock bas'}</Badge></span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {variantes.length === 0 ? <Vide>Aucune variante.</Vide> : null}
            </div>
            {modifier ? (
              <details className="mt-4 border-t border-neutral-100 pt-3">
                <summary className="cursor-pointer text-sm font-medium">Ajouter une variante</summary>
                <form action={ajouterVarianteAction} className="mt-3 grid gap-3 sm:grid-cols-3">
                  <ChampsVariante prix={prix} produitId={produit.id} />
                  <div className="flex items-end">
                    <button type="submit" className={bouton('primaire')}>
                      Ajouter
                    </button>
                  </div>
                </form>
              </details>
            ) : null}
          </Carte>

          <Carte titre="Stock" id="stock" description="Chaque mouvement est tracé ; le stock ne peut pas devenir négatif.">
            {stock && variantes.length > 0 ? (
              <form action={mouvementStockAction} className="mb-4 grid gap-3 sm:grid-cols-[1.4fr_1fr_0.8fr_1.4fr_auto]">
                <input type="hidden" name="produit_id" value={produit.id} />
                <label className={libelle}>
                  Variante
                  <select name="variante_id" required className={champ}>
                    {variantes.filter((v) => v.actif).map((v) => (
                      <option key={v.id} value={v.id}>
                        {libelleVariante(v)} (stock {v.stock})
                      </option>
                    ))}
                  </select>
                </label>
                <label className={libelle}>
                  Mouvement
                  <select name="type" className={champ}>
                    <option value="ENTREE">Entrée (réception)</option>
                    <option value="SORTIE">Sortie</option>
                    <option value="PERTE">Perte / défaut</option>
                    <option value="AJUSTEMENT">Inventaire (fixe le stock)</option>
                  </select>
                </label>
                <label className={libelle}>
                  Quantité
                  <input name="quantite" type="number" min={0} required className={champ} />
                </label>
                <label className={libelle}>
                  Motif
                  <input name="motif" maxLength={200} placeholder="Bon de livraison, commande…" className={champ} />
                </label>
                <div className="flex items-end">
                  <button type="submit" className={bouton('primaire')}>
                    Enregistrer
                  </button>
                </div>
              </form>
            ) : null}
            {mouvements.length === 0 ? (
              <Vide>Aucun mouvement de stock.</Vide>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {mouvements.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{MOUVEMENTS[m.type]}</span>
                      <span className="text-neutral-500"> · {m.variante_id ? nomsVariantes.get(m.variante_id) ?? 'variante' : '—'}</span>
                      {m.motif ? <span className="text-neutral-500"> · {m.motif}</span> : null}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className={`tabular-nums font-medium ${m.quantite < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {m.quantite > 0 ? '+' : ''}
                        {m.quantite}
                      </span>
                      <span className="text-xs text-neutral-500">{dateHeure(m.cree_le)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Carte>
        </div>

        <aside className="min-w-0 space-y-6">
          <Carte titre="Images" id="images" description="PNG, JPEG ou WebP · 4 Mo maximum · contenu vérifié">
            {images.length === 0 ? <Vide>Aucune image.</Vide> : null}
            <ul className="grid grid-cols-2 gap-3">
              {images.map((img) => (
                <li key={img.id} className="rounded-lg border border-neutral-200 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.texte_alternatif ?? produit.nom} className="aspect-square w-full rounded-md bg-neutral-50 object-contain" />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                    {img.principale ? <Badge ton="succes">Principale</Badge> : null}
                    {modifier && !img.principale ? (
                      <form action={gererImageAction}>
                        <input type="hidden" name="produit_id" value={produit.id} />
                        <input type="hidden" name="image_id" value={img.id} />
                        <input type="hidden" name="operation" value="principale" />
                        <button type="submit" className={bouton('discret')}>
                          Principale
                        </button>
                      </form>
                    ) : null}
                    {modifier ? (
                      <Confirmation resume={<span className="text-xs text-red-700 underline">Supprimer</span>}>
                        <form action={gererImageAction}>
                          <input type="hidden" name="produit_id" value={produit.id} />
                          <input type="hidden" name="image_id" value={img.id} />
                          <input type="hidden" name="operation" value="supprimer" />
                          <button type="submit" className={bouton('danger', 'sm')}>
                            Confirmer la suppression
                          </button>
                        </form>
                      </Confirmation>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {modifier ? (
              <form action={ajouterImageAction} className="mt-4 space-y-2 border-t border-neutral-100 pt-3">
                <input type="hidden" name="produit_id" value={produit.id} />
                <label className={libelle}>
                  Image
                  <input type="file" name="image" required accept="image/png,image/jpeg,image/webp" className={`${champ} file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-2 file:py-1 file:text-xs`} />
                </label>
                <label className={libelle}>
                  Texte alternatif
                  <input name="texte_alternatif" maxLength={200} placeholder="T-shirt noir, face avant" className={champ} />
                </label>
                <button type="submit" className={bouton('secondaire', 'sm')}>
                  Envoyer l’image
                </button>
              </form>
            ) : null}
          </Carte>

          <Carte titre="Historique des modifications">
            {historique.length === 0 ? (
              <Vide>Aucune modification enregistrée depuis le back-office.</Vide>
            ) : (
              <ol className="space-y-2.5 text-sm">
                {historique.map((h) => (
                  <li key={h.id}>
                    <p className="font-medium">{ACTIONS[h.action] ?? h.action}</p>
                    <p className="text-xs text-neutral-500">
                      {h.acteur_email ?? 'personnel'} · {dateHeure(h.cree_le)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Carte>
        </aside>
      </div>
    </div>
  );
}
