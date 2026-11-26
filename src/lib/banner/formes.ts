/**
 * Banner Studio — décorations (audit §4.4) : chemins originaux, remplis, en commandes absolues
 * M, L, C, Z. Le canvas les dessine avec `Path2D`, le PDF avec `drawSvgPath`. Ils sont toujours mis
 * à l'échelle **uniformément** : pas de matrice déformante dans le PDF.
 */

import type { Decoration, ElementForme, NatureForme } from './model';

export type DefinitionDecoration = { id: Decoration; nom: string; largeur: number; hauteur: number; trace: string };

const n = (v: number) => Math.round(v * 100) / 100 + 0;
const pt = (x: number, y: number) => `${n(x)} ${n(y)}`;
const polygone = (points: [number, number][]) => `M${points.map(([x, y]) => pt(x, y)).join('L')}Z`;

/** Étoile à `branches` pointes, pointe en haut, inscrite dans un carré de 100. */
function etoile(branches: number, rayonInterieur: number): string {
  return polygone(Array.from({ length: branches * 2 }, (_, i): [number, number] => {
    const r = i % 2 ? rayonInterieur : 50;
    const a = (i * Math.PI) / branches - Math.PI / 2;
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  }));
}

/** Cercle en quatre courbes ; `sens` −1 pour un trou (règle non nulle). */
function cercle(cx: number, cy: number, r: number, sens: 1 | -1 = 1): string {
  const k = r * 0.5522847498;
  const s = sens;
  return `M${pt(cx + r, cy)}C${pt(cx + r, cy + s * k)} ${pt(cx + k, cy + s * r)} ${pt(cx, cy + s * r)}`
    + `C${pt(cx - k, cy + s * r)} ${pt(cx - r, cy + s * k)} ${pt(cx - r, cy)}`
    + `C${pt(cx - r, cy - s * k)} ${pt(cx - k, cy - s * r)} ${pt(cx, cy - s * r)}`
    + `C${pt(cx + k, cy - s * r)} ${pt(cx + r, cy - s * k)} ${pt(cx + r, cy)}Z`;
}

export const DECORATIONS: DefinitionDecoration[] = [
  { id: 'etoile', nom: 'Étoile', largeur: 100, hauteur: 100, trace: etoile(5, 19.1) },
  { id: 'eclat', nom: 'Éclat', largeur: 100, hauteur: 100, trace: etoile(18, 41) },
  { id: 'coeur', nom: 'Cœur', largeur: 100, hauteur: 90, trace: 'M50 90C20 65 0 48 0 26C0 10 12 0 27 0C37 0 46 6 50 15C54 6 63 0 73 0C88 0 100 10 100 26C100 48 80 65 50 90Z' },
  { id: 'croix', nom: 'Croix', largeur: 70, hauteur: 100, trace: polygone([[26, 0], [44, 0], [44, 26], [70, 26], [70, 44], [44, 44], [44, 100], [26, 100], [26, 44], [0, 44], [0, 26], [26, 26]]) },
  { id: 'anneaux', nom: 'Anneaux', largeur: 150, hauteur: 90, trace: cercle(45, 45, 45) + cercle(45, 45, 37, -1) + cercle(105, 45, 45) + cercle(105, 45, 37, -1) },
  { id: 'ruban', nom: 'Ruban', largeur: 200, hauteur: 60, trace: 'M0 16L34 16L34 0L166 0L166 16L200 16L184 38L200 60L150 60L150 44L50 44L50 60L0 60L16 38Z' },
  { id: 'vague', nom: 'Vague', largeur: 200, hauteur: 40, trace: 'M0 20C33 -6 67 -6 100 20C133 46 167 46 200 20L200 32C167 46 133 46 100 32C67 8 33 8 0 32Z' },
  { id: 'coin', nom: 'Coin', largeur: 100, hauteur: 100, trace: `M0 0L100 0L100 6L60 6C30 6 6 30 6 60L6 100L0 100Z${cercle(38, 38, 7)}` },
  { id: 'triangle', nom: 'Triangle', largeur: 100, hauteur: 87, trace: polygone([[50, 0], [100, 87], [0, 87]]) },
  { id: 'fleche', nom: 'Flèche', largeur: 120, hauteur: 80, trace: polygone([[0, 24], [70, 24], [70, 0], [120, 40], [70, 80], [70, 56], [0, 56]]) },
];

export const decoration = (nature: NatureForme): DefinitionDecoration | null => DECORATIONS.find((d) => d.id === nature) ?? null;

/**
 * Placement d'une forme dans son cadre, contour **compris** : le trait est dessiné à l'intérieur,
 * donc la taille affichée est la taille imprimée.
 */
export function placementForme(e: ElementForme) {
  const ep = e.forme.contour ? Math.min(e.forme.epaisseurMm, e.largeurMm / 2, e.hauteurMm / 2) : 0;
  const largeur = e.largeurMm - ep;
  const hauteur = e.hauteurMm - ep;
  const d = decoration(e.forme.nature);
  const echelle = d ? Math.min(largeur / d.largeur, hauteur / d.hauteur) : 1;
  return {
    epaisseurMm: ep,
    cadre: { x: -largeur / 2, y: -hauteur / 2, largeur, hauteur },
    rayonMm: e.forme.nature === 'rect' ? Math.max(0, Math.min(e.forme.rayonMm - ep / 2, largeur / 2, hauteur / 2)) : 0,
    decoration: d ? { trace: d.trace, echelle, x: (-d.largeur * echelle) / 2, y: (-d.hauteur * echelle) / 2 } : null,
  };
}
