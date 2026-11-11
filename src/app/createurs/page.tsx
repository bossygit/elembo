import type { Metadata } from 'next';

import { Check } from '@/components/site/Icons';
import { Etiquette } from '@/components/site/ui';
import { BoutonWhatsApp, LienWhatsApp } from '@/components/site/WhatsApp';
import { MESSAGES_WHATSAPP } from '@/lib/site/marque';

export const metadata: Metadata = {
  title: 'Créateurs congolais',
  description:
    'Illustrateurs, photographes, artistes, créateurs de contenu : proposez vos collections sur Elembo et soyez rémunérés à chaque vente.',
};

const PROFILS = [
  'Un étudiant qui crée des illustrations et les propose à la vente',
  'Un artiste qui lance sa collection de t-shirts',
  'Une personne qui imagine des modèles pour les mariages',
  'Un photographe qui vend des tableaux de ses images',
  'Un créateur de contenu qui lance sa propre collection',
];

const ROLES = [
  { qui: 'Vous', quoi: 'Vos designs, vos idées, votre communauté.' },
  {
    qui: 'Elembo',
    quoi: 'La plateforme, la vente, la production, la livraison et le paiement — opérés par Smart Vision.',
  },
  { qui: 'Ensemble', quoi: 'Une rémunération pour vous à chaque vente de vos créations.' },
];

export default function PageCreateurs() {
  return (
    <>
      <section className="border-b border-filet bg-[#F3EFE6]">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <Etiquette>Bientôt · Préinscription ouverte</Etiquette>
          <h1 className="titre-editorial mt-5 max-w-3xl text-5xl text-encre sm:text-6xl">
            Créateurs congolais, rejoignez Elembo.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-attenue">
            Elembo veut devenir la vitrine de la créativité congolaise. Illustrateurs,
            photographes, artistes, créateurs de contenu : proposez vos collections, nous les
            fabriquons et les livrons.
          </p>
          <div className="mt-8">
            <BoutonWhatsApp message={MESSAGES_WHATSAPP.createur}>Me préinscrire sur WhatsApp</BoutonWhatsApp>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Pour qui ?</p>
            <h2 className="titre-editorial mt-4 text-4xl text-encre">Imaginez…</h2>
            <ul className="mt-6 space-y-3">
              {PROFILS.map((profil) => (
                <li key={profil} className="flex items-start gap-2.5 text-base text-encre">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-orange-action" />
                  <span>{profil}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Comment ça marche</p>
            <dl className="mt-6 space-y-6">
              {ROLES.map((role) => (
                <div key={role.qui} className="border-t-2 border-encre pt-4">
                  <dt className="font-display text-2xl text-encre">{role.qui}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-attenue">{role.quoi}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <p className="mt-12 max-w-2xl text-sm leading-relaxed text-attenue">
          Le programme créateurs est en préparation : les conditions de rémunération seront
          présentées aux premiers inscrits. Pour être contacté·e,{' '}
          <LienWhatsApp message={MESSAGES_WHATSAPP.createur}>écrivez-nous sur WhatsApp</LienWhatsApp>{' '}
          ou à{' '}
          <a href="mailto:store@smartvision.cg" className="font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4">
            store@smartvision.cg
          </a>{' '}
          avec quelques exemples de votre travail.
        </p>
      </section>
    </>
  );
}
