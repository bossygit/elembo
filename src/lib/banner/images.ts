/**
 * Banner Studio — contrôle d'un fichier image avant import (audit §7.5). Le type est lu dans les
 * octets, jamais dans l'extension. WEBP, orientation EXIF et recadrage : lot 3.
 */

export const IMAGE_MAX_OCTETS = 25 * 1024 * 1024;
export const IMAGE_MAX_PIXELS = 50_000_000;
export const IMAGE_MIN_COTE = 200;
/** Copie de travail de l'éditeur : l'original est conservé pour l'impression. */
export const COTE_TRAVAIL = 2048;

export type MimeImage = 'image/jpeg' | 'image/png';

export function typeReel(octets: Uint8Array): MimeImage | null {
  const commence = (...s: number[]) => s.every((o, i) => octets[i] === o);
  if (commence(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (commence(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  return null;
}

export function refusFichier(taille: number, entete: Uint8Array): string | null {
  if (taille === 0) return 'Ce fichier est vide.';
  if (taille > IMAGE_MAX_OCTETS) return 'Cette image dépasse 25 Mo.';
  return typeReel(entete) ? null : 'Format non pris en charge : utilisez une image JPEG ou PNG.';
}

export function refusDimensions(largeur: number, hauteur: number): string | null {
  if (Math.min(largeur, hauteur) < IMAGE_MIN_COTE) return `Image trop petite (${largeur} × ${hauteur} px) : au moins ${IMAGE_MIN_COTE} px de côté.`;
  if (largeur * hauteur > IMAGE_MAX_PIXELS || Math.max(largeur, hauteur) > 20_000) return 'Image trop grande : 50 millions de pixels au plus.';
  return null;
}

/** Dimensions de la copie de travail (≤ 2 048 px, jamais agrandie). */
export function tailleTravail(largeur: number, hauteur: number) {
  const k = Math.min(1, COTE_TRAVAIL / Math.max(largeur, hauteur));
  return { largeur: Math.max(1, Math.round(largeur * k)), hauteur: Math.max(1, Math.round(hauteur * k)) };
}

/** Nom d'affichage : sans chemin ni caractère de contrôle, borné. */
export const nomFichier = (nom: string) => nom.replace(/^.*[\\/]/, '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 100) || 'image';
