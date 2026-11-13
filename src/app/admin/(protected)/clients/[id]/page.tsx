import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Carte, Definitions, EnTete, Flash, Indicateur, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import { dateCourte, dateHeure, estUuid, fcfa } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import {
  TYPES_CLIENT,
  estProfessionnel,
  libelleCommande,
  libelleDevis,
  libelleFamille,
  libellePaiement,
  libelleTypeClient,
} from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { clientParId, historiqueClient, indicateursClient } from '@/server/admin/clients';
import { notesInternes } from '@/server/admin/commandes';
import { modifierCoordonneesAction, modifierFacturationAction, modifierNoteCommercialeAction } from '../actions';

export const metadata: Metadata = { title: 'Client' };
export const dynamic = 'force-dynamic';

const MESSAGES = {
  coordonnees: 'Coordonnées enregistrées.',
  facturation: 'Informations de facturation enregistrées.',
  note: 'Note enregistrée.',
};

export default async function PageClient({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const staff = await exigerAcces('clients.voir');
  const { id } = await params;
  if (!estUuid(id)) notFound();
  const messages = await searchParams;
  const client = await clientParId(id);
  if (!client) notFound();
  const [{ commandes, devis }, notes] = await Promise.all([historiqueClient(id), notesInternes('client', id)]);
  const kpi = indicateursClient(commandes);
  const pro = estProfessionnel(client.type_client);
  const modifier = peut(staff.role, 'clients.modifier');
  const facturation = peut(staff.role, 'clients.facturation');
  const marges = peut(staff.role, 'marges.voir');

  return (
    <div>
      <EnTete
        retour={{ href: '/admin/clients', label: 'Clients' }}
        surtitre={pro ? 'Client professionnel' : 'Client particulier'}
        titre={client.nom}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge ton={pro ? 'info' : 'neutre'}>{libelleTypeClient(client.type_client)}</Badge>
            <span>
              {[client.societe, client.ville].filter(Boolean).join(' · ')} · client depuis le {dateCourte(client.cree_le)}
            </span>
          </span>
        }
      />
      <Flash ok={messages.ok} erreur={messages.erreur} messages={MESSAGES} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicateur label="Montant dépensé" valeur={fcfa(kpi.montantDepense)} detail={`${kpi.nbPayees} commande(s) payée(s)`} />
        <Indicateur label="Commandes" valeur={kpi.nbCommandes} detail={kpi.derniere ? `Dernière le ${dateCourte(kpi.derniere)}` : 'Aucune'} />
        <Indicateur label="Panier moyen" valeur={fcfa(kpi.panierMoyen)} detail="Commandes payées" />
        {marges ? (
          <Indicateur label="Marge générée" valeur={fcfa(kpi.marge)} detail="Commandes payées" />
        ) : (
          <Indicateur label="Devis" valeur={devis.length} detail={`${devis.filter((d) => d.statut === 'ACCEPTE').length} accepté(s)`} />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Carte titre="Historique des commandes" description={`${commandes.length} commande(s)`}>
            {commandes.length === 0 ? (
              <Vide>Aucune commande.</Vide>
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className={tableau.table}>
                  <thead className={tableau.thead}>
                    <tr>
                      <th className={tableau.th}>Référence</th>
                      <th className={tableau.th}>Date</th>
                      <th className={tableau.th}>Statut</th>
                      <th className={tableau.th}>Paiement</th>
                      <th className={`${tableau.th} text-right`}>Montant</th>
                    </tr>
                  </thead>
                  <tbody className={tableau.tbody}>
                    {commandes.map((c) => (
                      <tr key={c.id} className={tableau.tr}>
                        <td className={tableau.td}>
                          <Link href={`/admin/commandes/${c.id}`} className="font-mono text-xs hover:underline">
                            {c.reference}
                          </Link>
                        </td>
                        <td className={`${tableau.td} whitespace-nowrap`}>{dateCourte(c.cree_le)}</td>
                        <td className={tableau.td}>
                          <Badge ton={libelleCommande(c.statut).ton}>{libelleCommande(c.statut).label}</Badge>
                        </td>
                        <td className={tableau.td}>
                          <Badge ton={libellePaiement(c.statut_paiement).ton}>{libellePaiement(c.statut_paiement).label}</Badge>
                        </td>
                        <td className={tableau.nombre}>{fcfa(c.total_fcfa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Carte>

          {peut(staff.role, 'devis.voir') ? (
            <Carte titre="Devis" description={`${devis.length} demande(s)`}>
              {devis.length === 0 ? (
                <Vide>Aucun devis.</Vide>
              ) : (
                <ul className="divide-y divide-neutral-100 text-sm">
                  {devis.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link href={`/admin/devis/${d.id}`} className="font-mono text-xs hover:underline">
                        {d.reference}
                      </Link>
                      <span className="text-neutral-600">{libelleFamille(d.famille)}</span>
                      <span className="tabular-nums">{fcfa(d.montant_propose_fcfa)}</span>
                      <Badge ton={libelleDevis(d.statut).ton}>{libelleDevis(d.statut).label}</Badge>
                      <span className="text-xs text-neutral-500">{dateCourte(d.cree_le)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Carte>
          ) : null}

          <Carte titre="Notes commerciales" id="notes" description="Internes, jamais visibles du client">
            {modifier ? (
              <form action={modifierNoteCommercialeAction} className="mb-4 space-y-2">
                <input type="hidden" name="client_id" value={client.id} />
                <input type="hidden" name="synthese" value="1" />
                <label className={libelle}>
                  Synthèse (habitudes, préférences, conditions négociées)
                  <textarea name="contenu" rows={3} maxLength={4000} defaultValue={client.notes ?? ''} className={champ} />
                </label>
                <button type="submit" className={bouton('secondaire', 'sm')}>
                  Enregistrer la synthèse
                </button>
              </form>
            ) : client.notes ? (
              <p className="mb-4 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm">{client.notes}</p>
            ) : null}
            {modifier ? (
              <form action={modifierNoteCommercialeAction} className="space-y-2 border-t border-neutral-100 pt-3">
                <input type="hidden" name="client_id" value={client.id} />
                <textarea name="contenu" rows={2} maxLength={4000} required placeholder="Compte rendu d’appel, relance…" aria-label="Nouvelle note datée" className={champ} />
                <button type="submit" className={bouton('secondaire', 'sm')}>
                  Ajouter une note datée
                </button>
              </form>
            ) : null}
            <ul className="mt-4 space-y-3 text-sm">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-neutral-50 px-3 py-2">
                  <p className="whitespace-pre-wrap break-words">{n.contenu}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {n.auteur_email ?? 'personnel'} · {dateHeure(n.cree_le)}
                  </p>
                </li>
              ))}
            </ul>
          </Carte>
        </div>

        <aside className="min-w-0 space-y-6">
          <Carte titre="Coordonnées" id="coordonnees">
            {modifier ? (
              <form action={modifierCoordonneesAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="client_id" value={client.id} />
                <label className={libelle}>
                  Nom
                  <input name="nom" required minLength={2} maxLength={160} defaultValue={client.nom} className={champ} />
                </label>
                <label className={libelle}>
                  Type de client
                  <select name="type_client" defaultValue={client.type_client} className={champ}>
                    {TYPES_CLIENT.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label} — {t.professionnel ? 'professionnel' : 'particulier'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={libelle}>
                  Société
                  <input name="societe" maxLength={160} defaultValue={client.societe ?? ''} className={champ} />
                </label>
                <label className={libelle}>
                  Téléphone
                  <input name="telephone" required minLength={6} maxLength={32} defaultValue={client.telephone} className={champ} />
                </label>
                <label className={libelle}>
                  Email
                  <input type="email" name="email" maxLength={254} defaultValue={client.email ?? ''} className={champ} />
                </label>
                <label className={libelle}>
                  Ville
                  <input name="ville" maxLength={120} defaultValue={client.ville ?? ''} className={champ} />
                </label>
                <label className={`${libelle} sm:col-span-2`}>
                  Adresse
                  <input name="adresse" maxLength={300} defaultValue={client.adresse ?? ''} className={champ} />
                </label>
                <div className="sm:col-span-2">
                  <button type="submit" className={bouton('primaire', 'sm')}>
                    Enregistrer
                  </button>
                </div>
              </form>
            ) : (
              <Definitions
                elements={[
                  ['Téléphone', client.telephone],
                  ['Email', client.email],
                  ['Société', client.societe],
                  ['Ville', client.ville],
                  ['Adresse', client.adresse],
                ]}
              />
            )}
          </Carte>

          <Carte
            titre="Facturation"
            id="facturation"
            description={pro ? 'Mentions à reporter sur les factures' : 'Facultatif pour un particulier'}
          >
            {facturation ? (
              <form action={modifierFacturationAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="client_id" value={client.id} />
                <label className={`${libelle} sm:col-span-2`}>
                  Raison sociale
                  <input name="facturation_raison_sociale" maxLength={160} defaultValue={client.facturation_raison_sociale ?? client.societe ?? ''} className={champ} />
                </label>
                <label className={libelle}>
                  NIU (identifiant fiscal)
                  <input name="facturation_niu" maxLength={40} defaultValue={client.facturation_niu ?? ''} className={champ} />
                </label>
                <label className={libelle}>
                  RCCM
                  <input name="facturation_rccm" maxLength={60} defaultValue={client.facturation_rccm ?? ''} className={champ} />
                </label>
                <label className={`${libelle} sm:col-span-2`}>
                  Adresse de facturation
                  <input name="facturation_adresse" maxLength={300} defaultValue={client.facturation_adresse ?? ''} className={champ} />
                </label>
                <label className={libelle}>
                  Ville
                  <input name="facturation_ville" maxLength={120} defaultValue={client.facturation_ville ?? ''} className={champ} />
                </label>
                <label className={libelle}>
                  Email de facturation
                  <input type="email" name="facturation_email" maxLength={254} defaultValue={client.facturation_email ?? ''} className={champ} />
                </label>
                <div className="sm:col-span-2">
                  <button type="submit" className={bouton('primaire', 'sm')}>
                    Enregistrer
                  </button>
                </div>
              </form>
            ) : (
              <Definitions
                elements={[
                  ['Raison sociale', client.facturation_raison_sociale],
                  ['NIU', client.facturation_niu],
                  ['RCCM', client.facturation_rccm],
                  ['Adresse', [client.facturation_adresse, client.facturation_ville].filter(Boolean).join(', ')],
                  ['Email', client.facturation_email],
                ]}
              />
            )}
          </Carte>
        </aside>
      </div>
    </div>
  );
}
