/**
 * Banner Studio — ce qui dépend du navigateur : mesure du texte, chargement des polices et des
 * images. Isolé ici pour que le store et les opérations restent testables sans DOM.
 */

import { refusDimensions, refusFichier, tailleTravail, typeReel, nomFichier, type MimeImage } from './images';
import type { DocumentBanner, StyleTexte } from './model';
import { fontCss, type Mesureur } from './polices';

let ctx: CanvasRenderingContext2D | null = null;

/** Mesure crénée, à un corps fixe de 100 px : le résultat ne dépend pas du zoom. */
export const mesureurNavigateur: Mesureur = (choix) => (texte, corpsMm) => {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return [...texte].length * corpsMm * 0.6;
  ctx.font = fontCss(choix, 100);
  ctx.fontKerning = 'normal';
  return (ctx.measureText(texte).width / 100) * corpsMm;
};

/** Charge la police avec **son texte** : les sous-ensembles (latin étendu) se chargent à la demande. */
export async function chargerPolice(t: Pick<StyleTexte, 'policeId' | 'graisse' | 'contenu'>): Promise<void> {
  try {
    await document.fonts.load(fontCss(t, 100), t.contenu || 'A');
  } catch {
    // Police indisponible : le navigateur affiche sa police de secours, le préflight le signale.
  }
}

/** La police est-elle prête pour **tous** les caractères du texte ? */
export function policePrete(t: Pick<StyleTexte, 'policeId' | 'graisse' | 'contenu'>): boolean {
  try {
    return document.fonts.check(fontCss(t, 100), t.contenu || 'A');
  } catch {
    return true;
  }
}

export const chargerPolices = (doc: DocumentBanner) => Promise.all(doc.elements.map((e) => (e.type === 'texte' ? chargerPolice(e.texte) : null)));

export type ImageLue = { mime: MimeImage; nom: string; largeurPx: number; hauteurPx: number; travail: CanvasImageSource };

/** Copie de travail réduite (≤ 2 048 px), pour la fluidité ; l'original reste dans le stockage. */
export async function copieTravail(blob: Blob): Promise<{ largeurPx: number; hauteurPx: number; travail: HTMLCanvasElement }> {
  const bitmap = await createImageBitmap(blob);
  try {
    const t = tailleTravail(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = t.largeur;
    canvas.height = t.hauteur;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, t.largeur, t.hauteur);
    return { largeurPx: bitmap.width, hauteurPx: bitmap.height, travail: canvas };
  } finally {
    bitmap.close();
  }
}

/** Lit et contrôle un fichier choisi par l'utilisateur ; lève une `Error` au message affichable. */
export async function lireImage(fichier: File): Promise<ImageLue> {
  const entete = new Uint8Array(await fichier.slice(0, 16).arrayBuffer());
  const refus = refusFichier(fichier.size, entete);
  if (refus) throw new Error(refus);
  const copie = await copieTravail(fichier).catch(() => {
    throw new Error('Cette image est illisible.');
  });
  const trop = refusDimensions(copie.largeurPx, copie.hauteurPx);
  if (trop) throw new Error(trop);
  return { mime: typeReel(entete)!, nom: nomFichier(fichier.name), ...copie };
}
