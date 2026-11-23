import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BadgePartenaire, BadgeTarif, BadgeValidationAdmin, ChampsFiche, ChampsTarifAdmin, DecisionElement } from '@/components/admin/partenaires';
import { Badge, Carte, Confirmation, Definitions, EnTete, Flash, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import { dateCourte, dateHeure, estUuid, fcfa } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import {
  CATEGORIES_SERVICE,
  ETATS_MACHINE,
  FINITIONS_PRODUCTION,
  STATUTS_DISPONIBILITE,
  UNITES_CAPACITE,
  nomPrestation,
  nomTypeMachine,
} from '@/lib/partenaires/catalogue';
import { estStatutAffectation, libelleSourceTarif, statutAffectation } from '@/lib/partenaires/affectations';
import { disponibiliteCourante } from '@/lib/partenaires/formulaires';
import { resumeVersion } from '@/lib/partenaires/paliers';
import {
  DECISIONS_AVEC_MOTIF,
  decisionsPossibles,
  statutPartenaire,
  type DecisionPartenaire,
  type StatutPartenaire,
} from '@/lib/partenaires/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { listerAffectations } from '@/server/admin/affectations';
import { notesInternes } from '@/server/admin/commandes';
import { fichePartenaireAdmin } from '@/server/admin/partenaires';
import { tarifsDuPartenaire } from '@/server/admin/tarifsPartenaires';
import { invitations } from '@/server/partenaires/invitations';
import { InvitationResponsable } from '@/components/admin/InvitationResponsable';
import {
  basculerMembreAdminAction,
  deciderPartenaireAction,
  deciderTarifAction,
  enregistrerPartenaireAction,
  noteAction,
  revoquerInvitationAdminAction,
  saisirTarifAction,
} from '../actions';

export const metadata: Metadata = { title: 'Partenaire' };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  cree: 'Partenaire créé et validé.',
  modifie: 'Informations enregistrées.',
  note: 'Note ajoutée.',
  'decision-valide': 'Partenaire validé : il peut recevoir des travaux. L’atelier est prévenu par e-mail.',
  'decision-refuse': 'Dossier refusé. L’atelier est prévenu par e-mail.',
  'decision-brouillon': 'Compléments demandés à l’atelier.',
  'decision-suspendu': 'Partenaire suspendu : il n’a plus accès au portail et ne reçoit plus de travaux.',
  'decision-archive': 'Partenaire archivé.',
  'element-valide': 'Élément validé.',
  'element-refuse': 'Élément refusé : l’atelier est prévenu par e-mail.',
  'tarif-saisi': 'Tarif enregistré, en attente de validation.',
  'tarif-valider': 'Tarif validé.',
  'tarif-refuser': 'Tarif refusé.',
  'tarif-modifier': 'Modification demandée à l’atelier.',
  'tarif-retirer': 'Tarif retiré.',
  'invitation-annulee': 'Invitation annulée.',
  'membre-desactive': 'Accès désactivé.',
  'membre-reactive': 'Accès réactivé.',
};

const LIBELLE_DECISION: Record<DecisionPartenaire, string> = {
  VALIDE: 'Valider',
  REFUSE: 'Refuser',
  BROUILLON: 'Demander des compléments',
  SUSPENDU: 'Suspendre',
  ARCHIVE: 'Archiver',
};

const mm = (x: unknown) => (typeof x === 'number' ? `${String(x / 1000).replace('.', ',')} m` : null);
const texte = (x: unknown) => (x === null || x === undefined || x === '' ? null : String(x));

export default async function PagePartenaire({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const staff = await exigerAcces('partenaires.voir');
  const [{ id }, messages] = await Promise.all([params, searchParams]);
  if (!estUuid(id)) notFound();
  const voirTarifs = peut(staff.role, 'partenaires.tarifs_voir');
  const comptes = peut(staff.role, 'partenaires.comptes');
  const [f, notes, tarifs, toutesInvitations, affectations] = await Promise.all([
    fichePartenaireAdmin(id),
    notesInternes('partenaire', id),
    voirTarifs ? tarifsDuPartenaire(id) : Promise.resolve([]),
    comptes ? invitations(id) : Promise.resolve([]),
    listerAffectations({ partenaireId: id, limite: 20 }),
  ]);
  const invitationsEnAttente = toutesInvitations.filter((i) => i.etat === 'EN_ATTENTE');
  if (!f) notFound();

  const p = f.partenaire;
  const statut = p.statut as StatutPartenaire;
  const valider = peut(staff.role, 'partenaires.valider');
  const suspendre = peut(staff.role, 'partenaires.suspendre');
  const gerer = peut(staff.role, 'partenaires.gerer');
  const saisir = peut(staff.role, 'partenaires.tarifs_saisir');
  const deciderTarifs = peut(staff.role, 'partenaires.tarifs_valider');
  const voirCoutsAffectations = peut(staff.role, 'affectations.couts');
  const decisions = decisionsPossibles(statut).filter((d) =>
    d === 'SUSPENDU' || d === 'ARCHIVE' || (d === 'VALIDE' && (statut === 'SUSPENDU' || statut === 'ARCHIVE')) ? suspendre : valider,
  );
  const nomMachine = (mid: string) => (f.machines.find((m) => m.id === mid)?.nom as string | undefined) ?? '—';
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const dispo = disponibiliteCourante(f.disponibilites, aujourdhui);

  return (
    <div>
      <EnTete
        retour={{ href: '/admin/partenaires', label: 'Partenaires' }}
        surtitre="Elembo Partners"
        titre={p.nom}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <BadgePartenaire statut={statut} actif={p.actif} />
            <span>{texte(p.specialite)}</span>
            <span className="text-neutral-400">·</span>
            <span>{p.origine === 'INSCRIPTION' ? 'Inscrit depuis le portail' : 'Créé par Smart Vision'}</span>
          </span>
        }
      />
      <Flash ok={messages.ok} erreur={messages.erreur} messages={MESSAGES} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {decisions.length ? (
            <Carte id="decision" titre="Décision sur le partenaire" description={`Statut actuel : ${statutPartenaire(statut).label}`}>
              {texte(p.motif_decision) && statut !== 'VALIDE' ? <p className="mb-3 text-sm text-neutral-600">Dernier motif : {texte(p.motif_decision)}</p> : null}
              <div className="flex flex-wrap gap-2">
                {decisions.map((d) =>
                  (DECISIONS_AVEC_MOTIF as readonly string[]).includes(d) ? (
                    <Confirmation key={d} resume={<span className={bouton(d === 'SUSPENDU' ? 'danger' : 'secondaire', 'sm')}>{LIBELLE_DECISION[d]}…</span>}>
                      <form action={deciderPartenaireAction} className="space-y-2">
                        <input type="hidden" name="partenaire_id" value={p.id} />
                        <input type="hidden" name="statut_actuel" value={statut} />
                        <input type="hidden" name="decision" value={d} />
                        <label className={libelle}>
                          Motif (transmis à l’atelier)
                          <textarea name="motif" required maxLength={2000} rows={2} className={champ} />
                        </label>
                        <button type="submit" className={bouton(d === 'SUSPENDU' ? 'danger' : 'primaire', 'sm')}>
                          {LIBELLE_DECISION[d]}
                        </button>
                      </form>
                    </Confirmation>
                  ) : (
                    <form key={d} action={deciderPartenaireAction}>
                      <input type="hidden" name="partenaire_id" value={p.id} />
                      <input type="hidden" name="statut_actuel" value={statut} />
                      <input type="hidden" name="decision" value={d} />
                      <button type="submit" className={bouton(d === 'VALIDE' ? 'succes' : 'secondaire', 'sm')}>
                        {d === 'VALIDE' && (statut === 'SUSPENDU' || statut === 'ARCHIVE') ? 'Réactiver' : LIBELLE_DECISION[d]}
                      </button>
                    </form>
                  ),
                )}
              </div>
            </Carte>
          ) : null}

          <Carte id="machines" titre={`Machines (${f.machines.filter((m) => !m.archive).length})`}>
            {f.machines.length === 0 ? <Vide>Aucune machine déclarée.</Vide> : null}
            <ul className="divide-y divide-neutral-100">
              {f.machines.map((m) => (
                <li key={m.id} className={`py-3 ${m.archive ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {m.nom} {m.archive ? <Badge>Retirée</Badge> : <BadgeValidationAdmin statut={m.statut_validation} />}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {[
                          nomTypeMachine(String(m.type_machine)),
                          texte(m.marque),
                          texte(m.modele),
                          Number(m.quantite) > 1 ? `× ${m.quantite as number}` : null,
                          mm(m.largeur_max_mm) ? `laize ${mm(m.largeur_max_mm)}` : null,
                          ETATS_MACHINE.find((e) => e.id === m.etat)?.nom,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {texte(m.motif_refus) && m.statut_validation === 'REFUSEE' ? <p className="text-xs text-orange-800">Motif : {texte(m.motif_refus)}</p> : null}
                    </div>
                    {valider && !m.archive ? <DecisionElement type="machine" id={m.id} partenaireId={p.id} statut={m.statut_validation} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Carte>

          <Carte id="capacites" titre={`Capacités (${f.capacites.filter((c) => c.actif).length})`}>
            {f.capacites.length === 0 ? <Vide>Aucune capacité déclarée.</Vide> : null}
            <ul className="divide-y divide-neutral-100">
              {f.capacites.map((c) => {
                const unite = UNITES_CAPACITE.find((u) => u.id === c.unite_capacite);
                return (
                  <li key={c.id} className={`py-3 ${c.actif ? '' : 'opacity-60'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {c.nom} {c.actif ? <BadgeValidationAdmin statut={c.statut_validation} /> : <Badge>En pause</Badge>}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {[
                            nomPrestation(String(c.prestation)),
                            c.capacite_journaliere !== null ? `${Number(c.capacite_journaliere).toLocaleString('fr-FR')} ${unite?.parJour ?? ''}` : null,
                            mm(c.largeur_max_mm) ? `jusqu’à ${mm(c.largeur_max_mm)}` : null,
                            c.delai_jours !== null ? `${c.delai_jours as number} j` : null,
                            c.delai_express_jours !== null ? `express ${c.delai_express_jours as number} j` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {[
                            (c.finitions as string[]).map((x) => FINITIONS_PRODUCTION.find((y) => y.id === x)?.nom ?? x).join(', '),
                            c.machines.length ? `Machines : ${c.machines.map(nomMachine).join(', ')}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {texte(c.motif_refus) && c.statut_validation === 'REFUSEE' ? <p className="text-xs text-orange-800">Motif : {texte(c.motif_refus)}</p> : null}
                      </div>
                      {valider && c.actif ? <DecisionElement type="capacite" id={c.id} partenaireId={p.id} statut={c.statut_validation} /> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Carte>

          <Carte id="services" titre={`Services (${f.services.filter((s) => s.actif).length})`}>
            {f.services.length === 0 ? <Vide>Aucun service déclaré.</Vide> : null}
            <ul className="divide-y divide-neutral-100">
              {f.services.map((s) => (
                <li key={s.id} className={`py-3 ${s.actif ? '' : 'opacity-60'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {s.nom} {s.actif ? <BadgeValidationAdmin statut={s.statut_validation} /> : <Badge>En pause</Badge>}{' '}
                        {s.realise_par_tiers ? <Badge ton="alerte">Avec un autre atelier</Badge> : null}
                      </p>
                      <p className="text-xs text-neutral-500">{CATEGORIES_SERVICE.find((c) => c.id === s.categorie)?.nom}</p>
                      {s.realise_par_tiers ? <p className="text-xs text-orange-800">Sous-traitance : {texte(s.tiers_precision)}</p> : null}
                    </div>
                    {valider && s.actif ? <DecisionElement type="service" id={s.id} partenaireId={p.id} statut={s.statut_validation} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Carte>

          {voirTarifs ? (
            <Carte id="tarifs" titre="Tarifs négociés" description="Confidentiels : admin et finance. Un prix n’est utilisé qu’une fois validé.">
              {tarifs.length === 0 ? <Vide>Aucun tarif.</Vide> : null}
              <ul className="divide-y divide-neutral-100">
                {tarifs.map((l) => (
                  <li key={l.ligneeId} className="space-y-2 py-3">
                    <p className="font-medium">{l.nom}</p>
                    {l.enVigueur ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <p>
                          <BadgeTarif statut="VALIDE" /> {resumeVersion(l.enVigueur)}{' '}
                          <span className="text-xs text-neutral-500">
                            depuis le {dateCourte(l.enVigueur.valide_du)}
                            {l.enVigueur.valide_jusquau ? ` jusqu’au ${dateCourte(l.enVigueur.valide_jusquau)}` : ''}
                          </span>
                        </p>
                        {deciderTarifs ? (
                          <form action={deciderTarifAction}>
                            <input type="hidden" name="partenaire_id" value={p.id} />
                            <input type="hidden" name="tarif_id" value={l.enVigueur.id} />
                            <input type="hidden" name="decision" value="RETIRER" />
                            <button type="submit" className={bouton('discret')}>
                              Retirer
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                    {l.enCours ? (
                      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm">
                        <p>
                          <BadgeTarif statut={l.enCours.statut} /> v{l.enCours.version} · {resumeVersion(l.enCours)}{' '}
                          <span className="text-xs text-neutral-500">{l.enCours.origine === 'SMART_VISION' ? 'saisi par Smart Vision' : 'proposé par l’atelier'}</span>
                        </p>
                        {l.enCours.conditions ? <p className="text-xs text-neutral-600">{l.enCours.conditions}</p> : null}
                        {l.enCours.motif_decision ? <p className="text-xs text-orange-800">Demande : {l.enCours.motif_decision}</p> : null}
                        {deciderTarifs && l.enCours.statut === 'PROPOSE' ? (
                          <div className="flex flex-wrap items-start gap-2">
                            <form action={deciderTarifAction} className="flex flex-wrap items-end gap-2">
                              <input type="hidden" name="partenaire_id" value={p.id} />
                              <input type="hidden" name="tarif_id" value={l.enCours.id} />
                              <input type="hidden" name="decision" value="VALIDER" />
                              <label className={libelle}>
                                À partir du
                                <input type="date" name="valide_du" defaultValue={aujourdhui} className={champ} />
                              </label>
                              <label className={libelle}>
                                Jusqu’au (facultatif)
                                <input type="date" name="valide_jusquau" className={champ} />
                              </label>
                              <button type="submit" className={bouton('succes', 'sm')}>
                                Valider
                              </button>
                            </form>
                            {(['MODIFIER', 'REFUSER'] as const).map((d) => (
                              <Confirmation key={d} resume={<span className={bouton('secondaire', 'sm')}>{d === 'MODIFIER' ? 'Demander une modification…' : 'Refuser…'}</span>}>
                                <form action={deciderTarifAction} className="space-y-2">
                                  <input type="hidden" name="partenaire_id" value={p.id} />
                                  <input type="hidden" name="tarif_id" value={l.enCours!.id} />
                                  <input type="hidden" name="decision" value={d} />
                                  <label className={libelle}>
                                    Motif (transmis à l’atelier)
                                    <textarea name="motif" required maxLength={2000} rows={2} className={champ} />
                                  </label>
                                  <button type="submit" className={bouton(d === 'REFUSER' ? 'danger' : 'primaire', 'sm')}>
                                    {d === 'MODIFIER' ? 'Demander' : 'Refuser'}
                                  </button>
                                </form>
                              </Confirmation>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {saisir && !l.enCours ? (
                      <Confirmation resume={<span className={bouton('discret')}>Saisir un nouveau prix</span>}>
                        <form action={saisirTarifAction} className="space-y-3">
                          <input type="hidden" name="partenaire_id" value={p.id} />
                          <input type="hidden" name="lignee_id" value={l.ligneeId} />
                          <ChampsTarifAdmin base={l.enVigueur ?? l.historique[0]} />
                          <button type="submit" className={bouton('primaire', 'sm')}>
                            Enregistrer (à valider ensuite)
                          </button>
                        </form>
                      </Confirmation>
                    ) : null}
                    {l.historique.length > 1 ? (
                      <details className="text-xs text-neutral-600">
                        <summary className="cursor-pointer">Historique ({l.historique.length} versions)</summary>
                        <ul className="mt-1 space-y-1">
                          {l.historique.map((h) => (
                            <li key={h.id}>
                              v{h.version} · <BadgeTarif statut={h.statut} /> · {resumeVersion(h)} · {dateCourte(h.cree_le)}
                              {h.motif_decision ? ` · ${h.motif_decision}` : ''}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
              {saisir ? (
                <div className="mt-4 border-t border-neutral-100 pt-4">
                  <Confirmation resume={<span className={bouton('secondaire', 'sm')}>Saisir un tarif négocié</span>}>
                    <form action={saisirTarifAction} className="space-y-3">
                      <input type="hidden" name="partenaire_id" value={p.id} />
                      <ChampsTarifAdmin />
                      <button type="submit" className={bouton('primaire', 'sm')}>
                        Enregistrer (à valider ensuite)
                      </button>
                    </form>
                  </Confirmation>
                </div>
              ) : null}
            </Carte>
          ) : null}
        </div>

        <div className="space-y-6">
          <Carte id="travaux" titre={`Travaux (${affectations.length})`} description="Propositions et affectations acceptées.">
            {affectations.length === 0 ? (
              <Vide>Aucun travail proposé à cet atelier.</Vide>
            ) : (
              <div className={tableau.conteneur}>
                <table className={tableau.table}>
                  <thead className={tableau.thead}>
                    <tr>
                      <th className={tableau.th}>Référence</th>
                      <th className={tableau.th}>Statut</th>
                      <th className={tableau.th}>Créée</th>
                      {voirCoutsAffectations ? <th className={`${tableau.th} text-right`}>Montant</th> : null}
                    </tr>
                  </thead>
                  <tbody className={tableau.tbody}>
                    {affectations.map((a) => {
                      const badge = estStatutAffectation(a.statut) ? statutAffectation(a.statut) : { label: a.statut, ton: 'neutre' as const };
                      return (
                        <tr key={a.id} className={tableau.tr}>
                          <td className={tableau.td}>
                            <Link href="/admin/affectations" className="font-medium tabular-nums hover:underline">
                              {a.reference}
                            </Link>
                            <p className="text-xs text-neutral-500">{a.commande?.reference ?? a.objet}</p>
                          </td>
                          <td className={tableau.td}>
                            <Badge ton={badge.ton}>{badge.label}</Badge>
                            {a.statut === 'REFUSEE' && a.motif_refus ? (
                              <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-600">Motif : {a.motif_refus}</p>
                            ) : a.statut === 'ANNULEE' && a.motif_annulation ? (
                              <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-600">Motif : {a.motif_annulation}</p>
                            ) : null}
                          </td>
                          <td className={tableau.td}>{dateCourte(a.cree_le)}</td>
                          {voirCoutsAffectations ? (
                            <td className={tableau.nombre}>
                              {fcfa(a.montant_fcfa)}
                              <p className="text-xs font-normal text-neutral-500">{libelleSourceTarif(a.tarif_source)}</p>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Carte>

          <Carte id="informations" titre="Informations">
            <Definitions
              elements={[
                ['Raison sociale', texte(p.raison_sociale)],
                ['Responsable', [texte(p.contact_nom), texte(p.contact_fonction)].filter(Boolean).join(', ') || null],
                ['Téléphone', texte(p.telephone)],
                ['WhatsApp', texte(p.whatsapp)],
                ['E-mail', texte(p.email)],
                ['Adresse', [texte(p.adresse), texte(p.quartier), texte(p.ville)].filter(Boolean).join(', ') || null],
                ['Point de repère', texte(p.localisation)],
                ['Zone desservie', texte(p.zone_desservie)],
                ['RCCM / NIU', [texte(p.rccm), texte(p.niu)].filter(Boolean).join(' / ') || null],
                ['Délai habituel', p.delai_jours !== null && p.delai_jours !== undefined ? `${p.delai_jours as number} jours` : null],
                ['Présentation', texte(p.description)],
                ['Conditions', texte(p.conditions_particulieres)],
                ['Validé le', p.valide_le ? `${dateCourte(p.valide_le as string)}${p.valide_par_email ? ` par ${p.valide_par_email as string}` : ''}` : null],
              ]}
            />
            {gerer ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-neutral-600">Modifier les informations</summary>
                <form action={enregistrerPartenaireAction} className="mt-3 space-y-3">
                  <input type="hidden" name="partenaire_id" value={p.id} />
                  <ChampsFiche f={p} />
                  <button type="submit" className={bouton('primaire', 'sm')}>
                    Enregistrer
                  </button>
                </form>
              </details>
            ) : null}
          </Carte>

          <Carte id="comptes" titre={`Comptes (${f.utilisateurs.filter((u) => u.actif).length})`}>
            {f.utilisateurs.length === 0 ? <p className="text-sm text-neutral-500">Aucun compte rattaché.</p> : null}
            <ul className="divide-y divide-neutral-100 text-sm">
              {f.utilisateurs.map((u) => (
                <li key={u.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${u.actif ? '' : 'opacity-60'}`}>
                  <span className="min-w-0 break-all">
                    {u.email ?? '—'} · <span className="text-neutral-500">{u.role_partenaire.toLowerCase()}</span>
                    {!u.actif ? ' · désactivé' : ''}
                  </span>
                  {comptes ? (
                    <form action={basculerMembreAdminAction}>
                      <input type="hidden" name="partenaire_id" value={p.id} />
                      <input type="hidden" name="membre_id" value={u.id} />
                      <input type="hidden" name="actif" value={u.actif ? 'false' : 'true'} />
                      <button type="submit" className={bouton('discret')}>
                        {u.actif ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            {comptes ? (
              <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
                {invitationsEnAttente.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {invitationsEnAttente.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="break-all">
                          {i.email} · <span className="text-neutral-500">invité {i.role_partenaire.toLowerCase()}, jusqu’au {dateCourte(i.expire_le)}</span>
                        </span>
                        <form action={revoquerInvitationAdminAction}>
                          <input type="hidden" name="partenaire_id" value={p.id} />
                          <input type="hidden" name="invitation_id" value={i.id} />
                          <button type="submit" className={bouton('discret')}>
                            Annuler
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {statut !== 'SUSPENDU' && statut !== 'ARCHIVE' ? <InvitationResponsable partenaireId={p.id} nom={p.nom} /> : null}
              </div>
            ) : null}
          </Carte>

          <Carte titre="Disponibilité">
            {dispo ? (
              <p className="text-sm">
                <Badge ton={dispo.statut === 'DISPONIBLE' || dispo.statut === 'ACTIVITE_NORMALE' ? 'succes' : 'alerte'}>
                  {STATUTS_DISPONIBILITE.find((x) => x.id === dispo.statut)?.nom ?? dispo.statut}
                </Badge>{' '}
                depuis le {dateCourte(dispo.debut_periode)}
                {dispo.fin_periode ? ` jusqu’au ${dateCourte(dispo.fin_periode)}` : ''}
                {dispo.delai_moyen_jours !== null ? ` · délai moyen ${dispo.delai_moyen_jours} j` : ''}
                {dispo.commentaire ? <span className="block text-xs text-neutral-500">{dispo.commentaire}</span> : null}
              </p>
            ) : (
              <p className="text-sm text-neutral-500">Aucune déclaration en cours.</p>
            )}
          </Carte>

          {f.fichiers.length ? (
            <Carte titre={`Photos et documents (${f.fichiers.length})`}>
              <ul className="grid grid-cols-3 gap-2">
                {f.fichiers.map((x) => (
                  <li key={x.id}>
                    <a href={x.url ?? '#'} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-neutral-200" title={x.nom_original ?? undefined}>
                      {x.url && x.type_mime.startsWith('image/') ? (
                        // URL signée de 10 minutes : <img> simple (pas de domaine next/image).
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={x.url} alt={x.nom_original ?? x.type_fichier} loading="lazy" className="aspect-square w-full object-cover" />
                      ) : (
                        <span className="grid aspect-square place-items-center bg-neutral-50 p-1 text-center text-[11px]">{x.nom_original ?? 'PDF'}</span>
                      )}
                    </a>
                    <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                      {x.type_fichier === 'MACHINE' ? nomMachine(x.machine_id ?? '') : x.type_fichier.toLowerCase()}
                    </p>
                  </li>
                ))}
              </ul>
            </Carte>
          ) : null}

          <Carte id="notes" titre="Notes internes" description="Jamais visibles de l’atelier.">
            {gerer ? (
              <form action={noteAction} className="mb-3 space-y-2">
                <input type="hidden" name="partenaire_id" value={p.id} />
                <textarea name="contenu" required maxLength={4000} rows={2} placeholder="Visite d’atelier, échange téléphonique…" className={champ} />
                <button type="submit" className={bouton('secondaire', 'sm')}>
                  Ajouter la note
                </button>
              </form>
            ) : null}
            {notes.length === 0 ? <p className="text-sm text-neutral-500">Aucune note.</p> : null}
            <ul className="space-y-2 text-sm">
              {notes.map((n) => (
                <li key={n.id}>
                  <p className="whitespace-pre-line">{n.contenu}</p>
                  <p className="text-xs text-neutral-500">
                    {n.auteur_email ?? '—'} · {dateHeure(n.cree_le)}
                  </p>
                </li>
              ))}
            </ul>
          </Carte>

          <Carte titre="Historique des statuts">
            {f.historique.length === 0 ? <p className="text-sm text-neutral-500">Aucun changement de statut.</p> : null}
            <ul className={`space-y-1.5 text-sm ${tableau.tbody}`}>
              {f.historique.map((h, i) => (
                <li key={i}>
                  {statutPartenaire(h.ancien_statut as StatutPartenaire).label} → <strong>{statutPartenaire(h.nouveau_statut as StatutPartenaire).label}</strong>
                  <span className="text-xs text-neutral-500"> · {dateHeure(h.cree_le)}</span>
                  {h.motif ? <span className="block text-xs text-neutral-600">{h.motif}</span> : null}
                </li>
              ))}
            </ul>
          </Carte>
        </div>
      </div>
    </div>
  );
}
