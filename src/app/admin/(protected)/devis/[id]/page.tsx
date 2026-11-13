import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Carte, Confirmation, Definitions, EnTete, Flash, Vide, bouton, champ, libelle } from '@/components/admin/ui';
import { dateHeure, estUuid, fcfa, pourcentage, tauxMarge } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { MODES_PAIEMENT, libelleCommande, libelleDevis, libelleFamille, libellePaiement, libelleTypeClient } from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { notesInternes } from '@/server/admin/commandes';
import { etapesPipeline, historiqueDevis, voletCommercial } from '@/server/admin/devis';
import { commandeDuDevis } from '@/server/commandes/repository';
import { clientDuDevis, devisParId, fichiersDuDevis } from '@/server/devis/repository';
import {
  ajouterNoteDevis,
  changerStatut,
  creerCommande,
  deciderPourClient,
  enregistrerAnalyseAction,
  proposerDevis,
  revoquerSessions,
  telechargerFichier,
  validerPrixAction,
} from './actions';

export const metadata: Metadata = { title: 'Devis' };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  analyse: 'Analyse enregistrée.',
  propose: 'Proposition envoyée : le client la voit dans son suivi.',
  prix: 'Prix validé.',
  statut: 'Statut mis à jour.',
  decision: 'Décision enregistrée.',
  note: 'Note ajoutée.',
  sessions: 'Sessions client révoquées.',
};

function lisible(valeur: unknown): string {
  if (Array.isArray(valeur)) return valeur.length ? valeur.join(', ') : '—';
  if (typeof valeur === 'boolean') return valeur ? 'Oui' : 'Non';
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  return typeof valeur === 'object' ? JSON.stringify(valeur) : String(valeur);
}

export default async function PageDevis({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const staff = await exigerAcces('devis.voir');
  const { id } = await params;
  if (!estUuid(id)) notFound();
  const messages = await searchParams;
  const devis = await devisParId(id);
  if (!devis) notFound();
  const [client, fichiers, commande, commercial, historique, notes] = await Promise.all([
    clientDuDevis(devis.client_id),
    fichiersDuDevis(id),
    commandeDuDevis(id),
    voletCommercial(id),
    historiqueDevis(id),
    notesInternes('devis', id),
  ]);
  if (!commercial) notFound();

  const traiter = peut(staff.role, 'devis.traiter');
  const marges = peut(staff.role, 'marges.voir');
  const clos = ['ACCEPTE', 'REFUSE', 'EXPIRE'].includes(devis.statut);
  const etapes = etapesPipeline({
    statut: devis.statut,
    cree_le: devis.cree_le,
    analyse_besoins: commercial.analyse_besoins,
    montant_propose_fcfa: devis.montant_propose_fcfa,
    proposition_commerciale: commercial.proposition_commerciale,
    prix_valide: commercial.prix_valide,
    prix_valide_le: commercial.prix_valide_le,
    commande: commande ? { reference: commande.reference, statut_paiement: commande.statut_paiement, paye_le: commande.paye_le, cree_le: commande.cree_le } : null,
    historique,
  });
  const contact = devis.contact_snapshot as Record<string, unknown>;
  const s = libelleDevis(devis.statut);
  const margeEstimee =
    devis.montant_propose_fcfa !== null && commercial.cout_estime_fcfa !== null
      ? devis.montant_propose_fcfa - commercial.cout_estime_fcfa
      : null;

  return (
    <div>
      <EnTete
        retour={{ href: '/admin/devis', label: 'Devis' }}
        surtitre={devis.reference}
        titre={String(contact.nom ?? client?.nom ?? 'Client')}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge ton={s.ton}>{s.label}</Badge>
            <span>
              {libelleFamille(devis.famille)} · reçu le {dateHeure(devis.cree_le)}
              {devis.expire_le ? ` · expire le ${dateHeure(devis.expire_le)}` : ''}
            </span>
          </span>
        }
      />
      <Flash ok={messages.ok} erreur={messages.erreur} messages={MESSAGES} />

      <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" aria-label="Avancement du devis">
        {etapes.map((e, i) => (
          <li
            key={e.cle}
            aria-current={!e.faite && (i === 0 || etapes[i - 1].faite) ? 'step' : undefined}
            className={`rounded-xl border px-3 py-2.5 text-sm ${e.faite ? 'border-emerald-200 bg-emerald-50' : 'border-neutral-200 bg-white'}`}
          >
            <span className={`text-[11px] font-semibold ${e.faite ? 'text-emerald-800' : 'text-neutral-400'}`}>
              {e.faite ? '✓' : i + 1} · {e.faite ? 'fait' : 'à faire'}
            </span>
            <span className="mt-0.5 block font-medium leading-tight">{e.label}</span>
            {e.detail || e.le ? (
              <span className="mt-0.5 block truncate text-[11px] text-neutral-500">{e.detail ?? dateHeure(e.le)}</span>
            ) : null}
          </li>
        ))}
      </ol>

      {devis.statut === 'REFUSE' || devis.statut === 'EXPIRE' ? (
        <p className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-700">
          Devis {s.label.toLowerCase()} : il est clos.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Carte titre="1 · Demande reçue">
            <p className="whitespace-pre-wrap text-sm">{devis.besoin}</p>
            <div className="mt-4">
              <Definitions
                elements={[
                  ['Format', devis.format],
                  ['Quantité', devis.quantite],
                  ...Object.entries(devis.specifications ?? {}).map(([cle, v]) => [cle, lisible(v)] as [string, string]),
                ]}
              />
            </div>
            <div className="mt-4 border-t border-neutral-100 pt-3">
              <h3 className="text-xs font-medium text-neutral-500">Pièces jointes</h3>
              {fichiers.length === 0 ? (
                <p className="mt-1 text-sm text-neutral-500">Aucune.</p>
              ) : (
                <ul className="mt-1 divide-y divide-neutral-100 text-sm">
                  {fichiers.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{f.nom}</span>
                        <span className="text-xs text-neutral-500">
                          {f.type_mime} · {(f.taille_octets / 1024 / 1024).toFixed(2)} Mo · analyse : {f.statut_analyse}
                        </span>
                      </span>
                      {traiter && f.verifie && f.statut_analyse === 'PROPRE' ? (
                        <form action={telechargerFichier}>
                          <input type="hidden" name="devis_id" value={id} />
                          <input type="hidden" name="fichier_id" value={f.id} />
                          <button type="submit" className={bouton('secondaire', 'sm')}>
                            Télécharger
                          </button>
                        </form>
                      ) : (
                        <Badge ton="attente">Téléchargement bloqué</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Carte>

          <Carte titre="2 · Analyse des besoins" id="analyse" description="Faisabilité, technique, fournitures, sous-traitance — interne">
            {traiter && !clos ? (
              <form action={enregistrerAnalyseAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="devis_id" value={id} />
                <label className={`${libelle} sm:col-span-2`}>
                  Analyse
                  <textarea name="analyse_besoins" rows={5} maxLength={8000} defaultValue={commercial.analyse_besoins ?? ''} className={champ} />
                </label>
                <label className={libelle}>
                  Coût de revient estimé (FCFA)
                  <input name="cout_estime_fcfa" type="number" min={0} defaultValue={commercial.cout_estime_fcfa ?? ''} className={champ} />
                </label>
                <label className={libelle}>
                  Délai de réalisation (jours)
                  <input name="delai_propose_jours" type="number" min={0} max={365} defaultValue={commercial.delai_propose_jours ?? ''} className={champ} />
                </label>
                <div className="sm:col-span-2">
                  <button type="submit" className={bouton('primaire', 'sm')}>
                    {devis.statut === 'NOUVEAU' ? 'Enregistrer et passer en analyse' : 'Enregistrer l’analyse'}
                  </button>
                </div>
              </form>
            ) : (
              <Definitions
                elements={[
                  ['Analyse', commercial.analyse_besoins ? <span className="whitespace-pre-wrap">{commercial.analyse_besoins}</span> : null],
                  ['Coût estimé', marges ? fcfa(commercial.cout_estime_fcfa) : 'réservé'],
                  ['Délai', commercial.delai_propose_jours !== null ? `${commercial.delai_propose_jours} jours` : null],
                ]}
              />
            )}
          </Carte>

          <Carte titre="3 · Proposition commerciale et 4 · prix validé" id="proposition">
            <Definitions
              elements={[
                ['Montant proposé', <span key="m" className="font-semibold">{fcfa(devis.montant_propose_fcfa)}</span>],
                [
                  'Prix',
                  commercial.prix_valide ? (
                    <Badge key="v" ton="succes">
                      Validé{commercial.prix_valide_par_email ? ` par ${commercial.prix_valide_par_email}` : ''} · {dateHeure(commercial.prix_valide_le)}
                    </Badge>
                  ) : devis.montant_propose_fcfa !== null ? (
                    <Badge key="v" ton="attente">À valider</Badge>
                  ) : null,
                ],
                ...(marges
                  ? ([
                      [
                        'Marge estimée',
                        margeEstimee !== null ? `${fcfa(margeEstimee)} (${pourcentage(tauxMarge(margeEstimee, devis.montant_propose_fcfa ?? 0))})` : 'coût estimé manquant',
                      ],
                    ] as [string, React.ReactNode][])
                  : []),
              ]}
            />
            {commercial.proposition_commerciale ? (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm">{commercial.proposition_commerciale}</p>
            ) : null}

            {peut(staff.role, 'devis.valider_prix') && devis.montant_propose_fcfa !== null && !commercial.prix_valide && !clos ? (
              <form action={validerPrixAction} className="mt-4">
                <input type="hidden" name="devis_id" value={id} />
                <button type="submit" className={bouton('succes', 'sm')}>
                  Valider le prix de {fcfa(devis.montant_propose_fcfa)}
                </button>
              </form>
            ) : null}

            {traiter && (devis.statut === 'EN_ANALYSE' || devis.statut === 'PROPOSE') ? (
              <form action={proposerDevis} className="mt-4 grid gap-3 border-t border-neutral-100 pt-4 sm:grid-cols-[1fr_2fr]">
                <input type="hidden" name="devis_id" value={id} />
                <label className={libelle}>
                  Montant (FCFA)
                  <input name="montant" type="number" min={1} step={1} required defaultValue={devis.montant_propose_fcfa ?? undefined} className={champ} />
                </label>
                <label className={libelle}>
                  Détail de la proposition
                  <textarea
                    name="proposition_commerciale"
                    rows={3}
                    maxLength={8000}
                    defaultValue={commercial.proposition_commerciale ?? ''}
                    placeholder="Contenu, options, conditions, délai…"
                    className={champ}
                  />
                </label>
                <div className="sm:col-span-2">
                  <button type="submit" className={bouton('primaire', 'sm')}>
                    {devis.statut === 'PROPOSE' ? 'Réviser la proposition' : 'Envoyer la proposition'}
                  </button>
                  <p className="mt-1 text-xs text-neutral-500">
                    Le montant devient visible par le client. Un nouveau montant annule la validation du prix.
                  </p>
                </div>
              </form>
            ) : devis.statut === 'NOUVEAU' ? (
              <p className="mt-3 text-xs text-neutral-500">Passez d’abord le devis en analyse.</p>
            ) : null}
          </Carte>

          <Carte titre="5 · Acceptation · 6 · commande · 7 · paiement" id="commande">
            {devis.statut === 'PROPOSE' && traiter ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-auto text-sm text-neutral-600">Le client accepte en ligne, ou enregistrez sa réponse reçue par téléphone / WhatsApp :</p>
                <form action={deciderPourClient}>
                  <input type="hidden" name="devis_id" value={id} />
                  <input type="hidden" name="decision" value="ACCEPTE" />
                  <button type="submit" className={bouton('succes', 'sm')}>
                    Accepté par le client
                  </button>
                </form>
                <form action={deciderPourClient}>
                  <input type="hidden" name="devis_id" value={id} />
                  <input type="hidden" name="decision" value="REFUSE" />
                  <button type="submit" className={bouton('danger', 'sm')}>
                    Refusé
                  </button>
                </form>
              </div>
            ) : null}

            {devis.statut === 'ACCEPTE' && commande ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 text-sm">
                <div>
                  <p className="font-mono font-semibold">{commande.reference}</p>
                  <p className="text-neutral-600">Total {fcfa(commande.total_fcfa)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge ton={libelleCommande(commande.statut).ton}>{libelleCommande(commande.statut).label}</Badge>
                  <Badge ton={libellePaiement(commande.statut_paiement).ton}>Paiement : {libellePaiement(commande.statut_paiement).label}</Badge>
                </div>
                <Link href={`/admin/commandes/${commande.id}`} className={bouton('secondaire', 'sm')}>
                  Suivre la commande et le paiement
                </Link>
              </div>
            ) : null}

            {devis.statut === 'ACCEPTE' && !commande && traiter ? (
              <form action={creerCommande} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="devis_id" value={id} />
                <label className={libelle}>
                  Mode de paiement prévu
                  <select name="mode_paiement" defaultValue="MTN_MOMO" className={champ}>
                    {MODES_PAIEMENT.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={libelle}>
                  Frais de livraison (FCFA)
                  <input type="number" name="livraison" min={0} step={1} defaultValue={0} required className={champ} />
                </label>
                <label className={libelle}>
                  Ville de livraison
                  <input name="ville" maxLength={120} defaultValue={client?.ville ?? 'Brazzaville'} className={champ} />
                </label>
                <label className={libelle}>
                  Livraison souhaitée
                  <input type="date" name="livraison_prevue" className={champ} />
                </label>
                <label className={`${libelle} sm:col-span-2`}>
                  Adresse de livraison
                  <input name="adresse" maxLength={300} className={champ} />
                </label>
                <div className="sm:col-span-2">
                  <button type="submit" className={bouton('primaire')}>
                    Transformer en commande
                  </button>
                  <p className="mt-1 text-xs text-neutral-500">
                    Commande créée en brouillon avec le prix verrouillé du devis et ses fichiers. Aucun encaissement.
                  </p>
                </div>
              </form>
            ) : null}

            {devis.statut !== 'PROPOSE' && devis.statut !== 'ACCEPTE' ? (
              <p className="text-sm text-neutral-500">Disponible une fois la proposition envoyée.</p>
            ) : null}
          </Carte>
        </div>

        <aside className="min-w-0 space-y-6">
          <Carte
            titre="Client"
            action={
              peut(staff.role, 'clients.voir') ? (
                <Link href={`/admin/clients/${devis.client_id}`} className={bouton('discret')}>
                  Fiche client
                </Link>
              ) : null
            }
          >
            <Definitions
              elements={[
                ['Nom', client?.nom],
                ['Société', client?.societe],
                ['Type', typeof contact.typeClient === 'string' ? libelleTypeClient(contact.typeClient) : null],
                ['Téléphone', client?.telephone],
                ['Email', client?.email],
                ['Ville', client?.ville],
              ]}
            />
          </Carte>

          <Carte titre="Notes internes" id="notes">
            {traiter ? (
              <form action={ajouterNoteDevis} className="space-y-2">
                <input type="hidden" name="devis_id" value={id} />
                <textarea name="contenu" rows={2} maxLength={4000} required placeholder="Relance, échange, point d’attention…" aria-label="Nouvelle note" className={champ} />
                <button type="submit" className={bouton('secondaire', 'sm')}>
                  Ajouter
                </button>
              </form>
            ) : null}
            {devis.notes_internes ? (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-neutral-50 px-3 py-2 text-sm">{devis.notes_internes}</p>
            ) : null}
            <ul className="mt-3 space-y-2 text-sm">
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

          <Carte titre="Historique">
            {historique.length === 0 ? (
              <Vide>Aucun événement.</Vide>
            ) : (
              <ol className="space-y-2 text-sm">
                {historique.map((h, i) => (
                  <li key={i}>
                    <p className="font-medium">
                      {h.type_evenement === 'PRIX'
                        ? `Prix : ${fcfa(h.ancien_montant_fcfa)} → ${fcfa(h.nouveau_montant_fcfa)}`
                        : `${libelleDevis(h.ancien_statut).label} → ${libelleDevis(h.nouveau_statut).label}`}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {dateHeure(h.cree_le)} · {h.source === 'CLIENT' ? 'client' : h.source === 'SYSTEME' ? 'système' : 'personnel'}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Carte>

          {traiter && !clos ? (
            <Carte titre="Clore le devis">
              <div className="flex flex-wrap gap-2">
                <form action={changerStatut}>
                  <input type="hidden" name="devis_id" value={id} />
                  <input type="hidden" name="statut" value="EXPIRE" />
                  <button type="submit" className={bouton('secondaire', 'sm')}>
                    Marquer expiré
                  </button>
                </form>
                {devis.statut !== 'PROPOSE' ? (
                  <form action={changerStatut}>
                    <input type="hidden" name="devis_id" value={id} />
                    <input type="hidden" name="statut" value="REFUSE" />
                    <button type="submit" className={bouton('danger', 'sm')}>
                      Sans suite
                    </button>
                  </form>
                ) : null}
              </div>
            </Carte>
          ) : null}

          {peut(staff.role, 'devis.sessions') ? (
            <Confirmation resume={<span className="text-xs text-neutral-500 underline">Révoquer les sessions de suivi du client…</span>}>
              <form action={revoquerSessions}>
                <input type="hidden" name="devis_id" value={id} />
                <button type="submit" className={bouton('danger', 'sm')}>
                  Révoquer toutes les sessions
                </button>
                <p className="mt-1 text-xs text-neutral-500">Le client devra se réauthentifier pour consulter son devis.</p>
              </form>
            </Confirmation>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
