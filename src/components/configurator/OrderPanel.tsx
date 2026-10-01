'use client';

// Tunnel de commande : l'utilisateur VALIDE ce qu'il voit, choisit quantité/tailles/ville,
// puis Elembo produit ce que l'atelier attend :
//   • un PNG 300 dpi par face réellement personnalisée (avant, arrière) ;
//   • une FICHE DE PRODUCTION (texte + JSON) avec le positionnement en centimètres, les
//     tailles, les textes (police, corps, couleur), les couleurs et les consignes ;
//   • le récapitulatif FCFA (livraison selon la ville, délai ≤ 3 jours) et le montant à
//     encaisser par MTN MoMo.
//
// Aucun montant n'est inventé : si le prix unitaire ou les frais de livraison ne sont pas
// définis, la validation est bloquée et le motif est affiché.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById } from '../../lib/products/catalog';
import {
  compositionSize,
  drawComposition,
  elementsOfSide,

} from '../../lib/canvas/design-canvas';
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
import type { Side } from '../../types/configurator';
import { useElementImages } from './useElementImages';

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
    <figure className="flex flex-col gap-1" data-testid={`apercu-${side}`}>
      <canvas
        ref={canvasRef}
        width={space.width}
        height={space.height}
        className="w-full rounded-lg border border-neutral-200 bg-white"
        aria-label={`Aperçu ${titre}`}
      />
      <figcaption className="text-xs text-neutral-500">
        <span className="font-semibold text-neutral-700">{titre}</span> — {area.cmWidth} × {area.cmHeight} cm ·{' '}
        {deLaFace.filter((el) => el.visible !== false).length} élément(s)
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
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const product = getProductById(productId);
  const prixUnitaire = product?.priceFcfa ?? null;
  const images = useElementImages(elements);

  const lignes: SizeLine[] = useMemo(
    () => SIZE_ORDER.filter((taille) => (quantites[taille] ?? 0) > 0).map((taille) => ({ size: taille, quantity: quantites[taille] })),
    [quantites],
  );

  const totals = useMemo(
    () => orderTotals({ lines: lignes, unitPriceFcfa: prixUnitaire, city: ville }),
    [lignes, prixUnitaire, ville],
  );

  const faces = product ? facesToProduce({ elements }) : [];
  const prete = totals.blockedBy.length === 0 && faces.length > 0 && Boolean(product);

  async function generer() {
    if (!product) return;
    setEnCours(true);
    setMessage(null);
    const ref = makeReference();
    try {
      const draft = {
        reference: ref,
        product,
        color,
        lines: lignes,
        city: ville,
        unitPriceFcfa: prixUnitaire,
        elements,
        measure,
      };
      const sheet = buildProductionSheet(draft);

      // 1) Un PNG par face personnalisée, à la résolution d'impression (300 dpi).
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

      // 2) La fiche de production, en texte (WhatsApp/e-mail) et en JSON (traçabilité).
      downloadBlob(
        new Blob([productionSheetText(sheet)], { type: 'text/plain;charset=utf-8' }),
        `${ref}-fiche-production.txt`,
      );
      downloadBlob(new Blob([JSON.stringify(sheet, null, 2)], { type: 'application/json' }), `${ref}-fiche-production.json`);

      setReference(ref);
      setMessage(
        `Commande ${ref} prête : ${fichiers} fichier(s) d’impression et la fiche de production ont été téléchargés.`,
      );
    } finally {
      setEnCours(false);
    }
  }

  if (!product) return null;
  const delai = deliveryDays(totals.quantity, ville);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-neutral-500">
        Vérifie l’aperçu ci-dessous : c’est exactement ce qui sera imprimé. Les fichiers envoyés à l’atelier sont
        générés à la validation.
      </p>

      <div className={`grid gap-3 ${faces.length > 1 ? 'sm:grid-cols-2' : ''}`}>
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
          <dd>
            {totals.quantity > 0 ? `${delai} jour(s) maximum` : '—'}
          </dd>
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
        disabled={!prete || enCours}
        onClick={generer}
        data-testid="valider-commande"
        className="rounded-xl bg-[#200233] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E85F00] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {enCours ? 'Préparation des fichiers…' : 'Valider et générer les fichiers d’impression'}
      </button>

      {message && (
        <div role="status" aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <p className="font-semibold">{message}</p>
          <p className="mt-1">
            Référence à rappeler dans le paiement : <span className="font-mono">{reference}</span>
          </p>
          <p className="mt-1">
            Paiement : <strong>MTN Mobile Money</strong> — montant {formatFcfa(totals.totalFcfa)}. L’encaissement MoMo
            nécessite le service serveur (création de la demande + callback) ; en attendant, la fiche de production sert
            de bon de commande pour l’atelier.
          </p>
        </div>
      )}
    </div>
  );
}
