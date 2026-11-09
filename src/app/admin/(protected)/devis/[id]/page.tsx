import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { clientDuDevis, devisParId, fichiersDuDevis } from '@/server/devis/repository';
import { MODES_PAIEMENT, commandeDuDevis } from '@/server/commandes/repository';
import {
  changerStatut,
  creerCommande,
  deciderPourClient,
  proposerDevis,
  revoquerSessions,
  telechargerFichier,
} from './actions';

export const metadata: Metadata = { title: 'Détail du devis — Elembo' };
export const dynamic = 'force-dynamic';

function euros(valeur: number | null): string {
  return valeur === null ? '—' : `${valeur.toLocaleString('fr-FR')} FCFA`;
}

function valeurLisible(valeur: unknown): string {
  if (Array.isArray(valeur)) return valeur.length ? valeur.join(', ') : '—';
  if (typeof valeur === 'boolean') return valeur ? 'Oui' : 'Non';
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  return String(valeur);
}

function dateCourte(valeur: string | null): string {
  if (!valeur) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(valeur),
  );
}

export default async function PageDetailDevis({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string; ok?: string }>;
}) {
  const { id } = await params;
  const messages = await searchParams;
  const devis = await devisParId(id);
  if (!devis) notFound();
  const client = await clientDuDevis(devis.client_id);
  const fichiers = await fichiersDuDevis(id);
  const commande = await commandeDuDevis(id);
  const peutDecider = devis.statut === 'PROPOSE';

  return (
    <div>
      <Link href="/admin/devis" className="text-sm text-neutral-500 underline">
        ← Tous les devis
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-neutral-500">{devis.reference}</p>
          <h1 className="mt-1 text-3xl font-semibold">{String((devis.contact_snapshot as { nom?: unknown }).nom ?? client?.nom ?? 'Client')}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {devis.famille} · {devis.statut} · créé le {dateCourte(devis.cree_le)}
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-medium">
          {devis.statut}
        </span>
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

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Demande</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {devis.notes_internes ? (
              <div>
                <dt className="text-neutral-500">Notes internes</dt>
                <dd className="mt-1 whitespace-pre-wrap">{devis.notes_internes}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-neutral-500">Besoin</dt>
              <dd className="mt-1 whitespace-pre-wrap">{devis.besoin}</dd>
            </div>
            {Object.keys(devis.specifications ?? {}).length > 0 ? (
              <div>
                <dt className="text-neutral-500">Précisions de la demande</dt>
                <dd className="mt-2">
                  <ul className="space-y-1.5">
                    {Object.entries(devis.specifications as Record<string, unknown>).map(([cle, valeur]) => (
                      <li key={cle} className="flex flex-wrap gap-x-2 text-sm">
                        <span className="text-neutral-500">{cle} :</span>
                        <span>{valeurLisible(valeur)}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-neutral-500">Format</dt>
                <dd>{devis.format ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Quantité</dt>
                <dd>{devis.quantite ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Montant proposé</dt>
                <dd className="font-semibold">{euros(devis.montant_propose_fcfa)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Expire le</dt>
                <dd>{dateCourte(devis.expire_le)}</dd>
              </div>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Client</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-neutral-500">Nom</dt>
              <dd>{client?.nom ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Société</dt>
              <dd>{client?.societe ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Email</dt>
              <dd>{client?.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Téléphone</dt>
              <dd>{client?.telephone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Ville</dt>
              <dd>{client?.ville ?? '—'}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Pièces jointes</h2>
        {fichiers.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Aucune pièce jointe.</p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-100">
            {fichiers.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">{f.nom}</p>
                  <p className="text-xs text-neutral-500">
                    {f.type_mime} · {(f.taille_octets / 1024 / 1024).toFixed(2)} Mo · {f.verifie ? 'vérifié' : 'non vérifié'} · analyse : {f.statut_analyse}
                  </p>
                </div>
                {f.verifie && f.statut_analyse === 'PROPRE' ? (
                  <form action={telechargerFichier}>
                    <input type="hidden" name="devis_id" value={id} />
                    <input type="hidden" name="fichier_id" value={f.id} />
                    <button type="submit" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium">
                      Télécharger (60 s)
                    </button>
                  </form>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
                    Téléchargement bloqué
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {devis.statut === 'ACCEPTE' ? (
        <section className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Transmission à l’atelier</h2>
              <p className="mt-1 max-w-2xl text-sm text-green-900/80">
                Une commande distincte est créée avec sa propre référence, ses fichiers et son cycle
                de production. Le paiement confirmé ne déclenche pas automatiquement la fabrication.
              </p>
            </div>
            {commande ? (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-green-900">
                {commande.statut}
              </span>
            ) : null}
          </div>

          {commande ? (
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-green-200 bg-white p-4 text-sm">
              <p className="font-mono font-semibold">{commande.reference}</p>
              <p className="text-neutral-600">
                Total : {commande.total_fcfa.toLocaleString('fr-FR')} FCFA
              </p>
              <Link href={`/admin/commandes/${commande.id}`} className="font-semibold underline">
                Ouvrir la commande
              </Link>
            </div>
          ) : (
            <form action={creerCommande} className="mt-4 grid gap-4 rounded-xl border border-green-200 bg-white p-4 sm:grid-cols-2">
              <input type="hidden" name="devis_id" value={id} />
              <label className="block text-sm">
                Mode de paiement prévu
                <select name="mode_paiement" defaultValue="MTN_MOMO" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" required>
                  {MODES_PAIEMENT.map((mode) => (
                    <option key={mode.id} value={mode.id}>{mode.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Frais de livraison (FCFA)
                <input type="number" name="livraison" min="0" step="1" defaultValue="0" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" required />
              </label>
              <label className="block text-sm">
                Ville de livraison
                <input type="text" name="ville" maxLength={120} defaultValue={client?.ville ?? 'Brazzaville'} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
              </label>
              <label className="block text-sm">
                Date de livraison souhaitée
                <input type="date" name="livraison_prevue" className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
              </label>
              <label className="block text-sm sm:col-span-2">
                Adresse de livraison
                <input type="text" name="adresse" maxLength={300} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" className="rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white">
                  Créer la commande
                </button>
                <p className="mt-2 text-xs text-neutral-500">
                  La commande sera créée en brouillon. Aucun paiement n’est encaissé par cette action.
                </p>
              </div>
            </form>
          )}
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Proposer un prix</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Le prix devient visible par le client et la transition est journalisée.
          </p>
          <form action={proposerDevis} className="mt-4 space-y-3">
            <input type="hidden" name="devis_id" value={id} />
            <label className="block text-sm">
              Montant en FCFA
              <input
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                type="number"
                name="montant"
                min="1"
                step="1"
                defaultValue={devis.montant_propose_fcfa ?? undefined}
                required
              />
            </label>
            <label className="block text-sm">
              Note interne (facultative)
              <textarea
                className="mt-1 min-h-20 w-full rounded-xl border border-neutral-300 px-3 py-2"
                name="note"
                maxLength={2000}
              />
            </label>
            <button type="submit" className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white">
              Enregistrer la proposition
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Actions</h2>
          <div className="mt-4 space-y-4">
            {devis.statut === 'NOUVEAU' ? (
              <form action={changerStatut}>
                <input type="hidden" name="devis_id" value={id} />
                <input type="hidden" name="statut" value="EN_ANALYSE" />
                <button type="submit" className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm">
                  Passer en analyse
                </button>
              </form>
            ) : null}

            {peutDecider ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <form action={deciderPourClient}>
                  <input type="hidden" name="devis_id" value={id} />
                  <input type="hidden" name="decision" value="ACCEPTE" />
                  <button type="submit" className="w-full rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white">
                    Marquer accepté
                  </button>
                </form>
                <form action={deciderPourClient}>
                  <input type="hidden" name="devis_id" value={id} />
                  <input type="hidden" name="decision" value="REFUSE" />
                  <button type="submit" className="w-full rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-800">
                    Marquer refusé
                  </button>
                </form>
              </div>
            ) : null}

            <form action={revoquerSessions}>
              <input type="hidden" name="devis_id" value={id} />
              <button type="submit" className="text-sm text-neutral-600 underline">
                Révoquer toutes les sessions client
              </button>
            </form>
            <p className="text-xs text-neutral-500">
              La révocation est enregistrée dans l’audit. Aucun paiement n’est déclenché.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
