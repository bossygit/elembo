'use client';

// ProductModel : aiguillage du modèle 3D selon la technique déclarée au catalogue.
//
//  'zones' — modèle Elembo à cinq surfaces d'impression (avant, dos, manches, col).
//            Chaque zone reçoit sa propre texture transparente ; la couleur est portée
//            par les matériaux du tissu. Voir ZonesProductModel.tsx.
//
//  'uv' / 'decal' — modèles historiques (placeholder, second T-shirt fournisseur).
//            Conservés à l'identique : on n'enlève jamais une fonctionnalité existante.
//            Voir LegacyProductModel.tsx.

import { useConfiguratorStore } from '../../stores/configurator-store';
import { getProductById } from '../../lib/products/catalog';
import type { Box } from '../../lib/three/framing';
import LegacyProductModel from './LegacyProductModel';
import ZonesProductModel from './ZonesProductModel';

export default function ProductModel({ onBounds }: { onBounds?: (box: Box) => void }) {
  const productId = useConfiguratorStore((s) => s.productId);
  const product = getProductById(productId);

  if (product?.technique === 'zones') return <ZonesProductModel onBounds={onBounds} />;
  return <LegacyProductModel onBounds={onBounds} />;
}
