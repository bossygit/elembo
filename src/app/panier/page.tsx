import type { Metadata } from 'next';

import Panier from '../../components/cart/Panier';

export const metadata: Metadata = {
  title: 'Panier et créations',
  description:
    'Retrouvez vos T-shirts personnalisés Elembo : couleur, zones imprimées, procédé de production. Reprenez une création dans le studio 3D avant de commander.',
};

export default function PanierPage() {
  return (
    <main className="bg-creme">
      <Panier />
    </main>
  );
}
