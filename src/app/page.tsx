import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import ProductCard from '../components/site/ProductCard';
import { ArrowRight, Check } from '../components/site/Icons';
import { BoutonLien, Etiquette } from '../components/site/ui';
import { FAMILLES, PRODUITS_VITRINE, SERVICES_ENTREPRISE } from '../lib/commerce/catalogue';
import { asset } from '../lib/site/asset';

export const metadata: Metadata = {
  title: 'Personnalisation textile & impression à Brazzaville',
  description:
    'T-shirts personnalisés, tableaux canvas, flyers et supports de communication. Smart Vision Congo fabrique à Brazzaville, avec paiement MTN Mobile Money et livraison locale.',
};

const PREUVES = [
  { titre: 'Atelier', valeur: 'Brazzaville' },
  { titre: 'Paiement', valeur: 'MTN Mobile Money' },
  { titre: 'Livraison', valeur: 'Brazzaville & Pointe-Noire' },
  { titre: 'Délai', valeur: '1 à 3 jours selon la quantité' },
];

const ETAPES = [
  {
    numero: '01',
    titre: 'Choisissez',
    texte: 'Un textile à personnaliser, un tableau à imprimer ou un support graphique à produire.',
  },
  {
    numero: '02',
    titre: 'Composez',
    texte: 'Ajoutez votre texte, votre logo ou votre photo. L’aperçu montre le rendu avant fabrication.',
  },
  {
    numero: '03',
    titre: 'Validez',
    texte: 'Vous confirmez les tailles, la quantité et la livraison. Le prix est recalculé côté atelier.',
  },
  {
    numero: '04',
    titre: 'Recevez',
    texte: 'Nous produisons, contrôlons et livrons. Pour l’impression, un devis précède la fabrication.',
  },
];

export default function Home() {
  return (
    <>
      {/* ---------------------------------------------------------------- héros */}
      <section className="relative overflow-hidden border-b border-filet">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">
              Smart Vision Congo · Brazzaville
            </p>
            <h1 className="titre-editorial mt-5 text-[clamp(2.9rem,7vw,5.4rem)] text-encre">
              Vos idées,
              <br />
              imprimées <span className="text-orange">ici.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-attenue">
              Textile personnalisé, impression graphique et communication visuelle pour les
              particuliers, les entreprises et les événements. Vous voyez un aperçu, nous
              fabriquons à Brazzaville.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <BoutonLien href="/personnalisation" variante="primaire">
                Personnaliser un textile
                <ArrowRight className="h-4 w-4" />
              </BoutonLien>
              <BoutonLien href="/boutique" variante="secondaire">
                Découvrir la boutique
              </BoutonLien>
            </div>

            <ul className="mt-10 grid gap-3 sm:grid-cols-2">
              {[
                'Aperçu avant fabrication',
                'Paiement MTN MoMo',
                'Livraison à Brazzaville & Pointe-Noire',
                'Un interlocuteur réel à l’atelier',
              ].map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-attenue">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
            <div aria-hidden className="absolute -left-4 top-10 h-32 w-32 bg-orange sm:h-44 sm:w-44" />
            <div className="relative border border-encre bg-[#F3EFE6] p-4 sm:p-6">
              <Image
                src={asset('/mockups/tshirt-studio.jpg')}
                alt="T-shirt blanc prêt à être personnalisé, photographié en studio"
                width={1600}
                height={1067}
                priority
                sizes="(min-width: 1024px) 46vw, 100vw"
                className="h-[340px] w-full object-cover sm:h-[460px]"
              />
              <span className="absolute bottom-4 left-4 bg-encre px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-creme">
                DTF · pressé à chaud
              </span>
            </div>
            <div className="absolute -bottom-8 -right-3 hidden w-44 border border-encre bg-creme p-2 sm:block">
              <Image
                src={asset('/mockups/tableau-interieur.jpg')}
                alt="Tableau canvas dans un salon"
                width={1600}
                height={2844}
                sizes="180px"
                className="h-32 w-full object-cover"
              />
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-attenue">
                Tableau canvas
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ réassurance */}
      <section className="border-b border-filet bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-7 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {PREUVES.map((preuve) => (
            <div key={preuve.titre} className="border-l border-filet pl-4 first:border-l-0 first:pl-0 lg:first:border-l lg:first:pl-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-attenue">{preuve.titre}</p>
              <p className="mt-1 text-sm font-semibold text-encre">{preuve.valeur}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------------- familles */}
      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Ce que nous faisons</p>
            <h2 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">
              Trois familles, un même atelier.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-attenue">
              De la pièce unique à la série pour une entreprise, la même exigence : un visuel
              validé, une production suivie, une livraison annoncée.
            </p>
          </div>
          <Link
            href="/boutique"
            className="inline-flex items-center gap-2 text-sm font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4 hover:text-orange-action"
          >
            Tout le catalogue
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {FAMILLES.map((famille) => (
            <article key={famille.id} className="flex flex-col border-t-2 border-encre pt-6">
              <p className="font-mono text-xs font-semibold text-orange-action">{famille.numero}</p>
              <h3 className="mt-3 font-display text-3xl leading-tight text-encre">{famille.titre}</h3>
              <p className="mt-3 text-sm leading-relaxed text-attenue">{famille.description}</p>
              <ul className="mt-5 space-y-2">
                {famille.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-xs text-attenue">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-action" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={famille.href}
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-encre hover:text-orange-action"
              >
                {famille.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------------- produits */}
      <section className="border-y border-filet bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Pièces populaires</p>
              <h2 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">Ce que l’on imprime le plus.</h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-attenue">
              Les prix définitifs sont en cours de validation. Demandez un devis pour obtenir un
              montant ferme et un délai engagé.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PRODUITS_VITRINE.map((produit) => (
              <ProductCard key={produit.id} produit={produit} />
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- personnalisation */}
      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Etiquette>Personnalisation en ligne</Etiquette>
            <h2 className="titre-editorial mt-5 text-4xl text-encre sm:text-5xl">
              Votre visuel sur le vêtement, avant de payer.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-attenue">
              Choisissez un T-shirt, sa couleur et sa taille. Ajoutez un texte ou un logo,
              placez-le sur le devant ou le dos, et faites tourner le modèle en 3D. Ce que vous
              validez est ce que l’atelier reçoit.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Aperçu 3D interactif, sans installation',
                'Textes et images indépendants, avant et arrière',
                'Contrôle de la taille et de la qualité du visuel',
                'Fichier de production généré après validation',
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-attenue">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-orange" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <BoutonLien href="/personnalisation" variante="accent">
                Ouvrir le configurateur
                <ArrowRight className="h-4 w-4" />
              </BoutonLien>
              <BoutonLien href="/comment-ca-marche" variante="secondaire">
                Voir le processus
              </BoutonLien>
            </div>
          </div>

          <div className="relative border border-encre bg-[#F3EFE6] p-6 sm:p-10">
            <Image
              src={asset('/mockups/tshirt-cintre.jpg')}
              alt="Aperçu d’un T-shirt personnalisé sur cintre"
              width={1600}
              height={1067}
              sizes="(min-width: 1024px) 44vw, 100vw"
              className="mx-auto h-[320px] w-full object-cover sm:h-[420px]"
            />
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-encre/20 pt-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-attenue">Couleurs</p>
                <div className="mt-2 flex gap-2">
                  {['#FFFFFF', '#1A1A1A', '#C62828', '#1565C0'].map((couleur) => (
                    <span
                      key={couleur}
                      className="h-6 w-6 rounded-full border border-encre/30"
                      style={{ backgroundColor: couleur }}
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
              <p className="max-w-[12rem] text-right text-[11px] leading-snug text-attenue">
                Aperçu non contractuel. Le prix et le délai sont confirmés avant paiement.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- entreprises */}
      <section className="bg-encre text-creme">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <Etiquette sombre>Entreprises & organisations</Etiquette>
            <h2 className="titre-editorial mt-5 text-4xl text-creme sm:text-5xl">
              Une communication visuelle qui tient dans le temps.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-creme/75">
              Identité, supports, textiles et événements : un seul interlocuteur pour coordonner
              la création et la production, avec des devis détaillés et des délais annoncés.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <BoutonLien href="/entreprises" variante="clair">
                Découvrir l’offre entreprise
                <ArrowRight className="h-4 w-4" />
              </BoutonLien>
              <BoutonLien
                href="/contact"
                variante="secondaire"
                className="border-creme/40 text-creme hover:bg-creme hover:text-encre"
              >
                Demander une proposition
              </BoutonLien>
            </div>
          </div>

          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {SERVICES_ENTREPRISE.map((service, index) => (
              <div key={service.titre} className="border-t border-creme/20 pt-4">
                <p className="font-mono text-[11px] text-orange">0{index + 1}</p>
                <h3 className="mt-2 font-display text-2xl text-creme">{service.titre}</h3>
                <p className="mt-2 text-sm leading-relaxed text-creme/70">{service.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ étapes */}
      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Comment ça marche</p>
          <h2 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">Quatre étapes, pas de surprise.</h2>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {ETAPES.map((etape) => (
            <div key={etape.numero} className="border-t border-filet pt-5">
              <p className="font-mono text-xs font-semibold text-orange-action">{etape.numero}</p>
              <h3 className="mt-3 text-lg font-semibold text-encre">{etape.titre}</h3>
              <p className="mt-2 text-sm leading-relaxed text-attenue">{etape.texte}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-attenue">
          Le paiement en ligne s’applique au textile déjà tarifé. L’impression graphique et les
          projets sur mesure passent par un devis validé avant toute facturation.
        </p>
      </section>

      {/* --------------------------------------------------------------- exemples */}
      <section className="border-y border-filet bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Exemples de supports</p>
              <h2 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">Ce que l’atelier peut produire.</h2>
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-attenue">
              Visuels de travail — les photos des réalisations réelles seront ajoutées au fur et à
              mesure des productions.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {[
              { src: '/mockups/tshirt-cintre.jpg', alt: 'T-shirt blanc personnalisable sur cintre', legende: 'Textile · T-shirt' },
              { src: '/mockups/tableau-interieur.jpg', alt: 'Tableau canvas dans un salon', legende: 'Décoration · Tableau canvas' },
              { src: '/mockups/cartes-impression.jpg', alt: 'Cartes et supports imprimés empilés', legende: 'Impression · Papeterie' },
            ].map((exemple) => (
              <figure key={exemple.src} className="border border-filet bg-[#F3EFE6]">
                <div className="aspect-[4/5] p-6">
                  <Image
                    src={asset(exemple.src)}
                    alt={exemple.alt}
                    width={1600}
                    height={1067}
                    sizes="(min-width: 640px) 33vw, 100vw"
                    className="h-full w-full object-cover"
                  />
                </div>
                <figcaption className="border-t border-filet bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-attenue">
                  {exemple.legende}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------- CTA */}
      <section className="bg-orange">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-16 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-encre/80">Un projet à imprimer ?</p>
            <h2 className="titre-editorial mt-3 text-4xl text-encre sm:text-5xl">
              Dites-nous ce dont vous avez besoin.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-encre/80">
              Un T-shirt, un tableau, un lot de flyers ou une commande d’entreprise : nous
              revenons vers vous avec une proposition claire.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <BoutonLien href="/contact" variante="primaire">
              Nous contacter
              <ArrowRight className="h-4 w-4" />
            </BoutonLien>
            <BoutonLien href="/boutique" variante="secondaire">
              Parcourir la boutique
            </BoutonLien>
          </div>
        </div>
      </section>
    </>
  );
}
