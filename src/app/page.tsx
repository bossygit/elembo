import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';

import ProductCard from '../components/site/ProductCard';
import { ArrowRight, Celebration, Check, Gift, Shirt, Sparkle } from '../components/site/Icons';
import { CarteCollection, CarteUnivers, SectionGammes } from '../components/site/Univers';
import { BoutonLien, Etiquette } from '../components/site/ui';
import { BoutonWhatsApp } from '../components/site/WhatsApp';
import { PRODUITS_VITRINE, type ProduitVitrine } from '../lib/commerce/catalogue';
import { COLLECTIONS, REGISTRES, UNIVERS } from '../lib/commerce/univers';
import { devisConfigure } from '../lib/devis/configuration';
import { asset } from '../lib/site/asset';
import { MARQUE, MESSAGES_WHATSAPP } from '../lib/site/marque';

export const metadata: Metadata = {
  title: { absolute: MARQUE.titre },
  description: MARQUE.description,
};

type Icone = ComponentType<SVGProps<SVGSVGElement>>;

const INTENTIONS: { titre: string; texte: string; href: string; Icone: Icone }[] = [
  { titre: 'Offrir un cadeau', texte: 'Créer une attention personnalisée.', href: '/univers/cadeaux', Icone: Gift },
  { titre: 'Créer mon vêtement', texte: 'Exprimer mon style.', href: '/personnalisation', Icone: Shirt },
  {
    titre: 'Préparer un événement',
    texte: 'Mariage, anniversaire, cérémonie.',
    href: '/univers/evenements',
    Icone: Celebration,
  },
  { titre: 'Personnaliser un objet', texte: 'Partir d’une idée ou d’un modèle.', href: '/boutique', Icone: Sparkle },
];

const ETAPES = [
  {
    numero: '01',
    titre: 'Dites-nous votre idée',
    texte: 'Un cadeau, un t-shirt, un événement : choisissez en ligne ou écrivez-nous sur WhatsApp.',
  },
  {
    numero: '02',
    titre: 'Personnalisez',
    texte: 'Votre photo, votre texte, vos mots. L’aperçu montre le rendu avant fabrication.',
  },
  {
    numero: '03',
    titre: 'Payez simplement',
    texte: 'Prix en FCFA, paiement MTN Mobile Money depuis votre téléphone.',
  },
  {
    numero: '04',
    titre: 'Recevez',
    texte: 'Nous fabriquons à Brazzaville et livrons à Brazzaville et Pointe-Noire.',
  },
];

// Les produits à mettre en avant pour un particulier : cadeaux d'abord.
const POPULAIRES = ['mug-personnalise', 'tshirt-basic', 'tableau-canvas', 'coffret-cadeau'];

export default function Home() {
  const lienDevis = devisConfigure ? '/devis' : '/contact';
  const populaires = POPULAIRES.map((id) => PRODUITS_VITRINE.find((p) => p.id === id)).filter(
    (p): p is ProduitVitrine => p !== undefined,
  );

  return (
    <>
      {/* ---------------------------------------------------------------- héros */}
      <section className="relative overflow-hidden border-b border-filet bg-[#F3EFE6]">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-20">
          <div>
            <Etiquette>{MARQUE.signature}</Etiquette>
            <h1 className="titre-editorial mt-6 max-w-2xl text-[clamp(2.8rem,6.2vw,5.2rem)] text-encre">
              Exprimez vos idées.
              <br />
              Nous les <span className="text-orange">matérialisons.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-attenue">
              Bienvenue dans l’univers Elembo. Vos souvenirs, vos émotions et votre culture
              deviennent des objets : un mug pour Maman, un t-shirt qui parle comme vous, les
              souvenirs d’un mariage. Créé au Congo, pour les Congolais.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <BoutonLien href="#intentions" variante="primaire">
                Que souhaitez-vous faire ?
                <ArrowRight className="h-4 w-4" />
              </BoutonLien>
              <BoutonWhatsApp variante="secondaire">Commander sur WhatsApp</BoutonWhatsApp>
            </div>

            <ul className="mt-9 grid gap-3 sm:grid-cols-2">
              {[
                'Prix en FCFA, pour tous les budgets',
                'Paiement MTN MoMo',
                'Commande assistée sur WhatsApp',
                'Fabriqué à Brazzaville',
              ].map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-attenue">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto hidden w-full max-w-xl lg:block lg:max-w-none">
            <div aria-hidden className="absolute -left-4 top-10 h-36 w-36 bg-orange sm:h-48 sm:w-48" />
            <div className="relative border border-encre bg-creme p-3 shadow-[0_30px_80px_-40px_rgba(32,2,51,0.45)] sm:p-4">
              <div className="relative overflow-hidden bg-[#E9E3D7]">
                <Image
                  src={asset('/mockups/tshirt-studio.jpg')}
                  alt="T-shirt blanc prêt à recevoir votre design"
                  width={1600}
                  height={1067}
                  priority
                  sizes="(min-width: 1024px) 44vw, 100vw"
                  className="h-[320px] w-full object-cover sm:h-[430px]"
                />
                <span className="absolute left-3 top-3 bg-creme px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-encre">
                  Votre style
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Link href="/univers/cadeaux" className="group relative overflow-hidden border border-filet bg-white">
                  <Image
                    src={asset('/mockups/cadre-salon.jpg')}
                    alt="Cadre photo personnalisé dans un salon"
                    width={800}
                    height={533}
                    sizes="(min-width: 1024px) 22vw, 45vw"
                    className="h-24 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-28"
                  />
                  <span className="absolute bottom-2 left-2 bg-creme/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                    Vos souvenirs
                  </span>
                </Link>
                <Link href="/univers/evenements" className="group relative overflow-hidden border border-filet bg-white">
                  <Image
                    src={asset('/mockups/textile-lot.jpg')}
                    alt="T-shirts assortis pour un événement"
                    width={800}
                    height={533}
                    sizes="(min-width: 1024px) 22vw, 45vw"
                    className="h-24 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-28"
                  />
                  <span className="absolute bottom-2 left-2 bg-creme/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                    Vos célébrations
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- intentions */}
      <section id="intentions" className="scroll-mt-28 mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Bienvenue dans l’univers Elembo</p>
        <h2 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">Que souhaitez-vous faire aujourd’hui ?</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INTENTIONS.map(({ titre, texte, href, Icone }) => (
            <Link
              key={titre}
              href={href}
              className="group flex flex-col rounded-2xl border border-encre bg-white p-6 transition-colors duration-200 hover:bg-encre hover:text-creme"
            >
              <Icone className="h-8 w-8 text-orange-action group-hover:text-orange" />
              <span className="mt-6 font-display text-2xl leading-tight">{titre}</span>
              <span className="mt-2 text-sm text-attenue group-hover:text-creme/75">{texte}</span>
              <ArrowRight className="mt-6 h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- univers */}
      <section className="border-y border-filet bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Nos univers</p>
              <h2 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">
                Offrir, célébrer, s’exprimer, se souvenir.
              </h2>
            </div>
            <Link
              href="/univers"
              className="inline-flex items-center gap-2 text-sm font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4 hover:text-orange-action"
            >
              Tous les univers
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {UNIVERS.map((univers) => (
              <CarteUnivers key={univers.id} univers={univers} compacte />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ collections */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Nos collections congolaises</p>
            <h2 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">Notre culture, telle qu’on la vit.</h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-attenue">
              Urbaine, jeune, musicale, drôle et créative : la culture congolaise ne se résume pas
              aux pagnes et aux masques. Nos collections parlent français, lingala et kituba.
            </p>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            {REGISTRES.map((r) => (
              <div key={r.titre} className="border-l-2 border-orange pl-4">
                <dt className="text-sm font-semibold text-encre">{r.titre}</dt>
                <dd className="mt-1 text-sm text-attenue">{r.description}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {COLLECTIONS.slice(0, 2).map((collection) => (
            <CarteCollection key={collection.id} collection={collection} />
          ))}
        </div>
        <Link
          href="/univers"
          className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4 hover:text-orange-action"
        >
          Voir toutes les collections
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* ----------------------------------------------------------------- gammes */}
      <section className="border-y border-filet bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Pour tous les budgets</p>
          <h2 className="titre-editorial mt-4 max-w-3xl text-4xl text-encre sm:text-5xl">
            Du petit cadeau d’étudiant au mariage en famille.
          </h2>
          <div className="mt-10">
            <SectionGammes />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- produits */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">À personnaliser</p>
            <h2 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">Les favoris pour offrir.</h2>
          </div>
          <Link
            href="/boutique"
            className="inline-flex items-center gap-2 text-sm font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4 hover:text-orange-action"
          >
            Voir tous les produits
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {populaires.map((produit) => (
            <ProductCard key={produit.id} produit={produit} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ étapes */}
      <section className="border-t border-filet bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Comment ça marche</p>
          <h2 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">Simple, depuis votre téléphone.</h2>
          <div className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {ETAPES.map((etape) => (
              <div key={etape.numero} className="border-t-2 border-encre pt-5">
                <p className="font-display text-4xl text-orange">{etape.numero}</p>
                <h3 className="mt-4 text-lg font-semibold text-encre">{etape.titre}</h3>
                <p className="mt-2 text-sm leading-relaxed text-attenue">{etape.texte}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------- créateurs & entreprises */}
      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
        <article className="flex flex-col justify-between border border-encre bg-encre p-8 text-creme">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange">Créateurs congolais</p>
            <h2 className="mt-3 font-display text-3xl leading-tight">Vos créations méritent une vitrine.</h2>
            <p className="mt-3 text-sm leading-relaxed text-creme/75">
              Illustrateurs, photographes, artistes : proposez vos collections sur Elembo et
              soyez rémunérés à chaque vente.
            </p>
          </div>
          <BoutonLien href="/createurs" variante="clair" className="mt-8 self-start">
            Rejoindre les créateurs
            <ArrowRight className="h-4 w-4" />
          </BoutonLien>
        </article>
        <article className="flex flex-col justify-between border border-filet bg-white p-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-action">Entreprises & organisations</p>
            <h2 className="mt-3 font-display text-3xl leading-tight text-encre">Une équipe, une école, une association ?</h2>
            <p className="mt-3 text-sm leading-relaxed text-attenue">
              Uniformes, textiles en quantité, impression et communication visuelle : le même
              atelier, avec des devis détaillés.
            </p>
          </div>
          <BoutonLien href="/entreprises" variante="secondaire" className="mt-8 self-start">
            Découvrir l’offre entreprise
            <ArrowRight className="h-4 w-4" />
          </BoutonLien>
        </article>
      </section>

      {/* ------------------------------------------------------------------- CTA */}
      <section className="bg-orange">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-16 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-encre/80">Une idée en tête ?</p>
            <h2 className="titre-editorial mt-3 text-4xl text-encre sm:text-5xl">Racontez-la-nous.</h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-encre/80">
              Un cadeau, un t-shirt, un mariage ou un souvenir pour la famille à l’étranger :
              écrivez-nous, nous vous aidons à le réaliser.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <BoutonWhatsApp message={MESSAGES_WHATSAPP.general} variante="primaire">
              Écrire sur WhatsApp
            </BoutonWhatsApp>
            <BoutonLien href={lienDevis} variante="secondaire">
              {devisConfigure ? 'Demander un devis' : 'Nous contacter'}
            </BoutonLien>
          </div>
        </div>
      </section>
    </>
  );
}
