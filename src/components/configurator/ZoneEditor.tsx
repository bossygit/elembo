'use client';

// Éditeur 2D de la zone active — manipulation directe du visuel SUR le patron.
//
// Souris ET tactile passent par les mêmes événements Pointer (aucun code parallèle) :
//   • glisser un élément = le déplacer ;
//   • poignée bas-droite = redimensionner ;
//   • poignée haute = tourner ;
//   • flèches du clavier = affiner, Suppr = retirer, Ctrl+D = dupliquer.
//
// Le canvas ne peint QUE le visuel (transparent hors des éléments). La couleur du vêtement
// et la silhouette du patron sont des calques CSS derrière : ce qui est montré est
// exactement ce que `drawComposition` enverra dans la texture 3D et dans le PNG de
// production. Hors de la zone réellement imprimable du procédé, un voile sombre rappelle
// la limite — la composition ne peut pas déborder.

import { useEffect, useMemo, useRef } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById } from '../../lib/products/catalog';
import {
  compositionSize,
  contextMeasurer,
  drawComposition,
  elementRect,
  elementsOfSide,
  hitTest,
  printAreaRect,
} from '../../lib/canvas/design-canvas';
import type { CanvasSpace, Measurer } from '../../lib/canvas/design-canvas';
import type { DesignElement, TextElement } from '../../types/configurator';
import { SIDE_LABELS } from '../../types/configurator';
import { useElementImages, useTextFonts } from './useElementImages';
import { gabaritUrl } from '../../lib/zone-assets';

/** Largeur de l'espace de composition de l'éditeur (hauteur = ratio de la texture). */
const EDITOR_WIDTH = 900;

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

export default function ZoneEditor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const interaction = useRef<Interaction | null>(null);
  const mesureur = useRef<Measurer | null>(null);

  const productId = useConfiguratorStore((s) => s.productId);
  const profileId = useConfiguratorStore((s) => s.profileId);
  const side = useConfiguratorStore((s) => s.side);
  const color = useConfiguratorStore((s) => s.color);
  const elements = useConfiguratorStore((s) => s.elements);
  const selectedId = useConfiguratorStore((s) => s.selectedId);
  const showGuides = useConfiguratorStore((s) => s.showGuides);
  const selectElement = useConfiguratorStore((s) => s.selectElement);
  const updateElement = useConfiguratorStore((s) => s.updateElement);
  const removeElement = useConfiguratorStore((s) => s.removeElement);
  const duplicateElement = useConfiguratorStore((s) => s.duplicateElement);
  const nudge = useConfiguratorStore((s) => s.nudge);
  const setMeasurer = useConfiguratorStore((s) => s.setMeasurer);

  const images = useElementImages(elements);
  const fontesChargees = useTextFonts(elements);

  const product = getProductById(productId);
  const area = getPrintArea(product, side, profileId);
  const space: CanvasSpace = useMemo(
    () => (area ? compositionSize(area, EDITOR_WIDTH) : { width: EDITOR_WIDTH, height: EDITOR_WIDTH }),
    [area],
  );
  const deLaZone = elementsOfSide(elements, side);

  // Le mesureur du canvas devient celui du store : bornage exact des textes.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const m = contextMeasurer(ctx);
    mesureur.current = m;
    setMeasurer(m);
  }, [setMeasurer]);

  // Redessin : visuel + zone imprimable + voile hors zone. Les polices déclenchent un
  // second passage quand elles viennent d'être chargées.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !area) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawComposition(ctx, {
      size: space.width,
      height: space.height,
      area,
      elements: deLaZone.map((el) => ({ element: el, image: images.get(el.id) ?? null })),
      baseColor: null,
      showGuides,
      selectedId,
      measure: mesureur.current ?? undefined,
    });

    // Limite de la zone réellement imprimable : un cadre discret, pas un voile opaque —
    // l'utilisateur doit continuer de voir le vêtement autour (on ne compose pas là, mais
    // on garde le contexte du patron).
    const zone = printAreaRect(area, space);
    ctx.save();
    ctx.fillStyle = 'rgba(17, 13, 21, 0.10)';
    ctx.beginPath();
    ctx.rect(0, 0, space.width, space.height);
    ctx.rect(zone.x, zone.y, zone.w, zone.h);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(255, 90, 18, 0.9)';
    ctx.lineWidth = Math.max(1, space.width / 520);
    ctx.setLineDash([space.width / 80, space.width / 130]);
    ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
    ctx.setLineDash([]);
    // Repères d'angle : on voit tout de suite où s'arrête la zone utile.
    const cote = Math.max(8, space.width / 40);
    ctx.lineWidth = Math.max(2, space.width / 300);
    ctx.strokeStyle = 'rgba(255, 90, 18, 0.9)';
    for (const [x, y, dx, dy] of [
      [zone.x, zone.y, 1, 1],
      [zone.x + zone.w, zone.y, -1, 1],
      [zone.x, zone.y + zone.h, 1, -1],
      [zone.x + zone.w, zone.y + zone.h, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * cote, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * cote);
      ctx.stroke();
    }
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, space.width, space.height, elements, side, color, showGuides, selectedId, images, fontesChargees]);

  // Repère de recette (développement) pour piloter les poignées depuis un navigateur.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return;
    const w = window as unknown as { __elemboEditor?: unknown };
    w.__elemboEditor = {
      side,
      space,
      zone: area ? printAreaRect(area, space) : null,
      rect: (id: string) => {
        const el = elements.find((e) => e.id === id);
        return el && area ? elementRect(el, area, space, mesureur.current ?? undefined) : null;
      },
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
  }, [area, space, elements, side]);

  if (!area) {
    return (
      <p className="rounded-xl bg-sable/60 px-3 py-4 text-sm text-attenue">
        Cette zone n’est pas proposée par le procédé choisi.
      </p>
    );
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
    const r = elementRect(el, area!, space, mesurer());
    const rad = (el.rotation * Math.PI) / 180;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const distance = Math.hypot(r.w, r.h) / 2;
    const angle = Math.atan2(r.h / 2, r.w / 2);
    const coins = [
      { x: cx + distance * Math.cos(rad + angle), y: cy + distance * Math.sin(rad + angle) },
      { x: cx + distance * Math.cos(rad - angle), y: cy + distance * Math.sin(rad - angle) },
    ];
    const tolerance = Math.max(space.width / 24, 18);
    if (Math.hypot(p.x - coins[0].x, p.y - coins[0].y) < tolerance) return 'resize';
    const poigneeRotation = {
      x: cx - Math.sin(rad) * (r.h / 2 + space.width / 24),
      y: cy - Math.cos(rad) * (r.h / 2 + space.width / 24),
    };
    if (Math.hypot(p.x - poigneeRotation.x, p.y - poigneeRotation.y) < tolerance) return 'rotate';
    return null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = point(e);
    const selectionne = deLaZone.find((el) => el.id === selectedId) ?? null;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture optionnelle (navigateur ancien)
    }

    if (selectionne) {
      const type = poignee(selectionne, p);
      if (type) {
        const r = elementRect(selectionne, area!, space, mesurer());
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

    const touche = hitTest(deLaZone, area!, space, p, mesurer());
    if (touche) {
      selectElement(touche.id);
      const r = elementRect(touche, area!, space, mesurer());
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
    if (!actif) return;
    const p = point(e);
    const zone = printAreaRect(area!, space);

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
    interaction.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture optionnelle
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (!selectedId) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeElement(selectedId);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateElement(selectedId);
      return;
    }
    const pas = e.shiftKey ? 5 : 1;
    const direct = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[
      e.key
    ] as [number, number] | undefined;
    if (direct) {
      e.preventDefault();
      nudge(selectedId, direct[0] * pas, direct[1] * pas);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-encre/15">
      <div
        className="relative"
        style={{ aspectRatio: `${space.width} / ${space.height}`, backgroundColor: color }}
      >
        {/* Silhouette du patron : repère visuel, jamais imprimé. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={gabaritUrl(side)}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill opacity-25"
        />
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
          aria-label={`Zone d’impression ${SIDE_LABELS[side]} — cliquez un élément pour le sélectionner`}
          data-testid="design-canvas"
          className="relative block w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-orange/60 active:cursor-grabbing"
        />
      </div>
      <p className="flex flex-wrap items-center justify-between gap-1 border-t border-encre/10 bg-white px-2.5 py-1.5 text-[11px] text-attenue">
        <span>
          Zone utile <strong className="font-semibold text-encre">{area.cmWidth} × {area.cmHeight} cm</strong>
          {' '}· hors cadre : non imprimé
        </span>
        <span className="hidden sm:inline">Glisser · poignées · flèches · Suppr</span>
      </p>
    </div>
  );
}
