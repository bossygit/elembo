// Catalogue du configurateur 3D.
//
// Différence avec studio.ts : ici un produit est décrit par un MODÈLE 3D (GLB) et
// par des zones d'impression exprimées en espace UV du panneau (0..1) avec leur
// taille physique en centimètres. Aucune caractéristique produit n'est codée en dur
// dans les composants : tout passe par ce catalogue, ce qui permet d'ajouter un
// hoodie, un tote bag ou une casquette sans toucher au configurateur.

export type PanelDimensions = { width: number; height: number };

/**
 * Zone d'impression d'un panneau.
 *
 * `x/y/w/h` sont des fractions de la texture du panneau (0..1) — la texture est
 * composée en Canvas 2D puis appliquée au panneau 3D. `cmWidth/cmHeight` donnent la
 * taille physique de la zone, indispensable pour calculer la densité réelle (dpi).
 *
 * ⚠️ INVARIANT : la conversion texture → centimètres doit être isotrope, donc
 * cmWidth / cmHeight DOIT égaler (w × panel.width) / (h × panel.height). Sinon un
 * visuel carré s'imprime en rectangle. `validateProduct()` refuse une zone qui casse
 * cette règle.
 */
export type PrintArea = {
  side: 'front' | 'back';
  x: number;
  y: number;
  w: number;
  h: number;
  cmWidth: number;
  cmHeight: number;
};

export type ColorOption = { name: string; hex: string };

export type Product = {
  id: string;
  name: string;
  /** Chemin racine du modèle GLB ; préfixer avec resolveModelUrl() pour le déploiement. */
  modelUrl: string;
  /** Taille physique réelle du panneau imprimable (le torse : ≈ 50 × 60 cm). */
  panel: PanelDimensions;
  colors: ColorOption[];
  printAreas: { front?: PrintArea; back?: PrintArea };
};

export const MODEL_DIR = '/models';
export const DEFAULT_PRODUCT_ID = 'tshirt-basic';

// Panneau du torse : 1,0 × 1,2 unités de modèle, 1 unité ≈ 50 cm.
const TSHIRT_PANEL: PanelDimensions = { width: 50, height: 60 };

export const CATALOG: Product[] = [
  {
    id: DEFAULT_PRODUCT_ID,
    name: 'T-Shirt classique',
    modelUrl: `${MODEL_DIR}/tshirt/tshirt.glb`,
    panel: TSHIRT_PANEL,
    colors: [
      { name: 'Blanc', hex: '#FFFFFF' },
      { name: 'Noir', hex: '#1A1A1A' },
      { name: 'Rouge', hex: '#C62828' },
      { name: 'Bleu', hex: '#1565C0' },
    ],
    printAreas: {
      // A4 portrait centré sur la poitrine : 21 × 30 cm
      front: { side: 'front', x: 0.29, y: 0.3, w: 0.42, h: 0.5, cmWidth: 21, cmHeight: 30 },
      // A3 portrait au dos : 25 × 32,4 cm
      back: { side: 'back', x: 0.25, y: 0.23, w: 0.5, h: 0.54, cmWidth: 25, cmHeight: 32.4 },
    },
  },
];

export function getProductById(id: string): Product | undefined {
  return CATALOG.find((p) => p.id === id);
}

export function getPrintArea(product: Product | undefined, side: 'front' | 'back'): PrintArea | null {
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
  if (!(product.panel?.width > 0) || !(product.panel?.height > 0)) {
    errors.push('panel doit avoir des dimensions > 0');
  }
  if (!product.colors?.length) errors.push('au moins une couleur est requise');
  for (const c of product.colors ?? []) {
    if (!hex.test(c.hex)) errors.push(`couleur ${c.name} : hex invalide (${c.hex})`);
    if (!c.name?.trim()) errors.push('couleur sans nom');
  }

  const areas = Object.entries(product.printAreas ?? {});
  if (!areas.length) errors.push('au moins une zone d’impression est requise');
  for (const [key, area] of areas) {
    if (!area) continue;
    if (area.side !== key) errors.push(`zone ${key} : side incohérent (${area.side})`);
    if (area.x < 0 || area.y < 0 || area.w <= 0 || area.h <= 0) {
      errors.push(`zone ${key} : dimensions invalides`);
    }
    if (area.x + area.w > 1.0001 || area.y + area.h > 1.0001) {
      errors.push(`zone ${key} : sort de la texture (x+w ou y+h > 1)`);
    }
    if (!(area.cmWidth > 0) || !(area.cmHeight > 0)) errors.push(`zone ${key} : taille cm manquante`);
    const aspectTexture = (area.w * product.panel.width) / (area.h * product.panel.height);
    const aspectCm = area.cmWidth / area.cmHeight;
    if (Math.abs(aspectCm - aspectTexture) > 0.02) {
      errors.push(
        `zone ${key} : conversion non isotrope (ratio cm ${aspectCm.toFixed(3)} ≠ ratio texture ${aspectTexture.toFixed(3)})`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
