import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BoutonImprimer } from '@/components/admin/BoutonImprimer';
import { Badge, Carte, Definitions, EnTete, Flash, Vide, bouton, champ, libelle, tableau } from '@/components/admin/ui';
import { aujourdhui, dateCourte, dateHeure, estUuid, fcfa, libelleEtape, taille } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { STATUTS_PRODUCTION, libelleCommande, libelleProduction } from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import {
  dossierProduction,
  listerPartenaires,
  quantiteTotale,
  quantitesParTailleCouleur,
  type Partenaire,
  type Tache,
} from '@/server/admin/production';
import { creerTacheAction, modifierTacheAction } from '../actions';

export const metadata: Metadata = { title: 'Dossier de production' };
export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  VISUEL_IMPRESSION: 'Visuel HD',
  FICHE_PRODUCTION: 'Fiche technique',
  BAT: 'BAT',
  SOURCE: 'Source client',
  FACTURE: 'Facture',
  AUTRE: 'Autre',
};

const OPTIONS_MASQUEES = new Set(['produitId', 'devis_id', 'devis_reference', 'specifications']);

function valeurOption(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function ChampsTache({ tache, partenaires }: { tache?: Tache; partenaires: Partenaire[] }) {
  return (
    <>
      <label className={libelle}>
        État
        <select name="statut" defaultValue={tache?.statut ?? 'A_FAIRE'} className={champ}>
          {STATUTS_PRODUCTION.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className={libelle}>
        Prestataire
        <select name="partenaire_id" defaultValue={tache?.partenaire_id ?? ''} className={champ}>
          <option value="">Atelier interne</option>
          {partenaires
            .filter((p) => p.actif || p.id === tache?.partenaire_id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom} — {p.specialite}
              </option>
            ))}
        </select>
      </label>
      <label className={libelle}>
        Date prévue
        <input type="date" name="date_prevue" defaultValue={tache?.date_prevue ?? ''} className={champ} />
      </label>
      <label className={libelle}>
        Coût (sous-traitance, FCFA)
        <input type="number" name="cout_fcfa" min={0} step={1} defaultValue={tache?.cout_fcfa ?? ''} className={champ} />
      </label>
      <label className={`${libelle} sm:col-span-2`}>
        Instructions
        <textarea name="instructions" rows={2} maxLength={4000} defaultValue={tache?.instructions ?? ''} className={champ} />
      </label>
    </>
  );
}

export default async function PageDossierProduction({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  // Le dossier (fiche technique + fichiers HD) est réservé aux personnes autorisées.
  const staff = await exigerAcces('production.fichiers');
  const { id } = await params;
  if (!estUuid(id)) notFound();
  const messages = await searchParams;
  const [dossier, partenaires] = await Promise.all([dossierProduction(id), listerPartenaires()]);
  if (!dossier) notFound();

  const { commande: c, fichiers } = dossier;
  const contact = c.contact_snapshot as Record<string, unknown>;
  const design = c.design_snapshot as Record<string, unknown>;
  const quantites = quantitesParTailleCouleur(c.lignes, design);
  const peutModifier = peut(staff.role, 'production.modifier');
  const jour = aujourdhui();
  const statut = libelleCommande(c.statut);
  const zones = Array.isArray(design.zones) ? (design.zones as unknown[]).map(String) : [];
  const specifications = (design.specifications ?? {}) as Record<string, unknown>;
  const autorisee = ['PAYEE', 'A_PRODUIRE', 'EN_PRODUCTION', 'CONTROLE_QUALITE', 'PRETE', 'EN_LIVRAISON', 'LIVREE'].includes(c.statut);

  return (
    <div className="print:text-[12px]">
      <EnTete
        retour={{ href: '/admin/production', label: 'Atelier' }}
        surtitre="Dossier de production"
        titre={c.reference}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge ton={statut.ton}>{statut.label}</Badge>
            <span>
              {String(contact.nom ?? '—')}
              {c.ville ? ` · ${c.ville}` : ''} · livraison prévue {c.livraison_prevue_le ? dateCourte(c.livraison_prevue_le) : 'non fixée'}
            </span>
          </span>
        }
        actions={
          <span className="flex gap-2 print:hidden">
            <BoutonImprimer className={bouton('secondaire', 'sm')}>Imprimer la fiche</BoutonImprimer>
            <Link href={`/admin/commandes/${c.id}`} className={bouton('secondaire', 'sm')}>
              Commande
            </Link>
          </span>
        }
      />
      <div className="print:hidden">
        <Flash ok={messages.ok} erreur={messages.erreur} messages={{ tache: 'Tâche enregistrée.' }} />
      </div>
      {!autorisee ? (
        <p role="alert" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Cette commande n’est pas payée : ne lancez pas la fabrication.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] print:block print:space-y-4">
        <div className="min-w-0 space-y-6 print:space-y-4">
          <Carte titre="Fiche technique" description={`${quantiteTotale(c.lignes)} pièce(s) au total`}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Quantités par taille et couleur</h3>
            <table className="mt-2 w-full max-w-md text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-1 pr-4 font-medium">Taille / format</th>
                  <th className="py-1 pr-4 font-medium">Couleur</th>
                  <th className="py-1 text-right font-medium">Quantité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {quantites.map((q) => (
                  <tr key={`${q.taille}-${q.couleur}`}>
                    <td className="py-1.5 pr-4 font-medium">{q.taille}</td>
                    <td className="py-1.5 pr-4">{q.couleur}</td>
                    <td className="py-1.5 text-right text-base font-semibold tabular-nums">{q.quantite}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-neutral-500">Articles</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {c.lignes.map((l) => (
                <li key={l.id} className="rounded-lg border border-neutral-100 px-3 py-2">
                  <p className="font-medium">
                    {l.quantite} × {l.designation}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-600">
                    {Object.entries(l.options ?? {})
                      .filter(([cle, v]) => !OPTIONS_MASQUEES.has(cle) && v !== null && v !== '')
                      .map(([cle, v]) => `${cle} : ${valeurOption(v)}`)
                      .join(' · ') || 'Aucune option'}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-6">
              <Definitions
                elements={[
                  ['Produit', String(design.produitNom ?? design.produitId ?? design.famille ?? '—')],
                  ['Couleur du support', typeof design.couleur === 'string' ? design.couleur : null],
                  ['Zones imprimées', zones.length ? zones.join(', ') : null],
                  ['Format (devis)', typeof design.format === 'string' ? design.format : null],
                  ['Origine', design.source === 'DEVIS' ? `Devis ${String(design.devis_reference ?? '')}` : 'Configurateur en ligne'],
                  ['Payée le', dateHeure(c.paye_le)],
                ]}
              />
            </div>
            {typeof design.besoin === 'string' && design.besoin ? (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Besoin exprimé par le client</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm">{design.besoin}</p>
              </div>
            ) : null}
            {Object.keys(specifications).length ? (
              <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {Object.entries(specifications).map(([cle, v]) => (
                  <div key={cle} className="flex gap-2">
                    <dt className="text-neutral-500">{cle} :</dt>
                    <dd>{valeurOption(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </Carte>

          <Carte titre="Fichiers de production" description="Liens signés valables 60 secondes · chaque téléchargement est tracé">
            {fichiers.length === 0 ? (
              <Vide>Aucun fichier. Pour une commande directe, le dossier est envoyé automatiquement après paiement.</Vide>
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className={tableau.table}>
                  <thead className={tableau.thead}>
                    <tr>
                      <th className={tableau.th}>Fichier</th>
                      <th className={tableau.th}>Type</th>
                      <th className={`${tableau.th} text-right`}>Taille</th>
                      <th className={`${tableau.th} print:hidden`} />
                    </tr>
                  </thead>
                  <tbody className={tableau.tbody}>
                    {fichiers.map((f) => (
                      <tr key={f.id}>
                        <td className={`${tableau.td} break-all`}>{f.nom}</td>
                        <td className={tableau.td}>
                          {TYPES[f.type_fichier] ?? f.type_fichier}
                          <span className="block text-[11px] text-neutral-500">{f.type_mime}</span>
                        </td>
                        <td className={tableau.nombre}>{taille(Number(f.taille_octets))}</td>
                        <td className={`${tableau.td} text-right print:hidden`}>
                          <a href={`/admin/fichiers/${f.id}`} className={bouton('secondaire', 'sm')} rel="noreferrer">
                            Télécharger
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Carte>
        </div>

        <aside className="min-w-0 space-y-6 print:space-y-4">
          <Carte titre="Fabrication" id="taches" description="Étapes, prestataire concerné, date prévue et état">
            {c.travaux.length === 0 ? <Vide>Aucune tâche.</Vide> : null}
            <ul className="space-y-4">
              {c.travaux.map((t) => {
                const s = libelleProduction(t.statut);
                const retard = t.date_prevue && t.date_prevue < jour && ['A_FAIRE', 'EN_COURS', 'BLOQUE'].includes(t.statut);
                return (
                  <li key={t.id} className="rounded-lg border border-neutral-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{libelleEtape(t.etape)}</p>
                        <p className="text-xs text-neutral-500">
                          {t.partenaire ? `${t.partenaire.nom} — ${t.partenaire.specialite}` : 'Atelier interne'}
                          {t.date_prevue ? ` · prévu le ${dateCourte(t.date_prevue)}` : ''}
                          {t.termine_le ? ` · terminé le ${dateCourte(t.termine_le)}` : ''}
                        </p>
                      </div>
                      <span className="flex flex-col items-end gap-1">
                        <Badge ton={s.ton}>{s.label}</Badge>
                        {retard ? <Badge ton="danger">En retard</Badge> : null}
                      </span>
                    </div>
                    {t.instructions ? <p className="mt-2 whitespace-pre-wrap text-sm">{t.instructions}</p> : null}
                    {t.cout_fcfa ? <p className="mt-1 text-xs text-neutral-500">Coût : {fcfa(t.cout_fcfa)}</p> : null}
                    {peutModifier ? (
                      <details className="mt-2 print:hidden">
                        <summary className="cursor-pointer text-xs font-medium text-neutral-600">Modifier</summary>
                        <form action={modifierTacheAction} className="mt-2 grid gap-3 sm:grid-cols-2">
                          <input type="hidden" name="commande_id" value={c.id} />
                          <input type="hidden" name="tache_id" value={t.id} />
                          <ChampsTache tache={t} partenaires={partenaires} />
                          <div className="sm:col-span-2">
                            <button type="submit" className={bouton('primaire', 'sm')}>
                              Enregistrer
                            </button>
                          </div>
                        </form>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Carte>

          {peutModifier ? (
            <Carte titre="Ajouter une étape" id="nouvelle-tache" className="print:hidden">
              <form action={creerTacheAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="commande_id" value={c.id} />
                <label className={`${libelle} sm:col-span-2`}>
                  Étape
                  <input name="etape" required minLength={2} maxLength={80} placeholder="Impression DTF, pressage, broderie, encadrement…" className={champ} />
                </label>
                <ChampsTache partenaires={partenaires} />
                <div className="sm:col-span-2">
                  <button type="submit" className={bouton('primaire')}>
                    Ajouter l’étape
                  </button>
                </div>
              </form>
            </Carte>
          ) : null}

          {c.notes ? (
            <Carte titre="Consignes de la commande">
              <p className="whitespace-pre-wrap text-sm">{c.notes}</p>
            </Carte>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
