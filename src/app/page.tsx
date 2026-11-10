import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import ProductCard from '../components/site/ProductCard';
import { ArrowRight, Check } from '../components/site/Icons';
import { BoutonLien, Etiquette } from '../components/site/ui';
import { FAMILLES, PRODUITS_VITRINE, SERVICES_ENTREPRISE } from '../lib/commerce/catalogue';
import { devisConfigure } from '../lib/devis/configuration';
import { asset } from '../lib/site/asset';

export const metadata: Metadata = {
  title: 'Boutique textile, impression & services à Brazzaville',
  description:
    'Boutique atelier à Brazzaville : textile personnalisé, impression graphique et services créatifs. Aperçu avant fabrication, paiement MTN Mobile Money et livraison locale.',
};

const PREUVES = [
  { titre: 'Atelier', valeur: 'Brazzaville' },
  { titre: 'Paiement', valeur: 'MTN Mobile Money' },
  { titre: 'Livraison', valeur: 'Brazzaville & Pointe-Noire' },
  { titre: 'Délai', valeur: 'Confirmé dans le devis' },
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

type Exemple = {
  src: string;
  alt: string;
  legende: string;
  /** 'contain' = visuel produit détouré sur fond blanc : on ne le rogne pas dans le cadre 4:3. */
  cadrage?: 'cover' | 'contain';
};

const EXEMPLES: Exemple[] = [
  { src: '/mockups/tshirt-cintre.jpg', alt: 'T-shirt blanc personnalisable sur cintre', legende: 'Textile · T-shirt' },
  {
    src: '/mockups/polo-pique.jpg',
    alt: 'Polo piqué blanc à col et boutons',
    legende: 'Textile · Polo',
    cadrage: 'contain',
  },
  { src: '/mockups/tableau-interieur.jpg', alt: 'Tableau canvas dans un salon', legende: 'Décoration · Tableau canvas' },
  { src: '/mockups/cartes-impression.jpg', alt: 'Cartes et supports imprimés empilés', legende: 'Impression · Papeterie' },
];

export default function Home() {
  const lienDevis = devisConfigure ? '/devis' : '/contact';

  return (
    <>
      {/* ---------------------------------------------------------------- héros */}
      <section className="relative overflow-hidden border-b border-filet bg-[#F3EFE6]">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-20">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Etiquette>Atelier de création · Brazzaville</Etiquette>
            </div>
            <h1 className="titre-editorial mt-6 max-w-2xl text-[clamp(3rem,6.7vw,5.6rem)] text-encre">
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
              <BoutonLien href="/boutique" variante="primaire">
                Découvrir la boutique
                <ArrowRight className="h-4 w-4" />
              </BoutonLien>
              <BoutonLien href="/personnalisation" variante="secondaire">
                Personnaliser un textile
              </BoutonLien>
            </div>

            <div className="relative mt-7 overflow-hidden border border-encre bg-creme p-2 lg:hidden">
              <Image
                src={asset('/mockups/tshirt-studio.jpg')}
                alt="T-shirt blanc prêt à être personnalisé, photographié en studio"
                width={1600}
                height={1067}
                priority
                sizes="100vw"
                className="h-48 w-full object-cover"
              />
              <span className="absolute bottom-4 left-4 bg-encre px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-creme">
                Atelier · DTF pressé à chaud
              </span>
            </div>

            <ul className="mt-9 grid gap-3 sm:grid-cols-2">
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

          <div className="relative mx-auto hidden w-full max-w-xl lg:block lg:max-w-none">
            <div aria-hidden className="absolute -left-4 top-10 h-36 w-36 bg-orange sm:h-48 sm:w-48" />
            <div className="relative border border-encre bg-creme p-3 sm:p-4">
              <div className="relative overflow-hidden bg-[#E9E3D7]">
                <Image
                  src={asset('/mockups/tshirt-studio.jpg')}
                  alt="T-shirt blanc prêt à être personnalisé, photographié en studio"
                  width={1600}
                  height={1067}
                  priority
                  sizes="(min-width: 1024px) 44vw, 100vw"
                  className="h-[320px] w-full object-cover sm:h-[430px]"
                />
                <span className="absolute left-3 top-3 bg-creme px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-encre">
                  Collection atelier
                </span>
                <span className="absolute bottom-3 right-3 bg-encre px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-creme">
                  DTF · pressé à chaud
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Link href="/impression" className="group relative overflow-hidden border border-filet bg-white">
                  <Image
                    src={asset('/mockups/cartes-impression.jpg')}
                    alt="Cartes et supports imprimés empilés"
                    width={800}
                    height={533}
                    sizes="(min-width: 1024px) 22vw, 45vw"
                    className="h-24 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-28"
                  />
                  <span className="absolute bottom-2 left-2 bg-creme/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                    Impression
                  </span>
                </Link>
                <Link href="/textile/polo-pique" className="group relative overflow-hidden border border-filet bg-white">
                  <Image
                    src={asset('/mockups/polo-pique.jpg')}
                    alt="Polo piqué blanc à col et boutons"
                    width={800}
                    height={533}
                    sizes="(min-width: 1024px) 22vw, 45vw"
                    className="h-24 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-28"
                  />
                  <span className="absolute bottom-2 left-2 bg-creme/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                    Polos & équipes
                  </span>
                </Link>
              </div>
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
      <section id="familles" className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
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
            <article key={famille.id} className="group overflow-hidden border border-filet bg-white">
              <Link href={famille.href} className="block overflow-hidden">
                <div className="relative aspect-[4/3] overflow-hidden bg-[#F3EFE6]">
                  <Image
                    src={asset(famille.image.src)}
                    alt={famille.image.alt}
                    width={1600}
                    height={1067}
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute left-4 top-4 bg-creme/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-encre">
                    {famille.numero}
                  </span>
                </div>
              </Link>
              <div className="p-6">
                <h3 className="font-display text-3xl leading-tight text-encre">{famille.titre}</h3>
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
                  className="mt-6 inline-flex items-center gap-2 rounded-full border border-encre px-4 py-2.5 text-sm font-semibold text-encre transition-colors hover:bg-encre hover:text-creme"
                >
                  {famille.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
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
            <div className="max-w-sm">
              <p className="text-sm leading-relaxed text-attenue">
                Les prix définitifs sont en cours de validation. Demandez un devis pour obtenir un
                montant ferme et un délai engagé.
              </p>
              <Link
                href="/boutique"
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4 hover:text-orange-action"
              >
                Voir tous les produits
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PRODUITS_VITRINE.slice(0, 4).map((produit) => (
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
              <BoutonLien href="/boutique#textile" variante="secondaire">
                Voir les fiches textile
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
                href="/devis?famille=SERVICES"
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
        <div className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {ETAPES.map((etape) => (
            <div key={etape.numero} className="border-t-2 border-encre pt-5">
              <p className="font-display text-4xl text-orange">{etape.numero}</p>
              <h3 className="mt-4 text-lg font-semibold text-encre">{etape.titre}</h3>
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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Réalisations & exemples</p>
              <h2 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">Ce que l’atelier peut produire.</h2>
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-attenue">
              Visuels de travail — les photos des réalisations réelles seront ajoutées au fur et à
              mesure des productions.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {EXEMPLES.map((exemple) => (
              <figure key={exemple.src} className="group overflow-hidden border border-filet bg-[#F3EFE6]">
                <div className={`aspect-[4/3] overflow-hidden ${exemple.cadrage === 'contain' ? 'bg-white' : ''}`}>
                  <Image
                    src={asset(exemple.src)}
                    alt={exemple.alt}
                    width={1600}
                    height={1067}
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    className={`h-full w-full ${exemple.cadrage === 'contain' ? 'object-contain' : 'object-cover'} transition-transform duration-500 group-hover:scale-105`}
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
              Un T-shirt, un polo, un lot de flyers ou une commande d’entreprise : nous revenons
              vers vous avec une proposition claire.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <BoutonLien href={lienDevis} variante="primaire">
              Demander un devis
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
