'use client';

// Éditeur 2D : aperçu du panneau (couleur du produit + éléments + repères de zone) et
// manipulation directe — sélection, déplacement, redimensionnement, rotation, clavier.
//
// Toutes les valeurs sont écrites dans le store, donc la 3D se met à jour immédiatement,
// sans état parallèle. Le canvas enregistre aussi son mesureur typographique dans le
// store : le bornage des textes utilise ainsi la vraie largeur des glyphes.

import { useEffect, useMemo, useRef } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById } from '../../lib/products/catalog';
import {
  compositionSize,
  contextMeasurer,
  drawComposition,
  elementRect,
  hitTest,
  printAreaRect,
} from '../../lib/canvas/design-canvas';
import type { CanvasSpace, Measurer } from '../../lib/canvas/design-canvas';
import type { DesignElement, TextElement } from '../../types/configurator';
import { useElementImages, useTextFonts } from './useElementImages';

/** Largeur de l'éditeur ; la hauteur suit le format de la zone d'impression. */
const EDITOR_WIDTH = 720;

type Interaction = {
  type: 'drag' | 'resize' | 'rotate';
  id: string;
  depart: { x: number; y: number };
  initial: DesignElement;
  centre: { x: number; y: number };
  distance: number;
  angle: number;
};

/** Normalise un angle dans ]-180, 180]. */
function normaliseAngle(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

export default function DesignCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const interaction = useRef<Interaction | null>(null);
  const mesureur = useRef<Measurer | null>(null);

  const productId = useConfiguratorStore((s) => s.productId);
  const side = useConfiguratorStore((s) => s.side);
  const color = useConfiguratorStore((s) => s.color);
  const elements = useConfiguratorStore((s) => s.elements);
  const selectedId = useConfiguratorStore((s) => s.selectedId);
  const showGuides = useConfiguratorStore((s) => s.showGuides);
  const selectElement = useConfiguratorStore((s) => s.selectElement);
  const updateElement = useConfiguratorStore((s) => s.updateElement);
  const removeElement = useConfiguratorStore((s) => s.removeElement);
  const nudge = useConfiguratorStore((s) => s.nudge);
  const setMeasurer = useConfiguratorStore((s) => s.setMeasurer);

  const images = useElementImages(elements);
  const fontesChargees = useTextFonts(elements);

  const product = getProductById(productId);
  const area = getPrintArea(product, side);
  // Espace de composition = format réel de la zone (A4 portrait pour un décalque) : ce
  // que l'éditeur affiche est exactement ce qui sera projeté sur le vêtement.
  const space: CanvasSpace = useMemo(
    () => (area ? compositionSize(area, EDITOR_WIDTH) : { width: EDITOR_WIDTH, height: EDITOR_WIDTH }),
    [area],
  );

  const deLaFace = elements.filter((el) => el.side === side).sort((a, b) => a.z - b.z);

  // Le mesureur du canvas devient celui du store : bornage exact des textes.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const m = contextMeasurer(ctx);
    mesureur.current = m;
    setMeasurer(m);
  }, [setMeasurer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !area) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawComposition(ctx, {
      size: space.width,
      height: space.height,
      area,
      elements: deLaFace.map((el) => ({ element: el, image: images.get(el.id) ?? null })),
      baseColor: color,
      showGuides,
      selectedId,
      measure: mesureur.current ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, space.width, space.height, elements, side, color, showGuides, selectedId, images, fontesChargees]);

  // Repère de recette (développement uniquement) : permet de viser exactement les
  // poignées de sélection depuis un navigateur piloté, sans dépendre de la souris.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return;
    const w = window as unknown as { __elemboEditor?: unknown };
    w.__elemboEditor = {
      space,
      zone: area ? printAreaRect(area, space) : null,
      rect: (id: string) => {
        const el = elements.find((e) => e.id === id);
        return el && area ? elementRect(el, area, space, mesureur.current ?? undefined) : null;
      },
      /** Position CSS (viewport) d'un point de l'espace de composition. */
      toClient: (point: { x: number; y: number }) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const b = canvas.getBoundingClientRect();
        return { x: b.x + (point.x / space.width) * b.width, y: b.y + (point.y / space.height) * b.height };
      },
    };
    return () => {
      delete (window as unknown as { __elemboEditor?: unknown }).__elemboEditor;
    };
  }, [area, space, elements]);

  if (!area) {
    return <p className="text-sm text-neutral-500">Ce produit n’a pas de zone d’impression sur cette face.</p>;
  }

  const mesurer = () => mesureur.current ?? undefined;

  /** Point du canvas → coordonnées de l'espace de composition. */
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * space.width,
      y: ((e.clientY - rect.top) / rect.height) * space.height,
    };
  }

  /** Poignée saisie : coin bas-droit (redimensionner) ou poignée haute (pivoter). */
  function poignee(el: DesignElement, p: { x: number; y: number }): Interaction['type'] | null {
    if (!area) return null;
    const r = elementRect(el, area, space, mesurer());
    const rad = (el.rotation * Math.PI) / 180;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const distance = Math.hypot(r.w, r.h) / 2;
    const angle = Math.atan2(r.h / 2, r.w / 2);
    const coins = [
      { x: cx + distance * Math.cos(rad + angle), y: cy + distance * Math.sin(rad + angle) },
      { x: cx + distance * Math.cos(rad - angle), y: cy + distance * Math.sin(rad - angle) },
    ];
    const tolerance = space.width / 28;
    if (Math.hypot(p.x - coins[0].x, p.y - coins[0].y) < tolerance) return 'resize';
    const poigneeRotation = { x: cx - Math.sin(rad) * (r.h / 2 + space.width / 24), y: cy - Math.cos(rad) * (r.h / 2 + space.width / 24) };
    if (Math.hypot(p.x - poigneeRotation.x, p.y - poigneeRotation.y) < tolerance) return 'rotate';
    return null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!area) return;
    const p = point(e);
    const selectionne = deLaFace.find((el) => el.id === selectedId) ?? null;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture optionnelle
    }

    if (selectionne) {
      const type = poignee(selectionne, p);
      if (type) {
        const r = elementRect(selectionne, area, space, mesurer());
        const centre = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        interaction.current = {
          type,
          id: selectionne.id,
          depart: p,
          initial: selectionne,
          centre,
          distance: Math.max(1, Math.hypot(p.x - centre.x, p.y - centre.y)),
          angle: Math.atan2(p.y - centre.y, p.x - centre.x),
        };
        return;
      }
    }

    const touche = hitTest(deLaFace, area, space, p, mesurer());
    if (touche) {
      selectElement(touche.id);
      const r = elementRect(touche, area, space, mesurer());
      interaction.current = {
        type: 'drag',
        id: touche.id,
        depart: p,
        initial: touche,
        centre: { x: r.x + r.w / 2, y: r.y + r.h / 2 },
        distance: 0,
        angle: 0,
      };
    } else {
      selectElement(null);
      interaction.current = null;
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const actif = interaction.current;
    if (!actif || !area) return;
    const p = point(e);
    const zone = printAreaRect(area, space);

    if (actif.type === 'drag') {
      updateElement(actif.id, {
        x: actif.initial.x + (p.x - actif.depart.x) / zone.w,
        y: actif.initial.y + (p.y - actif.depart.y) / zone.h,
      });
      return;
    }

    const distance = Math.max(1, Math.hypot(p.x - actif.centre.x, p.y - actif.centre.y));
    if (actif.type === 'resize') {
      const facteur = distance / actif.distance;
      if (actif.initial.type === 'text') {
        updateElement(actif.id, {
          fontSize: Math.round((actif.initial as TextElement).fontSize * facteur),
        } as Partial<TextElement>);
      } else {
        updateElement(actif.id, { scale: actif.initial.scale * facteur });
      }
      return;
    }

    const angle = Math.atan2(p.y - actif.centre.y, p.x - actif.centre.x);
    const delta = ((angle - actif.angle) * 180) / Math.PI;
    updateElement(actif.id, { rotation: normaliseAngle(actif.initial.rotation + delta) });
  }

  function endInteraction(e: React.PointerEvent<HTMLCanvasElement>) {
    if (interaction.current) interaction.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture optionnelle
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (!selectedId) return;
    const pas = e.shiftKey ? 5 : 1;
    const direct = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (direct) {
      e.preventDefault();
      nudge(selectedId, direct[0] * pas, direct[1] * pas);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeElement(selectedId);
    }
  }

  const curseur = 'cursor-grab active:cursor-grabbing';

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={space.width}
        height={space.height}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        onKeyDown={onKeyDown}
        aria-label={`Zone d’impression ${side === 'front' ? 'avant' : 'arrière'} — cliquez un élément pour le sélectionner`}
        data-testid="design-canvas"
        className={`w-full touch-none rounded-xl border border-neutral-200 outline-none focus-visible:ring-2 focus-visible:ring-[#E85F00]/40 ${curseur}`}
      />
      <p className="text-xs text-neutral-500">
        {deLaFace.length > 0
          ? `Cliquez un élément pour le sélectionner, glissez-le pour le déplacer ; les poignées orange redimensionnent et pivotent. Flèches du clavier pour affiner, Suppr pour retirer.`
          : `Zone d’impression ${area.cmWidth} × ${area.cmHeight} cm : les éléments restent bornés à ce cadre, avec une marge de sécurité.`}
      </p>
    </div>
  );
}
