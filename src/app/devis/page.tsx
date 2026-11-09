import type { Metadata } from 'next';
import Link from 'next/link';

import DevisForm from '@/components/devis/DevisForm';
import { Etiquette } from '@/components/site/ui';

export const metadata: Metadata = {
  title: 'Demander un devis',
  description:
    'Décrivez votre projet textile, impression ou communication visuelle. Smart Vision Congo vous répond avec un prix et un délai.',
};

export default function PageDevis() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <Etiquette>Devis gratuit</Etiquette>
          <h1 className="titre-editorial mt-5 text-5xl text-encre">Un projet précis, un prix juste.</h1>
          <p className="mt-5 text-lg leading-relaxed text-attenue">
            Envoyez vos éléments — logo, visuel, quantités, format. Nous étudions la faisabilité et
            revenons vers vous avec une proposition validée par Smart Vision.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-attenue">
            <li className="border-l-2 border-orange pl-4">Réponse humaine, à Brazzaville.</li>
            <li className="border-l-2 border-orange pl-4">Aucun paiement à la demande de devis.</li>
            <li className="border-l-2 border-orange pl-4">Vos fichiers restent privés et protégés.</li>
          </ul>
          <p className="mt-8 text-sm text-attenue">
            Vous avez déjà une référence ?{' '}
            <Link href="/devis/suivi" className="underline">
              Retrouver mon devis
            </Link>
          </p>
        </div>

        <div className="rounded-3xl border border-filet bg-white p-6 sm:p-8">
          <h2 className="font-display text-2xl text-encre">Décrire ma demande</h2>
          <p className="mt-1 text-sm text-attenue">Les champs marqués * sont obligatoires.</p>
          <DevisForm />
        </div>
      </div>
    </div>
  );
}
