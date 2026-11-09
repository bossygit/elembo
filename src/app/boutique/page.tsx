import type { Metadata } from 'next';
import Link from 'next/link';

import { ArrowRight, Check } from '../../components/site/Icons';
import ProductCard from '../../components/site/ProductCard';
import { BoutonLien, Etiquette } from '../../components/site/ui';
import { PRODUITS_VITRINE, SUPPORTS_IMPRESSION } from '../../lib/commerce/catalogue';

export const metadata: Metadata = {
  title: 'Boutique',
  description:
    'Textile personnalisé, tableaux canvas et impression graphique. Choisissez un support, personnalisez ou demandez un devis avec Smart Vision Congo.',
};

export default function BoutiquePage() {
  const textiles = PRODUITS_VITRINE.filter((p) => p.famille === 'textile');
  const tableaux = PRODUITS_VITRINE.filter((p) => p.famille === 'tableaux');

  return (
    <>
      <section className="border-b border-filet">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <Etiquette>Boutique</Etiquette>
          <h1 className="titre-editorial mt-5 max-w-3xl text-5xl text-encre sm:text-6xl">
            Des supports utiles, fabriqués à Brazzaville.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-attenue">
            Choisissez une famille. Le textile se personnalise en ligne ; l’impression et les
            projets sur mesure passent par un devis pour garantir le prix et le délai.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <BoutonLien href="/personnalisation" variante="primaire">
              Personnaliser un textile
              <ArrowRight className="h-4 w-4" />
            </BoutonLien>
            <BoutonLien href="/impression" variante="secondaire">
              Voir l’impression graphique
            </BoutonLien>
          </div>
        </div>
      </section>

      <section id="textile" className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">01 · Textile</p>
            <h2 className="titre-editorial mt-3 text-4xl text-encre sm:text-5xl">À porter, à offrir, à porter ensemble.</h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-attenue">
            Coton, DTF pressé à chaud, tailles S à 3XL. Quatre couleurs de base et un aperçu 3D
            avant validation.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {textiles.map((produit) => (
            <ProductCard key={produit.id} produit={produit} />
          ))}
          <article className="flex flex-col justify-between border border-filet bg-encre p-6 text-creme">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange">Quantité</p>
              <h3 className="mt-3 font-display text-3xl leading-tight">Équipes, écoles, événements.</h3>
              <p className="mt-3 text-sm leading-relaxed text-creme/70">
                À partir de quelques pièces ou pour un lot complet, nous adaptons le délai et la
                préparation. Un devis fixe le prix et la date.
              </p>
            </div>
            <Link
              href="/entreprises"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-creme underline decoration-orange decoration-2 underline-offset-4 hover:text-orange"
            >
              Demander un devis quantité
              <ArrowRight className="h-4 w-4" />
            </Link>
          </article>
        </div>
      </section>

      <section id="tableaux" className="border-y border-filet bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">02 · Murs & décoration</p>
              <h2 className="titre-editorial mt-3 text-4xl text-encre sm:text-5xl">Vos photos, en grand.</h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-attenue">
              Cinq formats, toile seule ou montée sur châssis. L’aperçu indique la résolution
              réelle de votre photo avant impression.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {tableaux.map((produit) => (
              <ProductCard key={produit.id} produit={produit} />
            ))}
            <article className="border border-filet bg-[#F3EFE6] p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-action">Formats</p>
              <ul className="mt-4 space-y-2 text-sm text-encre">
                {['20 × 30 cm', '30 × 40 cm', '40 × 60 cm', '50 × 70 cm', '60 × 90 cm'].map((format) => (
                  <li key={format} className="flex items-center justify-between border-b border-encre/10 pb-2 last:border-b-0">
                    <span>{format}</span>
                    <span className="text-xs text-attenue">portrait ou paysage</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-attenue">
                Le prix dépend du format, du montage et de la quantité. Il est confirmé dans le
                configurateur avant paiement.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="impression" className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">03 · Impression graphique</p>
            <h2 className="titre-editorial mt-3 text-4xl text-encre sm:text-5xl">Le support juste, au bon format.</h2>
          </div>
          <Link
            href="/impression"
            className="inline-flex items-center gap-2 text-sm font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4 hover:text-orange-action"
          >
            Tous les supports
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SUPPORTS_IMPRESSION.slice(0, 4).map((support) => (
            <article key={support.id} className="border border-filet bg-white p-5">
              <h3 className="font-display text-2xl text-encre">{support.nom}</h3>
              <p className="mt-2 text-sm leading-relaxed text-attenue">{support.description}</p>
              <ul className="mt-4 space-y-1.5">
                {support.options.slice(0, 3).map((option) => (
                  <li key={option} className="flex items-start gap-2 text-xs text-attenue">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-action" />
                    <span>{option}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-8 border border-encre bg-[#F3EFE6] p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h3 className="font-display text-2xl text-encre">Un besoin précis ?</h3>
            <p className="mt-1 text-sm text-attenue">
              Décrivez le support, le format, la quantité et votre échéance. Nous chiffrons avant
              toute production.
            </p>
          </div>
          <BoutonLien href="/contact" variante="primaire" className="mt-4 shrink-0 sm:mt-0">
            Demander un devis
            <ArrowRight className="h-4 w-4" />
          </BoutonLien>
        </div>
      </section>

      <section className="border-t border-filet bg-encre text-creme">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange">04 · Services</p>
            <h2 className="mt-3 font-display text-3xl text-creme">Identité visuelle, événements, commandes récurrentes.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-creme/70">
              Pour les entreprises, associations, restaurants et organisateurs : un interlocuteur
              unique, de la conception à la livraison.
            </p>
          </div>
          <BoutonLien href="/entreprises" variante="clair" className="shrink-0">
            Offre entreprise
            <ArrowRight className="h-4 w-4" />
          </BoutonLien>
        </div>
      </section>
    </>
  );
}
