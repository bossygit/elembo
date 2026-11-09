'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Fichier = {
  id: string;
  nom: string;
  typeMime: string;
  tailleOctets: number;
  verifie: boolean;
  statutAnalyse: string;
  telechargementDisponible: boolean;
};

type Commande = {
  reference: string;
  statut: string;
  statutPaiement: string;
  statutProduction: string;
  statutLivraison: string;
  totalFcfa: number;
  creeLe: string;
  livraisonPrevueLe: string | null;
};

type Devis = {
  reference: string;
  statut: string;
  famille: string;
  besoin: string;
  format: string | null;
  specifications?: Record<string, unknown>;
  quantite: number | null;
  montantProposeFcfa: number | null;
  creeLe: string;
  expireLe: string | null;
  commande?: Commande | null;
  fichiers: Fichier[];
};

const LIBELLES_COMMANDE: Record<string, string> = {
  BROUILLON: 'Brouillon',
  EN_ATTENTE_DE_VALIDATION: 'En attente de votre validation',
  EN_ATTENTE_DE_PAIEMENT: 'En attente de paiement',
  PAYEE: 'Paiement confirmé',
  A_PRODUIRE: 'À produire',
  EN_PRODUCTION: 'En production',
  CONTROLE_QUALITE: 'En contrôle qualité',
  PRETE: 'Prête',
  EN_LIVRAISON: 'En livraison',
  LIVREE: 'Livrée',
  ANNULEE: 'Annulée',
  REMBOURSEMENT_A_TRAITER: 'Remboursement à traiter',
};

const LIBELLES_PRODUCTION: Record<string, string> = {
  A_FAIRE: 'À produire',
  EN_COURS: 'En cours',
  TERMINE: 'Terminé',
  BLOQUE: 'Bloqué',
  ANNULE: 'Annulé',
};

const LIBELLES_LIVRAISON: Record<string, string> = {
  A_LIVRER: 'À livrer',
  EN_LIVRAISON: 'En livraison',
  LIVREE: 'Livrée',
  ECHEC: 'Échec',
};

const LIBELLES_PAIEMENT: Record<string, string> = {
  EN_ATTENTE: 'En attente',
  PAYE: 'Confirmé',
  ECHEC: 'Échec',
  ANOMALIE: 'À vérifier',
  REMBOURSE: 'Remboursé',
  NON_REQUIS: 'Non requis',
};

const LIBELLES: Record<string, string> = {
  NOUVEAU: 'Demande reçue',
  EN_ANALYSE: 'En cours d’analyse',
  PROPOSE: 'Proposition envoyée',
  ACCEPTE: 'Accepté',
  REFUSE: 'Refusé',
  EXPIRE: 'Expiré',
};

function csrf(): string {
  const morceau = document.cookie
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('elembo_devis_csrf='));
  return morceau ? decodeURIComponent(morceau.split('=').slice(1).join('=')) : '';
}

export default function SuiviDevis({ reference }: { reference: string }) {
  const [devis, setDevis] = useState<Devis | null>(null);
  const [erreur, setErreur] = useState('');
  const [action, setAction] = useState(false);

  const charger = useCallback(async () => {
    setErreur('');
    const r = await fetch(`/api/devis/${encodeURIComponent(reference)}`, { cache: 'no-store' });
    if (r.status === 404 || r.status === 401) {
      setErreur('Ce devis n’est pas accessible depuis cet appareil. Utilisez la récupération par code.');
      return;
    }
    if (!r.ok) {
      setErreur('Le suivi est temporairement indisponible.');
      return;
    }
    setDevis((await r.json()) as Devis);
  }, [reference]);

  useEffect(() => {
    let actif = true;
    fetch(`/api/devis/${encodeURIComponent(reference)}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!actif) return;
        if (r.status === 404 || r.status === 401) {
          setErreur('Ce devis n’est pas accessible depuis cet appareil. Utilisez la récupération par code.');
          return;
        }
        if (!r.ok) {
          setErreur('Le suivi est temporairement indisponible.');
          return;
        }
        const donnees = (await r.json()) as Devis;
        if (actif) setDevis(donnees);
      })
      .catch(() => {
        if (actif) setErreur('Le suivi est temporairement indisponible.');
      });
    return () => {
      actif = false;
    };
  }, [reference]);

  async function decider(decision: 'ACCEPTE' | 'REFUSE') {
    setAction(true);
    setErreur('');
    try {
      const r = await fetch(`/api/devis/${encodeURIComponent(reference)}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf() },
        body: JSON.stringify({ decision }),
      });
      if (!r.ok) {
        setErreur('La décision n’a pas pu être enregistrée.');
        return;
      }
      await charger();
    } finally {
      setAction(false);
    }
  }

  async function telecharger(fichier: Fichier) {
    const r = await fetch(
      `/api/devis/${encodeURIComponent(reference)}/fichiers/${encodeURIComponent(fichier.id)}/url`,
      { cache: 'no-store' },
    );
    if (!r.ok) {
      setErreur('Téléchargement indisponible.');
      return;
    }
    const { url } = (await r.json()) as { url: string };
    window.location.assign(url);
  }

  if (erreur && !devis) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <p>{erreur}</p>
        <Link href="/devis/suivi" className="mt-3 inline-block underline">
          Récupérer mon devis avec un code
        </Link>
      </div>
    );
  }

  if (!devis) return <p className="text-sm text-attenue">Chargement du devis…</p>;

  const proposition = devis.montantProposeFcfa;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-filet bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-attenue">{devis.reference}</p>
            <h2 className="mt-1 font-display text-2xl text-encre">{LIBELLES[devis.statut] ?? devis.statut}</h2>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium">{devis.famille}</span>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-attenue">Montant proposé</dt>
            <dd className="mt-1 text-lg font-semibold">
              {proposition === null ? 'En attente de chiffrage' : `${proposition.toLocaleString('fr-FR')} FCFA`}
            </dd>
          </div>
          <div>
            <dt className="text-attenue">Quantité</dt>
            <dd className="mt-1">{devis.quantite ?? '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-attenue">Votre besoin</dt>
            <dd className="mt-1 whitespace-pre-wrap">{devis.besoin}</dd>
          </div>
          {devis.specifications && Object.keys(devis.specifications).length > 0 ? (
            <div className="sm:col-span-2">
              <dt className="text-attenue">Précisions transmises</dt>
              <dd className="mt-1">
                <ul className="space-y-1 text-sm">
                  {Object.entries(devis.specifications).map(([cle, valeur]) => (
                    <li key={cle}>
                      <span className="text-attenue">{cle} : </span>
                      {Array.isArray(valeur) ? valeur.join(', ') : String(valeur)}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>

        {devis.statut === 'PROPOSE' ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={action}
              onClick={() => void decider('ACCEPTE')}
              className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Accepter la proposition
            </button>
            <button
              type="button"
              disabled={action}
              onClick={() => void decider('REFUSE')}
              className="rounded-full border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-800 disabled:opacity-60"
            >
              Refuser
            </button>
          </div>
        ) : null}
        {erreur ? <p className="mt-4 text-sm text-red-700">{erreur}</p> : null}
      </div>

      {devis.commande ? (
        <div className="rounded-2xl border border-encre/15 bg-encre p-6 text-creme">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-creme/60">Commande</p>
              <h3 className="mt-1 font-mono text-xl">{devis.commande.reference}</h3>
            </div>
            <span className="rounded-full border border-creme/30 px-3 py-1 text-xs font-medium">
              {LIBELLES_COMMANDE[devis.commande.statut] ?? devis.commande.statut}
            </span>
          </div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-creme/60">Montant total</dt>
              <dd className="mt-1 text-lg font-semibold">
                {devis.commande.totalFcfa.toLocaleString('fr-FR')} FCFA
              </dd>
            </div>
            <div>
              <dt className="text-creme/60">Paiement</dt>
              <dd className="mt-1">
                {LIBELLES_PAIEMENT[devis.commande.statutPaiement] ?? devis.commande.statutPaiement}
              </dd>
            </div>
            <div>
              <dt className="text-creme/60">Production</dt>
              <dd className="mt-1">{LIBELLES_PRODUCTION[devis.commande.statutProduction] ?? devis.commande.statutProduction}</dd>
            </div>
            <div>
              <dt className="text-creme/60">Livraison</dt>
              <dd className="mt-1">{LIBELLES_LIVRAISON[devis.commande.statutLivraison] ?? devis.commande.statutLivraison}</dd>
            </div>
            {devis.commande.livraisonPrevueLe ? (
              <div className="sm:col-span-2">
                <dt className="text-creme/60">Livraison prévue</dt>
                <dd className="mt-1">
                  {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
                    new Date(`${devis.commande.livraisonPrevueLe}T12:00:00`),
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-5 border-t border-creme/20 pt-4 text-xs leading-relaxed text-creme/70">
            Le paiement et la fabrication sont suivis séparément. Votre commande ne passe en
            production qu’après confirmation du paiement et prise en charge par l’atelier.
          </p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-filet bg-white p-6">
        <h3 className="font-semibold">Vos pièces jointes</h3>
        {devis.fichiers.length === 0 ? (
          <p className="mt-2 text-sm text-attenue">Aucune pièce jointe.</p>
        ) : (
          <ul className="mt-3 divide-y divide-filet text-sm">
            {devis.fichiers.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span>
                  {f.nom}{' '}
                  <span className="text-xs text-attenue">
                    ({f.statutAnalyse === 'PROPRE' ? 'analysé' : 'non analysé'})
                  </span>
                </span>
                {f.telechargementDisponible ? (
                  <button type="button" onClick={() => void telecharger(f)} className="underline">
                    Télécharger
                  </button>
                ) : (
                  <span className="text-xs text-amber-800">Indisponible</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-center text-xs text-attenue">
        Ce lien ne contient aucun code secret. Pour retrouver ce devis sur un autre appareil, utilisez{' '}
        <Link href="/devis/suivi" className="underline">
          la récupération par code
        </Link>
        .
      </p>
    </div>
  );
}
