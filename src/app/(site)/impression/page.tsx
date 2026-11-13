import type { Metadata } from 'next';
import Image from 'next/image';

import { ArrowRight, Check } from '../../../components/site/Icons';
import { BoutonLien, Etiquette } from '../../../components/site/ui';
import { SUPPORTS_IMPRESSION } from '../../../lib/commerce/catalogue';
import { asset } from '../../../lib/site/asset';

export const metadata: Metadata = {
  title: 'Impression graphique',
  description:
    'Flyers, affiches A3+, cartes de visite, menus, brochures et documents personnalisés. Impression à Brazzaville, devis avant production.',
};

const FICHIER = [
  'PDF de préférence (ou image très haute résolution)',
  '300 dpi à la taille finale',
  '3 mm de fond perdu sur les bords',
  'Polices vectorisées ou intégrées',
  'Couleurs CMJN pour l’impression',
  'Un seul fichier par face, sans traits de coupe',
];

export default function ImpressionPage() {
  return (
    <>
      <section className="border-b border-filet">
        <div className="mx-auto grid w-full max-w-[90rem] gap-10 px-4 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <Etiquette>Impression graphique</Etiquette>
            <h1 className="titre-editorial mt-5 max-w-2xl text-5xl text-encre sm:text-6xl">
              Le papier juste, au bon format.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-attenue">
              Flyers, affiches, cartes de visite, menus, invitations, brochures et documents.
              Nous imprimons en interne ce que notre équipement permet, et nous coordonnons les
              finitions avec nos partenaires.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <BoutonLien href="/devis?famille=IMPRESSION" variante="primaire">
                Demander un devis
                <ArrowRight className="h-4 w-4" />
              </BoutonLien>
              <BoutonLien href="/boutique" variante="secondaire">
                Retour à la boutique
              </BoutonLien>
            </div>
            <p className="mt-5 max-w-lg text-xs leading-relaxed text-attenue">
              Les tarifs de l’impression sont établis sur devis, selon le support, la quantité,
              le papier et les finitions. Aucun paiement en ligne n’est ouvert sur cette famille
              tant que le prix n’est pas validé.
            </p>
          </div>

          <div className="border border-encre bg-sable p-4 sm:p-6">
            <div className="aspect-[4/3] overflow-hidden">
              <Image
                src={asset('/mockups/cartes-impression.jpg')}
                alt="Cartes et supports imprimés empilés"
                width={1600}
                height={1067}
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-encre/20 pt-4 text-xs">
              <div>
                <p className="font-semibold uppercase tracking-[0.12em] text-encre">Interne</p>
                <p className="mt-1 text-attenue">A4 / A3+ · Epson EcoTank L14150 · encres originales</p>
              </div>
              <div>
                <p className="font-semibold uppercase tracking-[0.12em] text-encre">Partenaires</p>
                <p className="mt-1 text-attenue">Finitions, reliure, grands formats</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[90rem] px-4 py-16 sm:px-8 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="surtitre text-orange-action">Supports</p>
            <h2 className="titre-editorial mt-3 text-4xl text-encre sm:text-5xl">Ce que nous produisons.</h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-attenue">
            Chaque support a ses contraintes de papier et de finition. Le devis précise ce qui est
            imprimé en interne et ce qui passe par un partenaire.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SUPPORTS_IMPRESSION.map((support) => (
            <article key={support.id} className="border border-filet bg-white p-6">
              <h3 className="font-display text-2xl text-encre">{support.nom}</h3>
              <p className="mt-2 text-sm leading-relaxed text-attenue">{support.description}</p>
              <ul className="mt-4 space-y-1.5">
                {support.options.map((option) => (
                  <li key={option} className="flex items-start gap-2 text-xs text-attenue">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-action" />
                    <span>{option}</span>
                  </li>
                ))}
              </ul>
              <BoutonLien
                href={`/devis?famille=IMPRESSION&support=${encodeURIComponent(support.id)}`}
                variante="secondaire"
                className="mt-5 w-full"
              >
                Demander un devis
              </BoutonLien>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-filet bg-white">
        <div className="mx-auto grid w-full max-w-[90rem] gap-10 px-4 py-16 sm:px-8 sm:py-20 lg:grid-cols-2">
          <div>
            <p className="surtitre text-orange-action">Votre fichier</p>
            <h2 className="titre-editorial mt-3 text-4xl text-encre">Prêt à imprimer ?</h2>
            <p className="mt-4 text-base leading-relaxed text-attenue">
              Un fichier bien préparé évite les mauvaises surprises : texte coupé, couleurs
              décalées, image floue. Voici ce que nous attendons.
            </p>
            <ul className="mt-6 space-y-2.5">
              {FICHIER.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-attenue">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs leading-relaxed text-attenue">
              Un doute sur votre fichier ? Envoyez-le : nous le contrôlons avant impression et
              vous disons ce qui doit être corrigé.
            </p>
          </div>

          <div className="border border-encre bg-sable p-6 sm:p-8">
            <p className="surtitre text-orange-action">Pas de fichier ?</p>
            <h3 className="mt-3 font-display text-3xl text-encre">Nous pouvons le créer.</h3>
            <p className="mt-3 text-sm leading-relaxed text-attenue">
              Notre atelier conçoit aussi l’identité et les supports : logo, mise en page,
              déclinaisons. La création est chiffrée séparément de l’impression, dans le même
              devis.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-attenue">
              <li>• Logo et charte visuelle</li>
              <li>• Mise en page de flyers, menus, brochures</li>
              <li>• Déclinaisons pour les réseaux et l’affichage</li>
            </ul>
            <BoutonLien href="/devis?famille=SERVICES&service=Cr%C3%A9ation%20graphique" variante="primaire" className="mt-6">
              Voir l’offre création
              <ArrowRight className="h-4 w-4" />
            </BoutonLien>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[90rem] px-4 py-16 sm:px-8 sm:py-20">
        <h2 className="titre-editorial text-4xl text-encre">Questions fréquentes</h2>
        <div className="mt-8 divide-y divide-filet border-y border-filet">
          {[
            {
              q: 'Quels sont les délais ?',
              r: 'Ils dépendent du support, de la quantité et des finitions. Le devis indique une date de livraison ; nous ne promettons pas un délai que l’atelier ne peut pas tenir.',
            },
            {
              q: 'Puis-je commander une petite quantité ?',
              r: 'Oui pour plusieurs supports, mais l’impression a un coût de calage. Le devis précise le minimum économique et le prix par palier.',
            },
            {
              q: 'Imprimez-vous des grands formats (bâche, roll-up) ?',
              r: 'Pas en interne aujourd’hui. Ces supports passent par un partenaire ; nous coordonnons la production et le contrôle, et le devis le mentionne.',
            },
            {
              q: 'Comment se passe le paiement ?',
              r: 'Sur devis accepté. Le paiement en ligne direct n’est ouvert que pour les produits dont le prix commercial est validé. Aucun montant provisoire n’est encaissé.',
            },
          ].map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold text-encre">
                {item.q}
                <span aria-hidden className="text-orange-action transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-attenue">{item.r}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="bg-encre text-creme">
        <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-14 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="titre-editorial text-4xl text-creme">Décrivez votre impression.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-creme/70">
              Support, format, quantité, papier, finitions, échéance : plus votre demande est
              précise, plus le devis est rapide.
            </p>
          </div>
          <BoutonLien href="/devis?famille=IMPRESSION" variante="clair" className="shrink-0">
            Demander un devis
            <ArrowRight className="h-4 w-4" />
          </BoutonLien>
        </div>
      </section>
    </>
  );
}
