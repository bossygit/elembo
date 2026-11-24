/**
 * Banner Studio — mise en page partagée (audit §4.4), en mm, relative au centre de l'élément.
 *
 * L'éditeur Konva, l'aperçu SVG et le PDF serveur consomment ces fonctions : mêmes lignes,
 * même ligne de base, même placement d'image. Le lot 0 a vérifié la fidélité éditeur ↔ PDF
 * avec cette formule (docs/spike-banner-studio-lot0.md §2.2).
 *
 * La mesure d'une ligne est injectée : le navigateur mesure au canvas, le serveur avec fontkit.
 */

import type { Asset, ElementImage, ElementTexte } from './model';

/** Métriques verticales d'une police, en em (descendante négative). */
export type MetriquesPolice = { ascendante: number; descendante: number };
/** Largeur d'une ligne, en mm, pour un corps donné (sans interlettrage). */
export type MesureLigne = (texte: string, corpsMm: number) => number;

export type LigneTexte = { texte: string; x: number; ligneBase: number; largeur: number };

const nbCaracteres = (s: string) => [...s].length;

/**
 * Lignes explicites d'un texte : position x de début (selon l'alignement), ligne de base et
 * largeur. Le bloc est centré verticalement dans le cadre.
 */
export function lignesTexte(e: ElementTexte, metriques: MetriquesPolice, mesurer: MesureLigne): LigneTexte[] {
  const t = e.texte;
  const lignes = t.contenu.split('\n');
  const hauteurLigne = t.corpsMm * t.interligne;
  const bloc = hauteurLigne * lignes.length;
  const espace = t.interlettrageEm * t.corpsMm;
  const oeil = (metriques.ascendante - metriques.descendante) * t.corpsMm;
  return lignes.map((texte, i) => {
    const largeur = mesurer(texte, t.corpsMm) + espace * Math.max(0, nbCaracteres(texte) - 1);
    const x = t.alignement === 'left' ? -e.largeurMm / 2 : t.alignement === 'right' ? e.largeurMm / 2 - largeur : -largeur / 2;
    const ligneBase = -bloc / 2 + i * hauteurLigne + (hauteurLigne - oeil) / 2 + metriques.ascendante * t.corpsMm;
    return { texte, x, ligneBase, largeur };
  });
}

/** Hauteur du bloc de texte et largeur de la plus longue ligne, en mm. */
export function encombrementTexte(e: ElementTexte, metriques: MetriquesPolice, mesurer: MesureLigne) {
  const lignes = lignesTexte(e, metriques, mesurer);
  return { largeurMm: Math.max(0, ...lignes.map((l) => l.largeur)), hauteurMm: e.texte.corpsMm * e.texte.interligne * lignes.length };
}

/**
 * Placement d'une image dans son cadre : l'image source entière est dessinée à `image`
 * (repère local du cadre), puis découpée au cadre. Le recadrage n'est jamais un réencodage.
 */
export function placementImage(e: ElementImage, asset: Asset) {
  const r = e.image.recadrage;
  const cw = r.l * asset.largeurPx;
  const ch = r.h * asset.hauteurPx;
  const echelle = e.image.ajustement === 'contain'
    ? Math.min(e.largeurMm / cw, e.hauteurMm / ch)
    : Math.max(e.largeurMm / cw, e.hauteurMm / ch);
  return {
    /** mm par pixel source. */
    echelle,
    cadre: { x: -e.largeurMm / 2, y: -e.hauteurMm / 2, largeur: e.largeurMm, hauteur: e.hauteurMm },
    image: {
      x: -(r.x + r.l / 2) * asset.largeurPx * echelle,
      y: -(r.y + r.h / 2) * asset.hauteurPx * echelle,
      largeur: asset.largeurPx * echelle,
      hauteur: asset.hauteurPx * echelle,
    },
  };
}
