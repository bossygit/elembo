import type { Metadata } from 'next';

import { Badge, Carte, EnTete, Flash, bouton, champ, libelle } from '@/components/admin/ui';
import { fcfa } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { statutVersBase, type TarifsLivraison } from '@/lib/tarifs/tarifs';
import { exigerAcces } from '@/server/admin/acces';
import { lireLivraison } from '@/server/admin/livraison';
import { enregistrerLivraisonAction } from './actions';

export const metadata: Metadata = { title: 'Livraison' };
export const dynamic = 'force-dynamic';

const LIBELLE = { valide: 'Validés', provisoire: 'Provisoires', test: 'Test' } as const;

export default async function PageLivraison({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  const staff = await exigerAcces('produits.voir');
  const messages = await searchParams;
  const modifier = peut(staff.role, 'produits.prix');

  let livraison: TarifsLivraison | null = null;
  let probleme: string | null = null;
  try {
    livraison = await lireLivraison();
  } catch (erreur) {
    probleme = (erreur as Error).message;
  }

  return (
    <div>
      <EnTete
        retour={{ href: '/admin/produits', label: 'Produits' }}
        surtitre="Catalogue"
        titre="Frais de livraison"
        description="Frais ajoutés à chaque commande selon la ville. Ils s’appliquent dès l’enregistrement au site et au paiement MoMo, sans redéploiement."
      />
      <Flash ok={messages.ok} erreur={messages.erreur ?? probleme ?? undefined} messages={{ modifie: 'Frais de livraison enregistrés.' }} />

      {livraison ? (
        <Carte
          titre="Villes desservies"
          description={
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge ton={livraison.statutPrix === 'valide' ? 'succes' : 'attente'}>Frais {LIBELLE[livraison.statutPrix].toLowerCase()}</Badge>
              <span className="text-xs text-neutral-500">Délai maximal annoncé : {livraison.delaiMaxJours} jour(s).</span>
            </span>
          }
        >
          <form action={enregistrerLivraisonAction} className="grid gap-4 p-5 sm:grid-cols-2">
            <fieldset disabled={!modifier} className="contents">
              {livraison.villes.map((v) => (
                <label key={v.id} className={libelle}>
                  {v.nom} — frais (FCFA)
                  <input
                    name={`frais_${v.id}`}
                    type="number"
                    min={0}
                    max={1000000}
                    defaultValue={v.fraisFcfa ?? ''}
                    placeholder="à confirmer"
                    className={champ}
                  />
                  <span className="mt-1 block text-[11px] font-normal text-neutral-500">
                    Actuellement : {v.fraisFcfa === null ? 'à confirmer (commande bloquée pour cette ville)' : fcfa(v.fraisFcfa)}
                  </span>
                </label>
              ))}
              <label className={libelle}>
                Délai maximal annoncé (jours)
                <input
                  name="delai_max_jours"
                  type="number"
                  min={1}
                  max={60}
                  required
                  defaultValue={livraison.delaiMaxJours}
                  className={champ}
                />
              </label>
              <label className={libelle}>
                Statut des frais
                <select name="statut_prix" defaultValue={statutVersBase(livraison.statutPrix)} className={champ}>
                  <option value="PROVISOIRE">Provisoires</option>
                  <option value="TEST">Test</option>
                  <option value="VALIDE">Validés</option>
                </select>
              </label>
              <p className="text-xs text-neutral-500 sm:col-span-2">
                Une ville sans frais (champ vide) bloque la commande pour cette ville plutôt que de livrer
                gratuitement. {modifier ? '' : 'Modification réservée à l’administration et à la finance.'}
              </p>
              {modifier ? (
                <div className="sm:col-span-2">
                  <button type="submit" className={bouton('primaire')}>
                    Enregistrer
                  </button>
                </div>
              ) : null}
            </fieldset>
          </form>
        </Carte>
      ) : null}
    </div>
  );
}
