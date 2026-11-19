import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Carte, Definitions, EnTete, Flash, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import ApercuBanderole from '@/components/grand-format/ApercuBanderole';
import { dateCourte, dateHeure, estUuid, fcfa, pourcentage } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { MODES_PAIEMENT, libelleCommande, libelleDevis, libellePaiement, libelleProduction } from '@/lib/admin/statuts';
import {
  formatDimensions,
  formatSurface,
  libelleDelai,
  libelleFinition,
  libellePrestation,
  libelleSupport,
  libelleUsage,
  supportParId,
  surfaceM2,
} from '@/lib/grand-format/catalogue';
import { MESSAGES_SANS_ESTIMATION, type RaisonSansEstimation } from '@/lib/grand-format/estimation';
import { modelePrincipal } from '@/lib/grand-format/modeles';
import {
  POSTES,
  coutsDepuisTaches,
  etatGrandFormat,
  genererProposition,
  postesAttendus,
  rentabilite,
  type Couts,
} from '@/lib/grand-format/suivi';
import { exigerAcces } from '@/server/admin/acces';
import { historiqueDevis, voletCommercial } from '@/server/admin/devis';
import { listerPartenaires } from '@/server/admin/production';
import { clientDuDevis, fichiersDuDevis } from '@/server/devis/repository';
import { demandeParDevis, tachesDeCommande } from '@/server/grand-format/repository';
import { telechargerFichier } from '../../devis/[id]/actions';
import {
  coutsReelsAction,
  creerCommandeAction,
  deciderAction,
  enregistrerChiffrageAction,
  envoyerPropositionAction,
  planifierProductionAction,
} from '../actions';

export const metadata: Metadata = { title: 'Banderole' };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  chiffrage: 'Chiffrage enregistré.',
  proposition: 'Proposition envoyée : le client la voit dans son suivi et peut l’accepter en ligne.',
  decision: 'Décision enregistrée.',
  commande: 'Commande créée : le chiffrage a été reporté en tâches d’atelier.',
  production: 'Production planifiée.',
  couts: 'Coûts réels enregistrés : la marge de la commande est recalculée.',
};

function Montant({ name, valeur, label, desactive = false }: { name: string; valeur: number | null; label: string; desactive?: boolean }) {
  return (
    <label className={libelle}>
      {label}
      <input type="number" name={name} min={0} step={1} defaultValue={valeur ?? ''} disabled={desactive} className={champ} />
    </label>
  );
}

export default async function PageBanderole({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const staff = await exigerAcces('grand_format.voir');
  const { id } = await params;
  if (!estUuid(id)) notFound();
  const messages = await searchParams;
  const d = await demandeParDevis(id);
  if (!d) notFound();

  const [client, fichiers, commercial, historique, partenaires, taches] = await Promise.all([
    clientDuDevis(d.devis.client_id),
    fichiersDuDevis(id),
    voletCommercial(id),
    historiqueDevis(id),
    listerPartenaires(),
    d.commande ? tachesDeCommande(d.commande.id) : Promise.resolve([]),
  ]);

  const chiffrer = peut(staff.role, 'grand_format.chiffrer');
  const voirCouts = peut(staff.role, 'grand_format.couts');
  const coordonnees = peut(staff.role, 'clients.coordonnees');
  const telecharger = peut(staff.role, 'devis.traiter');
  const statut = d.devis.statut;
  const etat = etatGrandFormat(statut, d.commande?.statut);
  const prixModifiable = ['NOUVEAU', 'EN_ANALYSE', 'PROPOSE'].includes(statut);
  const contact = d.devis.contact_snapshot as Record<string, unknown>;
  const surfacePiece = surfaceM2(d.largeur_m, d.hauteur_m);
  const partenaire = partenaires.find((p) => p.id === d.partenaire_id) ?? null;
  const imprimeurs = partenaires.filter((p) => p.actif || p.id === d.partenaire_id);
  const coutSuggere =
    partenaire?.tarifs.prix_m2_fcfa ? Math.ceil((partenaire.tarifs.prix_m2_fcfa * d.surface_totale_m2) / 100) * 100 : null;
  const finitionsApplicables = supportParId(d.support)?.finitionsApplicables ?? false;
  const estimationRaison = (d.estimation_detail as { raison?: RaisonSansEstimation }).raison;

  const coutsEstimes: Couts = {
    impression: d.cout_impression_estime_fcfa,
    creation: d.cout_creation_estime_fcfa,
    livraison: d.cout_livraison_estime_fcfa,
    autres: d.autres_couts_estimes_fcfa,
  };
  const coutsReels = coutsDepuisTaches(taches);
  const attendus = postesAttendus(d.prestation);
  const estimee = rentabilite(d.prix_vente_fcfa, coutsEstimes, attendus);
  const finale = d.commande ? rentabilite(d.commande.total_fcfa, coutsReels, attendus) : null;
  const tacheImpression = taches.find((t) => t.etape === 'Impression grand format');

  const proposition =
    d.prix_impression_fcfa !== null
      ? genererProposition({
          usage: d.usage,
          support: d.support,
          supportPrecision: d.support_precision,
          largeurM: d.largeur_m,
          hauteurM: d.hauteur_m,
          quantite: d.quantite,
          finition: d.finition,
          finitionPrecision: d.finition_precision,
          prestation: d.prestation,
          prixImpressionFcfa: d.prix_impression_fcfa,
          fraisCreationFcfa: d.frais_creation_fcfa,
          productionPrevueLe: d.production_prevue_le,
          livraisonPrevueLe: d.livraison_prevue_le,
        })
      : null;

  return (
    <div>
      <EnTete
        retour={{ href: '/admin/banderoles', label: 'Banderoles' }}
        surtitre={d.devis.reference}
        titre={String(contact.nom ?? client?.nom ?? 'Client')}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge ton={etat.ton}>{etat.label}</Badge>
            {etat.detail ? <span>{etat.detail} ·</span> : null}
            {d.delai === 'EXPRESS' ? <Badge ton="alerte">Urgent</Badge> : null}
            <span>reçue le {dateHeure(d.cree_le)}</span>
          </span>
        }
        actions={
          <>
            <Link href={`/admin/devis/${id}`} className={bouton('secondaire', 'sm')}>
              Fiche devis (notes, historique)
            </Link>
            {d.commande ? (
              <Link href={`/admin/commandes/${d.commande.id}`} className={bouton('secondaire', 'sm')}>
                Commande {d.commande.reference}
              </Link>
            ) : null}
          </>
        }
      />
      <Flash ok={messages.ok} erreur={messages.erreur} messages={MESSAGES} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {/* ------------------------------------------------------- demande ---- */}
          <Carte titre="1 · Demande du client">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
              <Definitions
                elements={[
                  ['Utilisation', libelleUsage(d.usage)],
                  ['Support', d.support === 'AUTRE' ? `Autre : ${d.support_precision ?? '—'}` : libelleSupport(d.support)],
                  ['Dimensions', formatDimensions(d.largeur_m, d.hauteur_m)],
                  ['Quantité', `${d.quantite} · ${formatSurface(surfacePiece)} / pièce · ${formatSurface(d.surface_totale_m2)} au total`],
                  ['Finition', d.finition === 'AUTRE' ? `Autre : ${d.finition_precision ?? '—'}` : libelleFinition(d.finition)],
                  ['Délai', d.delai === 'DATE' && d.date_souhaitee ? `Pour le ${dateCourte(d.date_souhaitee)}` : libelleDelai(d.delai)],
                  ['Prestation', libellePrestation(d.prestation)],
                  [
                    'Estimation en ligne',
                    d.estimation_fcfa !== null
                      ? `${fcfa(d.estimation_fcfa)} (grille validée, au dépôt)`
                      : estimationRaison
                        ? `Sur devis — ${MESSAGES_SANS_ESTIMATION[estimationRaison] ?? estimationRaison}`
                        : 'Sur devis',
                  ],
                ]}
              />
              <ApercuBanderole
                modele={modelePrincipal(d.usage)}
                largeurM={d.largeur_m}
                hauteurM={d.hauteur_m}
                finition={finitionsApplicables ? d.finition : 'SANS'}
                cadre={4 / 3}
                className="w-full rounded-lg bg-neutral-100"
                label="Proportions de la banderole demandée (modèle indicatif)"
              />
            </div>
            {d.commentaire ? <p className="mt-4 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm">{d.commentaire}</p> : null}

            <div className="mt-4 border-t border-neutral-100 pt-3">
              <h3 className="text-xs font-medium text-neutral-500">Fichiers fournis ({fichiers.length})</h3>
              {fichiers.length === 0 ? (
                <p className="mt-1 text-sm text-neutral-500">Aucun fichier.</p>
              ) : (
                <ul className="mt-1 divide-y divide-neutral-100 text-sm">
                  {fichiers.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{f.nom}</span>
                        <span className="text-xs text-neutral-500">
                          {f.type_mime} · {(f.taille_octets / 1024 / 1024).toFixed(2)} Mo · {f.verifie ? 'vérifié' : 'non vérifié'} · analyse : {f.statut_analyse}
                        </span>
                      </span>
                      {telecharger && f.verifie && f.statut_analyse === 'PROPRE' ? (
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
              <p className="mt-2 text-xs text-neutral-500">
                Règle de sécurité inchangée : seuls les fichiers vérifiés et analysés « propres » sont téléchargeables. La dérogation
                administrateur reste disponible depuis l’API du devis.
              </p>
            </div>
          </Carte>

          {/* ------------------------------------------------------ chiffrage ---- */}
          <Carte
            titre="2 · Chiffrage"
            id="chiffrage"
            description={prixModifiable ? 'Prix de vente, imprimeur pressenti, coûts estimés et planning' : 'Devis clos : le prix est verrouillé'}
          >
            {chiffrer || voirCouts ? (
              <form action={enregistrerChiffrageAction} className="space-y-4">
                <input type="hidden" name="devis_id" value={id} />
                {chiffrer ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={`${libelle} sm:col-span-2`}>
                      Imprimeur partenaire pressenti
                      <select name="partenaire_id" defaultValue={d.partenaire_id ?? ''} className={champ}>
                        <option value="">— Aucun / interne —</option>
                        {imprimeurs.map((p) => {
                          const compatible = p.types_impression.length === 0 || p.types_impression.includes(d.support);
                          const tient = !p.largeur_max_m || Math.min(d.largeur_m, d.hauteur_m) <= p.largeur_max_m;
                          return (
                            <option key={p.id} value={p.id}>
                              {p.nom}
                              {p.largeur_max_m ? ` · laize ${String(p.largeur_max_m).replace('.', ',')} m` : ''}
                              {p.delai_jours !== null ? ` · ${p.delai_jours} j` : ''}
                              {!compatible ? ' · support non déclaré' : ''}
                              {!tient ? ' · format trop large' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <Montant name="prix_impression_fcfa" label="Prix de vente — impression (FCFA)" valeur={d.prix_impression_fcfa} desactive={!prixModifiable} />
                    <Montant name="frais_creation_fcfa" label="Frais de création graphique facturés (FCFA)" valeur={d.frais_creation_fcfa} desactive={!prixModifiable} />
                    <label className={libelle}>
                      Production prévue le
                      <input type="date" name="production_prevue_le" defaultValue={d.production_prevue_le ?? ''} className={champ} />
                    </label>
                    <label className={libelle}>
                      Livraison prévue le
                      <input type="date" name="livraison_prevue_le" defaultValue={d.livraison_prevue_le ?? ''} className={champ} />
                    </label>
                    {d.estimation_fcfa !== null && d.prix_impression_fcfa === null ? (
                      <p className="text-xs text-neutral-500 sm:col-span-2">
                        Repère : l’estimation de la grille validée était de {fcfa(d.estimation_fcfa)}.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {voirCouts ? (
                  <fieldset className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 sm:grid-cols-2">
                    <legend className="px-1 text-xs font-medium text-amber-900">Coûts estimés — confidentiels</legend>
                    <Montant name="cout_impression_estime_fcfa" label="Coût imprimeur" valeur={d.cout_impression_estime_fcfa} />
                    <Montant name="cout_creation_estime_fcfa" label="Coût création graphique" valeur={d.cout_creation_estime_fcfa} />
                    <Montant name="cout_livraison_estime_fcfa" label="Coût de livraison" valeur={d.cout_livraison_estime_fcfa} />
                    <Montant name="autres_couts_estimes_fcfa" label="Autres dépenses" valeur={d.autres_couts_estimes_fcfa} />
                    {coutSuggere !== null ? (
                      <p className="text-xs text-amber-900 sm:col-span-2">
                        Tarif négocié de {partenaire?.nom} : {fcfa(partenaire?.tarifs.prix_m2_fcfa)} / m² × {formatSurface(d.surface_totale_m2)} ≈{' '}
                        <strong>{fcfa(coutSuggere)}</strong>
                        {partenaire?.tarifs.conditions ? ` (${partenaire.tarifs.conditions})` : ''}.
                      </p>
                    ) : null}
                  </fieldset>
                ) : null}
                <button type="submit" className={bouton('primaire', 'sm')}>
                  {statut === 'NOUVEAU' ? 'Enregistrer et prendre en charge' : 'Enregistrer le chiffrage'}
                </button>
              </form>
            ) : (
              <Definitions
                elements={[
                  ['Prix impression', fcfa(d.prix_impression_fcfa)],
                  ['Création graphique', fcfa(d.frais_creation_fcfa)],
                  ['Imprimeur', partenaire?.nom],
                ]}
              />
            )}
            {d.prix_vente_fcfa !== null ? (
              <p className="mt-4 border-t border-neutral-100 pt-3 text-sm">
                Prix de vente : <strong>{fcfa(d.prix_vente_fcfa)}</strong> hors livraison
                {voirCouts && estimee.margeFcfa !== null ? (
                  <>
                    {' '}
                    · marge estimée{' '}
                    <strong className={estimee.margeFcfa < 0 ? 'text-red-700' : ''}>
                      {fcfa(estimee.margeFcfa)} ({pourcentage(estimee.taux)})
                    </strong>
                  </>
                ) : null}
              </p>
            ) : null}
          </Carte>

          {/* ---------------------------------------------------- proposition ---- */}
          <Carte titre="3 · Proposition commerciale" id="proposition">
            {statut === 'PROPOSE' || statut === 'ACCEPTE' ? (
              <div className="mb-4">
                <Definitions
                  elements={[
                    ['Montant transmis', <strong key="m">{fcfa(d.devis.montant_propose_fcfa)}</strong>],
                    ['Statut', <Badge key="s" ton={libelleDevis(statut).ton}>{libelleDevis(statut).label}</Badge>],
                  ]}
                />
                {commercial?.proposition_commerciale ? (
                  <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 font-sans text-sm">{commercial.proposition_commerciale}</pre>
                ) : null}
              </div>
            ) : null}
            {chiffrer && prixModifiable ? (
              proposition ? (
                <form action={envoyerPropositionAction} className="space-y-3">
                  <input type="hidden" name="devis_id" value={id} />
                  <label className={libelle}>
                    Texte envoyé au client (généré depuis le chiffrage, modifiable)
                    <textarea name="proposition" rows={12} maxLength={8000} defaultValue={proposition} className={`${champ} font-mono text-xs`} />
                  </label>
                  <label className={`${libelle} max-w-40`}>
                    Validité (jours)
                    <input type="number" name="validite_jours" min={1} max={90} defaultValue={15} className={champ} />
                  </label>
                  <div>
                    <button type="submit" className={bouton('primaire', 'sm')}>
                      {statut === 'PROPOSE' ? 'Réviser et renvoyer' : `Envoyer la proposition de ${fcfa(d.prix_vente_fcfa)}`}
                    </button>
                    <p className="mt-1 text-xs text-neutral-500">
                      Le montant et le texte deviennent visibles dans le suivi du client, qui peut accepter en ligne. Aucun imprimeur ni coût n’y figure.
                    </p>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-neutral-500">Renseignez le prix de l’impression pour générer la proposition.</p>
              )
            ) : statut !== 'PROPOSE' && statut !== 'ACCEPTE' ? (
              <p className="text-sm text-neutral-500">Aucune proposition.</p>
            ) : null}
          </Carte>

          {/* ------------------------------------------------------ décision ---- */}
          {chiffrer && ['NOUVEAU', 'EN_ANALYSE', 'PROPOSE'].includes(statut) ? (
            <Carte titre="4 · Validation" description="Décision de Smart Vision, ou réponse du client reçue par téléphone / WhatsApp">
              <div className="flex flex-wrap gap-2">
                {statut === 'NOUVEAU' ? (
                  <form action={deciderAction}>
                    <input type="hidden" name="devis_id" value={id} />
                    <input type="hidden" name="decision" value="prendre_en_charge" />
                    <button type="submit" className={bouton('succes', 'sm')}>
                      Valider la demande (prendre en charge)
                    </button>
                  </form>
                ) : null}
                {statut === 'PROPOSE' ? (
                  <>
                    <form action={deciderAction}>
                      <input type="hidden" name="devis_id" value={id} />
                      <input type="hidden" name="decision" value="client_accepte" />
                      <button type="submit" className={bouton('succes', 'sm')}>
                        Accepté par le client
                      </button>
                    </form>
                    <form action={deciderAction}>
                      <input type="hidden" name="devis_id" value={id} />
                      <input type="hidden" name="decision" value="client_refuse" />
                      <button type="submit" className={bouton('danger', 'sm')}>
                        Refusé par le client
                      </button>
                    </form>
                    <form action={deciderAction}>
                      <input type="hidden" name="devis_id" value={id} />
                      <input type="hidden" name="decision" value="expirer" />
                      <button type="submit" className={bouton('secondaire', 'sm')}>
                        Marquer expiré
                      </button>
                    </form>
                  </>
                ) : (
                  <form action={deciderAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="devis_id" value={id} />
                    <input type="hidden" name="decision" value="refuser" />
                    <label className={`${libelle} min-w-56`}>
                      Motif du refus
                      <input name="note" maxLength={500} placeholder="Format impossible, délai intenable…" className={champ} />
                    </label>
                    <button type="submit" className={bouton('danger', 'sm')}>
                      Refuser la demande
                    </button>
                  </form>
                )}
              </div>
            </Carte>
          ) : null}

          {/* ------------------------------------------------------ commande ---- */}
          <Carte titre="5 · Commande et paiement" id="commande">
            {d.commande ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 text-sm">
                <div>
                  <p className="font-mono font-semibold">{d.commande.reference}</p>
                  <p className="text-neutral-600">
                    Total {fcfa(d.commande.total_fcfa)} (dont livraison {fcfa(d.commande.livraison_fcfa)})
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge ton={libelleCommande(d.commande.statut).ton}>{libelleCommande(d.commande.statut).label}</Badge>
                  <Badge ton={libellePaiement(d.commande.statut_paiement).ton}>Paiement : {libellePaiement(d.commande.statut_paiement).label}</Badge>
                </div>
                <Link href={`/admin/commandes/${d.commande.id}`} className={bouton('secondaire', 'sm')}>
                  Encaisser / changer le statut
                </Link>
              </div>
            ) : statut === 'ACCEPTE' && peut(staff.role, 'devis.traiter') ? (
              <form action={creerCommandeAction} className="grid gap-3 sm:grid-cols-2">
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
                  Frais de livraison facturés (FCFA)
                  <input type="number" name="livraison" min={0} step={1} defaultValue={0} required className={champ} />
                </label>
                <label className={libelle}>
                  Ville de livraison
                  <input name="ville" maxLength={120} defaultValue={client?.ville ?? 'Brazzaville'} className={champ} />
                </label>
                <label className={libelle}>
                  Adresse de livraison
                  <input name="adresse" maxLength={300} className={champ} />
                </label>
                <div className="sm:col-span-2">
                  <button type="submit" className={bouton('primaire')}>
                    Transformer en commande
                  </button>
                  <p className="mt-1 text-xs text-neutral-500">
                    Prix verrouillé du devis, fichiers rattachés, paiement MTN MoMo suivi sur la commande. Le chiffrage devient les tâches
                    d’atelier (imprimeur, création, livraison).
                  </p>
                </div>
              </form>
            ) : (
              <p className="text-sm text-neutral-500">Disponible une fois le devis accepté par le client.</p>
            )}
          </Carte>

          {/* ---------------------------------------------------- production ---- */}
          {d.commande ? (
            <Carte titre="6 · Production chez l’imprimeur" id="production">
              {chiffrer ? (
                <form action={planifierProductionAction} className="mb-4 grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="devis_id" value={id} />
                  <label className={libelle}>
                    Imprimeur affecté
                    <select name="partenaire_id" defaultValue={tacheImpression?.partenaire_id ?? d.partenaire_id ?? ''} className={champ}>
                      <option value="">— Interne —</option>
                      {imprimeurs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={libelle}>
                    Production prévue le
                    <input type="date" name="production_prevue_le" defaultValue={tacheImpression?.date_prevue ?? d.production_prevue_le ?? ''} className={champ} />
                  </label>
                  <label className={libelle}>
                    Livraison prévue le
                    <input type="date" name="livraison_prevue_le" defaultValue={d.commande.livraison_prevue_le ?? d.livraison_prevue_le ?? ''} className={champ} />
                  </label>
                  <div className="sm:col-span-3">
                    <button type="submit" className={bouton('primaire', 'sm')}>
                      Enregistrer le planning
                    </button>
                  </div>
                </form>
              ) : null}
              {taches.length === 0 ? (
                <Vide>Aucune tâche d’atelier.</Vide>
              ) : (
                <div className={tableau.conteneur}>
                  <table className={tableau.table}>
                    <thead className={tableau.thead}>
                      <tr>
                        <th className={tableau.th}>Étape</th>
                        <th className={tableau.th}>État</th>
                        <th className={tableau.th}>Prestataire</th>
                        <th className={tableau.th}>Prévue</th>
                      </tr>
                    </thead>
                    <tbody className={tableau.tbody}>
                      {taches.map((t) => (
                        <tr key={t.id}>
                          <td className={tableau.td}>{t.etape === 'INITIALISATION' ? 'Préparation (créée au paiement)' : t.etape}</td>
                          <td className={tableau.td}>
                            <Badge ton={libelleProduction(t.statut).ton}>{libelleProduction(t.statut).label}</Badge>
                          </td>
                          <td className={tableau.td}>{partenaires.find((p) => p.id === t.partenaire_id)?.nom ?? (t.interne ? 'Interne' : '—')}</td>
                          <td className={tableau.td}>{t.date_prevue ? dateCourte(t.date_prevue) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-xs text-neutral-500">
                Les états de fabrication et le statut de la commande (en production, contrôle qualité, prête, livrée) se pilotent depuis la vue
                Atelier et la fiche commande.
              </p>
            </Carte>
          ) : null}

          {/* --------------------------------------------------- rentabilité ---- */}
          {voirCouts ? (
            <Carte titre="7 · Rentabilité" id="rentabilite" description="Marge brute = prix facturé − coûts directs. Confidentiel.">
              <div className={tableau.conteneur}>
                <table className={tableau.table}>
                  <thead className={tableau.thead}>
                    <tr>
                      <th className={tableau.th}>Poste</th>
                      <th className={`${tableau.th} text-right`}>Estimé</th>
                      <th className={`${tableau.th} text-right`}>Réel</th>
                    </tr>
                  </thead>
                  <tbody className={tableau.tbody}>
                    <tr>
                      <td className={`${tableau.td} font-medium`}>Prix facturé au client</td>
                      <td className={tableau.nombre}>{fcfa(d.prix_vente_fcfa)}</td>
                      <td className={tableau.nombre}>{fcfa(d.commande?.total_fcfa)}</td>
                    </tr>
                    {POSTES.map((p) => (
                      <tr key={p.id}>
                        <td className={tableau.td}>{p.label}</td>
                        <td className={tableau.nombre}>{fcfa(coutsEstimes[p.id])}</td>
                        <td className={tableau.nombre}>{d.commande ? fcfa(coutsReels[p.id]) : '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-neutral-50 font-semibold">
                      <td className={tableau.td}>Marge brute</td>
                      <td className={`${tableau.nombre} ${(estimee.margeFcfa ?? 0) < 0 ? 'text-red-700' : ''}`}>
                        {fcfa(estimee.margeFcfa)}
                        {estimee.taux !== null ? <span className="block text-[11px] font-normal text-neutral-500">{pourcentage(estimee.taux)}</span> : null}
                      </td>
                      <td className={`${tableau.nombre} ${(finale?.margeFcfa ?? 0) < 0 ? 'text-red-700' : ''}`}>
                        {fcfa(finale?.margeFcfa)}
                        {finale?.taux !== null && finale?.taux !== undefined ? (
                          <span className="block text-[11px] font-normal text-neutral-500">{pourcentage(finale.taux)}</span>
                        ) : null}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {finale && finale.postesManquants.length ? (
                <p className="mt-2 text-xs text-amber-800">
                  Coût réel manquant : {finale.postesManquants.map((p) => POSTES.find((x) => x.id === p)?.label).join(', ')} — la marge finale est
                  surestimée tant qu’il manque.
                </p>
              ) : null}
              {d.commande ? (
                <>
                  <p className="mt-2 text-xs text-neutral-500">
                    Prix réel = total de la commande, livraison facturée comprise. {d.commande.statut === 'LIVREE' ? 'Commande livrée : marge finale.' : 'Marge provisoire jusqu’à la livraison.'}
                  </p>
                  <form action={coutsReelsAction} className="mt-4 grid gap-3 border-t border-neutral-100 pt-4 sm:grid-cols-4">
                    <input type="hidden" name="devis_id" value={id} />
                    {POSTES.map((p) => (
                      <Montant key={p.id} name={`cout_${p.id}`} label={`${p.label} (réel)`} valeur={coutsReels[p.id]} />
                    ))}
                    <div className="sm:col-span-4">
                      <button type="submit" className={bouton('primaire', 'sm')}>
                        Enregistrer les coûts réels
                      </button>
                      <p className="mt-1 text-xs text-neutral-500">
                        Saisissez ce qui a réellement été payé (facture imprimeur, coursier…). Les tâches d’atelier et la marge de la commande sont mises à jour.
                      </p>
                    </div>
                  </form>
                </>
              ) : null}
            </Carte>
          ) : null}
        </div>

        {/* --------------------------------------------------------- latéral ---- */}
        <aside className="min-w-0 space-y-6">
          <Carte
            titre="Client"
            action={
              peut(staff.role, 'clients.voir') ? (
                <Link href={`/admin/clients/${d.devis.client_id}`} className={bouton('discret')}>
                  Fiche client
                </Link>
              ) : null
            }
          >
            <Definitions
              elements={[
                ['Nom', client?.nom ?? String(contact.nom ?? '')],
                ['Organisation', client?.societe],
                ['Téléphone', coordonnees ? client?.telephone : 'réservé'],
                ['Email', coordonnees ? client?.email : 'réservé'],
                ['Ville', client?.ville],
              ]}
            />
          </Carte>

          <Carte titre="Imprimeur partenaire" description="Jamais communiqué au client">
            {partenaire ? (
              <Definitions
                elements={[
                  ['Entreprise', partenaire.nom],
                  ['Contact', partenaire.contact_nom],
                  ['Téléphone', partenaire.telephone],
                  ['Adresse', partenaire.adresse],
                  ['Supports', partenaire.types_impression.map(libelleSupport).join(', ')],
                  ['Laize max.', partenaire.largeur_max_m ? `${String(partenaire.largeur_max_m).replace('.', ',')} m` : null],
                  ['Délai habituel', partenaire.delai_jours !== null ? `${partenaire.delai_jours} jours` : null],
                  ...(voirCouts
                    ? ([['Tarif négocié', partenaire.tarifs.prix_m2_fcfa ? `${fcfa(partenaire.tarifs.prix_m2_fcfa)} / m²` : null]] as [string, React.ReactNode][])
                    : []),
                ]}
              />
            ) : (
              <p className="text-sm text-neutral-500">Aucun imprimeur affecté.</p>
            )}
            {peut(staff.role, 'partenaires.gerer') ? (
              <Link href="/admin/production/prestataires" className={`${bouton('discret')} mt-3 inline-block`}>
                Gérer les imprimeurs
              </Link>
            ) : null}
          </Carte>

          <Carte titre="Historique du devis">
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
        </aside>
      </div>
    </div>
  );
}
