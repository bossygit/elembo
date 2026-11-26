import fontkit from '@pdf-lib/fontkit';
import {
  decodePDFRawStream, PDFArray, PDFDict, PDFRawStream,
  beginText, clip, closePath, concatTransformationMatrix, appendBezierCurve, endPath, endText, fill, lineTo, moveTo, PDFDocument, PDFHexString,
  PDFName, PDFNumber, PDFOperator, PDFOperatorNames, popGraphicsState, pushGraphicsState, rectangle, setFillingRgbColor, setFontAndSize, setGraphicsState,
  setLineJoin, setLineWidth, setStrokingRgbColor, setTextMatrix, setTextRise, stroke, drawObject, LineJoinStyle,
  type PDFFont, type PDFPage, type PDFRef,
} from 'pdf-lib';

import { decoupePages, PLAFOND_LIBRE_SERVICE, RECOUVREMENT_PANNEAUX_MM } from '@/lib/banner/constraints';
import { placementForme } from '@/lib/banner/formes';
import { lignesTexte, placementImage } from '@/lib/banner/layout';
import type { Asset, DocumentBanner, Element, ElementTexte } from '@/lib/banner/model';
import { metriquesDe } from '@/lib/banner/polices';

import { embarquerPngOpaque } from './png';
import { chargerPoliceTtf, clePolice, composer, fonctionsOpenType, glyphesAbsents, mesureurServeur, type PoliceChargee } from './polices';

/**
 * Banner Studio — PDF de production (audit §7) : vectoriel, 1:1, polices embarquées, images à leur
 * définition d'origine. Même mise en page que l'éditeur (`lignesTexte`, `placementImage`,
 * `placementForme`) ; aucun repère (ourlet, œillet, zone de sécurité) n'est jamais dessiné.
 *
 * Chaque élément est dessiné en **millimètres, y vers le bas**, dans un repère centré et tourné :
 * une seule matrice fait la conversion en points.
 */

export const PT_PAR_MM = 72 / 25.4;
/** Plafond d'une page PDF : 14 400 unités, soit 5 080 mm. */
const UNITES_MAX = 14_400;
/** Décompresser un PNG coûte 4 octets par pixel : au-delà, la fonction serveur manquerait de mémoire. */
export const PNG_PIXELS_MAX = 40_000_000;

export class ErreurRendu extends Error {
  constructor(public code: 'FORMAT_SUR_DEVIS' | 'POLICE_INDISPONIBLE' | 'POLICE_GLYPHES' | 'IMAGE_MANQUANTE' | 'IMAGE_ILLISIBLE' | 'IMAGE_INCOHERENTE' | 'IMAGE_TROP_LOURDE' | 'PLACEHOLDER', message: string) {
    super(message);
    this.name = 'ErreurRendu';
  }
}

export type PagePlan = { page: number; axe: 'x' | 'y'; debutMm: number; largeurMm: number; hauteurMm: number };
export type Rendu = { octets: Uint8Array; plan: PagePlan[]; recouvrementMm: number; userUnit: number; polices: string[] };

type Contexte = { pdf: PDFDocument; polices: Map<string, PoliceChargee>; embarquees: Map<string, PDFFont>; images: Map<string, PDFRef>; assets: Asset[] };

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Découpe des pages, commune à l'éditeur (`decoupePages`) ; refuse ce que le libre-service n'imprime pas. */
export function planDePages(doc: DocumentBanner): PagePlan[] {
  const { largeurMm: L, hauteurMm: H } = doc.dimensions;
  const { axe, panneaux, tientEnPage } = decoupePages(doc);
  if (!tientEnPage) throw new ErreurRendu('FORMAT_SUR_DEVIS', 'Les deux côtés dépassent la taille maximale d’une page.');
  if (panneaux.length > PLAFOND_LIBRE_SERVICE.pages || (L * H) / 1e6 > PLAFOND_LIBRE_SERVICE.surfaceM2 || Math.max(L, H) > PLAFOND_LIBRE_SERVICE.longueurMm) {
    throw new ErreurRendu('FORMAT_SUR_DEVIS', 'Ce format dépasse le libre-service (12 pages, 100 m², 20 m).');
  }
  return panneaux.map((p, i) => ({ page: i + 1, axe, debutMm: p.debutMm, largeurMm: axe === 'x' ? p.longueurMm : L, hauteurMm: axe === 'y' ? p.longueurMm : H }));
}

export async function rendrePdf(doc: DocumentBanner, fichiers: ReadonlyMap<string, Uint8Array>): Promise<Rendu> {
  const plan = planDePages(doc);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // Dates du document, pas de l'horloge : deux rendus du même document sont identiques.
  const date = new Date(doc.modifieLe);
  pdf.setTitle(doc.nom);
  pdf.setCreator('Elembo Banner Studio');
  pdf.setProducer(`Elembo Banner Studio, rendu ${doc.meta.versionRendu}`);
  pdf.setCreationDate(date);
  pdf.setModificationDate(date);

  const visibles = doc.elements.filter((e) => e.visible);
  const textes = visibles.filter((e): e is ElementTexte => e.type === 'texte');
  const ctx: Contexte = { pdf, polices: new Map(), embarquees: new Map(), images: new Map(), assets: doc.assets };
  for (const e of textes) {
    const cle = clePolice(e.texte);
    if (!ctx.polices.has(cle)) {
      const p = await chargerPoliceTtf(e.texte).catch(() => {
        throw new ErreurRendu('POLICE_INDISPONIBLE', `La police « ${e.texte.policeId} » est indisponible.`);
      });
      ctx.polices.set(cle, p);
      ctx.embarquees.set(cle, await pdf.embedFont(p.octets, { subset: true }));
    }
    const absents = glyphesAbsents(ctx.polices.get(cle)!, e.texte.contenu);
    if (absents.length) throw new ErreurRendu('POLICE_GLYPHES', `La police « ${e.texte.policeId} » ne contient pas : ${absents.join(' ')}`);
  }

  const utiles = new Set(visibles.flatMap((e) => (e.type === 'image' ? [e.image.assetId] : [])));
  if (doc.fond.type === 'image') utiles.add(doc.fond.assetId);
  let pixelsPng = 0;
  for (const a of doc.assets) {
    if (!utiles.has(a.id)) continue;
    if (a.placeholder) throw new ErreurRendu('PLACEHOLDER', `« ${a.nom} » est une image d’exemple.`);
    const octets = fichiers.get(a.id);
    if (!octets) throw new ErreurRendu('IMAGE_MANQUANTE', `L’image « ${a.nom} » est introuvable.`);
    const illisible = () => {
      throw new ErreurRendu('IMAGE_ILLISIBLE', `L’image « ${a.nom} » est illisible.`);
    };
    let image: { ref: PDFRef; width: number; height: number } | null = null;
    if (a.mime === 'image/png') {
      image = embarquerPngOpaque(pdf, octets);
      if (!image) {
        if ((pixelsPng += a.largeurPx * a.hauteurPx) > PNG_PIXELS_MAX) throw new ErreurRendu('IMAGE_TROP_LOURDE', 'Images transparentes trop grandes : 40 millions de pixels au total.');
        image = await pdf.embedPng(octets).catch(illisible);
      }
    } else image = await pdf.embedJpg(octets).catch(illisible);
    if (!image) return illisible();
    if (image.width !== a.largeurPx || image.height !== a.hauteurPx) throw new ErreurRendu('IMAGE_INCOHERENTE', `L’image « ${a.nom} » n’a pas les dimensions annoncées.`);
    ctx.images.set(a.id, image.ref);
  }

  const b = doc.contraintes.fondPerduMm;
  const grandePage = Math.max(...plan.map((p) => Math.max(p.largeurMm, p.hauteurMm))) + 2 * b;
  const userUnit = Math.max(1, Math.ceil((grandePage * PT_PAR_MM) / UNITES_MAX - 1e-9));
  const k = PT_PAR_MM / userUnit;
  for (const p of plan) {
    const l = (p.largeurMm + 2 * b) * k;
    const h = (p.hauteurMm + 2 * b) * k;
    const page = pdf.addPage([l, h]);
    if (userUnit > 1) page.node.set(PDFName.of('UserUnit'), PDFNumber.of(userUnit));
    page.setCropBox(0, 0, l, h);
    page.setBleedBox(0, 0, l, h);
    page.setTrimBox(b * k, b * k, p.largeurMm * k, p.hauteurMm * k);
    page.setArtBox(b * k, b * k, p.largeurMm * k, p.hauteurMm * k);
    const dx = p.axe === 'x' ? p.debutMm : 0;
    const dy = p.axe === 'y' ? p.debutMm : 0;
    /** Point (mm, surface finie) → point de page ; y change de sens. */
    const repere = (xMm: number, yMm: number, deg: number) => {
      const a = (deg * Math.PI) / 180;
      return concatTransformationMatrix(k * Math.cos(a), -k * Math.sin(a), -k * Math.sin(a), -k * Math.cos(a), (xMm - dx + b) * k, h - (yMm - dy + b) * k);
    };
    page.pushOperators(pushGraphicsState(), repere(0, 0, 0));
    dessinerFond(page, doc, ctx);
    page.pushOperators(popGraphicsState());
    for (const e of visibles) {
      page.pushOperators(pushGraphicsState(), repere(e.xMm, e.yMm, e.rotationDeg));
      if (e.opacite < 1) page.pushOperators(setGraphicsState(page.node.newExtGState('GS', ctx.pdf.context.obj({ Type: 'ExtGState', ca: e.opacite, CA: e.opacite }))));
      dessinerElement(page, e, ctx);
      page.pushOperators(popGraphicsState());
    }
  }
  // Sans flux d'objets : lisible par les RIP anciens.
  const octets = await pdf.save({ useObjectStreams: false });
  controlerGlyphes(ctx);
  return { octets, plan, recouvrementMm: plan.length > 1 ? RECOUVREMENT_PANNEAUX_MM : 0, userUnit, polices: [...ctx.polices.keys()].sort() };
}

type SousEnsemble = { glyphIdMap: Map<number, number> };

/**
 * Chaque lettre du PDF a-t-elle le tracé de la police d'origine ? Un sous-ensemble mal formé donne
 * un fichier valide… où des lettres manquent : ni les dimensions ni les polices ne le révèlent.
 */
function controlerGlyphes(ctx: Contexte) {
  for (const [cle, police] of ctx.embarquees) {
    const type0 = ctx.pdf.context.lookup(police.ref, PDFDict);
    const cid = type0.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);
    const flux = cid.lookup(PDFName.of('FontDescriptor'), PDFDict).lookup(PDFName.of('FontFile2'));
    if (!(flux instanceof PDFRawStream)) throw new ErreurRendu('POLICE_INDISPONIBLE', `La police « ${cle} » n’a pas été embarquée.`);
    const embarquee = fontkit.create(decodePDFRawStream(flux).decode()) as unknown as PoliceTracee;
    const source = ctx.polices.get(cle)!.police as unknown as PoliceTracee;
    for (const [idSource, idEmbarque] of (police as unknown as { embedder: SousEnsemble }).embedder.glyphIdMap) {
      let identique = false;
      try {
        identique = source.getGlyph(idSource).path.toSVG() === embarquee.getGlyph(idEmbarque).path.toSVG();
      } catch {
        // tracé illisible : traité comme différent
      }
      if (!identique) throw new ErreurRendu('POLICE_INDISPONIBLE', `La police « ${cle} » est altérée dans le PDF.`);
    }
  }
}
type PoliceTracee = { getGlyph: (id: number) => { path: { toSVG: () => string } } };

function dessinerFond(page: PDFPage, doc: DocumentBanner, ctx: Contexte) {
  const { largeurMm: L, hauteurMm: H } = doc.dimensions;
  const b = doc.contraintes.fondPerduMm;
  const w = L + 2 * b;
  const h = H + 2 * b;
  page.pushOperators(setFillingRgbColor(...rgb(doc.fond.couleur)), rectangle(-b, -b, w, h), fill());
  if (doc.fond.type !== 'image') return;
  const { assetId, ajustement } = doc.fond;
  const a = doc.assets.find((x) => x.id === assetId)!;
  const e = ajustement === 'contain' ? Math.min(w / a.largeurPx, h / a.hauteurPx) : Math.max(w / a.largeurPx, h / a.hauteurPx);
  page.pushOperators(pushGraphicsState(), rectangle(-b, -b, w, h), clip(), endPath());
  poserImage(page, ctx, a.id, L / 2 - (a.largeurPx * e) / 2, H / 2 - (a.hauteurPx * e) / 2, a.largeurPx * e, a.hauteurPx * e);
  page.pushOperators(popGraphicsState());
}

/** Une image PDF occupe un carré unité, y vers le haut : on la retourne dans notre repère. */
function poserImage(page: PDFPage, ctx: Contexte, id: string, x: number, y: number, l: number, h: number) {
  const nom = page.node.newXObject('Im', ctx.images.get(id)!);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(l, 0, 0, -h, x, y + h), drawObject(nom), popGraphicsState());
}

function dessinerElement(page: PDFPage, e: Element, ctx: Contexte) {
  if (e.type === 'texte') return dessinerTexte(page, e, ctx);
  if (e.type === 'image') {
    const p = placementImage(e, ctx.assets.find((a) => a.id === e.image.assetId)!);
    page.pushOperators(rectangle(p.cadre.x, p.cadre.y, p.cadre.largeur, p.cadre.hauteur), clip(), endPath());
    return poserImage(page, ctx, e.image.assetId, p.image.x, p.image.y, p.image.largeur, p.image.hauteur);
  }
  const f = e.forme;
  const p = placementForme(e);
  let trace: PDFOperator[];
  let epaisseur = p.epaisseurMm;
  if (p.decoration) {
    const { echelle, x, y } = p.decoration;
    page.pushOperators(concatTransformationMatrix(echelle, 0, 0, echelle, x, y), setLineJoin(LineJoinStyle.Round));
    epaisseur /= echelle;
    trace = cheminSvg(p.decoration.trace);
  } else if (f.nature === 'ellipse') trace = ellipse(p.cadre.largeur / 2, p.cadre.hauteur / 2);
  else if (p.rayonMm > 0) trace = rectArrondi(p.cadre.x, p.cadre.y, p.cadre.largeur, p.cadre.hauteur, p.rayonMm);
  else trace = [rectangle(p.cadre.x, p.cadre.y, p.cadre.largeur, p.cadre.hauteur)];
  // Remplir puis tracer séparément, comme le canvas : avec une opacité, le résultat en dépend.
  if (f.fond) page.pushOperators(setFillingRgbColor(...rgb(f.fond)), ...trace, fill());
  if (f.contour && epaisseur > 0) page.pushOperators(setStrokingRgbColor(...rgb(f.contour)), setLineWidth(epaisseur), ...trace, stroke());
}

const KAPPA = 0.5522847498;

function ellipse(rx: number, ry: number): PDFOperator[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    moveTo(rx, 0), appendBezierCurve(rx, ky, kx, ry, 0, ry), appendBezierCurve(-kx, ry, -rx, ky, -rx, 0),
    appendBezierCurve(-rx, -ky, -kx, -ry, 0, -ry), appendBezierCurve(kx, -ry, rx, -ky, rx, 0), closePath(),
  ];
}

function rectArrondi(x: number, y: number, l: number, h: number, r: number): PDFOperator[] {
  const c = r * (1 - KAPPA);
  const X = x + l;
  const Y = y + h;
  return [
    moveTo(x + r, y), lineTo(X - r, y), appendBezierCurve(X - c, y, X, y + c, X, y + r),
    lineTo(X, Y - r), appendBezierCurve(X, Y - c, X - c, Y, X - r, Y),
    lineTo(x + r, Y), appendBezierCurve(x + c, Y, x, Y - c, x, Y - r),
    lineTo(x, y + r), appendBezierCurve(x, y + c, x + c, y, x + r, y), closePath(),
  ];
}

/** Décorations : commandes absolues M, L, C, Z seulement (`formes.ts`). */
export function cheminSvg(trace: string): PDFOperator[] {
  return [...trace.matchAll(/([MLCZ])([^MLCZ]*)/g)].map(([, commande, reste]) => {
    const n = (reste.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (commande === 'M') return moveTo(n[0], n[1]);
    if (commande === 'L') return lineTo(n[0], n[1]);
    if (commande === 'C') return appendBezierCurve(n[0], n[1], n[2], n[3], n[4], n[5]);
    return closePath();
  });
}

/**
 * Texte posé **glyphe par glyphe** avec les avances crénées (opérateur TJ). `drawText` de pdf-lib
 * ignore le crénage : jusqu'à 1,2 % d'écart avec l'écran.
 */
function dessinerTexte(page: PDFPage, e: ElementTexte, ctx: Contexte) {
  const t = e.texte;
  const cle = clePolice(t);
  const p = ctx.polices.get(cle)!;
  const police = ctx.embarquees.get(cle)!;
  const interne = (police as unknown as { embedder: { fontFeatures?: Record<string, boolean> } }).embedder;
  const nom = page.node.newFontDictionary('F', police.ref);
  const mille = 1000 / p.police.unitsPerEm;
  page.pushOperators(beginText(), setFontAndSize(nom, t.corpsMm), setFillingRgbColor(...rgb(t.couleur)));
  for (const l of lignesTexte(e, metriquesDe(t), mesureurServeur(ctx.polices)(t))) {
    if (!l.texte) continue;
    // Mêmes fonctions OpenType pour les codes des glyphes et pour leurs positions.
    interne.fontFeatures = fonctionsOpenType(t);
    const hex = police.encodeText(l.texte).asString();
    const { glyphs, positions } = composer(p, l.texte, t);
    if (hex.length !== glyphs.length * 4) throw new Error('RENDU_TEXTE : composition incohérente');
    // Le repère a y vers le bas : on redresse les lettres.
    page.pushOperators(setTextMatrix(1, 0, 0, -1, l.x, l.ligneBase));
    const tableau = ctx.pdf.context.obj([]);
    let hausse = 0;
    const vider = () => {
      if (tableau.size()) page.pushOperators(PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [tableau.clone()]));
      while (tableau.size()) tableau.remove(0);
    };
    const ajuster = (milliemes: number) => {
      if (Math.abs(milliemes) > 1e-4) tableau.push(PDFNumber.of(-Math.round(milliemes * 1e4) / 1e4));
    };
    glyphs.forEach((g, i) => {
      const pos = positions[i];
      const y = (pos.yOffset / p.police.unitsPerEm) * t.corpsMm;
      if (y !== hausse) {
        vider();
        page.pushOperators(setTextRise((hausse = y)));
      }
      ajuster(pos.xOffset * mille);
      tableau.push(PDFHexString.of(hex.slice(i * 4, i * 4 + 4)));
      // L'interlettrage suit un caractère complet, accents combinants compris.
      const espace = i < glyphs.length - 1 && !glyphs[i + 1].isMark ? t.interlettrageEm * 1000 : 0;
      ajuster((pos.xAdvance - g.advanceWidth - pos.xOffset) * mille + espace);
    });
    vider();
    if (hausse !== 0) page.pushOperators(setTextRise(0));
  }
  page.pushOperators(endText());
}
