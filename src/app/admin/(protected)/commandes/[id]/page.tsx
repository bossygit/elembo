import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Carte, Definitions, EnTete, Flash, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import { dateCourte, dateHeure, estUuid, fcfa, libelleEtape, pourcentage, taille, tauxMarge } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import {
  MODES_PAIEMENT,
  libelleCommande,
  libelleMode,
  libellePaiement,
  libelleProduction,
  transitionsPossibles,
} from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { historiqueCommande } from '@/server/admin/commandes';
import { detailCommande } from '@/server/commandes/repository';
import {
  ajouterNoteCommande,
  changerStatutCommande,
  confirmerPaiement,
  modifierCoutLigneCommande,
  modifierLivraisonCommande,
} from '../actions';

export const metadata: Metadata = { title: 'Commande' };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  statut: 'Statut mis à jour.',
  paiement: 'Paiement enregistré. La commande doit encore être lancée en production.',
  note: 'Note ajoutée.',
  livraison: 'Informations de livraison enregistrées.',
  cout: 'Coût de revient mis à jour, marge recalculée.',
  creee: 'Commande créée depuis le devis.',
  existante: 'Ce devis a déjà sa commande.',
};

const TYPES_FICHIER: Record<string, string> = {
  VISUEL_IMPRESSION: 'Visuel d’impression',
  FICHE_PRODUCTION: 'Fiche technique',
  BAT: 'BAT',
  FACTURE: 'Facture',
  SOURCE: 'Fichier source',
  AUTRE: 'Autre',
};

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.trim() ? valeur : typeof valeur === 'number' ? String(valeur) : null;
}

export default async function PageCommande({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const staff = await exigerAcces('commandes.voir');
  const { id } = await params;
  if (!estUuid(id)) notFound();
  const messages = await searchParams;
  const detail = await detailCommande(id);
  if (!detail) notFound();
  const historique = await historiqueCommande(id, (s) => libelleCommande(s).label);

  const { commande, client, lignes, fichiers, paiements, production } = detail;
  const contact = commande.contact_snapshot as Record<string, unknown>;
  const design = commande.design_snapshot as Record<string, unknown>;
  const voit = {
    coordonnees: peut(staff.role, 'clients.coordonnees'),
    marges: peut(staff.role, 'marges.voir'),
    couts: peut(staff.role, 'commandes.couts'),
    fichiers: peut(staff.role, 'production.fichiers'),
    paiement: peut(staff.role, 'commandes.paiement'),
    modifier: peut(staff.role, 'commandes.modifier'),
    client: peut(staff.role, 'clients.voir'),
    production: peut(staff.role, 'production.voir'),
    dossier: peut(staff.role, 'production.fichiers'),
  };
  const suivants = transitionsPossibles(commande.statut, staff.role).filter((s) => s !== 'PAYEE');
  const peutConfirmer = voit.paiement && commande.statut === 'EN_ATTENTE_DE_PAIEMENT';
  const statut = libelleCommande(commande.statut);
  const cout = Number(commande.cout_fcfa ?? 0);
  const marge = Number(commande.marge_fcfa ?? 0);
  const couleurCommande = texte(design.couleur);

  const jalons: [string, string | null][] = [
    ['Créée', commande.cree_le],
    ['Validée', commande.valide_le],
    ['Payée', commande.paye_le],
    ['Production démarrée', commande.production_demarree_le],
    ['Contrôle qualité', commande.controle_qualite_le],
    ['Prête', commande.prete_le],
    ['Partie en livraison', commande.livraison_demarree_le],
    ['Livrée', commande.livree_le],
    ['Annulée', commande.annulee_le],
    ['Remboursement demandé', commande.remboursement_demande_le],
  ];

  return (
    <div>
      <EnTete
        retour={{ href: '/admin/commandes', label: 'Commandes' }}
        surtitre={commande.reference}
        titre={String(contact.nom ?? client?.nom ?? 'Client')}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge ton={statut.ton}>{statut.label}</Badge>
            <Badge ton={libellePaiement(commande.statut_paiement).ton}>Paiement : {libellePaiement(commande.statut_paiement).label}</Badge>
            <Badge ton={libelleProduction(commande.statut_production).ton}>Production : {libelleProduction(commande.statut_production).label}</Badge>
            <span className="text-neutral-500">
              · {commande.devis_id ? 'sur devis' : 'commande directe'} · créée le {dateHeure(commande.cree_le)}
            </span>
          </span>
        }
        actions={
          <>
            {voit.dossier ? (
              <Link href={`/admin/production/${commande.id}`} className={bouton('secondaire', 'sm')}>
                Dossier de production
              </Link>
            ) : null}
            {commande.devis_id && peut(staff.role, 'devis.voir') ? (
              <Link href={`/admin/devis/${commande.devis_id}`} className={bouton('secondaire', 'sm')}>
                Devis d’origine
              </Link>
            ) : null}
          </>
        }
      />
      <Flash ok={messages.ok} erreur={messages.erreur} messages={MESSAGES} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Carte titre="Articles et quantités" description={`${lignes.length} ligne(s)${couleurCommande ? ` · couleur : ${couleurCommande}` : ''}`}>
            <div className="-mx-5 overflow-x-auto">
              <table className={tableau.table}>
                <thead className={tableau.thead}>
                  <tr>
                    <th className={tableau.th}>Désignation</th>
                    <th className={tableau.th}>Taille / couleur</th>
                    <th className={`${tableau.th} text-right`}>Qté</th>
                    <th className={`${tableau.th} text-right`}>Prix unit.</th>
                    <th className={`${tableau.th} text-right`}>Total</th>
                    {voit.marges ? <th className={`${tableau.th} text-right`}>Coût unit.</th> : null}
                  </tr>
                </thead>
                <tbody className={tableau.tbody}>
                  {lignes.map((l) => {
                    const o = l.options ?? {};
                    const variante = [texte(o.taille) ?? texte(o.formatId), texte(o.couleur) ?? couleurCommande, texte(o.support)]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <tr key={l.id}>
                        <td className={tableau.td}>
                          <p className="font-medium">{l.designation}</p>
                          {l.produit_id ? <p className="font-mono text-[11px] text-neutral-500">{l.produit_id}</p> : null}
                        </td>
                        <td className={tableau.td}>{variante || '—'}</td>
                        <td className={tableau.nombre}>{l.quantite}</td>
                        <td className={tableau.nombre}>{fcfa(l.prix_unitaire_fcfa)}</td>
                        <td className={`${tableau.nombre} font-medium`}>{fcfa(l.total_ligne_fcfa)}</td>
                        {voit.marges ? (
                          <td className={tableau.nombre}>
                            {voit.couts ? (
                              <form action={modifierCoutLigneCommande} className="flex items-center justify-end gap-1">
                                <input type="hidden" name="commande_id" value={commande.id} />
                                <input type="hidden" name="ligne_id" value={l.id} />
                                <input
                                  name="cout_unitaire_fcfa"
                                  type="number"
                                  min={0}
                                  step={1}
                                  defaultValue={l.cout_unitaire_fcfa}
                                  aria-label={`Coût unitaire de ${l.designation}`}
                                  className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-right text-xs"
                                />
                                <button type="submit" className={bouton('secondaire', 'sm')} aria-label="Enregistrer le coût">
                                  OK
                                </button>
                              </form>
                            ) : (
                              fcfa(l.cout_unitaire_fcfa)
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-neutral-100 pt-4 text-sm sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <dt className="text-xs text-neutral-500">Sous-total</dt>
                <dd className="mt-0.5 tabular-nums">{fcfa(commande.sous_total_fcfa)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Livraison</dt>
                <dd className="mt-0.5 tabular-nums">{fcfa(commande.livraison_fcfa)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Total</dt>
                <dd className="mt-0.5 text-base font-semibold tabular-nums">{fcfa(commande.total_fcfa)}</dd>
              </div>
              {voit.marges ? (
                <>
                  <div>
                    <dt className="text-xs text-neutral-500">Coût de revient</dt>
                    <dd className="mt-0.5 tabular-nums">{cout === 0 ? <span className="text-amber-700">non renseigné</span> : fcfa(cout)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">Marge</dt>
                    <dd className={`mt-0.5 font-semibold tabular-nums ${marge < 0 ? 'text-red-700' : ''}`}>
                      {fcfa(marge)} <span className="text-xs font-normal text-neutral-500">({pourcentage(tauxMarge(marge, commande.sous_total_fcfa), 0)})</span>
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            {voit.marges ? (
              <p className="mt-3 text-xs text-neutral-500">
                Coût = articles (coût figé à la commande) + coûts saisis sur les tâches d’atelier (sous-traitance).
              </p>
            ) : null}
          </Carte>

          <Carte
            titre="Fichiers de production"
            description="Visuels haute résolution, fiches techniques et BAT"
            action={
              voit.dossier ? (
                <Link href={`/admin/production/${commande.id}`} className={bouton('discret')}>
                  Ouvrir le dossier
                </Link>
              ) : null
            }
          >
            {fichiers.length === 0 ? (
              <Vide>Aucun fichier rattaché à cette commande.</Vide>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {fichiers.map((brut) => {
                  const f = brut as { id: string; nom: string; type_fichier: string; type_mime: string; taille_octets: number };
                  return (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{f.nom}</p>
                        <p className="text-xs text-neutral-500">
                          {TYPES_FICHIER[f.type_fichier] ?? f.type_fichier} · {f.type_mime} · {taille(Number(f.taille_octets))}
                        </p>
                      </div>
                      {voit.fichiers ? (
                        <a href={`/admin/fichiers/${f.id}`} className={bouton('secondaire', 'sm')} rel="noreferrer">
                          Télécharger
                        </a>
                      ) : (
                        <span className="text-xs text-neutral-500">Réservé à l’atelier</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Carte>

          <Carte titre="Paiement" id="paiement">
            <Definitions
              elements={[
                ['Mode', libelleMode(commande.mode_paiement)],
                ['Statut', <Badge key="p" ton={libellePaiement(commande.statut_paiement).ton}>{libellePaiement(commande.statut_paiement).label}</Badge>],
                ['Payée le', dateHeure(commande.paye_le)],
                ['Montant attendu', fcfa(commande.total_fcfa)],
              ]}
            />
            {paiements.length > 0 ? (
              <div className="-mx-5 mt-4 overflow-x-auto border-t border-neutral-100">
                <table className={tableau.table}>
                  <thead className={tableau.thead}>
                    <tr>
                      <th className={tableau.th}>Transaction</th>
                      <th className={tableau.th}>Opérateur</th>
                      <th className={tableau.th}>Statut</th>
                      <th className={`${tableau.th} text-right`}>Montant</th>
                      <th className={tableau.th}>Date</th>
                    </tr>
                  </thead>
                  <tbody className={tableau.tbody}>
                    {paiements.map((brut) => {
                      const p = brut as Record<string, unknown>;
                      return (
                        <tr key={String(p.reference_id)}>
                          <td className={`${tableau.td} font-mono text-xs`}>{texte(p.financial_tx_id) ?? '—'}</td>
                          <td className={tableau.td}>{String(p.operateur ?? '—')}</td>
                          <td className={tableau.td}>{String(p.statut ?? '—')}</td>
                          <td className={tableau.nombre}>{fcfa(Number(p.montant_fcfa))}</td>
                          <td className={`${tableau.td} whitespace-nowrap`}>{dateHeure(texte(p.cree_le))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {peutConfirmer ? (
              <form action={confirmerPaiement} className="mt-4 grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:grid-cols-[1fr_1.4fr_auto]">
                <input type="hidden" name="commande_id" value={commande.id} />
                <label className={libelle}>
                  Mode d’encaissement
                  <select name="mode_paiement" defaultValue={commande.mode_paiement === 'A_CONFIRMER' ? 'ESPECES' : commande.mode_paiement} className={champ}>
                    {MODES_PAIEMENT.filter((m) => m.id !== 'A_CONFIRMER').map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={libelle}>
                  Référence de l’encaissement
                  <input name="reference_paiement" required minLength={3} maxLength={120} placeholder="N° de transaction, de reçu…" className={champ} />
                </label>
                <div className="flex items-end">
                  <button type="submit" className={bouton('primaire')}>
                    Confirmer l’encaissement
                  </button>
                </div>
                <p className="text-xs text-amber-900/80 sm:col-span-3">
                  Enregistre un paiement réel de {fcfa(commande.total_fcfa)}. La fabrication ne démarre pas automatiquement.
                </p>
              </form>
            ) : null}
          </Carte>

          <Carte titre="Historique des modifications" description="Statuts, modifications, téléchargements et notes — du plus récent au plus ancien">
            {historique.length === 0 ? (
              <Vide>Aucun événement.</Vide>
            ) : (
              <ol className="space-y-3 border-l border-neutral-200 pl-4 text-sm">
                {historique.map((h, i) => (
                  <li key={`${h.le}-${i}`} className="relative">
                    <span
                      className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${h.type === 'statut' ? 'bg-encre' : h.type === 'note' ? 'bg-sky-500' : 'bg-neutral-300'}`}
                      aria-hidden="true"
                    />
                    <p className="font-medium">{h.titre}</p>
                    {h.detail ? <p className="mt-0.5 whitespace-pre-wrap break-words text-neutral-700">{h.detail}</p> : null}
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {dateHeure(h.le)}
                      {h.acteur ? ` · ${h.acteur}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Carte>
        </div>

        <aside className="min-w-0 space-y-6">
          <Carte titre="Faire avancer la commande">
            {suivants.length === 0 ? (
              <p className="text-sm text-neutral-500">
                {commande.statut === 'EN_ATTENTE_DE_PAIEMENT'
                  ? 'En attente du paiement. Il passera « Payée » dès la confirmation (Mobile Money ou encaissement saisi).'
                  : 'Aucune transition disponible pour votre rôle depuis ce statut.'}
              </p>
            ) : (
              <form action={changerStatutCommande} className="space-y-3">
                <input type="hidden" name="commande_id" value={commande.id} />
                <label className={libelle}>
                  Nouveau statut
                  <select name="statut" className={champ} required>
                    {suivants.map((s) => (
                      <option key={s} value={s}>
                        {libelleCommande(s).label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={libelle}>
                  Note de suivi (facultative)
                  <textarea name="note" maxLength={2000} rows={2} className={champ} />
                </label>
                <button type="submit" className={`${bouton('primaire')} w-full`}>
                  Enregistrer
                </button>
              </form>
            )}
          </Carte>

          <Carte
            titre="Client et livraison"
            id="livraison"
            action={
              voit.client && client ? (
                <Link href={`/admin/clients/${String((client as { id: string }).id)}`} className={bouton('discret')}>
                  Fiche client
                </Link>
              ) : null
            }
          >
            <Definitions
              elements={[
                ['Nom', texte(contact.nom) ?? texte(client?.nom)],
                ['Société', texte(contact.societe) ?? texte(client?.societe)],
                ...(voit.coordonnees
                  ? ([
                      ['Téléphone', texte(contact.telephone) ?? texte(client?.telephone)],
                      ['Email', texte(contact.email) ?? texte(client?.email)],
                      ['Adresse', commande.adresse],
                    ] as [string, React.ReactNode][])
                  : []),
                ['Ville', commande.ville],
                ['Livraison prévue', dateCourte(commande.livraison_prevue_le)],
                ['Frais de livraison', fcfa(commande.livraison_fcfa)],
              ]}
            />
            {!voit.coordonnees ? (
              <p className="mt-3 text-xs text-neutral-500">Coordonnées complètes réservées aux équipes commerciale et finance.</p>
            ) : null}
            {voit.modifier ? (
              <details className="mt-4 border-t border-neutral-100 pt-3">
                <summary className="cursor-pointer text-sm font-medium">Modifier la livraison</summary>
                <form action={modifierLivraisonCommande} className="mt-3 space-y-3">
                  <input type="hidden" name="commande_id" value={commande.id} />
                  <label className={libelle}>
                    Ville
                    <input name="ville" defaultValue={commande.ville ?? ''} maxLength={120} className={champ} />
                  </label>
                  <label className={libelle}>
                    Adresse
                    <input name="adresse" defaultValue={commande.adresse ?? ''} maxLength={300} className={champ} />
                  </label>
                  <label className={libelle}>
                    Date de livraison prévue
                    <input type="date" name="livraison_prevue_le" defaultValue={commande.livraison_prevue_le ?? ''} className={champ} />
                  </label>
                  <button type="submit" className={bouton('secondaire')}>
                    Enregistrer
                  </button>
                </form>
              </details>
            ) : null}
          </Carte>

          <Carte titre="Notes internes" id="notes" description="Visibles uniquement par le personnel">
            {peut(staff.role, 'commandes.notes') ? (
              <form action={ajouterNoteCommande} className="space-y-2">
                <input type="hidden" name="commande_id" value={commande.id} />
                <textarea name="contenu" required maxLength={4000} rows={3} placeholder="Échange client, consigne, incident…" className={champ} aria-label="Nouvelle note interne" />
                <button type="submit" className={bouton('secondaire', 'sm')}>
                  Ajouter la note
                </button>
              </form>
            ) : null}
            <ul className="mt-4 space-y-3 text-sm">
              {historique
                .filter((h) => h.type === 'note')
                .map((n, i) => (
                  <li key={`${n.le}-${i}`} className="rounded-lg bg-neutral-50 px-3 py-2">
                    <p className="whitespace-pre-wrap break-words">{n.detail}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {n.acteur ?? 'personnel'} · {dateHeure(n.le)}
                    </p>
                  </li>
                ))}
            </ul>
          </Carte>

          <Carte titre="Atelier" description={`${production.length} tâche(s)`}>
            {production.length === 0 ? (
              <Vide>Aucune tâche : elle est créée au paiement.</Vide>
            ) : (
              <ul className="space-y-2 text-sm">
                {production.map((brut) => {
                  const t = brut as { id: string; etape: string; statut: string; date_prevue: string | null };
                  const s = libelleProduction(t.statut);
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{libelleEtape(t.etape)}</span>
                      <span className="flex items-center gap-2 text-xs text-neutral-500">
                        {t.date_prevue ? dateCourte(t.date_prevue) : null}
                        <Badge ton={s.ton}>{s.label}</Badge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Carte>

          <Carte titre="Jalons">
            <dl className="space-y-1.5 text-sm">
              {jalons
                .filter(([, d]) => Boolean(d))
                .map(([label, d]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-neutral-500">{label}</dt>
                    <dd className="text-right tabular-nums">{dateHeure(d)}</dd>
                  </div>
                ))}
            </dl>
          </Carte>
        </aside>
      </div>
    </div>
  );
}
