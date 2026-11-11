'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ArrowUpRight } from '@/components/site/Icons';
import { Surtitre } from '@/components/site/ui';
import { asset } from '@/lib/site/asset';

/**
 * « Pour les moments qui comptent » : une liste typographique.
 * Sur écran large avec souris, une vignette suit le pointeur (GSAP `quickTo`, chargé à la
 * demande et nettoyé au démontage). Au tactile, chaque ligne porte sa vignette.
 */
const MOMENTS = [
  {
    titre: 'Anniversaires',
    texte: 'Le cadeau qu’on garde.',
    href: '/univers/cadeaux',
    couleur: 'bg-orange',
    image: { src: '/photos/joie-fond-orange.jpg', alt: 'Jeune femme riant sur fond orange' },
  },
  {
    titre: 'Mariages',
    texte: 'T-shirts assortis, souvenirs pour les invités.',
    href: '/univers/evenements',
    couleur: 'bg-lilas',
    image: { src: '/mockups/textile-lot.jpg', alt: 'T-shirts assortis pliés' },
  },
  {
    titre: 'Fêtes familiales',
    texte: 'Dot, baptême, retrouvailles.',
    href: '/univers/evenements',
    couleur: 'bg-foret',
    image: { src: '/mockups/cadre-salon.jpg', alt: 'Cadre photo dans un salon' },
  },
  {
    titre: 'Diplômes',
    texte: 'La promotion, l’année, la fierté.',
    href: '/univers/quotidien',
    couleur: 'bg-soleil',
    image: { src: '/photos/diplomee-fond-jaune.jpg', alt: 'Jeune diplômée souriante sur fond jaune' },
  },
  {
    titre: 'Cadeaux surprises',
    texte: 'Juste pour faire plaisir.',
    href: '/univers/cadeaux',
    couleur: 'bg-fuchsia',
    image: { src: '/photos/mug-fond-rose.jpg', alt: 'Une main tend un mug blanc' },
  },
];

export default function Moments() {
  const zone = useRef<HTMLDivElement>(null);
  const vignette = useRef<HTMLDivElement>(null);
  const [actif, setActif] = useState<number | null>(null);

  useEffect(() => {
    const el = zone.current;
    const cible = vignette.current;
    if (!el || !cible) return;
    // Pointeur précis uniquement, et pas si l'utilisateur limite les animations.
    if (!window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let annule = false;
    let nettoyer: (() => void) | undefined;

    (async () => {
      const { gsap } = await import('gsap');
      if (annule) return;
      const contexte = gsap.context(() => {
        gsap.set(cible, { xPercent: -50, yPercent: -50 });
      });
      const versX = gsap.quickTo(cible, 'x', { duration: 0.5, ease: 'power3.out' });
      const versY = gsap.quickTo(cible, 'y', { duration: 0.5, ease: 'power3.out' });
      const suivre = (e: PointerEvent) => {
        const cadre = el.getBoundingClientRect();
        versX(e.clientX - cadre.left);
        versY(e.clientY - cadre.top);
      };
      el.addEventListener('pointermove', suivre);
      nettoyer = () => {
        el.removeEventListener('pointermove', suivre);
        gsap.killTweensOf(cible);
        contexte.revert();
      };
      if (annule) nettoyer();
    })();

    return () => {
      annule = true;
      nettoyer?.();
    };
  }, []);

  return (
    <section className="bg-sable py-20 sm:py-28">
      <div className="mx-auto w-full max-w-[90rem] px-4 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Surtitre numero="05">Célébrer</Surtitre>
            <h2 data-anim="titre" className="titre-editorial mt-5 text-5xl text-encre sm:text-7xl">
              Pour les moments <span className="accent-serif text-orange">qui comptent.</span>
            </h2>
          </div>
          <p data-anim="monte" className="max-w-sm text-base leading-relaxed text-attenue">
            Chaque étape de la vie mérite son objet. Choisis l’occasion, on t’accompagne — en
            ligne ou sur WhatsApp.
          </p>
        </div>

        <div ref={zone} className="relative mt-12" onPointerLeave={() => setActif(null)}>
          <ul className="border-t border-encre/20">
            {MOMENTS.map((moment, index) => (
              <li key={moment.titre} data-anim="monte" className="border-b border-encre/20">
                <Link
                  href={moment.href}
                  onPointerEnter={() => setActif(index)}
                  onFocus={() => setActif(index)}
                  onBlur={() => setActif(null)}
                  className="group flex items-center gap-4 py-5 transition-[padding] duration-500 ease-sortie sm:gap-8 sm:py-7 lg:hover:pl-6"
                >
                  <span className="hidden font-mono text-sm text-encre/50 sm:block">0{index + 1}</span>
                  {/* Vignette en ligne : tactile et petits écrans. */}
                  <span className={`relative block h-16 w-16 shrink-0 overflow-hidden lg:hidden ${moment.couleur}`}>
                    <Image
                      src={asset(moment.image.src)}
                      alt=""
                      width={160}
                      height={160}
                      sizes="64px"
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="titre-geant block text-[clamp(1.7rem,6.2vw,5rem)] text-encre transition-colors duration-300 group-hover:text-orange">
                      {moment.titre}
                    </span>
                    <span className="mt-1 block text-sm text-attenue lg:hidden">{moment.texte}</span>
                  </span>
                  <span className="hidden max-w-[16rem] text-right text-sm text-attenue lg:block">{moment.texte}</span>
                  <ArrowUpRight className="h-6 w-6 shrink-0 text-encre transition-transform duration-300 ease-sortie group-hover:rotate-45 sm:h-8 sm:w-8" />
                </Link>
              </li>
            ))}
          </ul>

          {/* Vignette flottante : suit le pointeur sur bureau. Purement décorative. */}
          <div
            ref={vignette}
            aria-hidden
            className={`pointer-events-none absolute left-0 top-0 z-10 hidden h-64 w-52 -rotate-3 overflow-hidden border-[5px] border-creme shadow-[0_30px_60px_-30px_rgba(17,13,21,0.6)] transition-[opacity,scale] duration-300 ease-sortie lg:block ${
              actif === null ? 'scale-75 opacity-0' : 'scale-100 opacity-100'
            }`}
          >
            {MOMENTS.map((moment, index) => (
              <Image
                key={moment.titre}
                src={asset(moment.image.src)}
                alt=""
                width={420}
                height={520}
                sizes="210px"
                loading="lazy"
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                  index === actif ? 'opacity-100' : 'opacity-0'
                } ${moment.couleur}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
