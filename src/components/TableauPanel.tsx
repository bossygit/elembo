'use client';

// Commande d'un TABLEAU : format, montage, quantité, prix, paiement MoMo.
//
// Le prix affiché est calculé ici (lib/products/tableaux.ts) mais le montant encaissé est
// recalculé par le service de paiement à partir du format choisi — comme pour le textile.
// Après un paiement confirmé, le visuel est généré au format physique du tableau (150 dpi),
// prêt pour l'atelier.

import { useState } from 'react';
import {
  FORMATS,
  conseilFormat,
  devisTableau,
  formatParId,
  libelleBord,
  libelleSupport,
} from '../lib/products/tableaux';
import type { TableauBord, TableauFormatId, TableauOrientation, TableauSupport } from '../lib/products/tableaux';
import type { Zone } from '../lib/products/studio';
import type { FitMode } from '../lib/printArea';
import { DELIVERY, formatFcfa } from '../lib/order/order';
import type { DeliveryCity } from '../lib/order/order';
import { demanderPaiement, suivrePaiement, telephonePlausible } from '../lib/payment/momo';
import type { Paiement } from '../lib/payment/momo';
import { DPI_IMPRESSION_CANVAS, nomFichierImpression, renderVisuelPng } from '../lib/canvas/exportZone';
import { downloadBlob } from '../lib/canvas/export';
import type { Design } from './UploadZone';

/** MTN abandonne une demande non validée au bout de 5 minutes : on suit sur la même fenêtre. */
const FENETRE_PAIEMENT_MS = 5 * 60 * 1000;

type Props = {
  design: Design | null;
  formatId: TableauFormatId;
  orientation: TableauOrientation;
  onFormatId: (id: TableauFormatId) => void;
  onOrientation: (o: TableauOrientation) => void;
  zone: Zone;
  scale: number;
  fitMode: FitMode;
  rotation: number;
  offset: { x: number; y: number };
};

export default function TableauPanel({
  design,
  formatId,
  orientation,
  onFormatId,
  onOrientation,
  zone,
  scale,
  fitMode,
  rotation,
  offset,
}: Props) {
  const [support, setSupport] = useState<TableauSupport>('chassis');
  const [bord, setBord] = useState<TableauBord>('galerie');
  const [quantite, setQuantite] = useState(1);
  const [ville, setVille] = useState<DeliveryCity>('brazzaville');
  const [telephone, setTelephone] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [suivi, setSuivi] = useState<'inactif' | 'attente' | 'succes' | 'echec' | 'expire'>('inactif');
  const [paiement, setPaiement] = useState<Paiement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fichierPret, setFichierPret] = useState<{ url: string; nom: string } | null>(null);

  const devis = devisTableau({ formatId, support, quantite });
  const livraison = DELIVERY.find((d) => d.city === ville)?.feeFcfa ?? null;
  const total = livraison === null ? null : devis.sousTotalFcfa + livraison;
  const numeroOk = telephonePlausible(telephone);
  const conseil = design ? conseilFormat(design.width, design.height) : null;

  /** Génère le visuel d'impression (sans la photo d'ambiance) pour l'atelier. */
  async function produireFichier(reference: string) {
    if (!design) return;
    try {
      const blob = await renderVisuelPng({
        design: { url: design.url, width: design.width, height: design.height },
        zone,
        zoneCm: { w: formatParId(formatId)!.largeurCm, h: formatParId(formatId)!.hauteurCm },
        scale,
        fitMode,
        rotation,
        offset,
        dpi: DPI_IMPRESSION_CANVAS,
      });
      if (!blob) return;
      const nom = nomFichierImpression(reference, formatId);
      const url = URL.createObjectURL(blob);
      setFichierPret({ url, nom });
      downloadBlob(blob, nom);
    } catch {
      // l'échec de génération ne remet pas en cause le paiement déjà encaissé
    }
  }

  async function payer() {
    if (total === null) return;
    setEnCours(true);
    setErreur(null);
    setMessage(null);
    setPaiement(null);
    setFichierPret(null);

    const reference = `${formatId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    try {
      const demande = await demanderPaiement({
        commande: reference,
        produitId: 'tableau',
        lignes: [],
        tableaux: [{ formatId, support, quantite }],
        villeId: ville,
        telephone,
      });
      setPaiement(demande);
      setSuivi('attente');

      const resultat = await suivrePaiement(demande.referenceId, {
        delaiMaxMs: FENETRE_PAIEMENT_MS,
        onEtat: setPaiement,
      });

      if (resultat.paiement.statut === 'PAYE') {
        setSuivi('succes');
        setMessage(
          `Paiement confirmé (${formatFcfa(resultat.paiement.montantFcfa)}) — commande ${reference}. L'atelier prépare votre tableau ${formatParId(formatId)!.label}, ${libelleSupport(support).toLowerCase()}.`,
        );
        await produireFichier(reference);
      } else if (resultat.expire) {
        setSuivi('expire');
      } else {
        setSuivi('echec');
      }
    } catch (e) {
      setSuivi('echec');
      setErreur(e instanceof Error ? e.message : 'Paiement impossible.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        5. Votre tableau : format et commande
      </h2>

      {/* --- format --- */}
      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {FORMATS.map((f) => {
          const actif = f.id === formatId;
          const prix = devisTableau({ formatId: f.id, support, quantite: 1 }).prixUnitaireFcfa;
          return (
            <button
              key={f.id}
              type="button"
              data-testid={`format-${f.id}`}
              onClick={() => onFormatId(f.id)}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                actif
                  ? 'border-[#E85F00] bg-[#E85F00]/10 text-neutral-900'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
              }`}
            >
              <span className="block font-medium">{f.label}</span>
              <span className="block text-xs text-neutral-500">dès {formatFcfa(prix)}</span>
            </button>
          );
        })}
      </div>

      {/* --- conseil selon la photo --- */}
      {conseil && (
        <div
          data-testid="conseil-format"
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
            conseil.tropPetite
              ? 'border-red-200 bg-red-50 text-red-700'
              : conseil.recommande.id === formatId
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          <span className="font-semibold">{conseil.message}</span>{' '}
          {!conseil.tropPetite && conseil.recommande.id !== formatId && (
            <button
              type="button"
              onClick={() => onFormatId(conseil.recommande.id)}
              className="underline underline-offset-2"
            >
              Choisir {conseil.recommande.label}
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {/* --- montage --- */}
        <div>
          <span className="text-sm font-medium text-neutral-800">Montage</span>
          <div className="mt-1 flex flex-col gap-1 text-sm text-neutral-700">
            {(['chassis', 'toile-seule'] as const).map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="support-tableau"
                  checked={support === s}
                  onChange={() => setSupport(s)}
                  className="accent-[#E85F00]"
                />
                {libelleSupport(s)}
              </label>
            ))}
          </div>
        </div>

        {/* --- bord --- */}
        <div>
          <span className="text-sm font-medium text-neutral-800">Bord imprimé</span>
          <div className="mt-1 flex flex-col gap-1 text-sm text-neutral-700">
            {(['galerie', 'encadrement'] as const).map((b) => (
              <label key={b} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="bord-tableau"
                  checked={bord === b}
                  onChange={() => setBord(b)}
                  className="accent-[#E85F00]"
                />
                {b === 'galerie' ? 'Galerie' : 'Encadrement'}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-neutral-500">{libelleBord(bord)}</p>
        </div>

        {/* --- orientation + quantité --- */}
        <div className="flex flex-col gap-3">
          <div>
            <span className="text-sm font-medium text-neutral-800">Orientation</span>
            <div className="mt-1 flex gap-2">
              {(['portrait', 'paysage'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => onOrientation(o)}
                  className={`rounded-lg border px-3 py-1 text-sm ${
                    orientation === o
                      ? 'border-[#E85F00] bg-[#E85F00]/10 text-neutral-900'
                      : 'border-neutral-200 text-neutral-700'
                  }`}
                >
                  {o === 'portrait' ? 'Portrait' : 'Paysage'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="tableau-quantite" className="text-sm font-medium text-neutral-800">
              Quantité
            </label>
            <input
              id="tableau-quantite"
              type="number"
              min={1}
              max={50}
              data-testid="quantite-tableau"
              value={quantite}
              onChange={(e) => setQuantite(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="mt-1 w-24 rounded-lg border border-neutral-300 px-2 py-1 text-sm text-neutral-800"
            />
            {devis.remisePct > 0 && (
              <p className="mt-1 text-xs text-emerald-700">Remise de {devis.remisePct} % appliquée</p>
            )}
          </div>
        </div>
      </div>

      {/* --- livraison et téléphone --- */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tableau-ville" className="text-sm font-medium text-neutral-800">
            Livraison
          </label>
          <select
            id="tableau-ville"
            data-testid="ville-tableau"
            value={ville}
            onChange={(e) => setVille(e.target.value as DeliveryCity)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-800"
          >
            {DELIVERY.map((d) => (
              <option key={d.city} value={d.city}>
                {d.label} — {formatFcfa(d.feeFcfa)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tableau-telephone" className="text-sm font-medium text-neutral-800">
            Numéro MTN MoMo du client
          </label>
          <input
            id="tableau-telephone"
            type="tel"
            inputMode="tel"
            data-testid="telephone-tableau"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="06 12 34 567"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-800"
          />
          {telephone.trim() !== '' && !numeroOk && (
            <p className="mt-1 text-xs text-amber-700">
              Numéro incomplet ou invalide : attendu un mobile MTN à 9 chiffres (06 / 05), ou son format +242.
            </p>
          )}
        </div>
      </div>

      {/* --- récapitulatif --- */}
      <dl className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700" data-testid="recap-tableau">
        <div className="flex justify-between">
          <dt>
            {formatParId(formatId)!.label} — {libelleSupport(support).toLowerCase()}
          </dt>
          <dd>{formatFcfa(devis.prixUnitaireFcfa)} l&apos;unité</dd>
        </div>
        <div className="flex justify-between">
          <dt>
            Quantité {devis.quantite}
            {devis.remisePct > 0 ? ` (remise ${devis.remisePct} %)` : ''}
          </dt>
          <dd>{formatFcfa(devis.sousTotalFcfa)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Livraison {DELIVERY.find((d) => d.city === ville)?.label}</dt>
          <dd>{formatFcfa(livraison)}</dd>
        </div>
        <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 font-semibold text-neutral-900">
          <dt>Total à payer</dt>
          <dd data-testid="total-tableau">{formatFcfa(total)}</dd>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Délai estimé : {devis.delaiJours} jour(s) maximum — visuel d&apos;impression fourni en{' '}
          {DPI_IMPRESSION_CANVAS} dpi.
        </p>
      </dl>

      <button
        type="button"
        onClick={payer}
        data-testid="payer-tableau"
        disabled={enCours || !design || total === null || !numeroOk}
        className="mt-4 w-full rounded-xl bg-[#E85F00] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {enCours
          ? 'Paiement en cours…'
          : suivi === 'attente'
            ? 'En attente de validation sur le téléphone…'
            : `Payer ${formatFcfa(total)} par MTN MoMo`}
      </button>

      {!design && (
        <p className="mt-2 text-xs text-neutral-500">
          Uploadez d&apos;abord votre visuel (étape 2) pour pouvoir commander un tableau.
        </p>
      )}

      {suivi === 'attente' && (
        <p className="mt-2 text-xs text-neutral-500" data-testid="etat-paiement-tableau">
          Demande envoyée (référence {paiement?.referenceId?.slice(0, 8)}…). Validez le paiement sur le téléphone :
          vous avez 5 minutes.
        </p>
      )}

      {message && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p className="font-semibold">{message}</p>
          {fichierPret && (
            <a
              href={fichierPret.url}
              download={fichierPret.nom}
              className="mt-1 inline-block underline underline-offset-2"
            >
              Retélécharger le fichier d&apos;impression ({fichierPret.nom})
            </a>
          )}
        </div>
      )}

      {suivi === 'expire' && (
        <p className="mt-3 text-sm text-amber-800">
          Le délai de validation est dépassé : la demande a expiré sans être validée sur le téléphone. Relancez le
          paiement quand le client est prêt.
        </p>
      )}

      {suivi === 'echec' && (
        <p className="mt-3 text-sm text-red-700" data-testid="erreur-paiement-tableau">
          {erreur ?? 'Le paiement n’a pas abouti.'}
        </p>
      )}
    </section>
  );
}
