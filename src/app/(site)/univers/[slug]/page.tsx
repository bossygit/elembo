import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Check } from '@/components/site/Icons';
import ProductCard from '@/components/site/ProductCard';
import { CarteCollection, CarteKit, CarteUnivers } from '@/components/site/Univers';
import { BoutonLien, Etiquette, Surtitre } from '@/components/site/ui';
import { BoutonWhatsApp } from '@/components/site/WhatsApp';
import {
  collectionsDeUnivers,
  KITS_EVENEMENT,
  produitsDeUnivers,
  UNIVERS,
  universParId,
} from '@/lib/commerce/univers';
import { devisConfigure } from '@/lib/devis/configuration';
import { asset } from '@/lib/site/asset';
import { MESSAGES_WHATSAPP } from '@/lib/site/marque';

type Contexte = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return UNIVERS.map((u) => ({ slug: u.id }));
}

export async function generateMetadata({ params }: Contexte): Promise<Metadata> {
  const { slug } = await params;
  const univers = universParId(slug);
  if (!univers) return { title: 'Univers' };
  return { title: univers.titre, description: `${univers.accroche} ${univers.description}` };
}

export default async function PageUniversDetail({ params }: Contexte) {
  const { slug } = await params;
  const univers = universParId(slug);
  if (!univers) notFound();

  const produits = produitsDeUnivers(univers);
  const collections = collectionsDeUnivers(univers);
  const estEvenement = univers.id === 'evenements';
  const autres = UNIVERS.filter((u) => u.id !== univers.id);
  const message = MESSAGES_WHATSAPP[univers.messageWhatsApp];

  return (
    <>
      <section className="trame-sombre bg-sable">
        <div className="mx-auto grid w-full max-w-[90rem] gap-10 px-4 py-10 sm:px-8 sm:py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <nav className="flex flex-wrap items-center gap-2 text-xs text-attenue" aria-label="Fil d’Ariane">
              <Link href="/" className="hover:text-encre">Accueil</Link>
              <span aria-hidden>/</span>
              <Link href="/univers" className="hover:text-encre">Univers</Link>
              <span aria-hidden>/</span>
              <span className="text-encre">{univers.titre}</span>
            </nav>
            <div className="mt-6">
              <Etiquette>Univers {univers.numero}</Etiquette>
            </div>
            <h1 className="titre-geant mt-5 text-[clamp(2.6rem,7.4vw,6.5rem)] text-encre">{univers.titre}</h1>
            <p className="accent-serif mt-4 text-3xl text-orange-action sm:text-4xl">{univers.accroche}</p>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-attenue">{univers.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <BoutonWhatsApp message={message}>{univers.ctaWhatsApp}</BoutonWhatsApp>
              {estEvenement && devisConfigure ? (
                <BoutonLien href="/devis?famille=TEXTILE" variante="secondaire">
                  Demander un devis
                </BoutonLien>
              ) : (
                <BoutonLien href="/personnalisation" variante="secondaire">
                  Créer mon t-shirt
                </BoutonLien>
              )}
            </div>
          </div>
          <div className="relative">
            <div aria-hidden className="absolute -right-3 -top-3 h-2/3 w-2/3 bg-orange sm:-right-5 sm:-top-5" />
            <Image
              src={asset(univers.image.src)}
              alt={univers.image.alt}
              width={1600}
              height={1067}
              priority
              sizes="(min-width: 1024px) 75vw, 150vw"
              className="relative aspect-[4/5] w-full object-cover"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[90rem] px-4 py-14 sm:px-8 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="surtitre text-orange-action">Pour quelles occasions ?</p>
            <ul className="mt-5 space-y-3">
              {univers.occasions.map((occasion) => (
                <li key={occasion} className="flex items-start gap-2.5 text-base text-encre">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-orange-action" />
                  <span>{occasion}</span>
                </li>
              ))}
            </ul>
          </div>
          <blockquote data-anim="monte" className="self-start bg-encre p-7 text-creme sm:p-10">
            <p className="surtitre text-orange">Par exemple</p>
            <p className="accent-serif mt-4 text-3xl leading-[1.1] sm:text-5xl">{univers.exemple}</p>
          </blockquote>
        </div>
      </section>

      {estEvenement && (
        <section className="border-y border-encre/15 bg-sable">
          <div className="mx-auto w-full max-w-[90rem] px-4 py-14 sm:px-8 sm:py-20">
            <Surtitre>Kits événement</Surtitre>
            <h2 data-anim="titre" className="titre-editorial mt-5 text-5xl text-encre sm:text-6xl">
              Tout pour le jour J, <span className="accent-serif text-orange">en un seul kit.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-attenue">
              Chaque kit est composé avec vous selon le nombre d’invités, les couleurs et le
              budget. Écrivez-nous la date : nous revenons avec une proposition chiffrée.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {KITS_EVENEMENT.map((kit) => (
                <CarteKit key={kit.id} kit={kit} />
              ))}
            </div>
          </div>
        </section>
      )}

      {produits.length > 0 && (
        <section className="mx-auto w-full max-w-[90rem] px-4 py-14 sm:px-8 sm:py-20">
          <Surtitre>Les objets à personnaliser</Surtitre>
          <h2 data-anim="titre" className="titre-editorial mt-5 text-5xl text-encre sm:text-6xl">
            Choisissez <span className="accent-serif text-orange">votre support.</span>
          </h2>
          <div className="mt-10 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {produits.map((produit) => (
              <ProductCard key={produit.id} produit={produit} />
            ))}
          </div>
        </section>
      )}

      {collections.length > 0 && (
        <section className="border-t border-encre/15">
          <div className="mx-auto w-full max-w-[90rem] px-4 py-14 sm:px-8 sm:py-20">
            <Surtitre>Collection en préparation</Surtitre>
            <div className="mt-8 grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {collections.map((collection) => (
                <CarteCollection key={collection.id} collection={collection} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto w-full max-w-[90rem] px-4 py-14 sm:px-8 sm:py-20">
        <h2 className="titre-editorial text-4xl text-encre sm:text-5xl">Les autres univers</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {autres.map((u) => (
            <CarteUnivers key={u.id} univers={u} compacte />
          ))}
        </div>
      </section>
    </>
  );
}
