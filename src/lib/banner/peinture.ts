/**
 * Banner Studio — dessin d'un élément dans un contexte 2D, en mm, repère centré sur l'élément.
 * Utilisé par le plan de travail Konva et par l'aperçu : un seul dessin, donc un seul rendu.
 */

import { placementForme } from './formes';
import { lignesTexte, placementImage } from './layout';
import type { Asset, DocumentBanner, Element } from './model';
import { fontCss, metriquesDe, type Mesureur } from './polices';

export type Ressources = { image: (assetId: string) => CanvasImageSource | null; mesurer: Mesureur };

export function dessinerElement(c: CanvasRenderingContext2D, e: Element, assets: readonly Asset[], r: Ressources): void {
  const w = e.largeurMm;
  const h = e.hauteurMm;
  if (e.type === 'texte') {
    const t = e.texte;
    c.font = fontCss(t, t.corpsMm);
    c.fillStyle = t.couleur;
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.fontKerning = 'normal';
    c.letterSpacing = `${t.interlettrageEm * t.corpsMm}px`;
    for (const l of lignesTexte(e, metriquesDe(t), r.mesurer(t))) if (l.texte) c.fillText(l.texte, l.x, l.ligneBase);
    c.letterSpacing = '0px';
    return;
  }
  if (e.type === 'image') {
    const asset = assets.find((a) => a.id === e.image.assetId);
    if (asset?.placeholder) return dessinerExemple(c, w, h);
    const source = asset ? r.image(asset.id) : null;
    if (!asset || !source) {
      c.fillStyle = '#E5E0D5';
      c.fillRect(-w / 2, -h / 2, w, h);
      c.strokeStyle = '#9A3412';
      c.lineWidth = Math.min(w, h) / 60;
      c.beginPath();
      c.moveTo(-w / 2, -h / 2);
      c.lineTo(w / 2, h / 2);
      c.moveTo(w / 2, -h / 2);
      c.lineTo(-w / 2, h / 2);
      c.stroke();
      return;
    }
    const p = placementImage(e, asset);
    c.save();
    c.beginPath();
    c.rect(p.cadre.x, p.cadre.y, p.cadre.largeur, p.cadre.hauteur);
    c.clip();
    c.drawImage(source, p.image.x, p.image.y, p.image.largeur, p.image.hauteur);
    c.restore();
    return;
  }
  const f = e.forme;
  const p = placementForme(e);
  const { x, y, largeur, hauteur } = p.cadre;
  c.save();
  if (p.decoration) {
    const d = p.decoration;
    c.translate(d.x, d.y);
    c.scale(d.echelle, d.echelle);
    c.lineWidth = p.epaisseurMm / d.echelle;
    c.lineJoin = 'round';
    const t = chemin(d.trace);
    if (f.fond) {
      c.fillStyle = f.fond;
      c.fill(t);
    }
    if (f.contour && p.epaisseurMm > 0) {
      c.strokeStyle = f.contour;
      c.stroke(t);
    }
  } else {
    c.beginPath();
    if (f.nature === 'ellipse') c.ellipse(0, 0, largeur / 2, hauteur / 2, 0, 0, Math.PI * 2);
    else if (p.rayonMm > 0) c.roundRect(x, y, largeur, hauteur, p.rayonMm);
    else c.rect(x, y, largeur, hauteur);
    if (f.fond) {
      c.fillStyle = f.fond;
      c.fill();
    }
    if (f.contour && p.epaisseurMm > 0) {
      c.strokeStyle = f.contour;
      c.lineWidth = p.epaisseurMm;
      c.stroke();
    }
  }
  c.restore();
}

/** Silhouette neutre : emplacement d'une photo de modèle, jamais imprimée (alerte critique). */
function dessinerExemple(c: CanvasRenderingContext2D, w: number, h: number) {
  const u = Math.min(w, h);
  c.save();
  c.beginPath();
  c.rect(-w / 2, -h / 2, w, h);
  c.clip();
  c.fillStyle = '#D8D1C4';
  c.fillRect(-w / 2, -h / 2, w, h);
  c.fillStyle = '#B3AA99';
  c.beginPath();
  c.arc(0, -u * 0.14, u * 0.19, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(0, u * 0.5, u * 0.36, u * 0.38, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#5D5964';
  c.font = `600 ${u * 0.09}px sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.letterSpacing = '0px';
  c.fillText('Votre photo', 0, h / 2 - u * 0.06);
  c.restore();
}

const chemins = new Map<string, Path2D>();
function chemin(trace: string): Path2D {
  let p = chemins.get(trace);
  if (!p) chemins.set(trace, (p = new Path2D(trace)));
  return p;
}

/** Fond (couleur, puis image) sur la surface finie et son fond perdu. */
export function dessinerFond(c: CanvasRenderingContext2D, doc: DocumentBanner, r: Ressources): void {
  const { largeurMm: L, hauteurMm: H } = doc.dimensions;
  const b = doc.contraintes.fondPerduMm;
  c.fillStyle = doc.fond.couleur;
  c.fillRect(-b, -b, L + 2 * b, H + 2 * b);
  if (doc.fond.type !== 'image') return;
  const { assetId, ajustement } = doc.fond;
  const asset = doc.assets.find((a) => a.id === assetId);
  const source = asset ? r.image(asset.id) : null;
  if (!asset || !source) return;
  const w = L + 2 * b;
  const h = H + 2 * b;
  const k = ajustement === 'contain' ? Math.min(w / asset.largeurPx, h / asset.hauteurPx) : Math.max(w / asset.largeurPx, h / asset.hauteurPx);
  c.save();
  c.beginPath();
  c.rect(-b, -b, w, h);
  c.clip();
  c.drawImage(source, L / 2 - (asset.largeurPx * k) / 2, H / 2 - (asset.hauteurPx * k) / 2, asset.largeurPx * k, asset.hauteurPx * k);
  c.restore();
}

/** Document complet, à `echelle` px par mm (aperçu). */
export function dessinerDocument(c: CanvasRenderingContext2D, doc: DocumentBanner, r: Ressources, echelle: number): void {
  c.save();
  c.scale(echelle, echelle);
  dessinerFond(c, doc, r);
  for (const e of doc.elements) {
    if (!e.visible) continue;
    c.save();
    c.translate(e.xMm, e.yMm);
    c.rotate((e.rotationDeg * Math.PI) / 180);
    c.globalAlpha = e.opacite;
    dessinerElement(c, e, doc.assets, r);
    c.restore();
  }
  c.restore();
}
