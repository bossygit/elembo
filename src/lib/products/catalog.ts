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

//  'zones'  — modèle Elembo à surfaces d'impression dédiées (une par zone : avant, dos,
//             manches, intérieur du col), chacune avec ses UV propres et isotropes. Le
//             visuel est composé dans une texture TRANSPARENTE par zone ; la couleur du
//             tissu est portée par ses matériaux (FABRIC, FABRIC_RIB). La zone réellement
//             imprimable dépend du procédé choisi (src/lib/products/production.ts).

import { prixProduit } from '../tarifs/grille';
import type { Side } from '../../types/configurator';
import { SIDES } from '../../types/configurator';
import { profilParId, profilsDuProduit } from './production';
import type { ProfilProduction, SupportProduction } from './production';

export type { Side };
export type PanelDimensions = { width: number; height: number };
export type PrintTechnique = 'uv' | 'decal' | 'zones';

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
  /**
   * 'zones' : taille physique de la TEXTURE de la zone (toute la pièce de tissu), dont la
   * zone imprimable est un rectangle (x, y, w, h en fractions de cette texture).
   */
  textureCm?: { w: number; h: number };
  /** 'decal' : cadre de projection, en unités du modèle. */
  projection?: {
    center: [number, number, number];
    rotationY: number;
    depth: number;
  };
};

export type ColorOption = { name: string; hex: string };

/**
 * Surface d'impression d'un modèle 'zones', telle que mesurée dans le GLB
 * (`node scripts/glb-zones.mjs`). Les noms et les repères sont vérifiés contre le fichier
 * par `tests/elemboModel.test.ts`.
 */
export type ZoneModel = {
  /** Nom exact du maillage dans le GLB. */
  mesh: string;
  /** Taille physique de la texture de la zone (UV 0..1, isotropes). */
  textureCm: { w: number; h: number };
  /** Repères mesurés, en cm depuis le haut de la texture (axe médian). */
  reperesCm: { col?: number; epaule?: number };
  /**
   * Vue de caméra qui présente la zone : angles en degrés (azimut 0 = face, 90 = côté
   * gauche du porteur), distance relative au cadrage, hauteur de visée relative.
   */
  vue: { azimut: number; polaire: number; distance: number; cibleY?: number };
};

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
  /** 'zones' : surfaces d'impression du modèle. */
  zones?: Partial<Record<Side, ZoneModel>>;
  /** 'zones' : matériaux qui portent la couleur du produit (tissu, céramique…). */
  fabricMaterials?: string[];
  /** Famille de support : choisit les procédés de production applicables ('textile' par défaut). */
  support?: SupportProduction;
  /** Le produit se commande-t-il par tailles (S…3XL) ? `false` = quantité seule (mug). */
  tailles?: boolean;
  /** Encre brillante (mug émaillé) : la finition du GLB est conservée, pas matifiée. */
  impressionBrillante?: boolean;
  /**
   * `false` : produit composable dans l'atelier mais pas encore vendu en ligne (pas de prix
   * dans tarifs/grille.json) — commande sur devis ou WhatsApp, jamais par MoMo.
   */
  venteEnLigne?: boolean;
  colors: ColorOption[];
  /**
   * Prix unitaire TTC en FCFA, hors livraison. Laisser vide tant qu'il n'est pas arbitré :
   * le tunnel de commande refuse alors de valider plutôt que d'afficher un montant inventé.
   */
  priceFcfa?: number | null;
  /** Zones fixes ('uv', 'decal'). Pour 'zones', elles sont calculées selon le procédé. */
  printAreas: Partial<Record<Side, PrintArea>>;
};

export const MODEL_DIR = '/models';
export const DEFAULT_PRODUCT_ID = 'tshirt-basic';

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

// Modèle Elembo (assets/3d/elembo-tshirt) : repères mesurés par scripts/glb-zones.mjs.
//   avant : creux du col à 11,85 cm du haut de la texture — dos : 3,38 cm — manches :
//   tête de manche à 1,08 cm. Textures : 63,2 × 79 / 62,4 × 78 / 60 × 30 / 12 × 6,7 cm.
export const ELEMBO_TSHIRT_ZONES: Partial<Record<Side, ZoneModel>> = {
  front: {
    mesh: 'TSHIRT_FRONT_PRINT',
    textureCm: { w: 63.2, h: 79 },
    reperesCm: { col: 11.85 },
    vue: { azimut: 0, polaire: 86, distance: 1 },
  },
  back: {
    mesh: 'TSHIRT_BACK_PRINT',
    textureCm: { w: 62.4, h: 78 },
    reperesCm: { col: 3.38 },
    vue: { azimut: 180, polaire: 86, distance: 1 },
  },
  'left-sleeve': {
    mesh: 'TSHIRT_LEFT_SLEEVE_PRINT',
    textureCm: { w: 60, h: 30 },
    reperesCm: { epaule: 1.08 },
    vue: { azimut: 80, polaire: 72, distance: 0.62, cibleY: 0.22 },
  },
  'right-sleeve': {
    mesh: 'TSHIRT_RIGHT_SLEEVE_PRINT',
    textureCm: { w: 60, h: 30 },
    reperesCm: { epaule: 1.08 },
    vue: { azimut: -80, polaire: 72, distance: 0.62, cibleY: 0.22 },
  },
  collar: {
    mesh: 'TSHIRT_COLLAR_PRINT',
    textureCm: { w: 12, h: 6.7 },
    reperesCm: {},
    vue: { azimut: 0, polaire: 40, distance: 0.5, cibleY: 0.42 },
  },
};

// Mug Elembo 330 ml (assets/3d/elembo-mug) : une seule surface d'impression qui fait tout le
// tour (MUG_PRINT_SURFACE, UV 0..1 = 257,6 × 80 mm, couture sous l'anse à U = 0/1, face
// visible à U = 0,5). Noms vérifiés par tests/elemboMug.test.ts.
export const ELEMBO_MUG_ZONES: Partial<Record<Side, ZoneModel>> = {
  wrap: {
    mesh: 'MUG_PRINT_SURFACE',
    textureCm: { w: 25.76, h: 8 },
    reperesCm: {},
    // Recul ×1,5 : vu légèrement de dessus, le bord en ellipse et l'anse dépassent le cadrage
    // calculé sur la hauteur seule (mesuré dans le navigateur).
    vue: { azimut: 0, polaire: 80, distance: 1.5 },
  },
};

export const MUG_PRODUCT_ID = 'mug-personnalise';

export const CATALOG: Product[] = [
  {
    // L'identifiant historique est CONSERVÉ : c'est lui que le service de paiement et la
    // grille tarifaire connaissent (tarifs/grille.json). Changer d'identifiant casserait
    // le paiement tant que le service n'aurait pas été redéployé.
    id: DEFAULT_PRODUCT_ID,
    name: 'T-shirt Elembo oversize',
    modelUrl: `${MODEL_DIR}/elembo-tshirt/elembo-tshirt.glb`,
    technique: 'zones',
    zones: ELEMBO_TSHIRT_ZONES,
    fabricMaterials: ['FABRIC', 'FABRIC_RIB'],
    // PRIX : source unique tarifs/grille.json (prix de test validé par l'exploitant).
    priceFcfa: prixProduit('tshirt-basic'),
    // Couleurs du modèle (mêmes valeurs que les extras du GLB).
    colors: [
      { name: 'Blanc', hex: '#F4F3EF' },
      { name: 'Noir', hex: '#1A1A1C' },
      { name: 'Gris', hex: '#9C9EA1' },
      { name: 'Bleu marine', hex: '#1F2A44' },
      { name: 'Rouge', hex: '#B3202A' },
      { name: 'Vert', hex: '#1E5E3B' },
      { name: 'Jaune', hex: '#F2C230' },
      { name: 'Orange Elembo', hex: '#FF5A12' },
    ],
    printAreas: {},
  },
  {
    // Même identifiant que la fiche vitrine (src/lib/commerce/catalogue.ts) : le lien de la
    // boutique ouvre l'atelier sur ce produit. Aucun prix dans tarifs/grille.json → « Prix sur
    // demande » et paiement en ligne fermé, sans montant inventé.
    id: MUG_PRODUCT_ID,
    name: 'Mug Elembo 330 ml',
    modelUrl: `${MODEL_DIR}/elembo-mug/elembo-mug.glb`,
    technique: 'zones',
    support: 'mug',
    tailles: false,
    impressionBrillante: true,
    venteEnLigne: false,
    zones: ELEMBO_MUG_ZONES,
    // Toute la céramique prend la couleur choisie ; l'impression (MAT_MUG_PRINT) jamais.
    fabricMaterials: ['MAT_MUG_CERAMIC', 'MAT_MUG_INTERIOR', 'MAT_MUG_HANDLE', 'MAT_MUG_BOTTOM'],
    priceFcfa: prixProduit(MUG_PRODUCT_ID),
    // Couleurs du modèle (assets/3d/elembo-mug/zones.json).
    colors: [
      { name: 'Blanc', hex: '#F4F1EA' },
      { name: 'Noir', hex: '#171719' },
      { name: 'Crème', hex: '#EADFC8' },
      { name: 'Rouge', hex: '#B3262D' },
      { name: 'Bleu', hex: '#1E3A63' },
      { name: 'Vert', hex: '#225C43' },
      { name: 'Jaune', hex: '#F0C33C' },
      { name: 'Orange Elembo', hex: '#FF5A12' },
    ],
    printAreas: {},
  },
  {
    // Second modèle (Sketchfab) : col rond, maillage séparé avant/arrière, en mètres,
    // sans textures (deux couleurs plates) — donc teinté exactement par la couleur choisie.
    id: 'tshirt-alt',
    name: 'T-Shirt col rond',
    modelUrl: `${MODEL_DIR}/tshirt-alt/tshirt.glb`,
    technique: 'decal',
    unitToCm: 100, // 1 unité = 1 mètre (65,3 × 70,2 cm mesurés sur le maillage)
    priceFcfa: prixProduit('tshirt-alt'), // même prix de test que le raglan (voir tarifs/grille.json)
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

/**
 * Zone d'impression d'un produit pour une zone du vêtement.
 *
 * Produits 'uv' / 'decal' : zone fixe du catalogue. Produit 'zones' : zone calculée à
 * partir du procédé de production (dimensions et position réelles), dans la texture de
 * la surface d'impression.
 */
export function getPrintArea(product: Product | undefined, side: Side, profileId?: string | null): PrintArea | null {
  if (!product) return null;
  if (product.technique === 'zones') return zoneArea(product, side, profilParId(profileId, product));
  return product.printAreas[side] ?? null;
}

/** Zones exposées par un produit (dans l'ordre d'affichage). */
export function productSides(product: Product | undefined): Side[] {
  if (!product) return [];
  if (product.technique === 'zones') return SIDES.filter((s) => Boolean(product.zones?.[s]));
  return SIDES.filter((s) => Boolean(product.printAreas[s]));
}

const arrondi = (v: number) => Math.round(v * 100) / 100;

/** Zone imprimable d'un procédé, placée dans la texture de la surface d'impression. */
export function zoneArea(product: Product, side: Side, profil: ProfilProduction): PrintArea | null {
  const model = product.zones?.[side];
  const conf = profil.zones[side];
  if (!model || !conf) return null;
  const T = model.textureCm;
  let w: number;
  let h: number;
  let left: number;
  let top: number;
  if (conf.pleine) {
    w = T.w;
    h = T.h;
    left = 0;
    top = 0;
  } else {
    w = Math.min(conf.largeurCm ?? T.w, T.w);
    h = Math.min(conf.hauteurCm ?? T.h, T.h);
    const repere = conf.repere === 'haut' || !conf.repere ? 0 : (model.reperesCm[conf.repere] ?? 0);
    top = Math.min(Math.max(0, repere + (conf.hautCm ?? 0)), T.h - h);
    left = Math.min(Math.max(0, (T.w - w) / 2 + (conf.decalageXCm ?? 0)), T.w - w);
  }
  return {
    side,
    technique: 'zones',
    x: left / T.w,
    y: top / T.h,
    w: w / T.w,
    h: h / T.h,
    cmWidth: arrondi(w),
    cmHeight: arrondi(h),
    textureCm: T,
  };
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
  if (product.technique !== 'uv' && product.technique !== 'decal' && product.technique !== 'zones') {
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

  if (product.technique === 'zones') {
    const zones = Object.entries(product.zones ?? {});
    if (!zones.length) errors.push('technique zones : au moins une surface d’impression est requise');
    for (const [key, z] of zones) {
      if (!z) continue;
      if (!z.mesh?.trim()) errors.push(`zone ${key} : nom de maillage manquant`);
      if (!(z.textureCm?.w > 0) || !(z.textureCm?.h > 0)) errors.push(`zone ${key} : textureCm invalide`);
      for (const profil of profilsDuProduit(product)) {
        const area = zoneArea(product, key as Side, profil);
        if (!area) continue;
        if (area.x < -1e-6 || area.y < -1e-6 || area.x + area.w > 1.0001 || area.y + area.h > 1.0001) {
          errors.push(`zone ${key} / ${profil.id} : sort de la surface d’impression`);
        }
      }
    }
    if (!product.fabricMaterials?.length) errors.push('technique zones : matériaux du tissu non déclarés');
    return { ok: errors.length === 0, errors };
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
