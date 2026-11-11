import Image from 'next/image';
import Link from 'next/link';

import { ArrowUpRight } from '@/components/site/Icons';
import { Surtitre } from '@/components/site/ui';
import { asset } from '@/lib/site/asset';

const CATEGORIES = [
  {
    numero: '01',
    titre: 'Vêtements personnalisés',
    texte: 'Ton t-shirt, ta couleur, tes mots. Aperçu 3D avant de commander.',
    href: '/personnalisation',
    image: { src: '/photos/portrait-tee-pastel.jpg', alt: 'Jeune femme en t-shirt blanc sur fond pastel' },
    grille: 'lg:col-span-5 lg:row-span-2',
    position: 'object-[50%_22%]',
  },
  {
    numero: '02',
    titre: 'Cadeaux',
    texte: 'Mugs, coffrets, attentions avec photo et message.',
    href: '/univers/cadeaux',
    image: { src: '/photos/mug-fond-rose.jpg', alt: 'Une main tend un mug blanc sur fond rose' },
    grille: 'lg:col-span-4',
    position: 'object-center',
  },
  {
    numero: '03',
    titre: 'Accessoires',
    texte: 'Tote bags à ton image.',
    href: '/textile/tote-bag',
    image: { src: '/mockups/tote-bag.jpg', alt: 'Tote bag en toile naturelle' },
    grille: 'lg:col-span-3',
    position: 'object-center',
  },
  {
    numero: '04',
    titre: 'Décoration',
    texte: 'Tes photos en tableau, sur toile.',
    href: '/tableau',
    image: { src: '/mockups/tableau-interieur.jpg', alt: 'Tableau photo accroché dans un intérieur' },
    grille: 'lg:col-span-3',
    position: 'object-[50%_30%]',
  },
  {
    numero: '05',
    titre: 'Événements',
    texte: 'Mariage, dot, baptême : des kits aux couleurs de la famille.',
    href: '/univers/evenements',
    image: { src: '/mockups/textile-lot.jpg', alt: 'T-shirts assortis prêts pour un événement' },
    grille: 'lg:col-span-4',
    position: 'object-center',
  },
];

/** « Exprime ton style » : cinq portes d'entrée, en rail tactile sur mobile, en mosaïque sur bureau. */
export default function Categories() {
  return (
    <section className="mx-auto w-full max-w-[90rem] px-4 py-20 sm:px-8 sm:py-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Surtitre numero="01">Par où commencer</Surtitre>
          <h2 data-anim="titre" className="titre-editorial mt-5 text-5xl text-encre sm:text-7xl">
            Exprime <span className="accent-serif text-orange">ton style.</span>
          </h2>
        </div>
        <p data-anim="monte" className="max-w-sm text-base leading-relaxed text-attenue">
          Pas besoin de connaître l’impression. Dis-nous ce que tu veux créer, on s’occupe du reste.
        </p>
      </div>

      <div className="rail -mx-4 mt-12 gap-3 px-4 sm:-mx-8 sm:gap-4 sm:px-8 lg:mx-0 lg:grid lg:auto-rows-[17rem] lg:grid-cols-12 lg:overflow-visible lg:px-0">
        {CATEGORIES.map((categorie) => (
          <Link
            key={categorie.titre}
            href={categorie.href}
            data-anim="monte"
            className={`group relative block aspect-[4/5] w-[76vw] overflow-hidden bg-encre sm:w-[44vw] lg:aspect-auto lg:w-auto ${categorie.grille}`}
          >
            <Image
              src={asset(categorie.image.src)}
              alt={categorie.image.alt}
              width={1000}
              height={1250}
              sizes="(min-width: 1024px) 42vw, (min-width: 640px) 44vw, 76vw"
              className={`h-full w-full object-cover ${categorie.position} transition-transform duration-[900ms] ease-sortie group-hover:scale-[1.07]`}
            />
            <span className="absolute left-3 top-3 bg-creme px-2 py-1 font-mono text-[11px] font-semibold text-encre">
              {categorie.numero}
            </span>

            {/* Cartouche : toujours lisible, s'ouvre au survol pour révéler la description. */}
            <span className="absolute inset-x-3 bottom-3 block bg-creme p-4 transition-colors duration-300 group-hover:bg-orange">
              <span className="flex items-center justify-between gap-3">
                <span className="font-display text-2xl leading-none text-encre sm:text-[1.7rem]">{categorie.titre}</span>
                <ArrowUpRight className="h-5 w-5 shrink-0 text-encre transition-transform duration-300 ease-sortie group-hover:rotate-45" />
              </span>
              <span className="mt-2 block text-sm leading-snug text-encre/75 lg:grid lg:grid-rows-[0fr] lg:transition-[grid-template-rows,margin] lg:duration-500 lg:ease-sortie lg:mt-0 lg:group-hover:mt-2 lg:group-hover:grid-rows-[1fr] lg:group-focus-visible:mt-2 lg:group-focus-visible:grid-rows-[1fr]">
                <span className="overflow-hidden">{categorie.texte}</span>
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
