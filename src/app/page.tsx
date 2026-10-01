import type { Metadata } from 'next';
import Configurator from '../components/configurator/Configurator';

export const metadata: Metadata = {
  title: 'Elembo — Configurateur 3D Print-on-Demand',
  description:
    'Choisissez un produit, changez sa couleur, déposez votre visuel et voyez-le immédiatement sur le modèle 3D — dans votre navigateur. Par Smart Vision Congo.',
};

export default function Home() {
  return (
    <main className="min-h-full bg-[#FEFCF6]">
      <Configurator />
    </main>
  );
}
