import type { Metadata } from 'next';
import Link from 'next/link';
import Studio from '../../../components/Studio';

export const metadata: Metadata = {
  title: 'Elembo — Studio 2D (photo de mockup)',
  description:
    'Composez votre visuel sur une photo de produit : t-shirt, casquette ou tableau, avec zone d’impression, rotation et contrôle de la qualité. Par Smart Vision Congo.',
};

export default function StudioPage() {
  return (
    <main className="flex-1">
      <section className="border-b border-neutral-200 bg-[#FEFCF6]">
        <div className="mx-auto w-full max-w-5xl px-4 py-16">
          <Link href="/personnalisation" className="text-sm font-medium text-neutral-500 hover:text-[#E85F00]">
            ← Retour à la personnalisation
          </Link>
          <p className="mb-3 mt-4 text-sm font-semibold uppercase tracking-widest text-[#E85F00]">
            Elembo — par Smart Vision Congo
          </p>
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
            Uploadez votre design, voyez-le imprimé.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-neutral-600">
            La plateforme Print-on-Demand locale : t-shirts, casquettes (bientôt) et tableaux
            personnalisés, livrés à Brazzaville et Pointe-Noire sous 1 à 3 jours.
          </p>
          <p className="mt-6 inline-flex flex-wrap items-center gap-2 rounded-xl bg-neutral-100 px-4 py-2 text-sm text-neutral-600">
            Studio 2D — rendu sur photo de produit. Pour la vue 3D interactive, ouvrez le{' '}
            <Link href="/personnalisation" className="font-semibold text-[#E85F00] underline">
              configurateur 3D
            </Link>
            .
          </p>
        </div>
      </section>

      <Studio />

      <section className="border-t border-neutral-200 bg-neutral-50">
        <div className="mx-auto w-full max-w-5xl px-4 py-10">
          <p className="text-sm text-neutral-500">
            Le visuel reste dans votre navigateur pendant la composition. Il n&apos;est envoyé à
            l’atelier qu’après un paiement confirmé, vers une archive privée. Les photos de
            mockups sont des visuels de travail à remplacer par les photos réelles (presse VEVOR).
          </p>
        </div>
      </section>
    </main>
  );
}
