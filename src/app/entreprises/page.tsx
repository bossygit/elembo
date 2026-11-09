import type { Metadata } from 'next';
import Image from 'next/image';

import { ArrowRight, Check } from '../../components/site/Icons';
import { BoutonLien, Etiquette } from '../../components/site/ui';
import { SERVICES_ENTREPRISE } from '../../lib/commerce/catalogue';
import { asset } from '../../lib/site/asset';

export const metadata: Metadata = {
  title: 'Entreprises & organisations',
  description:
    'Identité visuelle, supports publicitaires, textiles en quantité et communication événementielle. Un interlocuteur unique à Brazzaville, du devis à la livraison.',
};

const CLIENTS = [
  'Entreprises et commerces',
  'Restaurants et bars',
  'Écoles et universités',
  'Églises et associations',
  'Organisateurs d’événements',
  'ONG et institutions',
];

const PROCESSUS = [
  { numero: '01', titre: 'Brief', texte: 'Vous décrivez le besoin, le public, la quantité et l’échéance.' },
  { numero: '02', titre: 'Proposition', texte: 'Nous cadrons le périmètre, les options et le budget dans un devis détaillé.' },
  { numero: '03', titre: 'Validation', texte: 'Vous validez le devis et, si nécessaire, une maquette ou un BAT.' },
  { numero: '04', titre: 'Production', texte: 'Fabrication interne ou partenaire, contrôle qualité, livraison annoncée.' },
];

export default function EntreprisesPage() {
  return (
    <>
      <section className="border-b border-filet">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <Etiquette>Entreprises & organisations</Etiquette>
            <h1 className="titre-editorial mt-5 max-w-2xl text-5xl text-encre sm:text-6xl">
              Votre communication, tenue par un seul atelier.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-attenue">
              Identité visuelle, supports imprimés, textiles en quantité et communication
              événementielle. Nous coordonnons la création et la production pour que vous ayez un
              interlocuteur, un devis et une date.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <BoutonLien href="/contact" variante="primaire">
                Demander une proposition
                <ArrowRight className="h-4 w-4" />
              </BoutonLien>
              <BoutonLien href="/impression" variante="secondaire">
                Voir l’impression
              </BoutonLien>
            </div>
          </div>

          <div className="border border-encre bg-[#F3EFE6] p-4 sm:p-6">
            <Image
              src={asset('/mockups/tableau-interieur.jpg')}
              alt="Tableau mural personnalisé dans un espace professionnel"
              width={1600}
              height={2844}
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="h-[360px] w-full object-cover sm:h-[440px]"
            />
            <p className="mt-3 border-t border-encre/20 pt-3 text-[11px] leading-relaxed text-attenue">
              Exemple de support mural. Les visuels de production réels seront ajoutés au fil des
              projets.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Nos prestations</p>
          <h2 className="titre-editorial mt-3 text-4xl text-encre sm:text-5xl">De l’idée au support fini.</h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {SERVICES_ENTREPRISE.map((service, index) => (
            <article key={service.titre} className="border border-filet bg-white p-6">
              <p className="font-mono text-xs font-semibold text-orange-action">0{index + 1}</p>
              <h3 className="mt-3 font-display text-2xl text-encre">{service.titre}</h3>
              <p className="mt-2 text-sm leading-relaxed text-attenue">{service.description}</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {service.exemples.map((exemple) => (
                  <li key={exemple} className="bg-encre/5 px-2.5 py-1 text-[11px] font-medium text-encre">
                    {exemple}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-filet bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Notre façon de travailler</p>
            <h2 className="titre-editorial mt-3 text-4xl text-encre">Un devis clair, une production suivie.</h2>
            <p className="mt-4 text-sm leading-relaxed text-attenue">
              Pas de prix inventé ni de délai promis à la légère. Chaque proposition distingue la
              création, l’impression, les finitions et la livraison.
            </p>
            <ul className="mt-6 space-y-2.5">
              {['Devis détaillé avant production', 'Validation d’un BAT pour les séries', 'Un interlocuteur unique', 'Livraison à Brazzaville et Pointe-Noire'].map(
                (point) => (
                  <li key={point} className="flex items-start gap-3 text-sm text-attenue">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
                    <span>{point}</span>
                  </li>
                ),
              )}
            </ul>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {PROCESSUS.map((etape) => (
              <div key={etape.numero} className="border-t border-filet pt-4">
                <p className="font-mono text-xs font-semibold text-orange-action">{etape.numero}</p>
                <h3 className="mt-2 text-lg font-semibold text-encre">{etape.titre}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-attenue">{etape.texte}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Pour qui</p>
            <h2 className="titre-editorial mt-3 text-4xl text-encre">Des organisations de toutes tailles.</h2>
            <ul className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {CLIENTS.map((client) => (
                <li key={client} className="flex items-start gap-2.5 text-sm text-attenue">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-orange" aria-hidden />
                  {client}
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-encre bg-[#F3EFE6] p-6 sm:p-8">
            <h3 className="font-display text-3xl text-encre">Commande récurrente ?</h3>
            <p className="mt-3 text-sm leading-relaxed text-attenue">
              Écoles, restaurants, entreprises : nous pouvons organiser des commandes régulières
              avec un prix et un délai convenus à l’avance. Parlez-nous du rythme et des volumes.
            </p>
            <BoutonLien href="/contact" variante="primaire" className="mt-6">
              Ouvrir le dialogue
              <ArrowRight className="h-4 w-4" />
            </BoutonLien>
          </div>
        </div>
      </section>

      <section className="bg-orange">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-14 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="titre-editorial text-4xl text-encre">Parlons de votre prochain projet.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-encre/80">
              Décrivez le contexte, le support, la quantité et la date souhaitée. Nous revenons
              vers vous avec une proposition.
            </p>
          </div>
          <BoutonLien href="/contact" variante="primaire" className="shrink-0">
            Demander une proposition
            <ArrowRight className="h-4 w-4" />
          </BoutonLien>
        </div>
      </section>
    </>
  );
}
