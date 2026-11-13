import type { Metadata } from 'next';
import Link from 'next/link';

import Atelier from '../../components/accueil/Atelier';
import Categories from '../../components/accueil/Categories';
import Collections from '../../components/accueil/Collections';
import Communaute from '../../components/accueil/Communaute';
import Hero from '../../components/accueil/Hero';
import Moments from '../../components/accueil/Moments';
import Bandeau from '../../components/site/Bandeau';
import { ArrowRight, ArrowUpRight } from '../../components/site/Icons';
import { SectionGammes } from '../../components/site/Univers';
import { baseBouton, stylesBouton, Surtitre } from '../../components/site/ui';
import { BoutonWhatsApp } from '../../components/site/WhatsApp';
import { devisConfigure } from '../../lib/devis/configuration';
import { MARQUE, MESSAGES_WHATSAPP } from '../../lib/site/marque';

export const metadata: Metadata = {
  title: { absolute: MARQUE.titre },
  description: MARQUE.description,
};

export default function Home() {
  const lienDevis = devisConfigure ? '/devis' : '/contact';

  return (
    <>
      <Hero />

      <Bandeau
        className="bg-encre py-4 font-display text-xl uppercase tracking-tight text-creme sm:text-2xl"
        elements={[
          'T-shirts personnalisés',
          'Cadeaux',
          'Mugs',
          'Tableaux photo',
          'Kits d’événement',
          'Brazzaville',
          'Pointe-Noire',
        ]}
      />

      <Categories />
      <Collections />
      <Atelier />
      <Communaute />
      <Moments />

      {/* ------------------------------------------------------- budgets */}
      <section className="mx-auto w-full max-w-[90rem] px-4 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Surtitre numero="06">Pour tous les budgets</Surtitre>
            <h2 data-anim="titre" className="titre-editorial mt-5 text-5xl text-encre sm:text-6xl">
              Du petit cadeau <span className="accent-serif text-orange">au grand jour.</span>
            </h2>
            <p data-anim="monte" className="mt-6 text-base leading-relaxed text-attenue">
              Un étudiant qui offre un mug, une famille qui prépare un mariage : la même
              attention, trois gammes de prix.
            </p>
            <Link
              data-anim="monte"
              href="/comment-ca-marche"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4 hover:text-orange-action"
            >
              Comment ça marche
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="lg:col-span-8">
            <SectionGammes />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- CTA */}
      <section className="relative overflow-hidden bg-orange">
        <div className="mx-auto w-full max-w-[90rem] px-4 py-20 sm:px-8 sm:py-28">
          <p className="surtitre text-encre/80">Une idée en tête ?</p>
          <h2 data-anim="titre" className="titre-geant mt-5 text-[clamp(3.2rem,12vw,10.5rem)] text-encre">
            À toi de <span className="accent-serif">jouer.</span>
          </h2>
          <div data-anim="monte" className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/personnalisation" className={`${baseBouton} ${stylesBouton.primaire} px-7 py-4 text-base hover:bg-creme`}>
              Créer mon design
              <ArrowUpRight className="h-5 w-5 transition-transform duration-300 ease-sortie group-hover/bouton:rotate-45" />
            </Link>
            <BoutonWhatsApp message={MESSAGES_WHATSAPP.general} variante="secondaire" className="px-7 py-4 text-base">
              En parler sur WhatsApp
            </BoutonWhatsApp>
            <Link
              href={lienDevis}
              className="ml-1 text-sm font-semibold text-encre underline decoration-encre decoration-2 underline-offset-4"
            >
              {devisConfigure ? 'Demander un devis' : 'Nous contacter'}
            </Link>
          </div>
          <p className="mt-10 max-w-md text-sm leading-relaxed text-encre/75">
            Une équipe, une école, une association ?{' '}
            <Link href="/entreprises" className="font-semibold underline underline-offset-4">
              Découvre l’offre entreprises
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
