'use client';

// Tunnel de commande : l'utilisateur VALIDE ce qu'il voit, choisit quantité/tailles/ville, paie
// par MTN MoMo, et Elembo produit alors ce que l'atelier attend :
//   • un PNG 300 dpi par face réellement personnalisée (avant, arrière) ;
//   • une FICHE DE PRODUCTION (texte + JSON) avec le positionnement en centimètres, les
//     tailles, les textes (police, corps, couleur), les couleurs et les consignes ;
//   • le récapitulatif FCFA (livraison selon la ville, délai ≤ 3 jours).
//
// Ordre imposé : les fichiers d'impression ne sont générés qu'APRÈS un paiement confirmé (PAYE).
// Le bouton « sans paiement » reste disponible, explicitement, pour les essais de l'atelier.
//
// Aucun montant n'est inventé ni calculé ici : le service de paiement recalcule à partir du
// catalogue, et refuse (motif affiché) si un prix ou des frais ne sont pas définis.

import { useEffect, useRef, useState } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById } from '../../lib/products/catalog';
import { compositionSize, drawComposition, elementsOfSide } from '../../lib/canvas/design-canvas';
import { downloadBlob, renderPrintPng } from '../../lib/canvas/export';
import {
  DELIVERY,
  SIZE_ORDER,
  buildProductionSheet,
  deliveryDays,
  facesToProduce,
  formatFcfa,
  makeReference,
  orderTotals,
  productionSheetText,
} from '../../lib/order/order';
import type { DeliveryCity, GarmentSize, SizeLine } from '../../lib/order/order';
import {
  demanderPaiement,
  suivrePaiement,
  telephonePlausible,
  type Paiement,
} from '../../lib/payment/momo';
import type { Side } from '../../types/configurator';
import { useElementImages } from './useElementImages';

/** Durée maximale de suivi : MTN abandonne une demande non validée au bout de 5 minutes. */
const FENETRE_PAIEMENT_MS = 5 * 60 * 1000;

/** Aperçu d'une face : ce que l'utilisateur valide avant de commander. */
function FacePreview({ side, titre }: { side: Side; titre: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const productId = useConfiguratorStore((s) => s.productId);
  const color = useConfiguratorStore((s) => s.color);
  const elements = useConfiguratorStore((s) => s.elements);
  const measure = useConfiguratorStore((s) => s.measure);
  const images = useElementImages(elements);

  const product = getProductById(productId);
  const area = getPrintArea(product, side);
  const deLaFace = elementsOfSide(elements, side);
  const space = area ? compositionSize(area, 300) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !area || !space) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Fond blanc : on montre le motif tel qu'il apparaîtra, pas la transparence du fichier.
    ctx.clearRect(0, 0, space.width, space.height);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, space.width, space.height);
    drawComposition(ctx, {
      size: space.width,
      height: space.height,
      area,
      elements: deLaFace.map((el) => ({ element: el, image: images.get(el.id) ?? null })),
      baseColor: null,
      showGuides: false,
      measure,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, space?.width, space?.height, elements, color, images, measure]);

  if (!area || !space) return null;

  return (
    <figure className="flex w-[132px] max-w-full flex-col gap-1" data-testid={`apercu-${side}`}>
      <canvas
        ref={canvasRef}
        width={space.width}
        height={space.height}
        className="w-full rounded-lg border border-neutral-200 bg-white"
        aria-label={`Aperçu ${titre}`}
      />
      <figcaption className="text-[11px] leading-snug text-neutral-500">
        <span className="font-semibold text-neutral-700">{titre}</span>
        <br />
        {area.cmWidth} × {area.cmHeight} cm · {deLaFace.filter((el) => el.visible !== false).length} élément(s)
      </figcaption>
    </figure>
  );
}

export default function OrderPanel() {
  const productId = useConfiguratorStore((s) => s.productId);
  const color = useConfiguratorStore((s) => s.color);
  const elements = useConfiguratorStore((s) => s.elements);
  const measure = useConfiguratorStore((s) => s.measure);

  const [quantites, setQuantites] = useState<Record<string, number>>({ M: 1 });
  const [ville, setVille] = useState<DeliveryCity>('brazzaville');
  const [telephone, setTelephone] = useState('');
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [paiement, setPaiement] = useState<Paiement | null>(null);
  const [suivi, setSuivi] = useState<'inactif' | 'attente' | 'succes' | 'echec' | 'expire'>('inactif');
  const [erreurPaiement, setErreurPaiement] = useState<string | null>(null);

  const product = getProductById(productId);
  const prixUnitaire = product?.priceFcfa ?? null;
  const images = useElementImages(elements);

  // Calculs purs et bon marché : pas de mémoïsation manuelle (le compilateur React préfère ça, et
  // la liste de tailles fait six entrées).
  const lignes: SizeLine[] = SIZE_ORDER.filter((taille) => (quantites[taille] ?? 0) > 0).map((taille) => ({
    size: taille,
    quantity: quantites[taille] ?? 0,
  }));

  const totals = orderTotals({ lines: lignes, unitPriceFcfa: prixUnitaire, city: ville });

  const faces = product ? facesToProduce({ elements }) : [];
  const numeroOk = telephonePlausible(telephone);
  const prete = totals.blockedBy.length === 0 && faces.length > 0 && Boolean(product);
  const enPaiement = suivi === 'attente';

  /**
   * Produit le dossier destiné à l'atelier : un PNG 300 dpi par face personnalisée et la fiche de
   * production (texte + JSON). Appelée après un paiement confirmé — ou explicitement sans paiement,
   * pour les essais de l'atelier.
   */
  async function genererFiles(ref: string) {
    if (!product) return 0;
    const sheet = buildProductionSheet({
      reference: ref,
      product,
      color,
      lines: lignes,
      city: ville,
      unitPriceFcfa: prixUnitaire,
      elements,
      measure,
    });

    let fichiers = 0;
    for (const side of faces) {
      const area = getPrintArea(product, side);
      if (!area) continue;
      const dessines = elementsOfSide(elements, side).map((element) => ({
        element,
        image: images.get(element.id) ?? null,
      }));
      const blob = await renderPrintPng({ area, elements: dessines, measure });
      if (blob) {
        downloadBlob(blob, sheet.faces.find((f) => f.side === side)?.fichier ?? `${ref}-${side}.png`);
        fichiers += 1;
      }
    }

    downloadBlob(
      new Blob([productionSheetText(sheet)], { type: 'text/plain;charset=utf-8' }),
      `${ref}-fiche-production.txt`,
    );
    downloadBlob(new Blob([JSON.stringify(sheet, null, 2)], { type: 'application/json' }), `${ref}-fiche-production.json`);
    return fichiers;
  }

  async function genererSansPaiement() {
    setEnCours(true);
    setMessage(null);
    const ref = makeReference();
    try {
      const fichiers = await genererFiles(ref);
      setReference(ref);
      setMessage(`Commande ${ref} : ${fichiers} fichier(s) d’impression et la fiche de production téléchargés.`);
    } finally {
      setEnCours(false);
    }
  }

  /** Paiement → suivi → production. Les fichiers ne partent qu'après un paiement confirmé. */
  async function payer() {
    if (!product) return;
    setEnCours(true);
    setErreurPaiement(null);
    setMessage(null);
    setPaiement(null);
    const ref = makeReference();
    setReference(ref);

    try {
      const demande = await demanderPaiement({
        commande: ref,
        produitId: product.id,
        lignes: lignes.map((l) => ({ taille: l.size, quantite: l.quantity })),
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
        const fichiers = await genererFiles(ref);
        setMessage(
          `Paiement confirmé (${formatFcfa(resultat.paiement.montantFcfa)}) — commande ${ref} : ${fichiers} fichier(s) d’impression et la fiche de production téléchargés.`,
        );
      } else if (resultat.expire) {
        setSuivi('expire');
      } else {
        setSuivi('echec');
      }
    } catch (erreur) {
      setSuivi('echec');
      setErreurPaiement(erreur instanceof Error ? erreur.message : 'Paiement impossible.');
    } finally {
      setEnCours(false);
    }
  }

  if (!product) return null;
  const delai = deliveryDays(totals.quantity, ville);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-neutral-500">
        Vérifie l’aperçu ci-dessous : c’est exactement ce qui sera imprimé. Les fichiers de l’atelier sont produits
        après confirmation du paiement.
      </p>

      <div className="flex flex-wrap items-start gap-3">
        {faces.map((side) => (
          <FacePreview key={side} side={side} titre={side === 'front' ? 'Face avant' : 'Face arrière'} />
        ))}
      </div>

      <div>
        <span className="text-sm font-medium text-neutral-800">Tailles et quantités</span>
        <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {SIZE_ORDER.map((taille) => (
            <label key={taille} className="flex flex-col gap-1 text-xs text-neutral-600">
              {taille}
              <input
                type="number"
                min={0}
                max={500}
                value={quantites[taille] ?? 0}
                data-testid={`qte-${taille}`}
                onChange={(e) =>
                  setQuantites((prev) => ({ ...prev, [taille as GarmentSize]: Math.max(0, Math.min(500, Number(e.target.value) || 0)) }))
                }
                className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm text-neutral-800"
              />
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-neutral-500">Total : {totals.quantity} pièce(s)</p>
      </div>

      <div>
        <label htmlFor="commande-ville" className="text-sm font-medium text-neutral-800">
          Livraison
        </label>
        <select
          id="commande-ville"
          data-testid="ville"
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
        <label htmlFor="commande-telephone" className="text-sm font-medium text-neutral-800">
          Numéro MTN MoMo du client
        </label>
        <input
          id="commande-telephone"
          type="tel"
          inputMode="tel"
          data-testid="telephone"
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

      <dl className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700" data-testid="recap-commande">
        <div className="flex justify-between">
          <dt>Prix unitaire</dt>
          <dd>{formatFcfa(prixUnitaire)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Sous-total ({totals.quantity} pièce(s))</dt>
          <dd>{formatFcfa(totals.itemsSubtotalFcfa)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Livraison</dt>
          <dd>{formatFcfa(totals.shippingFcfa)}</dd>
        </div>
        <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 font-semibold text-neutral-900">
          <dt>Total à payer</dt>
          <dd data-testid="total-commande">{formatFcfa(totals.totalFcfa)}</dd>
        </div>
        <div className="mt-1 flex justify-between text-xs text-neutral-500">
          <dt>Délai estimé</dt>
          <dd>{totals.quantity > 0 ? `${delai} jour(s) maximum` : '—'}</dd>
        </div>
      </dl>

      {!prete && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">Commande non encore validable :</p>
          <ul className="mt-1 list-disc pl-4">
            {faces.length === 0 && <li>aucun élément sur le vêtement</li>}
            {totals.blockedBy.map((raison) => (
              <li key={raison}>{raison}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        disabled={!prete || !numeroOk || enCours || enPaiement}
        onClick={payer}
        data-testid="payer-momo"
        className="rounded-xl bg-[#FFCC00] px-4 py-2.5 text-sm font-semibold text-[#200233] transition-colors hover:bg-[#E85F00] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {enPaiement
          ? 'En attente de validation sur le téléphone…'
          : enCours
            ? 'Préparation…'
            : `Payer ${formatFcfa(totals.totalFcfa)} par MTN MoMo`}
      </button>

      {paiement && (
        <div
          role="status"
          aria-live="polite"
          data-testid="etat-paiement"
          className={`rounded-lg border px-3 py-2 text-xs ${
            suivi === 'succes'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : suivi === 'echec'
                ? 'border-red-200 bg-red-50 text-red-800'
                : suivi === 'expire'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-700'
          }`}
        >
          <p className="font-semibold">
            {suivi === 'attente' && 'Demande de paiement envoyée — validez sur le téléphone'}
            {suivi === 'succes' && 'Paiement confirmé'}
            {suivi === 'echec' && 'Paiement non abouti'}
            {suivi === 'expire' && 'Délai de validation dépassé (5 minutes)'}
            {' · '}
            <span className="font-mono font-normal">{paiement.referenceId.slice(0, 8)}…</span>
          </p>
          {suivi === 'attente' && (
            <p className="mt-1">
              Le client reçoit une demande sur son téléphone MTN MoMo ; il a <strong>5 minutes</strong> pour la valider.
              Les fichiers d’impression seront générés automatiquement dès la confirmation.
            </p>
          )}
          {suivi === 'echec' && paiement.raison && <p className="mt-1">Motif renvoyé par MTN : {paiement.raison}.</p>}
          {suivi === 'expire' && (
            <p className="mt-1">
              Aucune validation reçue dans le délai. Relancez le paiement — aucune commande n’a été produite.
            </p>
          )}
          {suivi === 'succes' && (
            <p className="mt-1">
              Montant encaissé : {formatFcfa(paiement.montantFcfa)}
              {paiement.financialTransactionId ? ` · transaction MTN ${paiement.financialTransactionId}` : ''}
            </p>
          )}
        </div>
      )}

      {erreurPaiement && (
        <div role="status" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {erreurPaiement}
        </div>
      )}

      {message && (
        <div role="status" aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <p className="font-semibold">{message}</p>
          <p className="mt-1">
            Référence à rappeler : <span className="font-mono">{reference}</span>
          </p>
        </div>
      )}

      <details className="rounded-lg border border-neutral-200 px-3 py-2">
        <summary className="cursor-pointer text-xs text-neutral-500">
          Atelier : générer les fichiers sans paiement
        </summary>
        <button
          type="button"
          disabled={!prete || enCours}
          onClick={genererSansPaiement}
          data-testid="valider-commande"
          className="mt-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enCours ? 'Préparation des fichiers…' : 'Générer les fichiers d’impression (sans encaissement)'}
        </button>
      </details>
    </div>
  );
}
