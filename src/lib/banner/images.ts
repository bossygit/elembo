/**
 * Banner Studio — contrôle d'un fichier image avant import (audit §7.5). Tout est lu dans les
 * octets : type, orientation, espace de couleur, animation.
 *
 * Le PDF embarque le fichier tel quel et **ignore** orientation EXIF, profil ICC et CMJN : une
 * image qui en dépend est donc réécrite en sRVB droit à l'import (`aNormaliser`). Les autres sont
 * conservées sans aucune recompression.
 */

import type { Asset } from './model';

export const IMAGE_MAX_OCTETS = 25 * 1024 * 1024;
export const IMAGE_MAX_PIXELS = 50_000_000;
export const IMAGE_MIN_COTE = 200;
/** Copie de travail de l'éditeur : l'original est conservé pour l'impression. */
export const COTE_TRAVAIL = 2048;
/** Taille maximale d'un canvas sur iOS : plafond d'une image réécrite. */
export const PIXELS_REECRITURE = 16_777_216;
/** Octets lus pour l'analyse : EXIF, ICC et dimensions sont en tête de fichier. */
export const OCTETS_ANALYSE = 1024 * 1024;

export type TypeImage = 'image/jpeg' | 'image/png' | 'image/webp';
export type MimeImage = Asset['mime'];
export type Analyse = {
  type: TypeImage | null;
  /** Orientation EXIF, 1 = droite. */
  orientation: number;
  cmjn: boolean;
  /** Profil de couleur autre que sRVB (Display P3 d'un iPhone, AdobeRGB…). */
  profilEtranger: boolean;
  animee: boolean;
  /** Faux si l'en-tête n'a pas été entièrement compris. */
  complet: boolean;
};

const ascii = (o: Uint8Array, debut: number, texte: string) => [...texte].every((c, i) => o[debut + i] === c.charCodeAt(0));
const u16 = (o: Uint8Array, p: number, petit = false) => (petit ? (o[p + 1] << 8) | o[p] : (o[p] << 8) | o[p + 1]);
const u32 = (o: Uint8Array, p: number, petit = false) => (petit ? u16(o, p + 2, true) * 65536 + u16(o, p, true) : u16(o, p) * 65536 + u16(o, p + 2));

export function typeReel(octets: Uint8Array): TypeImage | null {
  const commence = (...s: number[]) => s.every((o, i) => octets[i] === o);
  if (commence(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (commence(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (ascii(octets, 0, 'RIFF') && ascii(octets, 8, 'WEBP')) return 'image/webp';
  return null;
}

/** Orientation dans un bloc TIFF (EXIF), 1 si absente ou incohérente. */
function orientationTiff(o: Uint8Array, debut: number, fin: number): number {
  const petit = ascii(o, debut, 'II');
  if (!petit && !ascii(o, debut, 'MM')) return 1;
  const ifd = debut + u32(o, debut + 4, petit);
  if (ifd + 2 > fin) return 1;
  const entrees = u16(o, ifd, petit);
  for (let i = 0; i < entrees; i++) {
    const p = ifd + 2 + i * 12;
    if (p + 12 > fin) return 1;
    if (u16(o, p, petit) === 0x0112) {
      const v = u16(o, p + 8, petit);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

/** Un profil ICC sRVB porte son nom dans sa description (ASCII ou UTF-16). */
function estSrgb(o: Uint8Array, debut: number, fin: number): boolean {
  let texte = '';
  for (let i = debut; i < Math.min(fin, debut + 4096, o.length); i++) if (o[i] >= 0x20 && o[i] < 0x7f) texte += String.fromCharCode(o[i]);
  return texte.includes('sRGB');
}

function analyserJpeg(o: Uint8Array): Omit<Analyse, 'type'> {
  const r = { orientation: 1, cmjn: false, profilEtranger: false, animee: false, complet: false };
  let p = 2;
  while (p + 4 <= o.length) {
    if (o[p] !== 0xff) return r;
    const marque = o[p + 1];
    if (marque === 0xff) { p++; continue; }
    const taille = u16(o, p + 2);
    const debut = p + 4;
    const fin = p + 2 + taille;
    if (taille < 2 || fin > o.length) return r;
    if (marque === 0xe1 && ascii(o, debut, 'Exif')) r.orientation = orientationTiff(o, debut + 6, fin);
    else if (marque === 0xe2 && ascii(o, debut, 'ICC_PROFILE') && o[debut + 12] === 1) r.profilEtranger = !estSrgb(o, debut + 14, fin);
    else if (marque >= 0xc0 && marque <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marque)) r.cmjn = o[debut + 5] === 4;
    // Début des données : les informations utiles sont toutes passées.
    else if (marque === 0xda) return { ...r, complet: true };
    p = fin;
  }
  return r;
}

function analyserPng(o: Uint8Array): Omit<Analyse, 'type'> {
  const r = { orientation: 1, cmjn: false, profilEtranger: false, animee: false, complet: false };
  let p = 8;
  let srgb = false;
  while (p + 12 <= o.length) {
    const taille = u32(o, p);
    if (ascii(o, p + 4, 'IDAT')) return { ...r, profilEtranger: r.profilEtranger && !srgb, complet: true };
    if (ascii(o, p + 4, 'acTL')) r.animee = true;
    if (ascii(o, p + 4, 'sRGB')) srgb = true;
    if (ascii(o, p + 4, 'iCCP')) r.profilEtranger = !estSrgb(o, p + 8, p + 8 + 79);
    p += 12 + taille;
  }
  return r;
}

export function analyserImage(o: Uint8Array): Analyse {
  const type = typeReel(o);
  const droit = { orientation: 1, cmjn: false, profilEtranger: false, animee: false, complet: true };
  if (type === 'image/jpeg') return { type, ...analyserJpeg(o) };
  if (type === 'image/png') return { type, ...analyserPng(o) };
  if (type === 'image/webp') return { type, ...droit, animee: ascii(o, 12, 'VP8X') && (o[20] & 0x02) !== 0 };
  return { type, ...droit };
}

/** L'image doit-elle être réécrite en sRVB droit pour que le PDF montre la même chose que l'écran ? */
export const aNormaliser = (a: Analyse): boolean => a.type === 'image/webp' || a.orientation !== 1 || a.cmjn || a.profilEtranger || !a.complet;

export function refusFichier(taille: number, octets: Uint8Array): string | null {
  if (taille === 0) return 'Ce fichier est vide.';
  if (taille > IMAGE_MAX_OCTETS) return 'Cette image dépasse 25 Mo.';
  const a = analyserImage(octets);
  if (ascii(octets, 4, 'ftyphei') || ascii(octets, 4, 'ftypmif1') || ascii(octets, 4, 'ftyphev')) return 'Photo HEIC (iPhone) non prise en charge : exportez-la en JPEG.';
  if (!a.type) return 'Format non pris en charge : utilisez une image JPEG, PNG ou WEBP.';
  return a.animee ? 'Image animée non prise en charge : utilisez une image fixe.' : null;
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

/** Dimensions d'une image réécrite : pleine définition, dans la limite d'un canvas iOS. */
export function tailleReecriture(largeur: number, hauteur: number) {
  const k = Math.min(1, Math.sqrt(PIXELS_REECRITURE / (largeur * hauteur)));
  return { largeur: Math.floor(largeur * k), hauteur: Math.floor(hauteur * k) };
}

/** Nom d'affichage : sans chemin ni caractère de contrôle, borné. */
export const nomFichier = (nom: string) => nom.replace(/^.*[\\/]/, '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 100) || 'image';
