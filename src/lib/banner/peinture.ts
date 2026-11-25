/**
 * Banner Studio — dessin d'un élément dans un contexte 2D, en mm, repère centré sur l'élément.
 * Utilisé par le plan de travail Konva et par l'aperçu : un seul dessin, donc un seul rendu.
 */

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
  c.beginPath();
  if (f.nature === 'ellipse') c.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (f.rayonMm > 0) c.roundRect(-w / 2, -h / 2, w, h, Math.min(f.rayonMm, w / 2, h / 2));
  else c.rect(-w / 2, -h / 2, w, h);
  if (f.fond) {
    c.fillStyle = f.fond;
    c.fill();
  }
  if (f.contour && f.epaisseurMm > 0) {
    c.strokeStyle = f.contour;
    c.lineWidth = f.epaisseurMm;
    c.stroke();
  }
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
