// Lot 0 — rendu PDF serveur d'un document Banner Studio (pdf-lib + @pdf-lib/fontkit).
// PROTOTYPE JETABLE : il sert à lever les risques du §7 de l'audit, pas à être fusionné.

import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument, PDFName, PDFNumber, rgb,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix,
  moveTo, lineTo, closePath, clip, endPath, setCharacterSpacing,
} from 'pdf-lib';

import { lignesTexte } from './mise-en-page.mjs';

export { lignesTexte };
export const PT_PAR_MM = 72 / 25.4;
/** Plafond PDF d'une page : 14 400 unités = 200 pouces = 5 080 mm. */
export const PAGE_MAX_MM = 5080;
const PANNEAU_MAX_MM = 5000;
const RECOUVREMENT_MM = 20;

const hex = (c) => {
  const n = parseInt(c.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/**
 * Métriques partagées éditeur ↔ PDF : ascendante et descendante (hhea) en em.
 * L'éditeur Konva reçoit exactement ces valeurs (metriques.json) pour placer les lignes.
 */
export function metriquesPolice(font) {
  return { ascendante: font.ascent / font.unitsPerEm, descendante: font.descent / font.unitsPerEm };
}

/** Découpe de la longueur en panneaux ≤ 5 000 mm avec recouvrement de 20 mm (§7.3). */
export function panneaux(longueurMm) {
  if (longueurMm <= PAGE_MAX_MM) return [{ debutMm: 0, longueurMm }];
  const n = Math.ceil((longueurMm - RECOUVREMENT_MM) / (PANNEAU_MAX_MM - RECOUVREMENT_MM));
  const l = (longueurMm + (n - 1) * RECOUVREMENT_MM) / n;
  return Array.from({ length: n }, (_, i) => ({ debutMm: i * (l - RECOUVREMENT_MM), longueurMm: l }));
}

/**
 * Rend le document en PDF.
 * @param {object} doc document Banner Studio (mm)
 * @param {{ polices: Record<string, Uint8Array>, images: Record<string, Uint8Array> }} ressources
 * @param {{ mode?: 'PANNEAUX' | 'USERUNIT' }} options
 */
export async function rendrePdf(doc, ressources, { mode = 'PANNEAUX' } = {}) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const dateFixe = new Date('2026-01-01T00:00:00Z');
  pdf.setTitle(doc.nom);
  pdf.setProducer('Elembo Banner Studio — spike lot 0');
  pdf.setCreator('Elembo Banner Studio');
  pdf.setCreationDate(dateFixe);
  pdf.setModificationDate(dateFixe);

  const polices = {};
  const metriques = {};
  for (const id of new Set(doc.elements.filter((e) => e.type === 'texte').map((e) => e.texte.policeId))) {
    const octets = ressources.polices[id];
    if (!octets) throw new Error(`POLICE_ABSENTE : ${id}`);
    const police = await pdf.embedFont(octets, { subset: true });
    polices[id] = police;
    metriques[id] = metriquesPolice(police.embedder.font);
    for (const e of doc.elements.filter((x) => x.type === 'texte' && x.texte.policeId === id)) {
      const manquants = [...new Set([...e.texte.contenu.replace(/\n/g, '')])].filter((c) => !police.embedder.font.hasGlyphForCodePoint(c.codePointAt(0)));
      if (manquants.length) throw new Error(`POLICE_GLYPHES : ${id} ne contient pas ${manquants.join(' ')}`);
    }
  }
  const images = {};
  for (const a of doc.assets) {
    const octets = ressources.images[a.id];
    if (!octets) throw new Error(`IMAGE_ABSENTE : ${a.id}`);
    images[a.id] = a.mime === 'image/png' ? await pdf.embedPng(octets) : await pdf.embedJpg(octets);
  }

  const { largeurMm, hauteurMm } = doc.dimensions;
  const fp = doc.contraintes?.fondPerduMm ?? 0;
  const userUnit = mode === 'USERUNIT' && Math.max(largeurMm, hauteurMm) + 2 * fp > PAGE_MAX_MM
    ? Math.ceil((Math.max(largeurMm, hauteurMm) + 2 * fp) / PAGE_MAX_MM) : 1;
  const k = PT_PAR_MM / userUnit;
  const decoupe = mode === 'USERUNIT' ? [{ debutMm: 0, longueurMm: largeurMm }] : panneaux(largeurMm);
  if (decoupe.length > 12 || (largeurMm * hauteurMm) / 1e6 > 100) throw new Error('FORMAT_SUR_DEVIS : plus de 12 pages ou de 100 m²');

  const plan = [];
  for (const [i, p] of decoupe.entries()) {
    const page = pdf.addPage([(p.longueurMm + 2 * fp) * k, (hauteurMm + 2 * fp) * k]);
    if (userUnit > 1) page.node.set(PDFName.of('UserUnit'), PDFNumber.of(userUnit));
    const H = (hauteurMm + 2 * fp) * k;
    page.setBleedBox(0, 0, (p.longueurMm + 2 * fp) * k, H);
    page.setTrimBox(fp * k, fp * k, p.longueurMm * k, hauteurMm * k);
    plan.push({ page: i + 1, debutMm: Math.round(p.debutMm * 10) / 10, longueurMm: Math.round(p.longueurMm * 10) / 10 });

    // Fond sur toute la page, fond perdu compris.
    if (doc.fond?.type === 'couleur') page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: H, color: hex(doc.fond.couleur) });

    for (const e of doc.elements) {
      if (e.visible === false) continue;
      // Repère : centre de l'élément, rotation horaire (y vers le bas) → anti-horaire en PDF.
      const cx = (e.xMm - p.debutMm + fp) * k;
      const cy = H - (e.yMm + fp) * k;
      const a = (-(e.rotationDeg ?? 0) * Math.PI) / 180;
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), cx, cy));
      const w = e.largeurMm * k;
      const h = e.hauteurMm * k;
      if (e.type === 'forme') {
        const f = e.forme;
        page.drawRectangle({
          x: -w / 2, y: -h / 2, width: w, height: h,
          color: f.fond ? hex(f.fond) : undefined,
          borderColor: f.contour ? hex(f.contour) : undefined,
          borderWidth: f.contour ? f.epaisseurMm * k : 0,
          opacity: e.opacite, borderOpacity: e.opacite,
        });
      } else if (e.type === 'image') {
        const im = e.image;
        const asset = doc.assets.find((x) => x.id === im.assetId);
        const W = asset.largeurPx;
        const Hpx = asset.hauteurPx;
        const r = im.recadrage;
        const cw = r.l * W;
        const ch = r.h * Hpx;
        const s = im.ajustement === 'contain' ? Math.min(e.largeurMm / cw, e.hauteurMm / ch) : Math.max(e.largeurMm / cw, e.hauteurMm / ch);
        const gauche = -(r.x + r.l / 2) * W * s;
        const haut = -(r.y + r.h / 2) * Hpx * s;
        page.pushOperators(moveTo(-w / 2, -h / 2), lineTo(w / 2, -h / 2), lineTo(w / 2, h / 2), lineTo(-w / 2, h / 2), closePath(), clip(), endPath());
        page.drawImage(images[im.assetId], { x: gauche * k, y: -(haut + Hpx * s) * k, width: W * s * k, height: Hpx * s * k, opacity: e.opacite });
      } else if (e.type === 'texte') {
        const police = polices[e.texte.policeId];
        const corpsPt = e.texte.corpsMm * k;
        const lignes = lignesTexte(e, metriques[e.texte.policeId], (texte, corpsMm) => police.widthOfTextAtSize(texte, corpsMm * k) / k);
        page.pushOperators(setCharacterSpacing(e.texte.interlettrageEm * e.texte.corpsMm * k));
        for (const l of lignes) {
          if (!l.texte) continue;
          page.drawText(l.texte, { x: l.x * k, y: -l.ligneBase * k, size: corpsPt, font: police, color: hex(e.texte.couleur), opacity: e.opacite });
        }
      }
      page.pushOperators(popGraphicsState());
    }
  }
  // Sans flux d'objets : dictionnaires lisibles par les RIP anciens et par la vérification ci-dessous.
  const octets = await pdf.save({ useObjectStreams: false });
  return { octets, plan, userUnit, metriques };
}

/** Relit le PDF produit et vérifie ce que le §7.8 exige. */
export async function verifierPdf(octets) {
  const pdf = await PDFDocument.load(octets);
  const brut = Buffer.from(octets).toString('latin1');
  const pages = pdf.getPages().map((p) => {
    const uu = p.node.get(PDFName.of('UserUnit'));
    const u = uu ? Number(uu.toString()) : 1;
    const mm = (v) => Math.round((v * u) / PT_PAR_MM * 10) / 10;
    const m = p.getMediaBox();
    const t = p.getTrimBox();
    const b = p.getBleedBox();
    return {
      mediaPt: [Math.round(m.width * 100) / 100, Math.round(m.height * 100) / 100],
      userUnit: u,
      mediaMm: [mm(m.width), mm(m.height)],
      trimMm: [mm(t.width), mm(t.height)],
      bleedMm: [mm(b.width), mm(b.height)],
    };
  });
  return {
    pages,
    policesEmbarquees: (brut.match(/\/FontFile2/g) ?? []).length + (brut.match(/\/FontFile3/g) ?? []).length,
    images: (brut.match(/\/Subtype \/Image/g) ?? []).length,
    taille: octets.length,
  };
}
