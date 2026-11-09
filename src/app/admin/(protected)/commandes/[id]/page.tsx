import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  MODES_PAIEMENT,
  STATUTS_COMMANDE,
  detailCommande,
  type StatutCommande,
} from '@/server/commandes/repository';
import { changerStatutCommande, confirmerPaiement } from '../actions';

export const metadata: Metadata = { title: 'Commande — Elembo' };
export const dynamic = 'force-dynamic';

function dateCourte(valeur: unknown): string {
  if (!valeur || typeof valeur !== 'string') return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(valeur),
  );
}

function jour(valeur: unknown): string {
  if (!valeur || typeof valeur !== 'string') return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(`${valeur}T12:00:00`));
}

function valeur(valeur: unknown): string {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  if (typeof valeur === 'boolean') return valeur ? 'Oui' : 'Non';
  return String(valeur);
}

function libelleStatut(statut: string): string {
  return STATUTS_COMMANDE.find((s) => s.id === statut)?.label ?? statut;
}

function libelleMode(mode: string): string {
  return MODES_PAIEMENT.find((m) => m.id === mode)?.label ?? mode;
}

const SUIVANTS: Record<StatutCommande, StatutCommande[]> = {
  BROUILLON: ['EN_ATTENTE_DE_VALIDATION', 'EN_ATTENTE_DE_PAIEMENT', 'ANNULEE'],
  EN_ATTENTE_DE_VALIDATION: ['EN_ATTENTE_DE_PAIEMENT', 'BROUILLON', 'ANNULEE'],
  EN_ATTENTE_DE_PAIEMENT: ['EN_ATTENTE_DE_VALIDATION', 'ANNULEE'],
  PAYEE: ['A_PRODUIRE', 'REMBOURSEMENT_A_TRAITER'],
  A_PRODUIRE: ['EN_PRODUCTION', 'REMBOURSEMENT_A_TRAITER'],
  EN_PRODUCTION: ['CONTROLE_QUALITE', 'A_PRODUIRE'],
  CONTROLE_QUALITE: ['PRETE', 'EN_PRODUCTION'],
  PRETE: ['EN_LIVRAISON', 'CONTROLE_QUALITE'],
  EN_LIVRAISON: ['LIVREE', 'PRETE'],
  LIVREE: ['REMBOURSEMENT_A_TRAITER'],
  ANNULEE: [],
  REMBOURSEMENT_A_TRAITER: ['ANNULEE'],
};

export default async function PageDetailCommande({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string; ok?: string }>;
}) {
  const { id } = await params;
  const messages = await searchParams;
  const detail = await detailCommande(id);
  if (!detail) notFound();

  const { commande, client, lignes, fichiers, historique, paiements, production } = detail;
  const contact = commande.contact_snapshot as Record<string, unknown>;
  const nom = valeur(contact.nom ?? client?.nom);
  const suivants = SUIVANTS[commande.statut] ?? [];
  const peutConfirmerPaiement =
    commande.statut === 'EN_ATTENTE_DE_PAIEMENT' && commande.mode_paiement !== 'A_CONFIRMER';

  const jalons = [
    ['Créée', commande.cree_le],
    ['Validée', commande.valide_le],
    ['Payée', commande.paye_le],
    ['Production démarrée', commande.production_demarree_le],
    ['Contrôle qualité', commande.controle_qualite_le],
    ['Prête', commande.prete_le],
    ['Livraison démarrée', commande.livraison_demarree_le],
    ['Livrée', commande.livree_le],
    ['Clôturée', commande.cloture_le],
    ['Annulée', commande.annulee_le],
    ['Remboursement demandé', commande.remboursement_demande_le],
  ].filter(([, date]) => Boolean(date));

  return (
    <div>
      <Link href="/admin/commandes" className="text-sm text-neutral-500 underline">
        ← Toutes les commandes
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-neutral-500">{commande.reference}</p>
          <h1 className="mt-1 text-3xl font-semibold">{nom}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {commande.devis_id ? (
              <>
                Depuis le devis{' '}
                <Link href={`/admin/devis/${commande.devis_id}`} className="underline">
                  {valeur(commande.design_snapshot && (commande.design_snapshot as Record<string, unknown>).devis_reference)}
                </Link>
              </>
            ) : (
              'Commande directe'
            )}{' '}
            · créée le {dateCourte(commande.cree_le)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-neutral-900 px-3 py-1.5 font-medium text-white">
            {libelleStatut(commande.statut)}
          </span>
          <span className="rounded-full border border-neutral-300 px-3 py-1.5">
            Paiement : {commande.statut_paiement}
          </span>
          <span className="rounded-full border border-neutral-300 px-3 py-1.5">
            Production : {commande.statut_production}
          </span>
          <span className="rounded-full border border-neutral-300 px-3 py-1.5">
            Livraison : {commande.statut_livraison}
          </span>
        </div>
      </div>

      {messages.erreur ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {messages.erreur}
        </p>
      ) : null}
      {messages.ok ? (
        <p className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Mise à jour enregistrée.
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Produits et quantités</h2>
              <span className="text-xs text-neutral-500">{lignes.length} ligne(s)</span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="py-2 pr-3">Désignation</th>
                    <th className="py-2 pr-3">Qté</th>
                    <th className="py-2 pr-3">Prix unitaire</th>
                    <th className="py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {lignes.map((ligne) => (
                    <tr key={ligne.id}>
                      <td className="py-3 pr-3">
                        <p className="font-medium">{ligne.designation}</p>
                        {ligne.options && Object.keys(ligne.options).length > 0 ? (
                          <p className="mt-1 font-mono text-[10px] text-neutral-500">
                            {JSON.stringify(ligne.options).slice(0, 220)}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-3">{ligne.quantite}</td>
                      <td className="py-3 pr-3">{ligne.prix_unitaire_fcfa.toLocaleString('fr-FR')} FCFA</td>
                      <td className="py-3 font-semibold">{ligne.total_ligne_fcfa.toLocaleString('fr-FR')} FCFA</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-5 grid gap-2 border-t border-neutral-200 pt-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-neutral-500">Sous-total</dt>
                <dd className="mt-1 font-medium">{commande.sous_total_fcfa.toLocaleString('fr-FR')} FCFA</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Livraison</dt>
                <dd className="mt-1 font-medium">{commande.livraison_fcfa.toLocaleString('fr-FR')} FCFA</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Total</dt>
                <dd className="mt-1 text-lg font-semibold">{commande.total_fcfa.toLocaleString('fr-FR')} FCFA</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Paiement</h2>
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-neutral-500">Mode prévu</p>
                <p className="mt-1 font-medium">{libelleMode(commande.mode_paiement)}</p>
              </div>
              <div>
                <p className="text-neutral-500">Statut</p>
                <p className="mt-1 font-medium">{commande.statut_paiement}</p>
              </div>
              <div>
                <p className="text-neutral-500">Payée le</p>
                <p className="mt-1 font-medium">{dateCourte(commande.paye_le)}</p>
              </div>
              <div>
                <p className="text-neutral-500">Référence de paiement</p>
                <p className="mt-1 font-mono text-xs">
                  {paiements[0] ? valeur((paiements[0] as Record<string, unknown>).financial_tx_id) : '—'}
                </p>
              </div>
            </div>

            {peutConfirmerPaiement ? (
              <form action={confirmerPaiement} className="mt-5 grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-[1fr_1fr_auto]">
                <input type="hidden" name="commande_id" value={commande.id} />
                <input type="hidden" name="mode_paiement" value={commande.mode_paiement} />
                <label className="block text-sm">
                  Référence de l’encaissement
                  <input
                    name="reference_paiement"
                    required
                    minLength={3}
                    maxLength={120}
                    placeholder="N° transaction ou pièce"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2"
                  />
                </label>
                <div className="flex items-end">
                  <button type="submit" className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white">
                    Confirmer le paiement
                  </button>
                </div>
                <p className="text-xs text-amber-900/70 sm:col-span-3">
                  Cette action enregistre un paiement réel dans le journal. Elle ne lance pas la
                  fabrication : la commande devra être passée à « À produire » séparément.
                </p>
              </form>
            ) : null}

            {paiements.length > 0 ? (
              <ul className="mt-5 space-y-2 border-t border-neutral-200 pt-4 text-sm">
                {paiements.map((p) => {
                  const ligne = p as Record<string, unknown>;
                  return (
                    <li key={String(ligne.reference_id)} className="flex flex-wrap justify-between gap-2">
                      <span className="font-mono text-xs">{valeur(ligne.financial_tx_id)}</span>
                      <span>{valeur(ligne.statut)}</span>
                      <span>{Number(ligne.montant_fcfa).toLocaleString('fr-FR')} FCFA</span>
                      <span className="text-neutral-500">{dateCourte(ligne.cree_le)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Fichiers associés</h2>
            {fichiers.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">Aucun fichier rattaché.</p>
            ) : (
              <ul className="mt-4 divide-y divide-neutral-100 text-sm">
                {fichiers.map((f) => {
                  const fichier = f as Record<string, unknown>;
                  return (
                    <li key={String(fichier.id)} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="font-medium">{valeur(fichier.nom)}</span>
                      <span className="text-xs text-neutral-500">
                        {valeur(fichier.type_mime)} · {valeur(fichier.statut_analyse ?? 'archivé')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Historique</h2>
            <ol className="mt-4 space-y-3 border-l border-neutral-200 pl-4 text-sm">
              {historique.map((h) => {
                const ligne = h as Record<string, unknown>;
                return (
                  <li key={String(ligne.id)}>
                    <p className="font-medium">
                      {valeur(ligne.ancien_statut)} → {valeur(ligne.nouveau_statut)}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {dateCourte(ligne.cree_le)} · {valeur(ligne.note ?? 'sans note')}
                    </p>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Client et livraison</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-neutral-500">Nom</dt>
                <dd className="mt-1 font-medium">{nom}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Société</dt>
                <dd className="mt-1">{valeur(contact.societe ?? client?.societe)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Téléphone</dt>
                <dd className="mt-1">{valeur(contact.telephone ?? client?.telephone)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Email</dt>
                <dd className="mt-1 break-all">{valeur(contact.email ?? client?.email)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Ville</dt>
                <dd className="mt-1">{valeur(commande.ville ?? client?.ville)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Adresse</dt>
                <dd className="mt-1">{valeur(commande.adresse ?? client?.adresse)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Livraison prévue</dt>
                <dd className="mt-1">{jour(commande.livraison_prevue_le)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Production et livraison</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-neutral-500">Production</dt>
                <dd className="mt-1 font-medium">{commande.statut_production}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Livraison</dt>
                <dd className="mt-1 font-medium">{commande.statut_livraison}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Travaux atelier</dt>
                <dd className="mt-1">{production.length} tâche(s)</dd>
              </div>
            </dl>
            <ul className="mt-4 space-y-2 border-t border-neutral-200 pt-4 text-sm">
              {production.map((t) => {
                const tache = t as Record<string, unknown>;
                return (
                  <li key={String(tache.id)} className="flex justify-between gap-2">
                    <span>{valeur(tache.etape)}</span>
                    <span className="text-neutral-500">{valeur(tache.statut)}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Faire avancer</h2>
            {suivants.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">Aucune transition prévue depuis ce statut.</p>
            ) : (
              <form action={changerStatutCommande} className="mt-4 space-y-3">
                <input type="hidden" name="commande_id" value={commande.id} />
                <label className="block text-sm">
                  Nouveau statut
                  <select name="statut" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" required>
                    {suivants.map((statut) => (
                      <option key={statut} value={statut}>{libelleStatut(statut)}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Note de suivi (facultative)
                  <textarea name="note" maxLength={2000} className="mt-1 min-h-16 w-full rounded-xl border border-neutral-300 px-3 py-2" />
                </label>
                <button type="submit" className="w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white">
                  Enregistrer la transition
                </button>
              </form>
            )}
            <p className="mt-4 text-xs text-neutral-500">
              Le paiement et la production sont deux statuts distincts. Une commande payée reste
              « À produire » tant que l’atelier ne l’a pas prise en charge.
            </p>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Jalons</h2>
            <dl className="mt-4 space-y-2 text-sm">
              {jalons.map(([label, date]) => (
                <div key={String(label)} className="flex justify-between gap-3">
                  <dt className="text-neutral-500">{label}</dt>
                  <dd className="text-right">{dateCourte(date)}</dd>
                </div>
              ))}
              {jalons.length === 0 ? <p className="text-neutral-500">Aucun jalon enregistré.</p> : null}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
