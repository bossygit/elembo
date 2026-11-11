import type { Metadata } from 'next';

import { CarteCollection, CarteUnivers } from '@/components/site/Univers';
import { Etiquette } from '@/components/site/ui';
import { BoutonWhatsApp } from '@/components/site/WhatsApp';
import { COLLECTIONS, REGISTRES, UNIVERS } from '@/lib/commerce/univers';
import { MARQUE } from '@/lib/site/marque';

export const metadata: Metadata = {
  title: 'Nos univers',
  description:
    'Cadeaux, identité et culture, événements, vie quotidienne, mémoire du Congo : cinq univers pour créer des objets qui vous ressemblent.',
};

export default function PageUnivers() {
  return (
    <>
      <section className="border-b border-filet bg-[#F3EFE6]">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <Etiquette>{MARQUE.signature}</Etiquette>
          <h1 className="titre-editorial mt-5 max-w-3xl text-5xl text-encre sm:text-6xl">
            Cinq univers, une même envie : créer ce qui vous ressemble.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-attenue">
            Partez de ce que vous voulez vivre — offrir, célébrer, exprimer, vous souvenir. Nous
            nous occupons du support, de l’impression et de la livraison.
          </p>
          <div className="mt-8">
            <BoutonWhatsApp>Être accompagné·e sur WhatsApp</BoutonWhatsApp>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {UNIVERS.map((univers) => (
            <CarteUnivers key={univers.id} univers={univers} />
          ))}
        </div>
      </section>

      <section className="border-y border-filet bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Nos collections congolaises</p>
          <h2 className="titre-editorial mt-4 max-w-3xl text-4xl text-encre sm:text-5xl">
            Pas seulement des pagnes et des masques.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-attenue">
            Le Congo est aussi urbain, jeune, musical, drôle et créatif. Nos collections font
            dialoguer quatre registres.
          </p>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {REGISTRES.map((r) => (
              <div key={r.titre} className="border-l-2 border-orange pl-4">
                <dt className="text-sm font-semibold text-encre">{r.titre}</dt>
                <dd className="mt-1 text-sm text-attenue">{r.description}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {COLLECTIONS.map((collection) => (
              <CarteCollection key={collection.id} collection={collection} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
