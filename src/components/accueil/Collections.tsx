import Link from 'next/link';

import AfficheCollection from '@/components/site/AfficheCollection';
import { ArrowRight } from '@/components/site/Icons';
import { Surtitre } from '@/components/site/ui';
import { COLLECTIONS } from '@/lib/commerce/univers';

/** Les collections Elembo : un rail d'affiches typographiques, sur fond noir. */
export default function Collections() {
  return (
    <section id="collections" className="trame scroll-mt-24 overflow-hidden bg-encre py-20 text-creme sm:py-28">
      <div className="mx-auto w-full max-w-[90rem] px-4 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Surtitre numero="02" sombre>
              Culture congolaise contemporaine
            </Surtitre>
            <h2 data-anim="titre" className="titre-editorial mt-5 text-5xl sm:text-7xl">
              Les collections <span className="accent-serif text-orange">Elembo.</span>
            </h2>
          </div>
          <div data-anim="monte" className="max-w-sm">
            <p className="text-base leading-relaxed text-creme/70">
              Urbaine, musicale, drôle, fière : notre culture telle qu’on la vit aujourd’hui.
              Cinq collections en préparation — dis-nous laquelle tu attends.
            </p>
            <Link
              href="/univers#collections"
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-creme underline decoration-orange decoration-2 underline-offset-4 hover:text-orange"
            >
              Voir le détail des collections
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      <div className="rail mt-12 gap-4 px-4 pb-2 sm:gap-5 sm:px-8 lg:px-[max(2rem,calc((100vw-90rem)/2+2rem))]">
        {COLLECTIONS.map((collection) => (
          <AfficheCollection
            key={collection.id}
            collection={collection}
            className="w-[80vw] sm:w-[23rem] lg:w-[25rem]"
          />
        ))}
        <span aria-hidden className="w-1 shrink-0" />
      </div>
      <p className="mx-auto mt-5 w-full max-w-[90rem] px-4 text-xs text-creme/50 sm:px-8">
        Fais glisser pour parcourir les collections →
      </p>
    </section>
  );
}
