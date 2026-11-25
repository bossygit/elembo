/**
 * Banner Studio — opérations d'édition, pures : elles renvoient un nouveau document et ne
 * touchent ni au DOM ni à Konva. Le store les enchaîne et tient l'historique.
 */

import { resoudreContraintes, PROFILS_PUBLICS } from './constraints';
import { DIMENSION_MAX_MM, DIMENSION_MIN_MM, finitionsApplicables } from './formats';
import { aligner, coins, type ModeAlignement, type Rect } from './geometry';
import { decoration } from './formes';
import { encombrementTexte, placementImage } from './layout';
import type { Asset, DistanceLecture, DocumentBanner, Element, ElementForme, ElementTexte, FinitionStudio, Recadrage, StyleTexte, SupportStudio } from './model';
import { metriquesDe, varianteDe, type Mesureur } from './polices';
import { normaliser, RECADRAGE_PLEIN } from './recadrage';
import { BORNES } from './schema';

export const TAILLE_MIN_MM = 5;
const CORPS_MIN_MM = 5;
const CORPS_MAX_MM = 5000;

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** Dixième de millimètre : largement sous la précision d'impression, et un JSON lisible. */
export const arrondir = (v: number) => Math.round(v * 10) / 10 + 0;

/** Angle ramené dans ]−180, 180]. */
export function normaliserAngle(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  return arrondir(a > 180 ? a - 360 : a);
}

export const trouver = (doc: DocumentBanner, id: string | null) => doc.elements.find((e) => e.id === id) ?? null;
/** Même document si rien ne change : une opération refusée ne crée pas d'étape d'historique. */
export function remplacer(doc: DocumentBanner, id: string, f: (e: Element) => Element): DocumentBanner {
  const e = trouver(doc, id);
  const n = e && f(e);
  return !e || n === e ? doc : { ...doc, elements: doc.elements.map((x) => (x === e ? n! : x)) };
}

/**
 * Ajuste le cadre d'un texte à ce qui est réellement dessiné. Les lignes ne se coupent pas
 * automatiquement : un cadre plus étroit que le texte fausserait toutes les alertes. Le bord
 * d'alignement ne bouge pas (gauche fixe pour un texte à gauche, etc.), rotation comprise.
 */
export function ajusterCadre(e: ElementTexte, mesurer: Mesureur): ElementTexte {
  const enc = encombrementTexte(e, metriquesDe(e.texte), mesurer(e.texte));
  const largeurMm = arrondir(Math.max(TAILLE_MIN_MM, enc.largeurMm));
  const hauteurMm = arrondir(Math.max(TAILLE_MIN_MM, enc.hauteurMm));
  const delta = e.texte.alignement === 'left' ? (largeurMm - e.largeurMm) / 2 : e.texte.alignement === 'right' ? (e.largeurMm - largeurMm) / 2 : 0;
  const a = (e.rotationDeg * Math.PI) / 180;
  return { ...e, largeurMm, hauteurMm, xMm: arrondir(e.xMm + delta * Math.cos(a)), yMm: arrondir(e.yMm + delta * Math.sin(a)) };
}

/** Le centre reste dans le format : un élément ne peut pas être perdu hors de vue. */
function garderVisible<T extends Element>(doc: DocumentBanner, e: T): T {
  return { ...e, xMm: arrondir(borner(e.xMm, 0, doc.dimensions.largeurMm)), yMm: arrondir(borner(e.yMm, 0, doc.dimensions.hauteurMm)) };
}

/** Ajoute une image à la liste, sans doublon. */
export const avecAsset = (doc: DocumentBanner, asset: Asset): DocumentBanner => (doc.assets.some((a) => a.id === asset.id) ? doc : { ...doc, assets: [...doc.assets, asset] });

/** Retire de la liste les images que plus rien n'utilise (« annuler » les rend). */
export function elaguerAssets(doc: DocumentBanner): DocumentBanner {
  const cites = new Set(doc.elements.flatMap((e) => (e.type === 'image' ? [e.image.assetId] : [])));
  if (doc.fond.type === 'image') cites.add(doc.fond.assetId);
  const assets = doc.assets.filter((a) => cites.has(a.id));
  return assets.length === doc.assets.length ? doc : { ...doc, assets };
}

export function ajouter(doc: DocumentBanner, e: Element): DocumentBanner {
  if (doc.elements.length >= BORNES.elementsMax) return doc;
  return { ...doc, elements: [...doc.elements, e] };
}

export function supprimer(doc: DocumentBanner, id: string): DocumentBanner {
  const e = trouver(doc, id);
  return !e || e.verrouille ? doc : elaguerAssets({ ...doc, elements: doc.elements.filter((x) => x.id !== id) });
}

export function dupliquer(doc: DocumentBanner, id: string, nouvelId: string): DocumentBanner {
  const e = trouver(doc, id);
  if (!e || doc.elements.length >= BORNES.elementsMax) return doc;
  const pas = Math.min(doc.dimensions.largeurMm, doc.dimensions.hauteurMm) * 0.05;
  const copie = garderVisible(doc, { ...structuredClone(e), id: nouvelId, nom: `${e.nom} (copie)`.slice(0, BORNES.nomMax), xMm: e.xMm + pas, yMm: e.yMm + pas, verrouille: false });
  const i = doc.elements.indexOf(e);
  return { ...doc, elements: [...doc.elements.slice(0, i + 1), copie, ...doc.elements.slice(i + 1)] };
}

export type Ordre = 'fond' | 'reculer' | 'avancer' | 'dessus';
export function reordonner(doc: DocumentBanner, id: string, vers: Ordre): DocumentBanner {
  const i = doc.elements.findIndex((e) => e.id === id);
  if (i < 0) return doc;
  const dernier = doc.elements.length - 1;
  const j = vers === 'fond' ? 0 : vers === 'dessus' ? dernier : borner(i + (vers === 'avancer' ? 1 : -1), 0, dernier);
  if (i === j) return doc;
  const elements = [...doc.elements];
  elements.splice(j, 0, ...elements.splice(i, 1));
  return { ...doc, elements };
}

export function deplacer(doc: DocumentBanner, id: string, xMm: number, yMm: number): DocumentBanner {
  return remplacer(doc, id, (e) => (e.verrouille ? e : garderVisible(doc, { ...e, xMm, yMm })));
}

export function tourner(doc: DocumentBanner, id: string, rotationDeg: number): DocumentBanner {
  return remplacer(doc, id, (e) => (e.verrouille ? e : { ...e, rotationDeg: normaliserAngle(rotationDeg) }));
}

/**
 * Redimensionne par facteurs. Un texte change de **corps** (mise à l'échelle uniforme) ; une image
 * ou une forme change de cadre. Pur : sert pendant le geste (aperçu) comme à la fin (document).
 */
export function redimensionne<T extends Element>(e: T, fx: number, fy: number, mesurer: Mesureur, limiteMm = DIMENSION_MAX_MM): T {
  if (e.type === 'texte') {
    const corpsMm = arrondir(borner(e.texte.corpsMm * fx, CORPS_MIN_MM, CORPS_MAX_MM));
    return ajusterCadre({ ...e, texte: { ...e.texte, corpsMm } }, mesurer) as T;
  }
  // Une décoration garde ses proportions : on suit le côté qui a le plus changé.
  if (e.type === 'forme' && decoration(e.forme.nature)) fx = fy = Math.abs(Math.log(Math.abs(fx) || 1)) >= Math.abs(Math.log(Math.abs(fy) || 1)) ? fx : fy;
  // Un filet peut être plus fin que la taille minimale d'un bloc.
  const min = e.type === 'forme' ? 1 : TAILLE_MIN_MM;
  return { ...e, largeurMm: arrondir(borner(e.largeurMm * Math.abs(fx), min, limiteMm)), hauteurMm: arrondir(borner(e.hauteurMm * Math.abs(fy), min, limiteMm)) };
}

/** Plus grande taille admise par le schéma pour un élément de ce document. */
export const tailleMax = (doc: DocumentBanner) => Math.max(doc.dimensions.largeurMm, doc.dimensions.hauteurMm) * 2;

/** Remplace la géométrie d'un élément (fin d'un geste ou saisie dans l'inspecteur). */
export type Geometrie = Partial<Pick<Element, 'xMm' | 'yMm' | 'largeurMm' | 'hauteurMm' | 'rotationDeg'>>;
export function poserGeometrie(doc: DocumentBanner, id: string, g: Geometrie, mesurer: Mesureur): DocumentBanner {
  return remplacer(doc, id, (e) => {
    if (e.verrouille) return e;
    let n: Element = e;
    if (e.type === 'texte') {
      const f = g.largeurMm !== undefined ? g.largeurMm / e.largeurMm : g.hauteurMm !== undefined ? g.hauteurMm / e.hauteurMm : 1;
      if (f !== 1) n = redimensionne(e, f, f, mesurer);
    } else {
      n = redimensionne(e, (g.largeurMm ?? e.largeurMm) / e.largeurMm, (g.hauteurMm ?? e.hauteurMm) / e.hauteurMm, mesurer, tailleMax(doc));
    }
    return garderVisible(doc, { ...n, xMm: g.xMm ?? n.xMm, yMm: g.yMm ?? n.yMm, rotationDeg: normaliserAngle(g.rotationDeg ?? n.rotationDeg) });
  });
}

/** Propriétés communes qui ne touchent pas la géométrie (nom, opacité, verrou, visibilité). */
export function poserProprietes(doc: DocumentBanner, id: string, p: Partial<Pick<Element, 'nom' | 'opacite' | 'verrouille' | 'visible'>>): DocumentBanner {
  return remplacer(doc, id, (e) => ({
    ...e,
    ...p,
    nom: (p.nom ?? e.nom).slice(0, BORNES.nomMax) || e.nom,
    opacite: borner(p.opacite ?? e.opacite, 0, 1),
  }));
}

/** Retire ce que le schéma refuse : caractères de contrôle, lignes et longueur en trop. */
export function nettoyerTexte(contenu: string): string {
  return contenu
    .normalize('NFC')
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    // Espaces typographiques : presque aucune police ne les contient toutes.
    .replace(/[\u2007\u202F]/g, '\u00A0')
    .replace(/[\u2000-\u2006\u2008-\u200A\u205F\u3000]/g, ' ')
    // Caractères invisibles (largeur nulle, sens d'écriture, césure conditionnelle).
    .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .split('\n')
    .slice(0, BORNES.lignesMax)
    .join('\n')
    .slice(0, BORNES.texteMax);
}

export function poserTexte(doc: DocumentBanner, id: string, style: Partial<StyleTexte>, mesurer: Mesureur): DocumentBanner {
  return remplacer(doc, id, (e) => {
    if (e.type !== 'texte' || e.verrouille) return e;
    const texte = { ...e.texte, ...style };
    if (style.contenu !== undefined) texte.contenu = nettoyerTexte(style.contenu) || ' ';
    texte.corpsMm = arrondir(borner(texte.corpsMm, CORPS_MIN_MM, CORPS_MAX_MM));
    texte.interligne = borner(Math.round(texte.interligne * 100) / 100, 0.5, 3);
    texte.interlettrageEm = borner(Math.round(texte.interlettrageEm * 1000) / 1000, -0.2, 1);
    // Le document dit ce qui est dessiné : jamais un gras ou un italique que la police n'a pas.
    Object.assign(texte, varianteDe(texte));
    return ajusterCadre({ ...e, texte }, mesurer);
  });
}

/** Coupe les lignes plus larges que `largeurMm` ; un mot seul trop long reste entier. */
export function couperLignes(contenu: string, largeurMm: number, mesure: (ligne: string) => number): string {
  return contenu
    .split('\n')
    .flatMap((ligne) => {
      const sortie: string[] = [];
      let courante = '';
      for (const mot of ligne.split(' ').filter(Boolean)) {
        const essai = courante ? `${courante} ${mot}` : mot;
        if (courante && mesure(essai) > largeurMm) {
          sortie.push(courante);
          courante = mot;
        } else courante = essai;
      }
      return [...sortie, courante];
    })
    .join('\n');
}

/** Largeur d'une ligne de ce texte, interlettrage compris. */
export const largeurLigne = (t: StyleTexte, mesurer: Mesureur) => {
  const m = mesurer(t);
  return (ligne: string) => m(ligne, t.corpsMm) + t.interlettrageEm * t.corpsMm * Math.max(0, [...ligne].length - 1);
};

/** Matérialise les retours à la ligne pour tenir dans une zone (les lignes restent explicites). */
export function couperTexte(doc: DocumentBanner, id: string, zone: Rect, mesurer: Mesureur): DocumentBanner {
  const e = trouver(doc, id);
  if (e?.type !== 'texte' || e.verrouille) return doc;
  const contenu = couperLignes(e.texte.contenu, zone.largeur, largeurLigne(e.texte, mesurer));
  if (contenu === e.texte.contenu || contenu.split('\n').length > BORNES.lignesMax) return doc;
  return remplacer(poserTexte(doc, id, { contenu }, mesurer), id, (x) => {
    const p = aligner(x, zone, 'centre-h');
    return Math.abs(x.rotationDeg) < 0.1 && (x.xMm - x.largeurMm / 2 < zone.x || x.xMm + x.largeurMm / 2 > zone.x + zone.largeur) ? { ...x, xMm: arrondir(p.x) } : x;
  });
}

export function poserForme(doc: DocumentBanner, id: string, forme: Partial<ElementForme['forme']>): DocumentBanner {
  return remplacer(doc, id, (e) => {
    if (e.type !== 'forme' || e.verrouille) return e;
    const f = { ...e.forme, ...forme };
    // Ni fond ni contour : la forme serait invisible (et refusée par le schéma).
    if (f.fond === null && f.contour === null) return e;
    f.epaisseurMm = arrondir(borner(f.epaisseurMm, 0, 500));
    f.rayonMm = arrondir(borner(f.rayonMm, 0, 5000));
    // Activer un contour lui donne une épaisseur visible.
    if (f.contour !== null && f.epaisseurMm === 0) f.epaisseurMm = arrondir(Math.max(1, Math.min(e.largeurMm, e.hauteurMm) * 0.03));
    return { ...e, forme: f };
  });
}

/* ------------------------------------------------------------------------- images -- */

/**
 * Recadre une image. `garderCadre` : le cadre ne bouge pas, c'est son contenu qui change. Sinon le
 * cadre prend la forme du recadrage, à la même échelle, et ce qui reste ne se déplace pas.
 */
export function poserRecadrage(doc: DocumentBanner, id: string, recadrage: Recadrage, garderCadre: boolean): DocumentBanner {
  return remplacer(doc, id, (e) => {
    if (e.type !== 'image' || e.verrouille) return e;
    const asset = doc.assets.find((a) => a.id === e.image.assetId);
    if (!asset) return e;
    const r = normaliser(recadrage);
    const image = { ...e.image, recadrage: r, ajustement: 'cover' as const };
    if (garderCadre) return { ...e, image };
    const p = placementImage(e, asset);
    const limite = tailleMax(doc);
    const largeurMm = arrondir(borner(r.l * asset.largeurPx * p.echelle, TAILLE_MIN_MM, limite));
    const hauteurMm = arrondir(borner(r.h * asset.hauteurPx * p.echelle, TAILLE_MIN_MM, limite));
    const dx = p.image.x + (r.x + r.l / 2) * asset.largeurPx * p.echelle;
    const dy = p.image.y + (r.y + r.h / 2) * asset.hauteurPx * p.echelle;
    const a = (e.rotationDeg * Math.PI) / 180;
    return garderVisible(doc, { ...e, image, largeurMm, hauteurMm, xMm: e.xMm + dx * Math.cos(a) - dy * Math.sin(a), yMm: e.yMm + dx * Math.sin(a) + dy * Math.cos(a) });
  });
}

/** Remplace la photo d'un cadre : position, taille et rotation restent, le recadrage repart de zéro. */
export function remplacerImage(doc: DocumentBanner, id: string, asset: Asset): DocumentBanner {
  const e = trouver(doc, id);
  if (e?.type !== 'image' || e.verrouille) return doc;
  const ancien = doc.assets.find((a) => a.id === e.image.assetId);
  return elaguerAssets(remplacer(avecAsset(doc, asset), id, (x) => ({
    ...x,
    nom: x.nom === ancien?.nom ? asset.nom : x.nom,
    ...(x.type === 'image' ? { image: { assetId: asset.id, recadrage: { ...RECADRAGE_PLEIN }, ajustement: 'cover' as const } } : {}),
  }) as Element));
}

/* --------------------------------------------------------------------------- fond -- */

export const poserCouleurFond = (doc: DocumentBanner, couleur: string): DocumentBanner => (doc.fond.couleur === couleur ? doc : { ...doc, fond: { ...doc.fond, couleur } });

export function poserImageFond(doc: DocumentBanner, asset: Asset): DocumentBanner {
  return elaguerAssets({ ...avecAsset(doc, asset), fond: { type: 'image', assetId: asset.id, ajustement: 'cover', couleur: doc.fond.couleur } });
}

export function retirerImageFond(doc: DocumentBanner): DocumentBanner {
  return doc.fond.type === 'image' ? elaguerAssets({ ...doc, fond: { type: 'couleur', couleur: doc.fond.couleur } }) : doc;
}

export function poserAjustementFond(doc: DocumentBanner, ajustement: 'cover' | 'contain'): DocumentBanner {
  return doc.fond.type === 'image' && doc.fond.ajustement !== ajustement ? { ...doc, fond: { ...doc.fond, ajustement } } : doc;
}

/** Une image posée devient le fond. */
export function mettreEnFond(doc: DocumentBanner, id: string): DocumentBanner {
  const e = trouver(doc, id);
  const asset = e?.type === 'image' && !e.verrouille ? doc.assets.find((a) => a.id === e.image.assetId) : undefined;
  return e && asset ? poserImageFond({ ...doc, elements: doc.elements.filter((x) => x !== e) }, asset) : doc;
}

export const poserDistance = (doc: DocumentBanner, distanceLectureM: DistanceLecture): DocumentBanner =>
  doc.qualite.distanceLectureM === distanceLectureM ? doc : { ...doc, qualite: { distanceLectureM } };

/** Couleurs déjà utilisées, les plus fréquentes d'abord : proposées dans les sélecteurs. */
export function couleursDocument(doc: DocumentBanner, max = 8): string[] {
  const n = new Map<string, number>();
  const compter = (c: string | null) => c && n.set(c.toUpperCase(), (n.get(c.toUpperCase()) ?? 0) + 1);
  compter(doc.fond.couleur);
  for (const e of doc.elements) {
    if (e.type === 'texte') compter(e.texte.couleur);
    if (e.type === 'forme') [e.forme.fond, e.forme.contour].forEach(compter);
  }
  return [...n].sort((a, b) => b[1] - a[1]).slice(0, max).map(([c]) => c);
}

export function poserAjustement(doc: DocumentBanner, id: string, ajustement: 'cover' | 'contain'): DocumentBanner {
  return remplacer(doc, id, (e) => (e.type !== 'image' || e.verrouille ? e : { ...e, image: { ...e.image, ajustement } }));
}

export function alignerElement(doc: DocumentBanner, id: string, zone: Rect, mode: ModeAlignement): DocumentBanner {
  return remplacer(doc, id, (e) => {
    if (e.verrouille) return e;
    const p = aligner(e, zone, mode);
    return garderVisible(doc, { ...e, xMm: p.x, yMm: p.y });
  });
}

/** Change support et finition : les contraintes sont re-résolues depuis le profil public. */
export function poserSupport(doc: DocumentBanner, support: SupportStudio, finition: FinitionStudio): DocumentBanner {
  const f = finitionsApplicables(support).includes(finition) ? finition : 'SANS';
  return { ...doc, support, finition: f, profil: null, contraintes: resoudreContraintes(PROFILS_PUBLICS[support], f) };
}

/**
 * Change le format. Les positions suivent la proportion du format, les tailles suivent le plus
 * petit rapport : la composition garde son allure, et rien ne sort par agrandissement.
 */
export function poserFormat(doc: DocumentBanner, largeurMm: number, hauteurMm: number, mesurer: Mesureur): DocumentBanner {
  if (!Number.isFinite(largeurMm) || !Number.isFinite(hauteurMm)) return doc;
  const L = Math.round(borner(largeurMm, DIMENSION_MIN_MM, DIMENSION_MAX_MM));
  const H = Math.round(borner(hauteurMm, DIMENSION_MIN_MM, DIMENSION_MAX_MM));
  const rx = L / doc.dimensions.largeurMm;
  const ry = H / doc.dimensions.hauteurMm;
  if (rx === 1 && ry === 1) return doc;
  const f = Math.min(rx, ry);
  const nouveau: DocumentBanner = { ...doc, dimensions: { largeurMm: L, hauteurMm: H } };
  return {
    ...nouveau,
    elements: doc.elements.map((e) => {
      const n = redimensionne(e, f, f, mesurer, tailleMax(nouveau));
      // Contours et arrondis suivent l'échelle de la composition.
      const forme = n.type === 'forme' ? { forme: { ...n.forme, epaisseurMm: arrondir(borner(n.forme.epaisseurMm * f, 0, 500)), rayonMm: arrondir(borner(n.forme.rayonMm * f, 0, 5000)) } } : {};
      return garderVisible(nouveau, { ...n, ...forme, xMm: e.xMm * rx, yMm: e.yMm * ry } as Element);
    }),
  };
}

/** Description du document pour le texte alternatif du plan de travail. */
export function decrire(doc: DocumentBanner): string {
  const t = doc.elements.filter((e) => e.type === 'texte').length;
  const i = doc.elements.filter((e) => e.type === 'image').length;
  const f = doc.elements.length - t - i;
  const n = (k: number, s: string) => `${k} ${s}${k > 1 ? 's' : ''}`;
  return `Plan de travail : ${doc.nom}, ${doc.dimensions.largeurMm / 10} × ${doc.dimensions.hauteurMm / 10} cm, ${n(t, 'texte')}, ${n(i, 'image')}, ${n(f, 'forme')}.`;
}

/** Coins d'un élément, pour le contour d'alerte. */
export const contour = (e: Element) => coins(e).flatMap((p) => [p.x, p.y]);
