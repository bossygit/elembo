'use client';

import Konva from 'konva';
import { useEffect, useRef } from 'react';

import type { Severite } from '@/lib/banner/constraints';
import { zones } from '@/lib/banner/constraints';
import { decrire, redimensionne, tailleMax } from '@/lib/banner/edition';
import { coins } from '@/lib/banner/geometry';
import type { Element } from '@/lib/banner/model';
import { dessinerElement, dessinerFond } from '@/lib/banner/peinture';
import { contenir, zoomer, type Vue } from '@/lib/banner/vue';
import type { EtatStudio } from '@/stores/banner-studio-store';

import { useContexte, useStudio } from './contexte';

// Deux doigts doivent pouvoir zoomer même si le premier déplaçait un élément.
Konva.hitOnDragEnabled = true;

const COULEUR_ALERTE: Record<Severite, string> = { critique: '#C81E1E', avertissement: '#B45309', info: '#5D5964' };
const borner = (v: number, max: number) => Math.min(max, Math.max(0, v));

/**
 * Plan de travail. Konva est une **projection** du document : chaque élément est une seule
 * `Konva.Shape` dessinée en mm par `dessinerElement`, et chaque geste se termine par une opération
 * du store. Trois pièges relevés au lot 0 : `fill` requis pour être cliquable, taille à déclarer
 * (`getSelfRect`), tracé à réinitialiser.
 */
export function StudioCanvas() {
  const { store, images } = useContexte();
  const hote = useRef<HTMLDivElement>(null);
  const description = useStudio((e) => decrire(e.document));

  useEffect(() => {
    const conteneur = hote.current;
    if (!conteneur) return;
    const tactile = window.matchMedia('(pointer: coarse)').matches;
    const stage = new Konva.Stage({ container: conteneur, width: 1, height: 1 });
    const fond = new Konva.Layer({ listening: false });
    const contenu = new Konva.Layer();
    const reperes = new Konva.Layer({ listening: false });
    const outils = new Konva.Layer();
    stage.add(fond, contenu, reperes, outils);

    const transfo = new Konva.Transformer({
      flipEnabled: false,
      ignoreStroke: true,
      rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
      rotationSnapTolerance: 4,
      rotateAnchorOffset: tactile ? 36 : 28,
      anchorSize: tactile ? 18 : 11,
      anchorCornerRadius: 3,
      anchorStroke: '#BF4A00',
      anchorFill: '#FFFFFF',
      borderStroke: '#BF4A00',
      borderStrokeWidth: 1.5,
      boundBoxFunc: (avant, apres) => (Math.abs(apres.width) < 6 || Math.abs(apres.height) < 2 ? avant : apres),
    });
    // Zone de prise de 44 px au doigt, sans grossir la poignée. Elle se développe vers l'extérieur
    // quand l'élément est petit : son centre doit toujours rester libre pour le déplacer.
    const prise = tactile ? 44 : 20;
    transfo.anchorStyleFunc((a) => {
      const nom = a.name().split(' ')[0];
      const sx = nom.endsWith('left') ? -1 : nom.endsWith('right') ? 1 : 0;
      const sy = nom.startsWith('top') ? -1 : nom.startsWith('bottom') ? 1 : 0;
      const bornes = (sens: number, taille: number): [number, number] => {
        if (!sens) return [-prise / 2, prise / 2];
        const dedans = Math.min(prise / 2, Math.max(0, taille / 2 - prise / 2));
        return sens > 0 ? [-dedans, prise - dedans] : [dedans - prise, dedans];
      };
      // Poignées de côté masquées quand elles se confondraient avec celles des coins.
      if (nom !== 'rotater' && transfo.enabledAnchors().length > 2 && ((!sy && transfo.height() < prise) || (!sx && transfo.width() < prise))) a.visible(false);
      const rotation = nom === 'rotater';
      const [x1, x2] = bornes(rotation ? 0 : sx, transfo.width());
      const [y1, y2] = bornes(rotation ? 0 : sy, transfo.height());
      const c = a.width() / 2;
      a.hitStrokeWidth(0);
      a.hitFunc((ctx, forme) => {
        ctx.beginPath();
        ctx.rect(c + x1, c + y1, x2 - x1, y2 - y1);
        ctx.closePath();
        ctx.fillStrokeShape(forme);
      });
    });
    outils.add(transfo);

    const formes = new Map<string, Konva.Shape>();
    const element = (f: Konva.Shape) => f.getAttr('element') as Element;

    const creer = (e: Element): Konva.Shape => {
      const f = new Konva.Shape({
        id: e.id,
        draggable: true,
        fill: '#000000',
        perfectDrawEnabled: false,
        sceneFunc: (ctx, forme) => {
          ctx.beginPath();
          dessinerElement(ctx._context, element(forme), store.getState().document.assets, images);
        },
        hitFunc: (ctx, forme) => {
          const x = element(forme);
          ctx.beginPath();
          // Un filet de 5 mm fait moins d'un pixel : il doit quand même se prendre.
          const min = (tactile ? 36 : 12) / store.getState().vue.echelle;
          const l = Math.max(x.largeurMm, min);
          const h = Math.max(x.hauteurMm, min);
          ctx.rect(-l / 2, -h / 2, l, h);
          ctx.closePath();
          ctx.fillStrokeShape(forme);
        },
      });
      f.getSelfRect = () => {
        const x = element(f);
        return { x: -x.largeurMm / 2, y: -x.hauteurMm / 2, width: x.largeurMm, height: x.hauteurMm };
      };
      f.setAttr('element', e);
      formes.set(e.id, f);

      f.on('mousedown touchstart', () => store.getState().selectionner(e.id));
      f.on('dragstart', () => store.getState().selectionner(e.id));
      f.on('dragmove', () => {
        const d = store.getState().document.dimensions;
        f.position({ x: borner(f.x(), d.largeurMm), y: borner(f.y(), d.hauteurMm) });
      });
      f.on('dragend', () => store.getState().poserGeometrie(e.id, { xMm: f.x(), yMm: f.y() }));
      f.on('transform', () => {
        // L'échelle de Konva est absorbée dans les dimensions : un trait ne s'épaissit pas.
        const d = store.getState().document;
        const n = redimensionne(element(f), f.scaleX(), f.scaleY(), images.mesurer, tailleMax(d));
        f.scale({ x: 1, y: 1 });
        f.setAttr('element', { ...n, xMm: f.x(), yMm: f.y(), rotationDeg: f.rotation() });
      });
      f.on('transformend', () => {
        const d = store.getState().document.dimensions;
        store.getState().poserElement({ ...element(f), xMm: borner(f.x(), d.largeurMm), yMm: borner(f.y(), d.hauteurMm) });
      });
      return f;
    };

    /** Aligne les formes Konva sur le document (création, mise à jour, ordre, suppression). */
    const synchroniser = (s: EtatStudio) => {
      const vus = new Set(s.document.elements.map((e) => e.id));
      for (const [id, f] of formes) if (!vus.has(id)) { f.destroy(); formes.delete(id); }
      s.document.elements.forEach((e, i) => {
        let f = formes.get(e.id);
        if (!f) contenu.add((f = creer(e)));
        const creux = e.type === 'forme' && !e.forme.fond;
        f.setAttr('element', e);
        f.setAttrs({
          x: e.xMm, y: e.yMm, rotation: e.rotationDeg, scaleX: 1, scaleY: 1, opacity: e.opacite, visible: e.visible,
          // Un élément verrouillé laisse passer les clics ; un cadre vide ne se prend que par son trait.
          listening: !e.verrouille, fillEnabled: !creux, stroke: creux ? '#000000' : undefined,
          hitStrokeWidth: creux ? Math.max(e.forme.epaisseurMm, 14 / s.vue.echelle) : 0,
        });
        if (f.zIndex() !== i) f.zIndex(i);
      });
    };

    const choisir = (s: EtatStudio) => {
      const e = s.document.elements.find((x) => x.id === s.selection);
      const f = e && e.visible && !e.verrouille ? formes.get(e.id) : undefined;
      transfo.nodes(f ? [f] : []);
      if (!f || !e) return;
      transfo.keepRatio(e.type !== 'forme');
      transfo.enabledAnchors(
        e.type === 'texte' ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
          : e.type === 'forme' && e.forme.nature === 'ligne' ? ['middle-left', 'middle-right']
            : ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'],
      );
      transfo.forceUpdate();
    };

    fond.add(new Konva.Shape({ sceneFunc: (ctx) => dessinerFond(ctx._context, store.getState().document, images) }));
    reperes.add(new Konva.Shape({
      sceneFunc: (ctx) => {
        const s = store.getState();
        const c = ctx._context;
        const z = zones(s.document);
        const px = 1 / s.vue.echelle;
        const { largeur: L, hauteur: H } = z.surface;
        // Voile sur ce qui dépasse du format : visible, mais clairement hors impression.
        c.fillStyle = 'rgba(241, 234, 220, 0.82)';
        c.beginPath();
        c.rect(-1e6, -1e6, 2e6, 2e6);
        c.rect(0, 0, L, H);
        c.fill('evenodd');
        c.lineWidth = px;
        c.strokeStyle = '#110D15';
        c.strokeRect(0, 0, L, H);
        if (s.reperes) {
          c.fillStyle = 'rgba(191, 74, 0, 0.16)';
          for (const r of z.ourlets) c.fillRect(r.x, r.y, r.largeur, r.hauteur);
          c.fillStyle = 'rgba(43, 68, 255, 0.16)';
          for (const r of z.fourreaux) c.fillRect(r.x, r.y, r.largeur, r.hauteur);
          // Trait double (clair puis foncé) : lisible sur tout fond.
          const trait = (tracer: () => void, couleur: string, tirets: number[]) => {
            c.setLineDash([]);
            c.lineWidth = 3 * px;
            c.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            tracer();
            c.setLineDash(tirets.map((t) => t * px));
            c.lineWidth = 1.5 * px;
            c.strokeStyle = couleur;
            tracer();
          };
          trait(() => c.strokeRect(z.zoneSure.x, z.zoneSure.y, z.zoneSure.largeur, z.zoneSure.hauteur), '#0F6B4C', [6, 4]);
          for (const p of z.plis) {
            for (const v of [p.debutMm, p.finMm]) {
              trait(() => {
                c.beginPath();
                if (p.axe === 'x') { c.moveTo(v, 0); c.lineTo(v, H); } else { c.moveTo(0, v); c.lineTo(L, v); }
                c.stroke();
              }, '#2B44FF', [2, 4]);
            }
          }
          const rayon = s.document.contraintes.oeillets.diametreMm / 2;
          for (const o of z.oeillets) {
            trait(() => {
              c.beginPath();
              c.arc(o.x, o.y, Math.max(rayon, 3 * px), 0, Math.PI * 2);
              c.stroke();
            }, '#110D15', []);
          }
          c.setLineDash([]);
        }
        // Contour des éléments signalés, du moins grave au plus grave.
        const pire = new Map<string, Severite>();
        for (const a of s.alertes) if (a.elementId && a.severite !== 'info' && !pire.has(a.elementId)) pire.set(a.elementId, a.severite);
        for (const [id, severite] of pire) {
          const e = s.document.elements.find((x) => x.id === id);
          if (!e) continue;
          c.strokeStyle = COULEUR_ALERTE[severite];
          c.lineWidth = 2 * px;
          c.setLineDash(severite === 'critique' ? [] : [8 * px, 5 * px]);
          c.beginPath();
          coins(e).forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
          c.closePath();
          c.stroke();
        }
        c.setLineDash([]);
      },
    }));

    const placer = (v: Vue) => {
      for (const l of [fond, contenu, reperes]) l.setAttrs({ x: v.x, y: v.y, scaleX: v.echelle, scaleY: v.echelle });
      transfo.forceUpdate();
      stage.batchDraw();
    };

    const appliquer = (s: EtatStudio, p: EtatStudio | null) => {
      if (!p || s.cadre !== p.cadre) stage.size({ width: s.cadre.largeur, height: s.cadre.hauteur });
      if (!p || s.document !== p.document || s.vue.echelle !== p.vue.echelle) synchroniser(s);
      if (!p || s.document !== p.document || s.selection !== p.selection) choisir(s);
      if (!p || s.vue !== p.vue) placer(s.vue);
      stage.batchDraw();
    };
    appliquer(store.getState(), null);
    const finStore = store.subscribe(appliquer);
    const finImages = images.abonner(() => stage.batchDraw());

    const taille = new ResizeObserver(() => {
      const { clientWidth: largeur, clientHeight: hauteur } = conteneur;
      const c = store.getState().cadre;
      if (largeur > 0 && hauteur > 0 && (c.largeur !== largeur || c.hauteur !== hauteur)) store.getState().poserCadre({ largeur, hauteur });
    });
    taille.observe(conteneur);

    /* --------------------------------------------------- vue : souris, trackpad, doigts ---- */
    let pan: { x: number; y: number; vue: Vue; bouge: boolean } | null = null;
    let pince: { distance: number; milieu: { x: number; y: number } } | null = null;
    const local = (x: number, y: number) => {
      const r = conteneur.getBoundingClientRect();
      return { x: x - r.left, y: y - r.top };
    };

    stage.on('wheel', (ev) => {
      ev.evt.preventDefault();
      const s = store.getState();
      if (ev.evt.ctrlKey || ev.evt.metaKey) s.zoomer(Math.exp(-ev.evt.deltaY * 0.005), local(ev.evt.clientX, ev.evt.clientY));
      else s.poserVue({ ...s.vue, x: s.vue.x - ev.evt.deltaX, y: s.vue.y - ev.evt.deltaY });
    });
    stage.on('mousedown touchstart', (ev) => {
      const milieu = 'button' in ev.evt && ev.evt.button === 1;
      if (milieu) {
        ev.evt.preventDefault();
        for (const f of formes.values()) f.stopDrag();
      }
      if (ev.target !== stage && !milieu) return;
      const p = stage.getPointerPosition();
      if (p && !pince) pan = { ...p, vue: store.getState().vue, bouge: milieu };
    });
    // Sur la fenêtre : le geste continue hors du plan de travail.
    const bouger = (x: number, y: number) => {
      if (!pan) return;
      const p = local(x, y);
      if (!pan.bouge && Math.hypot(p.x - pan.x, p.y - pan.y) < 4) return;
      pan.bouge = true;
      store.getState().poserVue({ ...pan.vue, x: pan.vue.x + p.x - pan.x, y: pan.vue.y + p.y - pan.y });
    };
    const finir = () => {
      if (pan && !pan.bouge) store.getState().selectionner(null);
      pan = null;
    };
    const souris = (ev: MouseEvent) => bouger(ev.clientX, ev.clientY);
    const ecart = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const centre = (t: TouchList) => local((t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2);
    const toucher = (ev: TouchEvent) => {
      if (ev.touches.length !== 2) return;
      ev.preventDefault();
      pan = null;
      for (const f of formes.values()) if (f.isDragging()) f.stopDrag();
      transfo.stopTransform();
      pince = { distance: ecart(ev.touches), milieu: centre(ev.touches) };
    };
    const glisser = (ev: TouchEvent) => {
      if (ev.touches.length === 1 && !pince) return bouger(ev.touches[0].clientX, ev.touches[0].clientY);
      if (ev.touches.length !== 2 || !pince) return;
      ev.preventDefault();
      const s = store.getState();
      const m = centre(ev.touches);
      const d = ecart(ev.touches);
      const z = zoomer(s.vue, d / Math.max(1, pince.distance), pince.milieu, s.cadre, s.document.dimensions);
      s.poserVue(contenir({ ...z, x: z.x + m.x - pince.milieu.x, y: z.y + m.y - pince.milieu.y }, s.cadre, s.document.dimensions));
      pince = { distance: d, milieu: m };
    };
    const lever = (ev: TouchEvent) => {
      if (ev.touches.length < 2) pince = null;
      if (ev.touches.length === 0) finir();
    };
    const annulerGeste = () => {
      pan = null;
      pince = null;
    };
    window.addEventListener('mousemove', souris);
    window.addEventListener('mouseup', finir);
    conteneur.addEventListener('touchstart', toucher, { passive: false });
    conteneur.addEventListener('touchmove', glisser, { passive: false });
    conteneur.addEventListener('touchend', lever);
    conteneur.addEventListener('touchcancel', annulerGeste);

    return () => {
      finStore();
      finImages();
      taille.disconnect();
      window.removeEventListener('mousemove', souris);
      window.removeEventListener('mouseup', finir);
      conteneur.removeEventListener('touchstart', toucher);
      conteneur.removeEventListener('touchmove', glisser);
      conteneur.removeEventListener('touchend', lever);
      conteneur.removeEventListener('touchcancel', annulerGeste);
      stage.destroy();
    };
  }, [store, images]);

  return (
    <div
      tabIndex={0}
      role="application"
      aria-label={description}
      aria-describedby="studio-aide-clavier"
      data-testid="plan-de-travail"
      className="absolute inset-0 overflow-hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-action"
    >
      <div ref={hote} className="absolute inset-0 touch-none select-none" />
      <p id="studio-aide-clavier" className="sr-only">
        Flèches pour déplacer l’élément sélectionné, Suppr pour le retirer, Ctrl Z pour annuler. La liste des calques permet de choisir un élément.
      </p>
    </div>
  );
}
