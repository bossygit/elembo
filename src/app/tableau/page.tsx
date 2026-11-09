import type { Metadata } from 'next';

import Studio from '../../components/Studio';
import { Etiquette } from '../../components/site/ui';

export const metadata: Metadata = {
  title: 'Tableau canvas',
  description:
    'Personnalisez un tableau canvas : cinq formats, toile seule ou montée sur châssis, contrôle de la résolution de votre photo. Impression à Brazzaville.',
};

export default function TableauPage() {
  return (
    <>
      <section className="border-b border-filet">
        <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-16">
          <Etiquette>Murs & décoration</Etiquette>
          <h1 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">Votre photo, en grand.</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-attenue">
            Choisissez le format, le montage et le bord. L’aperçu indique la résolution réelle de
            votre photo : une image trop petite est signalée avant impression.
          </p>
          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-attenue">
            Le barème des tableaux est encore provisoire. Le configurateur affiche le prix calculé,
            mais le paiement en ligne est désactivé tant que le tarif commercial n’est pas validé :
            demandez un devis pour un prix ferme.
          </p>
        </div>
      </section>

      <Studio initialProductId="tableau" />
    </>
  );
}
