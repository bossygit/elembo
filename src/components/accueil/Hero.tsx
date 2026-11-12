import Image from 'next/image';
import Link from 'next/link';

import { ArrowRight, ArrowUpRight } from '@/components/site/Icons';
import Sticker from '@/components/site/Sticker';
import { baseBouton, stylesBouton } from '@/components/site/ui';
import { asset } from '@/lib/site/asset';
import { MARQUE } from '@/lib/site/marque';

/**
 * Hero de l'accueil : composition éditoriale, titre géant qui chevauche la photo.
 * L'entrée est animée en CSS pur (classes `ligne`, `animate-*`) : aucune attente de
 * JavaScript, le titre — élément principal de la page — s'affiche tout de suite.
 */
export default function Hero() {
  const delai = (ms: number) => ({ animationDelay: `${ms}ms` });

  return (
    <section className="trame-sombre relative overflow-hidden bg-sable">
      <div className="mx-auto grid w-full max-w-[90rem] gap-10 px-4 pb-14 pt-10 sm:px-8 sm:pt-14 lg:grid-cols-12 lg:gap-6 lg:pb-24 lg:pt-10">
        {/* ------------------------------------------------------------ texte */}
        <div className="relative z-20 lg:col-span-8 lg:pt-4">
          <p className="surtitre flex items-center gap-3 text-encre animate-surgit" style={delai(60)}>
            <span aria-hidden className="h-2 w-2 rounded-full bg-orange" />
            {MARQUE.signature}
          </p>

          <h1 className="titre-geant mt-6 text-[clamp(3.4rem,10.4vw,9.25rem)] text-encre">
            <span className="ligne">
              <span style={{ '--i': 0 } as React.CSSProperties}>Crée ce</span>
            </span>
            <span className="ligne">
              <span style={{ '--i': 1 } as React.CSSProperties}>qui te</span>
            </span>
            <span className="ligne">
              <span style={{ '--i': 2 } as React.CSSProperties} className="accent-serif pb-[0.08em] text-orange">
                ressemble.
              </span>
            </span>
          </h1>

          <div className="mt-6 max-w-xl animate-surgit" style={delai(520)}>
            <p className="text-lg leading-relaxed text-encre/80 sm:text-xl">
              T-shirts, cadeaux, souvenirs, kits d’événement : sur Elembo, tes idées, tes photos
              et tes mots deviennent des objets. Imaginé au Congo, fabriqué à Brazzaville.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/personnalisation" className={`${baseBouton} ${stylesBouton.accent} px-7 py-4 text-base`}>
                Créer mon design
                <ArrowUpRight className="h-5 w-5 transition-transform duration-300 ease-sortie group-hover/bouton:rotate-45" />
              </Link>
              <Link href="#collections" className={`${baseBouton} ${stylesBouton.secondaire} px-7 py-4 text-base`}>
                Explorer les collections
                <ArrowRight className="h-5 w-5 transition-transform duration-300 ease-sortie group-hover/bouton:translate-x-1" />
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-encre/70">
              {['Dès 1 pièce', 'Prix en FCFA', 'Paiement MTN MoMo', 'Aide sur WhatsApp'].map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <span aria-hidden className="h-1 w-1 rounded-full bg-orange" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ------------------------------------------------------ composition */}
        <div className="relative z-10 mx-auto w-full max-w-md lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:mt-4 lg:max-w-none">
          {/* Aplat orange décalé : la signature derrière la photo. */}
          <div
            aria-hidden
            className="absolute -right-4 -top-4 h-2/3 w-3/4 bg-orange animate-devoile sm:-right-6 sm:-top-6"
            style={delai(250)}
            data-parallaxe="0.25"
          />

          <figure className="@container relative animate-devoile" style={delai(380)}>
            <div className="relative aspect-[2/3] overflow-hidden bg-creme">
              <Image
                src={asset('/photos/portrait-tee-blanc.jpg')}
                alt="Jeune homme portant un t-shirt blanc, avec une maquette d’impression « BZV 242 »"
                width={1100}
                height={1650}
                priority
                sizes="(min-width: 1024px) 30vw, (min-width: 640px) 28rem, 92vw"
                className="h-full w-full object-cover"
              />
              {/* Maquette de démonstration posée sur le t-shirt (pas une photo de produit réel). */}
              <div
                aria-hidden
                className="absolute left-[51%] top-[41.5%] w-[30%] -translate-x-1/2 text-center mix-blend-multiply"
              >
                <span className="titre-geant block text-[13.5cqw] text-orange">BZV</span>
                <span className="mt-[1cqw] block font-mono text-[3.6cqw] font-semibold tracking-[0.35em] text-encre">
                  242
                </span>
                <span className="accent-serif mt-[0.5cqw] block text-[4.6cqw] text-encre">Brazza la verte</span>
              </div>
            </div>
            <figcaption className="mt-2 text-[10px] uppercase tracking-[0.16em] text-encre/55">
              Photo d’illustration · maquette de démonstration
            </figcaption>
          </figure>

          {/* Seconde image, en chevauchement. */}
          <Link
            href="/univers/cadeaux"
            className="group absolute -left-3 bottom-16 z-10 block w-[52%] -rotate-3 border-[5px] border-creme bg-creme shadow-[0_24px_50px_-24px_rgba(17,13,21,0.55)] transition-transform duration-500 ease-sortie animate-surgit hover:rotate-0 sm:-left-10 lg:-left-24"
            style={delai(760)}
          >
            <span className="block overflow-hidden">
              <Image
                src={asset('/photos/joie-fond-orange.jpg')}
                alt="Jeune femme riant, les mains sur le cœur, sur fond orange"
                width={1200}
                height={800}
                sizes="(min-width: 1024px) 16vw, 45vw"
                className="aspect-[3/2] w-full object-cover transition-transform duration-700 ease-sortie group-hover:scale-105"
              />
            </span>
            <span className="flex items-center justify-between gap-2 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-encre">
              Offrir un cadeau
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </Link>

          <Sticker className="absolute -right-3 top-[46%] z-20 h-24 w-24 bg-encre text-creme animate-surgit sm:-right-8 sm:h-32 sm:w-32">
            <span className="font-display text-2xl font-extrabold tracking-[-0.06em]">
              e<span className="text-orange">.</span>
            </span>
          </Sticker>
        </div>
      </div>
    </section>
  );
}
