// Polices du configurateur : métadonnées (licence vérifiée) et utilitaires.
//
// Les fichiers sont locaux (public/fonts, générés par scripts/fetch-fonts.mjs) : aucune
// requête vers Google au chargement, et le build ne dépend pas du réseau. Le CSS est
// chargé par <link> avec un chemin RELATIF, donc valable sous n'importe quel basePath.

import { FONTS } from './fonts.generated';
import type { FontCategory, FontDefinition } from './fonts.generated';
import type { TextElement } from '../types/configurator';

export { FONTS };
export type { FontCategory, FontDefinition };

export const DEFAULT_FONT_ID = 'montserrat';

/** Largeur de l'espace de composition de référence (voir compositionSize). */
export const FONT_REFERENCE_WIDTH = 1024;

export const CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sans serif',
  display: 'Display / Gras',
  script: 'Script / Créatif',
  serif: 'Serif',
};

/** Ordre d'affichage des catégories dans le sélecteur. */
export const CATEGORY_ORDER: FontCategory[] = ['sans', 'display', 'script', 'serif'];

export function fontById(id: string): FontDefinition | undefined {
  return FONTS.find((f) => f.id === id);
}

/**
 * Police utilisable : renvoie la police demandée, la première de la liste en secours si
 * l'identifiant est inconnu (une configuration importée ne doit jamais casser l'édition).
 */
export function resolveFont(id: string): FontDefinition {
  return fontById(id) ?? FONTS[0];
}

/** Retrouve une police par son nom de famille — tolère les configurations écrites à la main. */
export function fontByName(family: string): FontDefinition | undefined {
  const cible = family.trim().toLowerCase();
  return FONTS.find((f) => f.name.toLowerCase() === cible || f.id === cible);
}

/** Polices groupées par catégorie, dans l'ordre d'affichage. */
export function fontsByCategory(): { category: FontCategory; label: string; fonts: FontDefinition[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    fonts: FONTS.filter((f) => f.category === category),
  })).filter((g) => g.fonts.length > 0);
}

/** Graisse disponible la plus proche (une police peut n'avoir que le 400). */
export function nearestWeight(font: FontDefinition, weight: number): number {
  return font.weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), font.weights[0]);
}

/**
 * Chaîne `ctx.font` d'un élément texte. La taille est exprimée dans l'espace de
 * composition courant : `fontSize` est une taille de référence (largeur 1024), donc elle
 * suit le facteur d'échelle de l'espace (aperçu 1024, export 300 dpi).
 */
export function cssFont(el: Pick<TextElement, 'fontId' | 'fontSize' | 'fontWeight' | 'fontStyle'>, spaceScale = 1): string {
  const font = resolveFont(el.fontId);
  const weight = nearestWeight(font, el.fontWeight);
  const size = Math.max(1, el.fontSize * spaceScale);
  return `${el.fontStyle === 'italic' ? 'italic ' : ''}${weight} ${size.toFixed(2)}px ${JSON.stringify(font.name)}, sans-serif`;
}

/** Le navigateur n'a la police que si elle a été téléchargée : on la demande explicitement. */
export async function ensureFontReady(el: Pick<TextElement, 'fontId' | 'fontWeight'>): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return false;
  const font = resolveFont(el.fontId);
  const weight = nearestWeight(font, el.fontWeight);
  try {
    await document.fonts.load(`${weight} 32px ${JSON.stringify(font.name)}`, 'Elembo');
    return document.fonts.check(`${weight} 32px ${JSON.stringify(font.name)}`);
  } catch {
    return false;
  }
}

/**
 * Charge le CSS des polices une seule fois. Le `<link>` est préféré à un import CSS pour
 * rester utilisable depuis n'importe quel basePath (chemins relatifs dans fonts.css).
 */
export function loadFontStylesheet(basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''): void {
  if (typeof document === 'undefined') return;
  const id = 'elembo-fonts';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `${basePath}/fonts/fonts.css`;
  document.head.appendChild(link);
}
