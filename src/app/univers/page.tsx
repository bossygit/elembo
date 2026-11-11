import type { Metadata } from 'next';

import { CarteCollection, CarteUnivers } from '@/components/site/Univers';
import { Etiquette, Surtitre } from '@/components/site/ui';
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
      <section className="trame-sombre bg-sable">
        <div className="mx-auto w-full max-w-[90rem] px-4 py-14 sm:px-8 sm:py-20">
          <Etiquette>{MARQUE.signature}</Etiquette>
          <h1 className="titre-geant mt-6 max-w-5xl text-[clamp(2.8rem,8.4vw,7.5rem)] text-encre">
            Cinq univers, <span className="accent-serif text-orange">une même envie.</span>
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

      <section className="mx-auto w-full max-w-[90rem] px-4 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {UNIVERS.map((univers, index) => (
            <CarteUnivers
              key={univers.id}
              univers={univers}
              className={
                index < 3
                  ? 'aspect-[4/5] lg:col-span-2'
                  : `aspect-[4/5] lg:col-span-3 lg:aspect-[16/10] ${index === 4 ? 'sm:col-span-2' : ''}`
              }
            />
          ))}
        </div>
      </section>

      <section id="collections" className="scroll-mt-24 border-t border-encre/15">
        <div className="mx-auto w-full max-w-[90rem] px-4 py-16 sm:px-8 sm:py-24">
          <Surtitre>Les collections Elembo · en préparation</Surtitre>
          <h2 data-anim="titre" className="titre-editorial mt-5 max-w-4xl text-5xl text-encre sm:text-7xl">
            Pas seulement des pagnes <span className="accent-serif text-orange">et des masques.</span>
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
          <div className="mt-14 grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {COLLECTIONS.map((collection) => (
              <CarteCollection key={collection.id} collection={collection} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
