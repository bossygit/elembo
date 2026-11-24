'use client';

// Lot 0 du Banner Studio — éditeur Konva minimal. PROTOTYPE JETABLE : ne pas fusionner.
// Le document reste la seule source de vérité (mm) ; Konva n'en est qu'une projection à l'écran.

import Konva from 'konva';
import { useEffect, useRef, useState } from 'react';

import documentReference from '../../../spike/banner-studio/document-3x1.json';
import metriquesPolices from '../../../spike/banner-studio/metriques.json';
import { lignesTexte } from '../../../spike/banner-studio/mise-en-page.mjs';

type Doc = typeof documentReference;
type Element = Doc['elements'][number];
type Metriques = Record<string, { famille: string; ascendante: number; descendante: number }>;

const METRIQUES = metriquesPolices as Metriques;
const SOURCES: Record<string, string> = { portrait: '/mockups/tableau-interieur.jpg', logo: '/spike/logo-transparent.png' };

function chargerImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const im = new window.Image();
    im.onload = () => ok(im);
    im.onerror = () => ko(new Error(`Image introuvable : ${src}`));
    im.src = src;
  });
}

/** Mesure d'une ligne en mm, à partir d'un corps de 100 px (indépendant du zoom). */
function mesureur(famille: string) {
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.font = `100px "${famille}"`;
  return (texte: string, corpsMm: number) => (ctx.measureText(texte).width / 100) * corpsMm;
}

function construire(e: Element, s: number, images: Record<string, HTMLImageElement>): Konva.Group {
  const w = e.largeurMm * s;
  const h = e.hauteurMm * s;
  const groupe = new Konva.Group({ id: e.id, x: e.xMm * s, y: e.yMm * s, rotation: e.rotationDeg, opacity: e.opacite, draggable: true });
  if (e.type === 'forme' && 'forme' in e && e.forme) {
    const f = e.forme;
    groupe.add(new Konva.Rect({ x: -w / 2, y: -h / 2, width: w, height: h, fill: f.fond ?? undefined, stroke: f.contour ?? undefined, strokeWidth: f.contour ? f.epaisseurMm * s : 0 }));
  } else if (e.type === 'image' && 'image' in e && e.image) {
    const im = e.image;
    const asset = documentReference.assets.find((a) => a.id === im.assetId)!;
    const r = im.recadrage;
    const cw = r.l * asset.largeurPx;
    const ch = r.h * asset.hauteurPx;
    const k = im.ajustement === 'contain' ? Math.min(e.largeurMm / cw, e.hauteurMm / ch) : Math.max(e.largeurMm / cw, e.hauteurMm / ch);
    const cadre = new Konva.Group({ clip: { x: -w / 2, y: -h / 2, width: w, height: h } });
    cadre.add(new Konva.Image({
      image: images[im.assetId],
      x: -(r.x + r.l / 2) * asset.largeurPx * k * s,
      y: -(r.y + r.h / 2) * asset.hauteurPx * k * s,
      width: asset.largeurPx * k * s,
      height: asset.hauteurPx * k * s,
    }));
    groupe.add(cadre);
  } else if (e.type === 'texte' && 'texte' in e && e.texte) {
    const t = e.texte;
    const m = METRIQUES[t.policeId];
    const lignes = lignesTexte(e, m, mesureur(m.famille)) as { texte: string; x: number; ligneBase: number }[];
    const forme = new Konva.Shape({
      // `fill` est requis pour que Konva dessine la zone cliquable (hitFunc) ; le texte est peint à la main.
      fill: t.couleur,
      // Texte dessiné à la main (pas Konva.Text) : mêmes lignes, même ligne de base que le PDF.
      sceneFunc: (ctx, forme) => {
        // Vide le tracé courant : sinon fillStrokeShape remplirait la découpe laissée par une image.
        ctx.beginPath();
        const c = ctx._context;
        c.font = `${t.corpsMm * s}px "${m.famille}"`;
        c.fillStyle = t.couleur;
        c.textBaseline = 'alphabetic';
        c.letterSpacing = `${t.interlettrageEm * t.corpsMm * s}px`;
        for (const l of lignes) c.fillText(l.texte, l.x * s, l.ligneBase * s);
        ctx.fillStrokeShape(forme);
      },
      hitFunc: (ctx, forme) => {
        ctx.beginPath();
        ctx.rect(-w / 2, -h / 2, w, h);
        ctx.closePath();
        ctx.fillStrokeShape(forme);
      },
    });
    // Konva ne connaît pas la taille d'une forme dessinée à la main : sans cela, le Transformer est nul.
    forme.getSelfRect = () => ({ x: -w / 2, y: -h / 2, width: w, height: h });
    groupe.add(forme);
  }
  return groupe;
}

export default function EditeurSpike() {
  const hote = useRef<HTMLDivElement>(null);
  const scene = useRef<Konva.Stage | null>(null);
  const [doc, setDoc] = useState<Doc>(documentReference);
  const [selection, setSelection] = useState<string | null>(null);
  const [etat, setEtat] = useState('Chargement des polices et des images…');

  useEffect(() => {
    let annule = false;
    (async () => {
      await Promise.all(Object.values(METRIQUES).map((m) => document.fonts.load(`100px "${m.famille}"`)));
      const images = Object.fromEntries(await Promise.all(Object.entries(SOURCES).map(async ([id, src]) => [id, await chargerImage(src)] as const)));
      if (annule || !hote.current) return;
      const largeur = Math.min(hote.current.clientWidth, 1200);
      const s = largeur / doc.dimensions.largeurMm;
      scene.current?.destroy();
      const stage = new Konva.Stage({ container: hote.current, width: largeur, height: doc.dimensions.hauteurMm * s });
      scene.current = stage;
      const calque = new Konva.Layer();
      calque.add(new Konva.Rect({ width: largeur, height: doc.dimensions.hauteurMm * s, fill: doc.fond.couleur, listening: false }));
      const transfo = new Konva.Transformer({ rotateEnabled: true, keepRatio: false, borderStroke: '#E87A2E', anchorStroke: '#E87A2E' });
      for (const e of doc.elements) {
        const g = construire(e, s, images);
        g.on('click tap', () => { transfo.nodes([g]); setSelection(e.id); });
        g.on('dragend transformend', () => {
          // Retour au modèle : le document en mm reste la vérité ; l'échelle est absorbée dans les dimensions.
          setDoc((d) => ({
            ...d,
            elements: d.elements.map((x) => x.id !== e.id ? x : ({
              ...x,
              xMm: Math.round((g.x() / s) * 10) / 10,
              yMm: Math.round((g.y() / s) * 10) / 10,
              largeurMm: Math.round(x.largeurMm * g.scaleX() * 10) / 10,
              hauteurMm: Math.round(x.hauteurMm * g.scaleY() * 10) / 10,
              rotationDeg: Math.round(g.rotation() * 10) / 10,
              ...('texte' in x && x.texte ? { texte: { ...x.texte, corpsMm: Math.round(x.texte.corpsMm * g.scaleY() * 10) / 10 } } : {}),
            }) as Element),
          }));
        });
        calque.add(g);
      }
      calque.add(transfo);
      stage.on('click tap', (ev) => { if (ev.target === stage || ev.target.getParent() === calque && ev.target.className === 'Rect') { transfo.nodes([]); setSelection(null); } });
      stage.add(calque);
      setEtat(`Échelle : ${(s * 1000).toFixed(1)} px par mètre · ${doc.elements.length} éléments`);
    })().catch((e: Error) => setEtat(`Erreur : ${e.message}`));
    return () => { annule = true; };
    // Le document modifié ne reconstruit pas la scène : Konva porte déjà l'état visuel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exporterApercu() {
    const stage = scene.current;
    if (!stage) return;
    stage.find('Transformer').forEach((t) => t.hide());
    const url = stage.toDataURL({ mimeType: 'image/jpeg', quality: 0.82, pixelRatio: 1600 / stage.width() });
    stage.find('Transformer').forEach((t) => t.show());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'apercu-spike-1600.jpg';
    a.click();
  }

  return (
    <div>
      <div ref={hote} data-testid="scene" style={{ width: '100%', maxWidth: 1200, boxShadow: '0 2px 12px rgba(0,0,0,.15)' }} />
      <p data-testid="etat" style={{ fontSize: 12, color: '#555', margin: '8px 0' }}>{etat}{selection ? ` · sélection : ${selection}` : ''}</p>
      <button type="button" onClick={exporterApercu} style={{ padding: '6px 12px', background: '#18181a', color: '#fff', borderRadius: 6, fontSize: 13 }}>
        Exporter l’aperçu JPEG 1 600 px
      </button>
      <pre data-testid="document" style={{ marginTop: 16, fontSize: 11, maxHeight: 280, overflow: 'auto', background: '#fff', padding: 12 }}>
        {JSON.stringify(doc.elements.map(({ id, xMm, yMm, largeurMm, hauteurMm, rotationDeg }) => ({ id, xMm, yMm, largeurMm, hauteurMm, rotationDeg })), null, 1)}
      </pre>
    </div>
  );
}
