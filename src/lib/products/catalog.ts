// Catalogue du configurateur 3D.
//
// Un produit est décrit par un MODÈLE 3D (GLB) et par des zones d'impression. Aucune
// caractéristique produit n'est codée en dur dans les composants : tout passe par ici,
// ce qui permet d'ajouter un hoodie, un tote bag ou une casquette sans toucher au
// configurateur.
//
// Deux techniques d'impression cohabitent :
//
//  'uv'     — le modèle expose des panneaux dédiés (nœuds « FrontPanel » / « BackPanel »)
//             avec des UV planes ; le visuel est composé dans la texture du panneau et
//             la zone d'impression est un rectangle de cette texture (x/y/w/h en 0..1).
//
//  'decal'  — le modèle d'un fournisseur est un maillage unique dont l'atlas UV ne
//             réserve pas de zone d'impression. Le visuel est alors PROJETÉ sur la
//             surface (décalque), dans un cadre exprimé en unités du modèle et déduit
//             du maillage (scripts/inspect-glb.mjs). La zone couvre toute la texture du
//             décalque (x/y/w/h = 0, 0, 1, 1) ; sa taille physique en cm reste la
//             référence pour l'impression.

export type PanelDimensions = { width: number; height: number };
export type PrintTechnique = 'uv' | 'decal';
export type Side = 'front' | 'back';

/**
 * Zone d'impression.
 *
 * `cmWidth/cmHeight` est LA référence physique : elle sert au calcul de la densité
 * réelle (dpi) et au fichier d'impression. Pour la technique 'uv', la conversion
 * texture → centimètres doit être isotrope (cmWidth/cmHeight = (w × panel.width) /
 * (h × panel.height)), sinon un visuel carré s'imprime en rectangle : `validateProduct()`
 * le vérifie.
 */
export type PrintArea = {
  side: Side;
  technique: PrintTechnique;
  /** 'uv' : fractions de la texture du panneau. 'decal' : 0, 0, 1, 1. */
  x: number;
  y: number;
  w: number;
  h: number;
  cmWidth: number;
  cmHeight: number;
  /** 'decal' : cadre de projection, en unités du modèle. */
  projection?: {
    center: [number, number, number];
    rotationY: number;
    depth: number;
  };
};

export type ColorOption = { name: string; hex: string };

/** Rendu de la surface du vêtement fournisseur — voir `Product.surface`. */
export type SurfaceMode = 'vendor' | 'flat-albedo' | 'blank';

export type Product = {
  id: string;
  name: string;
  /** Chemin racine du modèle GLB ; préfixer avec resolveModelUrl() pour le déploiement. */
  modelUrl: string;
  technique: PrintTechnique;
  /** Taille physique du panneau imprimable — requis pour la technique 'uv'. */
  panel?: PanelDimensions;
  /** Conversion unités du modèle → centimètres — requis pour la technique 'decal'. */
  unitToCm?: number;
  /**
   * Rendu de la surface du vêtement.
   *
   * - `vendor` (défaut) : textures PBR du fournisseur, albédo neutralisé.
   * - `flat-albedo` : albédo du fournisseur ignoré — couleur exacte (utile si l'auteur a
   *   laissé sa teinte dans la texture), textures de relief conservées.
   * - `blank` : aucun apport du fournisseur (ni albédo, ni normales, ni rugosité, ni
   *   occlusion). À utiliser quand un imprimé d'auteur est aussi GRAVÉ dans les textures
   *   de relief : sinon retirer l'albédo ne suffit pas, le motif reste visible.
   */
  surface?: SurfaceMode;
  colors: ColorOption[];
  /**
   * Prix unitaire TTC en FCFA, hors livraison. Laisser vide tant qu'il n'est pas arbitré :
   * le tunnel de commande refuse alors de valider plutôt que d'afficher un montant inventé.
   */
  priceFcfa?: number;
  printAreas: { front?: PrintArea; back?: PrintArea };
};

export const MODEL_DIR = '/models';
export const DEFAULT_PRODUCT_ID = 'tshirt-basic';

// Modèle fournisseur : 1 unité = 1 pouce (torse de 23,7 unités ≈ 60 cm, hauteur 28,1
// unités ≈ 71 cm — dimensions réelles d'un T-shirt homme régulier).
const INCH = 2.54;

// Placement déduit du maillage (scripts/inspect-glb.mjs) :
//   haut du vêtement Y ≈ 64,9 — surface avant Z ≈ 3,3 → 4,8 — surface arrière Z ≈ −5,2 → −5,6
export const TSHIRT_FRONT: PrintArea = {
  side: 'front',
  technique: 'decal',
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  cmWidth: 21, // A4 portrait, haut du visuel 7 cm sous le col
  cmHeight: 30,
  projection: { center: [0, 56.2, 5.0], rotationY: 0, depth: 3.4 },
};

export const TSHIRT_BACK: PrintArea = {
  side: 'back',
  technique: 'decal',
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  cmWidth: 25,
  cmHeight: 32.4,
  projection: { center: [0, 55.3, -5.5], rotationY: Math.PI, depth: 3.4 },
};

export const CATALOG: Product[] = [
  {
    id: DEFAULT_PRODUCT_ID,
    name: 'T-Shirt raglan',
    modelUrl: `${MODEL_DIR}/tshirt/tshirt.glb`,
    technique: 'decal',
    unitToCm: INCH,
    // Le modèle fournisseur porte un imprimé « RUN » gravé à la fois dans son albédo ET
    // dans sa texture de normales : on n'utilise donc aucune de ses textures, pour un
    // T-shirt vierge à la couleur exacte. La forme et les plis viennent de la géométrie
    // et de l'éclairage.
    surface: 'blank',
    // Prix de TEST (à confirmer en production) : il sera rendu configurable depuis un
    // tableau de bord ; d'ici là la valeur vit ici et la commande la reprend telle quelle.
    priceFcfa: 5000,
    colors: [
      { name: 'Blanc', hex: '#FFFFFF' },
      { name: 'Noir', hex: '#1A1A1A' },
      { name: 'Rouge', hex: '#C62828' },
      { name: 'Bleu', hex: '#1565C0' },
    ],
    printAreas: { front: TSHIRT_FRONT, back: TSHIRT_BACK },
  },
  {
    // Second modèle (Sketchfab) : col rond, maillage séparé avant/arrière, en mètres,
    // sans textures (deux couleurs plates) — donc teinté exactement par la couleur choisie.
    id: 'tshirt-alt',
    name: 'T-Shirt col rond',
    modelUrl: `${MODEL_DIR}/tshirt-alt/tshirt.glb`,
    technique: 'decal',
    unitToCm: 100, // 1 unité = 1 mètre (65,3 × 70,2 cm mesurés sur le maillage)
    priceFcfa: 5000, // même prix de test que le raglan (configurable via le futur tableau de bord)
    colors: [
      { name: 'Blanc', hex: '#FFFFFF' },
      { name: 'Noir', hex: '#1A1A1A' },
      { name: 'Rouge', hex: '#C62828' },
      { name: 'Bleu', hex: '#1565C0' },
    ],
    printAreas: {
      front: {
        side: 'front',
        technique: 'decal',
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        cmWidth: 21, // A4 portrait, haut du visuel 7 cm sous le col
        cmHeight: 30,
        // surface avant mesurée à Z ≈ 0,044 → 0,118 (script decal-frame.mjs)
        projection: { center: [0, 1.418, 0.1], rotationY: 0, depth: 0.14 },
      },
      back: {
        side: 'back',
        technique: 'decal',
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        cmWidth: 25,
        cmHeight: 32.4,
        // surface arrière mesurée à Z ≈ −0,119 → −0,149
        projection: { center: [0, 1.396, -0.14], rotationY: Math.PI, depth: 0.14 },
      },
    },
  },
];

/**
 * Produit de démonstration : placeholder de 36 triangles généré par nous
 * (`node scripts/gen-tshirt-glb.mjs`). Il exerce la technique 'uv' et permet de faire
 * tourner le configurateur si le modèle fournisseur est absent. Hors catalogue commercial.
 */
export const PLACEHOLDER_PRODUCT: Product = {
  id: 'tshirt-demo',
  name: 'T-Shirt de démonstration (placeholder)',
  modelUrl: `${MODEL_DIR}/tshirt/tshirt-placeholder.glb`,
  technique: 'uv',
  panel: { width: 50, height: 60 },
  colors: [
    { name: 'Blanc', hex: '#FFFFFF' },
    { name: 'Noir', hex: '#1A1A1A' },
    { name: 'Rouge', hex: '#C62828' },
    { name: 'Bleu', hex: '#1565C0' },
  ],
  printAreas: {
    front: { side: 'front', technique: 'uv', x: 0.29, y: 0.3, w: 0.42, h: 0.5, cmWidth: 21, cmHeight: 30 },
    back: { side: 'back', technique: 'uv', x: 0.25, y: 0.23, w: 0.5, h: 0.54, cmWidth: 25, cmHeight: 32.4 },
  },
};

export function getProductById(id: string): Product | undefined {
  return [PLACEHOLDER_PRODUCT, ...CATALOG].find((p) => p.id === id);
}

export function getPrintArea(product: Product | undefined, side: Side): PrintArea | null {
  if (!product) return null;
  return product.printAreas[side] ?? null;
}

/**
 * Préfixe le chemin du modèle avec le basePath du déploiement (GitHub Pages sert
 * l'app sous /elembo). Sans cela le GLB résout en 404 et la scène reste vide.
 */
export function resolveModelUrl(product: Product, basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''): string {
  return `${basePath}${product.modelUrl}`;
}

/**
 * Taille du cadre de projection, en unités de modèle — indispensable pour poser le
 * décalque : la zone est exprimée en centimètres, le modèle dans ses propres unités.
 */
export function decalFrame(
  area: PrintArea,
  unitToCm: number | undefined,
): { width: number; height: number; depth: number; center: [number, number, number]; rotationY: number } | null {
  if (area.technique !== 'decal' || !area.projection || !(unitToCm ?? 0)) return null;
  const u = unitToCm as number;
  return {
    width: area.cmWidth / u,
    height: area.cmHeight / u,
    depth: area.projection.depth,
    center: area.projection.center,
    rotationY: area.projection.rotationY,
  };
}

/** Validation d'un produit — utilisée par les tests et avant tout ajout au catalogue. */
export function validateProduct(product: Product): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const hex = /^#[0-9a-fA-F]{6}$/;

  if (!product.id?.trim()) errors.push('id manquant');
  if (!product.name?.trim()) errors.push('name manquant');
  if (!product.modelUrl?.startsWith(`${MODEL_DIR}/`)) {
    errors.push(`modelUrl doit commencer par ${MODEL_DIR}/ (reçu : ${product.modelUrl})`);
  }
  if (!product.modelUrl?.endsWith('.glb')) errors.push('modelUrl doit pointer un fichier .glb');
  if (product.technique !== 'uv' && product.technique !== 'decal') {
    errors.push(`technique inconnue : ${String(product.technique)}`);
  }
  if (!product.colors?.length) errors.push('au moins une couleur est requise');
  for (const c of product.colors ?? []) {
    if (!hex.test(c.hex)) errors.push(`couleur ${c.name} : hex invalide (${c.hex})`);
    if (!c.name?.trim()) errors.push('couleur sans nom');
  }

  if (product.technique === 'uv' && (!((product.panel?.width ?? 0) > 0) || !((product.panel?.height ?? 0) > 0))) {
    errors.push('technique uv : panel doit avoir des dimensions > 0');
  }
  if (product.technique === 'decal' && !((product.unitToCm ?? 0) > 0)) {
    errors.push('technique decal : unitToCm doit être > 0');
  }

  const areas = Object.entries(product.printAreas ?? {});
  if (!areas.length) errors.push('au moins une zone d’impression est requise');
  for (const [key, area] of areas) {
    if (!area) continue;
    if (area.side !== key) errors.push(`zone ${key} : side incohérent (${area.side})`);
    if (area.technique !== product.technique) {
      errors.push(`zone ${key} : technique ${area.technique} ≠ produit ${product.technique}`);
    }
    if (area.x < 0 || area.y < 0 || area.w <= 0 || area.h <= 0) {
      errors.push(`zone ${key} : dimensions invalides`);
    }
    if (!(area.cmWidth > 0) || !(area.cmHeight > 0)) errors.push(`zone ${key} : taille cm manquante`);

    if (area.technique === 'uv') {
      if (area.x + area.w > 1.0001 || area.y + area.h > 1.0001) {
        errors.push(`zone ${key} : sort de la texture (x+w ou y+h > 1)`);
      }
      const aspectTexture = (area.w * (product.panel?.width ?? 0)) / (area.h * (product.panel?.height ?? 0));
      const aspectCm = area.cmWidth / area.cmHeight;
      if (Math.abs(aspectCm - aspectTexture) > 0.02) {
        errors.push(
          `zone ${key} : conversion non isotrope (ratio cm ${aspectCm.toFixed(3)} ≠ ratio texture ${aspectTexture.toFixed(3)})`,
        );
      }
    } else {
      if (area.x !== 0 || area.y !== 0 || area.w !== 1 || area.h !== 1) {
        errors.push(`zone ${key} : technique decal — la zone doit couvrir toute la texture (0, 0, 1, 1)`);
      }
      const p = area.projection;
      if (!p || p.center?.length !== 3 || !Number.isFinite(p.rotationY) || !(p.depth > 0)) {
        errors.push(`zone ${key} : projection incomplète (center, rotationY, depth)`);
      } else if (decalFrame(area, product.unitToCm) === null) {
        errors.push(`zone ${key} : unitToCm manquant pour convertir la zone en unités de modèle`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
