// Catalogue produits Elembo — ré-exports.
//
// `studio.ts`  : les 3 produits du studio 2D (zones d'impression en pixels canvas),
//                conservés tels quels pour ne rien casser de l'existant.
// `catalog.ts` : le catalogue du configurateur 3D (modèle GLB, couleurs, zones
//                d'impression en espace UV/physique).
//
// Les deux surfaces sont exportées ici pour que les imports historiques
// (`from '@/lib/products'`) continuent de fonctionner sans modification.

export type { Zone, ProductDef } from './studio';
export { PRODUCTS, getProduct } from './studio';

export type { PrintArea, ColorOption, Product, PanelDimensions } from './catalog';
export {
  CATALOG,
  MODEL_DIR,
  DEFAULT_PRODUCT_ID,
  getProductById,
  getPrintArea,
  resolveModelUrl,
  validateProduct,
} from './catalog';
