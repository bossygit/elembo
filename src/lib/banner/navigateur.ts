/**
 * Banner Studio — ce qui dépend du navigateur : mesure du texte, chargement des polices et des
 * images. Isolé ici pour que le store et les opérations restent testables sans DOM.
 */

import { analyserImage, aNormaliser, IMAGE_MAX_OCTETS, nomFichier, OCTETS_ANALYSE, refusDimensions, refusFichier, tailleReecriture, tailleTravail, type MimeImage } from './images';
import type { DocumentBanner, StyleTexte } from './model';
import { fontCss, type ChoixPolice, type Mesureur } from './polices';

let ctx: CanvasRenderingContext2D | null = null;

/**
 * Mesure crénée, à un corps fixe de 100 px : le résultat ne dépend pas du zoom. L'interlettrage est
 * appliqué pendant la mesure puis retiré, parce qu'il change la composition (ligatures coupées).
 */
export const mesureurNavigateur: Mesureur = (choix) => (texte, corpsMm) => {
  ctx ??= document.createElement('canvas').getContext('2d');
  const n = [...texte].length;
  if (!ctx) return n * corpsMm * 0.6;
  const espace = (choix.interlettrageEm ?? 0) * 100;
  ctx.font = fontCss(choix, 100);
  ctx.fontKerning = 'normal';
  ctx.letterSpacing = `${espace}px`;
  const largeur = ctx.measureText(texte).width - n * espace;
  return (largeur / 100) * corpsMm;
};

type TextePolice = ChoixPolice & Pick<StyleTexte, 'contenu'>;

/** Charge la variante ; `false` si le fichier n'a pas pu l'être (réseau, police inconnue). */
export async function chargerPolice(t: TextePolice): Promise<boolean> {
  try {
    const faces = await document.fonts.load(fontCss(t, 100), 'A');
    return faces.length > 0 && faces.every((f) => f.status === 'loaded');
  } catch {
    return false;
  }
}

export function policePrete(t: TextePolice): boolean {
  try {
    return document.fonts.check(fontCss(t, 100), 'A');
  } catch {
    return false;
  }
}

/** Charge les polices d'un document ; renvoie les identifiants de celles qui ont échoué. */
export async function chargerPolices(doc: DocumentBanner): Promise<string[]> {
  const textes = doc.elements.flatMap((e) => (e.type === 'texte' ? [e.texte] : []));
  const ok = await Promise.all(textes.map(chargerPolice));
  return [...new Set(textes.filter((_, i) => !ok[i]).map((t) => t.policeId))];
}

export type ImageLue = { mime: MimeImage; nom: string; largeurPx: number; hauteurPx: number; sha256?: string; blob: Blob; travail: HTMLCanvasElement };

/** Décode par un élément `<img>` : tous les navigateurs y appliquent l'orientation EXIF. */
async function decoder(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function peindre(img: HTMLImageElement, largeur: number, hauteur: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  canvas.getContext('2d')?.drawImage(img, 0, 0, largeur, hauteur);
  return canvas;
}

/** Copie de travail réduite (≤ 2 048 px), pour la fluidité ; l'original reste dans le stockage. */
export async function copieTravail(blob: Blob): Promise<{ largeurPx: number; hauteurPx: number; travail: HTMLCanvasElement; source: HTMLImageElement }> {
  const source = await decoder(blob);
  const t = tailleTravail(source.naturalWidth, source.naturalHeight);
  return { largeurPx: source.naturalWidth, hauteurPx: source.naturalHeight, travail: peindre(source, t.largeur, t.hauteur), source };
}

function transparente(canvas: HTMLCanvasElement): boolean {
  const d = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
  if (d) for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

async function empreinte(blob: Blob): Promise<string | undefined> {
  // Absent hors contexte sécurisé (http sur un réseau local) : l'empreinte reste facultative.
  if (!globalThis.crypto?.subtle) return undefined;
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  return [...h].map((o) => o.toString(16).padStart(2, '0')).join('');
}

/**
 * Lit, contrôle et prépare un fichier choisi par l'utilisateur ; lève une `Error` au message
 * affichable. Le fichier est gardé **tel quel** sauf si le PDF ne pouvait pas le rendre comme
 * l'écran (WEBP, EXIF, CMJN, profil de couleur) : il est alors réécrit en sRVB droit.
 */
export async function lireImage(fichier: File): Promise<ImageLue> {
  const entete = new Uint8Array(await fichier.slice(0, OCTETS_ANALYSE).arrayBuffer());
  const refus = refusFichier(fichier.size, entete);
  if (refus) throw new Error(refus);
  const analyse = analyserImage(entete);
  const copie = await copieTravail(fichier).catch(() => {
    throw new Error('Cette image est illisible.');
  });
  const trop = refusDimensions(copie.largeurPx, copie.hauteurPx);
  if (trop) throw new Error(trop);

  let blob: Blob = fichier;
  let { largeurPx, hauteurPx } = copie;
  let mime: MimeImage = analyse.type === 'image/png' ? 'image/png' : 'image/jpeg';
  if (aNormaliser(analyse)) {
    const t = tailleReecriture(largeurPx, hauteurPx);
    if (analyse.type === 'image/webp' && transparente(copie.travail)) mime = 'image/png';
    const canvas = peindre(copie.source, t.largeur, t.hauteur);
    const reecrit = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, mime, 0.95));
    canvas.width = canvas.height = 0; // libère la mémoire sans attendre le ramasse-miettes
    if (!reecrit || reecrit.type !== mime) throw new Error('Cette image n’a pas pu être préparée : exportez-la en JPEG ou PNG.');
    if (reecrit.size > IMAGE_MAX_OCTETS) throw new Error('Cette image dépasse 25 Mo une fois convertie : exportez-la en JPEG.');
    blob = reecrit;
    largeurPx = t.largeur;
    hauteurPx = t.hauteur;
  }
  const sha256 = await empreinte(blob);
  return { mime, nom: nomFichier(fichier.name), largeurPx, hauteurPx, ...(sha256 ? { sha256 } : {}), blob, travail: copie.travail };
}
