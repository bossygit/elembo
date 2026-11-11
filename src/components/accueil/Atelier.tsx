'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { ArrowUpRight, Check } from '@/components/site/Icons';
import { baseBouton, stylesBouton, Surtitre } from '@/components/site/ui';
import { asset } from '@/lib/site/asset';

/**
 * « Crée quelque chose d'unique » : mise en avant de l'atelier de création.
 * Les trois maquettes sont des DÉMONSTRATIONS posées en CSS sur une photo de t-shirt :
 * elles montrent ce que l'atelier permet, pas des produits en vente. Les polices sont
 * celles du vrai configurateur (public/fonts).
 */
const MAQUETTES = [
  {
    id: 'ville',
    libelle: 'Ma ville',
    rendu: (
      <>
        <span className="block text-[11cqw] leading-[0.85] text-encre" style={{ fontFamily: '"Anton", sans-serif' }}>
          BZV
        </span>
        <span className="mt-[0.6cqw] block text-[2.6cqw] tracking-[0.4em] text-orange" style={{ fontFamily: '"Oswald", sans-serif' }}>
          BRAZZA · 242
        </span>
      </>
    ),
  },
  {
    id: 'mots',
    libelle: 'Mes mots',
    rendu: (
      <>
        <span className="block text-[7.4cqw] leading-[0.95] text-orange" style={{ fontFamily: '"Caveat", cursive', fontWeight: 700 }}>
          Fait avec
        </span>
        <span className="block text-[9cqw] leading-[0.9] text-encre" style={{ fontFamily: '"Caveat", cursive', fontWeight: 700 }}>
          amour.
        </span>
      </>
    ),
  },
  {
    id: 'promo',
    libelle: 'Ma promo',
    rendu: (
      <>
        <span className="block text-[3cqw] tracking-[0.3em] text-encre" style={{ fontFamily: '"Oswald", sans-serif' }}>
          PROMOTION
        </span>
        <span className="block text-[10.5cqw] leading-[0.9] text-encre" style={{ fontFamily: '"Bebas Neue", sans-serif' }}>
          2026
        </span>
        <span className="block text-[2.4cqw] tracking-[0.25em] text-orange" style={{ fontFamily: '"Oswald", sans-serif' }}>
          DIPLÔMÉ·E ET FIER·E
        </span>
      </>
    ),
  },
] as const;

const OUTILS = ['Texte libre', 'Tes images', '17 polices', 'Avant & arrière', '4 couleurs', 'Vue 3D'];

export default function Atelier() {
  const [actif, setActif] = useState(0);

  return (
    <section className="relative overflow-hidden bg-creme py-20 sm:py-28">
      <div className="mx-auto grid w-full max-w-[90rem] items-center gap-12 px-4 sm:px-8 lg:grid-cols-12 lg:gap-8">
        {/* ----------------------------------------------------- composition */}
        <div className="relative lg:col-span-7">
          <div aria-hidden className="absolute -bottom-5 -left-5 h-1/2 w-2/3 bg-citron" data-parallaxe="0.2" />
          <div data-anim="image" className="@container relative overflow-hidden bg-sable">
            <div className="relative aspect-[3/2]">
              <Image
                src={asset('/mockups/tshirt-studio.jpg')}
                alt="T-shirt blanc à plat, avec une maquette d’impression de démonstration"
                width={1600}
                height={1067}
                sizes="(min-width: 1024px) 56vw, 100vw"
                className="h-full w-full object-cover"
              />
              {MAQUETTES.map((maquette, index) => (
                <div
                  key={maquette.id}
                  aria-hidden
                  className={`absolute left-[49%] top-[46%] w-[26%] -translate-x-1/2 -translate-y-1/2 rotate-[2deg] text-center mix-blend-multiply transition-[opacity,transform] duration-500 ease-sortie ${
                    index === actif ? 'opacity-100' : 'translate-y-[-40%] opacity-0'
                  }`}
                >
                  {maquette.rendu}
                </div>
              ))}
            </div>

            {/* Barre d'aperçu : les outils réellement disponibles dans l'atelier. */}
            <ul className="flex flex-wrap gap-2 border-t border-encre/10 bg-creme p-3">
              {OUTILS.map((outil) => (
                <li key={outil} className="rounded-full border border-encre/15 px-3 py-1.5 text-[11px] font-semibold text-encre/80">
                  {outil}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mt-4 flex flex-wrap items-center gap-2">
            <span className="surtitre mr-1 text-attenue">Essaie une idée :</span>
            {MAQUETTES.map((maquette, index) => (
              <button
                key={maquette.id}
                type="button"
                aria-pressed={index === actif}
                onClick={() => setActif(index)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-300 ${
                  index === actif ? 'bg-encre text-creme' : 'border border-encre/25 text-encre hover:border-encre'
                }`}
              >
                {maquette.libelle}
              </button>
            ))}
            <span className="ml-auto text-[10px] uppercase tracking-[0.16em] text-attenue">Maquettes de démonstration</span>
          </div>
        </div>

        {/* ------------------------------------------------------------ texte */}
        <div className="lg:col-span-5 lg:pl-6">
          <Surtitre numero="03">L’atelier de création</Surtitre>
          <h2 data-anim="titre" className="titre-editorial mt-5 text-5xl text-encre sm:text-7xl">
            Crée quelque chose <span className="accent-serif text-orange">d’unique.</span>
          </h2>
          <p data-anim="monte" className="mt-6 max-w-md text-lg leading-relaxed text-attenue">
            Choisis ton t-shirt, sa couleur, puis pose tes textes et tes images. Tu le fais
            tourner en 3D, tu vois le rendu avant de payer.
          </p>
          <ul data-anim="monte" className="mt-6 space-y-3">
            {[
              'Aperçu 3D, directement sur ton téléphone',
              'Ce que tu valides est ce que l’atelier imprime',
              'Dès une pièce, paiement MTN MoMo',
            ].map((point) => (
              <li key={point} className="flex items-start gap-3 text-base text-encre">
                <Check className="mt-1 h-4 w-4 shrink-0 text-orange-action" />
                {point}
              </li>
            ))}
          </ul>
          <div data-anim="monte" className="mt-9">
            <Link href="/personnalisation" className={`${baseBouton} ${stylesBouton.accent} px-7 py-4 text-base`}>
              Personnaliser maintenant
              <ArrowUpRight className="h-5 w-5 transition-transform duration-300 ease-sortie group-hover/bouton:rotate-45" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
