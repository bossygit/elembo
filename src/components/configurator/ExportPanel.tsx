'use client';

// Export des FICHIERS DE PRODUCTION — distinct de la prévisualisation 3D.
//
// Un PNG transparent est recalculé pour chaque zone personnalisée, à la résolution
// physique de la zone imprimable et à la densité du procédé (300 dpi en DTF, 150 dpi en
// sublimation). Les fichiers portent les noms attendus par l'atelier :
// front.png, back.png, left-sleeve.png, right-sleeve.png, collar.png.
//
// Ce n'est jamais une capture du modèle 3D : le texte est redessiné à la résolution cible
// et les images sont rééchantillonnées depuis leur fichier d'origine.

import { useState } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById } from '../../lib/products/catalog';
import { profilParId, statutZone, LIBELLE_STATUT, motifZone } from '../../lib/products/production';
import { SIDE_FILE, SIDE_LABELS } from '../../types/configurator';
import type { Side } from '../../types/configurator';
import { elementsOfSide, productionTextureSize } from '../../lib/canvas/design-canvas';
import { downloadBlob, renderPrintPng } from '../../lib/canvas/export';
import { facesToProduce } from '../../lib/order/order';
import { useElementImages } from './useElementImages';

export default function ExportPanel() {
  const productId = useConfiguratorStore((s) => s.productId);
  const profileId = useConfiguratorStore((s) => s.profileId);
  const elements = useConfiguratorStore((s) => s.elements);
  const measure = useConfiguratorStore((s) => s.measure);
  const images = useElementImages(elements);
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState<Side[] | null>(null);

  const product = getProductById(productId);
  const profil = profilParId(profileId, product);
  const faces = facesToProduce({ elements });

  async function exporter() {
    if (!product) return;
    setEnCours(true);
    setFait(null);
    const exportees: Side[] = [];
    try {
      for (const side of faces) {
        const area = getPrintArea(product, side, profil.id);
        if (!area) continue;
        const blob = await renderPrintPng({
          area,
          dpi: profil.dpi,
          measure,
          elements: elementsOfSide(elements, side).map((element) => ({
            element,
            image: images.get(element.id) ?? null,
          })),
        });
        if (blob) {
          downloadBlob(blob, SIDE_FILE[side]);
          exportees.push(side);
        }
      }
      setFait(exportees);
    } finally {
      setEnCours(false);
    }
  }

  if (!product) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-attenue">
        Fichiers <strong className="text-encre">PNG transparents</strong>, recalculés à la
        taille réelle de chaque zone et à la densité de <strong className="text-encre">{profil.nom}</strong>{' '}
        ({profil.dpi} dpi). Ce ne sont pas des captures de l’aperçu 3D.
      </p>

      {faces.length === 0 ? (
        <p className="rounded-xl bg-sable/50 px-3 py-2 text-xs text-attenue">
          Aucune zone personnalisée : ajoutez un visuel pour générer des fichiers.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {faces.map((side) => {
            const area = getPrintArea(product, side, profil.id);
            if (!area) return null;
            const pixels = productionTextureSize(area, profil.dpi);
            const statut = statutZone(profil, side);
            const motif = motifZone(profil, side);
            return (
              <li key={side} className="rounded-lg border border-encre/10 bg-white px-2.5 py-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-encre">{SIDE_FILE[side]}</span>
                  <span className="text-attenue">
                    {pixels.w} × {pixels.h} px
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-attenue">
                  <span>
                    {SIDE_LABELS[side]} · {area.cmWidth} × {area.cmHeight} cm
                  </span>
                  {statut !== 'disponible' && (
                    <span className="shrink-0 text-amber-800">{LIBELLE_STATUT[statut]}</span>
                  )}
                </div>
                {motif && statut !== 'disponible' && (
                  <p className="mt-0.5 leading-snug text-amber-800">{motif}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={exporter}
        disabled={faces.length === 0 || enCours}
        data-testid="exporter-production"
        className="rounded-full bg-encre px-4 py-2.5 text-sm font-semibold text-creme transition-colors hover:bg-orange hover:text-encre disabled:cursor-not-allowed disabled:opacity-40"
      >
        {enCours ? 'Génération des fichiers…' : `Télécharger les fichiers de production (${faces.length})`}
      </button>

      {fait && (
        <p role="status" className="rounded-lg bg-succes/10 px-3 py-2 text-[11px] text-succes">
          {fait.length} fichier(s) généré(s) : {fait.map((side) => SIDE_FILE[side]).join(', ')}.
        </p>
      )}
    </div>
  );
}
