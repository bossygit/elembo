// Composition du design en Canvas 2D — maths pures testables + rendu.
//
// Rôle : le Canvas 2D est responsable de la COMPOSITION du design ; Three.js est
// responsable de son AFFICHAGE. Ce module ne connaît donc ni Three.js ni React, et il est
// le seul endroit qui sait placer/borner un élément (image ou texte) dans une zone
// d'impression.
//
// Le texte est composé ICI, pas en HTML au-dessus du modèle : il suit le vêtement, il
// tourne avec lui, il respecte les UV, il est décalqué dans la texture, et il pourra être
// recréé en haute résolution pour l'impression à partir de ses seuls paramètres.

import type { DesignElement, Side, TextElement } from '../../types/configurator';
import { ELEMENT_LIMITS, TEXT_LIMITS, TRANSFORM_LIMITS } from '../../types/configurator';
import type { PrintArea, Product } from '../products/catalog';
import { cssFont, resolveFont } from '../fonts';

/** Texture d'aperçu (écran) — volontairement limitée pour rester fluide. */
export const PREVIEW_TEXTURE_SIZE = 1024;
/** Densité cible du fichier d'impression. */
export const PRINT_DPI = 300;
/** Garde-fou : taille maximale du fichier de production. */
export const MAX_PRINT_TEXTURE_SIZE = 4096;

export type Rect = { x: number; y: number; w: number; h: number };

/** Dimensions de l'espace de composition (la « texture » sur laquelle on dessine). */
export type CanvasSpace = { width: number; height: number };

/**
 * Espace de composition d'une zone d'impression.
 *
 *  - technique 'uv'    : le panneau a sa propre texture, carrée (la zone est un rectangle
 *                        à l'intérieur).
 *  - technique 'decal' : la zone EST la texture du décalque ; l'espace doit donc avoir le
 *                        format physique de la zone (21 × 30 cm → 1024 × 1463), sinon le
 *                        visuel serait étiré en projection.
 */
export function compositionSize(area: PrintArea, base = PREVIEW_TEXTURE_SIZE): CanvasSpace {
  if (area.technique === 'decal') {
    return { width: base, height: Math.round(base * (area.cmHeight / area.cmWidth)) };
  }
  return { width: base, height: base };
}

/** Normalise un argument « espace » : un nombre = carré de ce côté. */
export function toSpace(space: number | CanvasSpace): CanvasSpace {
  return typeof space === 'number' ? { width: space, height: space } : space;
}

/**
 * Zone d'impression exprimée dans l'espace de composition.
 * Accepte un côté (espace carré) ou un couple largeur/hauteur.
 */
export function printAreaRect(area: PrintArea, space: number | CanvasSpace): Rect {
  const { width, height } = toSpace(space);
  if (width <= 0 || height <= 0) throw new RangeError('espace de composition invalide');
  return {
    x: area.x * width,
    y: area.y * height,
    w: area.w * width,
    h: area.h * height,
  };
}

/** Boîte englobante d'un rectangle pivoté (pour borner correctement). */
export function rotatedBox(w: number, h: number, rotationDeg: number): { w: number; h: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { w: w * c + h * s, h: w * s + h * c };
}

/* ------------------------------------------------------------------ éléments ----- */

/** Mesure la largeur d'un texte. Fourni par le canvas (ou un substitut dans les tests). */
export type Measurer = (text: string, font: string, letterSpacing: number) => number;

/** Mesureur générique : sert quand aucun contexte canvas n'est disponible (tests, maths). */
export const roughMeasurer: Measurer = (text, font, letterSpacing) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  return text.length * size * 0.55 + Math.max(0, text.length - 1) * letterSpacing * size;
};

/** Découpe un contenu en lignes : les retours à la ligne de l'utilisateur sont respectés. */
export function textLines(content: string): string[] {
  return content.replace(/\r\n?/g, '\n').split('\n');
}

/** Facteur d'échelle de l'espace de composition par rapport à l'espace de référence. */
export function spaceScale(space: number | CanvasSpace): number {
  return toSpace(space).width / PREVIEW_TEXTURE_SIZE;
}

/** Taille du bloc de texte, en pixels de l'espace de composition. */
export function textBlockSize(
  el: Pick<TextElement, 'content' | 'fontId' | 'fontSize' | 'fontWeight' | 'fontStyle' | 'letterSpacing' | 'lineHeight'>,
  measure: Measurer = roughMeasurer,
  scale = 1,
): { w: number; h: number } {
  const font = cssFont(el, scale);
  const lignes = textLines(el.content);
  let largeur = 1;
  for (const ligne of lignes) {
    largeur = Math.max(largeur, measure(ligne, font, el.letterSpacing));
  }
  const hauteur = Math.max(1, lignes.length) * el.fontSize * scale * el.lineHeight;
  return { w: Math.max(1, largeur), h: Math.max(1, hauteur) };
}

/**
 * Taille « naturelle » d'un élément dans la zone.
 *  - image : ses dimensions natives, ajustées en « contain » dans la zone (comportement
 *            historique : échelle 1 = l'image occupe la zone au mieux) ;
 *  - texte : son bloc mesuré, sans ajustement (la taille de police est voulue telle quelle).
 */
export function elementNaturalSize(
  el: DesignElement,
  area: PrintArea,
  space: number | CanvasSpace,
  measure: Measurer = roughMeasurer,
): { w: number; h: number; fit: number } {
  const zone = printAreaRect(area, space);
  if (el.type === 'image') {
    const w = Math.max(1, el.width);
    const h = Math.max(1, el.height);
    return { w, h, fit: Math.min(zone.w / w, zone.h / h) };
  }
  const bloc = textBlockSize(el, measure, spaceScale(space));
  return { w: bloc.w, h: bloc.h, fit: 1 };
}

/** Rectangle d'un élément dans la texture, en pixels, rotation non appliquée. */
export function elementRect(
  el: DesignElement,
  area: PrintArea,
  space: number | CanvasSpace,
  measure: Measurer = roughMeasurer,
): Rect {
  const zone = printAreaRect(area, space);
  const nat = elementNaturalSize(el, area, space, measure);
  const w = nat.w * nat.fit * el.scale;
  const h = nat.h * nat.fit * el.scale;
  const cx = zone.x + zone.w / 2 + el.x * zone.w;
  const cy = zone.y + zone.h / 2 + el.y * zone.h;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Boîte englobante d'un élément, rotation comprise — pour le bornage et la sélection. */
export function elementBox(
  el: DesignElement,
  area: PrintArea,
  space: number | CanvasSpace,
  measure: Measurer = roughMeasurer,
): Rect {
  const rect = elementRect(el, area, space, measure);
  const box = rotatedBox(rect.w, rect.h, el.rotation);
  return {
    x: rect.x + rect.w / 2 - box.w / 2,
    y: rect.y + rect.h / 2 - box.h / 2,
    w: box.w,
    h: box.h,
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Bornage numérique d'un centre : partagé par clampElement et clampTransform. */
function clampCenter(
  box: { w: number; h: number },
  zone: Rect,
  x: number,
  y: number,
  margin: number,
): { x: number; y: number } {
  const tientEnLargeur = box.w + 2 * margin * zone.w <= zone.w;
  const tientEnHauteur = box.h + 2 * margin * zone.h <= zone.h;
  const maxX = tientEnLargeur
    ? (zone.w - box.w) / 2 / zone.w - margin
    : Math.abs(zone.w - box.w) / 2 / zone.w;
  const maxY = tientEnHauteur
    ? (zone.h - box.h) / 2 / zone.h - margin
    : Math.abs(zone.h - box.h) / 2 / zone.h;
  return {
    x: clamp(x, -Math.max(0, maxX), Math.max(0, maxX)),
    y: clamp(y, -Math.max(0, maxY), Math.max(0, maxY)),
  };
}

/**
 * Borne un élément pour qu'il reste dans la zone d'impression :
 *  - élément plus petit que la zone → il reste entièrement dedans, avec une marge de
 *    sécurité (l'utilisateur ne peut donc pas le pousser hors de la zone) ;
 *  - élément plus grand que la zone → il peut glisser tant qu'il recouvre la zone (ce qui
 *    dépasse est rogné, comme en impression réelle).
 */
export function clampElement<T extends DesignElement>(
  el: T,
  area: PrintArea | null,
  space: number | CanvasSpace,
  measure: Measurer = roughMeasurer,
  margin = ELEMENT_LIMITS.margin,
): T {
  const scale = clamp(el.scale, ELEMENT_LIMITS.scaleMin, ELEMENT_LIMITS.scaleMax);
  const rotation = clamp(el.rotation, ELEMENT_LIMITS.rotationMin, ELEMENT_LIMITS.rotationMax);
  const borne: T = { ...el, scale, rotation };
  if (el.type === 'text') {
    const texte = borne as TextElement;
    texte.content = texte.content.slice(0, TEXT_LIMITS.contentMax);
    texte.fontSize = clamp(texte.fontSize, TEXT_LIMITS.fontSizeMin, TEXT_LIMITS.fontSizeMax);
    texte.letterSpacing = clamp(texte.letterSpacing, TEXT_LIMITS.letterSpacingMin, TEXT_LIMITS.letterSpacingMax);
    texte.lineHeight = clamp(texte.lineHeight, TEXT_LIMITS.lineHeightMin, TEXT_LIMITS.lineHeightMax);
  }
  if (!area) return borne;
  const zone = printAreaRect(area, space);
  const rect = elementRect(borne, area, space, measure);
  const box = rotatedBox(rect.w, rect.h, rotation);
  const centre = clampCenter(box, zone, borne.x, borne.y, margin);
  return { ...borne, x: centre.x, y: centre.y };
}

/** Décalage au clavier (flèches) — borné comme tout déplacement. */
export function nudgeElement<T extends DesignElement>(
  el: T,
  dx: number,
  dy: number,
  pas = ELEMENT_LIMITS.nudge,
): T {
  return { ...el, x: el.x + dx * pas, y: el.y + dy * pas };
}

/**
 * Un élément dépasse-t-il la zone d'impression ? Dans ce cas il sera rogné à
 * l'impression : l'interface doit le dire, et proposer de le ramener à la taille utile.
 *
 * `factor` est le coefficient à appliquer à l'échelle (ou à la taille de police) pour
 * que l'élément tienne entièrement dans la zone, marge de sécurité comprise.
 */
export function elementOverflow(
  el: DesignElement,
  area: PrintArea | null,
  space: number | CanvasSpace,
  measure: Measurer = roughMeasurer,
  margin = ELEMENT_LIMITS.margin,
): { over: boolean; factor: number } {
  if (!area) return { over: false, factor: 1 };
  const zone = printAreaRect(area, space);
  const rect = elementRect(el, area, space, measure);
  const box = rotatedBox(rect.w, rect.h, el.rotation);
  const largeurUtile = zone.w - 2 * margin * zone.w;
  const hauteurUtile = zone.h - 2 * margin * zone.h;
  const factor = Math.min(1, largeurUtile / box.w, hauteurUtile / box.h);
  return { over: factor < 0.999, factor };
}

/** Éléments d'une face, du calque le plus bas au plus haut. */
export function elementsOfSide(elements: DesignElement[], side: Side): DesignElement[] {
  return elements.filter((el) => el.side === side).sort((a, b) => a.z - b.z);
}

/** Identifiant lisible et stable : `text-001`, `image-002`, … */
export function nextElementId(elements: DesignElement[], type: DesignElement['type']): string {
  let max = 0;
  for (const el of elements) {
    if (el.type !== type) continue;
    const n = Number(/(\d+)$/.exec(el.id)?.[1] ?? 0);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `${type}-${String(max + 1).padStart(3, '0')}`;
}

/** Prochain ordre d'empilement (au-dessus de tous les éléments de la même face). */
export function nextZ(elements: DesignElement[], side: Side): number {
  return elements.filter((el) => el.side === side).reduce((max, el) => Math.max(max, el.z), 0) + 1;
}

/* --------------------------------------------------------------- rendu canvas ---- */

export type DrawElement = { element: DesignElement; image?: CanvasImageSource | null };

export type DrawParams = {
  /** Largeur de l'espace de composition, en pixels. */
  size: number;
  /** Hauteur de l'espace (par défaut = `size` : texture carrée du panneau). */
  height?: number;
  area: PrintArea;
  /** Éléments à composer, dans l'ordre des calques. */
  elements?: DrawElement[];
  /** Couleur du produit : si fournie, le panneau est rempli (mode aperçu éditeur). */
  baseColor?: string | null;
  /** Repères de calage (zone d'impression) — jamais dans la texture d'impression. */
  showGuides?: boolean;
  /** Élément sélectionné : sa boîte est dessinée (éditeur uniquement). */
  selectedId?: string | null;
  /** Mesureur fourni par le contexte ; par défaut, mesure réelle via le canvas. */
  measure?: Measurer;
};

/** Fabrique un mesureur à partir d'un contexte 2D (mesure typographique réelle). */
export function contextMeasurer(ctx: CanvasRenderingContext2D): Measurer {
  return (text, font, letterSpacing) => {
    const previous = ctx.font;
    ctx.font = font;
    applyLetterSpacing(ctx, letterSpacing);
    const width = ctx.measureText(text).width;
    applyLetterSpacing(ctx, 0);
    ctx.font = previous;
    return width;
  };
}

/** Interlettrage : pris en charge nativement par le canvas (Chrome, Safari 17+, Firefox 118+). */
function applyLetterSpacing(ctx: CanvasRenderingContext2D, em: number): void {
  if (!('letterSpacing' in ctx)) return;
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 16);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(em * size).toFixed(2)}px`;
}

/** Dessine un bloc de texte centré sur l'origine du repère courant. */
function drawTextBlock(ctx: CanvasRenderingContext2D, el: TextElement, spaceScaleValue: number): void {
  const font = cssFont(el, spaceScaleValue);
  ctx.font = font;
  ctx.fillStyle = el.color;
  applyLetterSpacing(ctx, el.letterSpacing);
  ctx.textBaseline = 'top';
  ctx.textAlign = el.align === 'left' ? 'left' : el.align === 'right' ? 'right' : 'center';

  const lignes = textLines(el.content);
  const hauteurLigne = el.fontSize * spaceScaleValue * el.lineHeight;
  const largeur = Math.max(...lignes.map((l) => ctx.measureText(l).width), 1);
  const origine = el.align === 'left' ? -largeur / 2 : el.align === 'right' ? largeur / 2 : 0;

  lignes.forEach((ligne, i) => {
    ctx.fillText(ligne, origine, (i - (lignes.length - 1) / 2) * hauteurLigne - hauteurLigne / 2);
  });
  applyLetterSpacing(ctx, 0);
}

/**
 * Compose un élément (image ou texte) à sa place, avec sa rotation et son échelle.
 * L'échelle est appliquée au contexte : en export haute résolution, le texte est donc
 * REDESSINÉ à la bonne taille, jamais agrandi depuis l'aperçu.
 */
function drawElement(
  ctx: CanvasRenderingContext2D,
  el: DesignElement,
  image: CanvasImageSource | null | undefined,
  area: PrintArea,
  space: CanvasSpace,
  measure: Measurer,
): void {
  const rect = elementRect(el, area, space, measure);
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  if (el.rotation !== 0) ctx.rotate((el.rotation * Math.PI) / 180);
  ctx.scale(el.scale, el.scale);
  if (el.type === 'image') {
    if (image) {
      const nat = elementNaturalSize(el, area, space, measure);
      const w = nat.w * nat.fit;
      const h = nat.h * nat.fit;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
    }
  } else {
    drawTextBlock(ctx, el, spaceScale(space));
  }
  ctx.restore();
}

/** Box de sélection (éditeur) : contour + poignées angulaires. */
function drawSelection(ctx: CanvasRenderingContext2D, el: DesignElement, area: PrintArea, space: CanvasSpace, measure: Measurer): void {
  const rect = elementRect(el, area, space, measure);
  const epaisseur = Math.max(1, space.width / 500);
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.rotate((el.rotation * Math.PI) / 180);
  ctx.strokeStyle = 'rgba(232, 95, 0, 0.95)';
  ctx.lineWidth = epaisseur * 1.6;
  ctx.setLineDash([epaisseur * 6, epaisseur * 4]);
  ctx.strokeRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
  ctx.setLineDash([]);
  const cote = Math.max(6, space.width / 60);
  ctx.fillStyle = '#E85F00';
  for (const [hx, hy] of [
    [-rect.w / 2, -rect.h / 2],
    [rect.w / 2, -rect.h / 2],
    [rect.w / 2, rect.h / 2],
    [-rect.w / 2, rect.h / 2],
  ]) {
    ctx.fillRect(hx - cote / 2, hy - cote / 2, cote, cote);
  }
  ctx.restore();
}

/**
 * Compose le panneau : fond optionnel, puis tous les éléments dans l'ordre des calques.
 * Sans `baseColor`, la texture est transparente hors des éléments : c'est ce qu'attend un
 * décalque (le vêtement garde sa propre couleur et ses textures PBR).
 */
export function drawComposition(ctx: CanvasRenderingContext2D, p: DrawParams): void {
  const space: CanvasSpace = { width: p.size, height: p.height ?? p.size };
  const zone = printAreaRect(p.area, space);
  const measure = p.measure ?? contextMeasurer(ctx);
  ctx.clearRect(0, 0, space.width, space.height);

  if (p.baseColor) {
    ctx.fillStyle = p.baseColor;
    ctx.fillRect(0, 0, space.width, space.height);
  }

  const elements = p.elements ?? [];
  if (elements.length) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(zone.x, zone.y, zone.w, zone.h);
    ctx.clip();
    for (const item of elements) {
      if (item.element.visible === false) continue;
      drawElement(ctx, item.element, item.image, p.area, space, measure);
    }
    ctx.restore();
  }

  const selection = elements.find((item) => item.element.id === p.selectedId)?.element;
  if (selection) drawSelection(ctx, selection, p.area, space, measure);

  if (p.showGuides) {
    ctx.save();
    ctx.strokeStyle = 'rgba(232, 95, 0, 0.95)';
    ctx.lineWidth = Math.max(1, space.width / 320);
    ctx.setLineDash([space.width / 60, space.width / 90]);
    ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
    ctx.restore();
  }
}

/**
 * Place un élément sous le curseur : renvoie son identifiant ou null.
 * Parcourt du calque le plus haut au plus bas (le dernier posé est attrapé en premier).
 */
export function hitTest(
  elements: DesignElement[],
  area: PrintArea,
  space: number | CanvasSpace,
  point: { x: number; y: number },
  measure: Measurer = roughMeasurer,
): DesignElement | null {
  const tries = [...elements].sort((a, b) => b.z - a.z);
  for (const el of tries) {
    if (el.visible === false) continue;
    const rect = elementRect(el, area, space, measure);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const rad = (-el.rotation * Math.PI) / 180;
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
    const marge = Math.max(rect.w, rect.h) * 0.08;
    if (Math.abs(localX) <= rect.w / 2 + marge && Math.abs(localY) <= rect.h / 2 + marge) return el;
  }
  return null;
}

/**
 * Rectangle du visuel dans la texture, en pixels, centré sur le centre de la zone
 * décalé par la transformation. Échelle 1 = le visuel occupe la zone au mieux
 * (contain), sans déformation.
 *
 * Conservé pour la compatibilité (studio 2D) ; les éléments passent par elementRect.
 */
export function designRect(
  transform: { x: number; y: number; scale: number; rotation: number },
  area: PrintArea,
  space: number | CanvasSpace,
  assetSize: { w: number; h: number },
): Rect {
  if (assetSize.w <= 0 || assetSize.h <= 0) throw new RangeError('dimensions du visuel invalides');
  const zone = printAreaRect(area, space);
  const fit = Math.min(zone.w / assetSize.w, zone.h / assetSize.h);
  const w = assetSize.w * fit * transform.scale;
  const h = assetSize.h * fit * transform.scale;
  const cx = zone.x + zone.w / 2 + transform.x * zone.w;
  const cy = zone.y + zone.h / 2 + transform.y * zone.h;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * Borne une transformation pour que le visuel ne puisse pas sortir arbitrairement de
 * la zone d'impression (comportement historique, sans marge de sécurité).
 */
export function clampTransform(
  transform: { x: number; y: number; scale: number; rotation: number },
  area: PrintArea,
  space: number | CanvasSpace,
  assetSize: { w: number; h: number },
): { x: number; y: number; scale: number; rotation: number } {
  const scale = clamp(transform.scale, TRANSFORM_LIMITS.scaleMin, TRANSFORM_LIMITS.scaleMax);
  const rotation = clamp(transform.rotation, TRANSFORM_LIMITS.rotationMin, TRANSFORM_LIMITS.rotationMax);
  const zone = printAreaRect(area, space);
  const rect = designRect({ ...transform, scale, rotation }, area, space, assetSize);
  const box = rotatedBox(rect.w, rect.h, rotation);
  const centre = clampCenter(box, zone, transform.x, transform.y, 0);
  return { x: centre.x, y: centre.y, scale, rotation };
}

/** Taille en pixels du fichier de production, à la densité d'impression cible. */
export function productionTextureSize(area: PrintArea, dpi = PRINT_DPI): { w: number; h: number } {
  const px = (cm: number) => Math.round((cm / 2.54) * dpi);
  return {
    w: Math.min(MAX_PRINT_TEXTURE_SIZE, px(area.cmWidth)),
    h: Math.min(MAX_PRINT_TEXTURE_SIZE, px(area.cmHeight)),
  };
}

/** Zone d'impression d'un côté, ou null si le produit ne l'expose pas. */
export function areaForSide(product: Product | undefined, side: Side): PrintArea | null {
  return product?.printAreas?.[side] ?? null;
}

/**
 * Taille réellement imprimée du visuel (cm). Grâce à l'invariant isotrope du
 * catalogue, le ratio de la texture est celui de la zone physique — la conversion
 * ci-dessous est donc exacte dans les deux directions.
 */
export function printedCm(rect: Rect, area: PrintArea, space: number | CanvasSpace): { w: number; h: number } {
  const zone = printAreaRect(area, space);
  return { w: (rect.w / zone.w) * area.cmWidth, h: (rect.h / zone.h) * area.cmHeight };
}

/** Famille CSS d'un élément texte (utilitaire de lecture). */
export function elementFontFamily(el: TextElement): string {
  return resolveFont(el.fontId).name;
}
