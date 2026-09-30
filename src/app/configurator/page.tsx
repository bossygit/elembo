import type { Metadata } from 'next';
import Configurator from '../../components/configurator/Configurator';

export const metadata: Metadata = {
  title: 'Configurateur 3D — Elembo',
  description:
    'Choisissez un produit, changez sa couleur, déposez votre visuel et voyez-le immédiatement sur le modèle 3D. Par Smart Vision Congo.',
};

export default function ConfiguratorPage() {
  return (
    <main className="min-h-full bg-[#FEFCF6]">
      <Configurator />
    </main>
  );
}
