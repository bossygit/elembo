import type { Metadata } from 'next';
import Link from 'next/link';

import { ArrowRight, Check, Mail, Pin } from '../../components/site/Icons';
import { BoutonLien, Etiquette } from '../../components/site/ui';

export const metadata: Metadata = {
  title: 'Contact & devis',
  description:
    'Écrivez à l’atelier Elembo à Brazzaville pour un devis textile, une impression ou un projet d’entreprise. Réponse par email, accompagnement humain.',
};

const EMAIL = 'store@smartvision.cg';

function lienMail(sujet: string): string {
  return `mailto:${EMAIL}?subject=${encodeURIComponent(sujet)}`;
}

const A_ENVOYER = [
  'La nature du projet : textile, tableau, impression ou identité visuelle',
  'Le support et le format souhaités',
  'La quantité approximative',
  'La date souhaitée ou l’échéance de l’événement',
  'Votre logo ou votre fichier, s’il existe déjà',
  'Vos coordonnées et la ville de livraison',
];

export default function ContactPage() {
  return (
    <>
      <section className="border-b border-filet">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <Etiquette>Contact</Etiquette>
          <h1 className="titre-editorial mt-5 max-w-3xl text-5xl text-encre sm:text-6xl">
            Parlons de ce que vous voulez imprimer.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-attenue">
            Un T-shirt, un tableau, un lot de flyers ou un projet d’entreprise : écrivez-nous avec
            le contexte. Nous revenons vers vous avec une proposition claire.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="font-display text-3xl text-encre">L’atelier</h2>
            <ul className="mt-5 space-y-5">
              <li className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-orange-action" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-attenue">Email</p>
                  <a
                    href={lienMail('Demande de devis — Elembo')}
                    className="mt-1 inline-block text-base font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4 hover:text-orange-action"
                  >
                    {EMAIL}
                  </a>
                  <p className="mt-1 text-xs text-attenue">
                    Le canal le plus fiable pour transmettre un brief ou un fichier.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Pin className="mt-0.5 h-5 w-5 shrink-0 text-orange-action" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-attenue">Atelier</p>
                  <p className="mt-1 text-base font-semibold text-encre">Brazzaville, République du Congo</p>
                  <p className="mt-1 text-xs text-attenue">
                    Visite sur rendez-vous : écrivez-nous pour convenir d’un créneau.
                  </p>
                </div>
              </li>
            </ul>

            <div className="mt-8 border border-encre bg-[#F3EFE6] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-action">Commande entreprise</p>
              <p className="mt-2 text-sm leading-relaxed text-attenue">
                Pour un appel d’offres, une commande récurrente ou un projet événementiel,
                précisez « entreprise » dans l’objet. Nous cadrons le périmètre avant de chiffrer.
              </p>
              <BoutonLien href={lienMail('Projet entreprise — Elembo')} variante="primaire" className="mt-4">
                Écrire pour un projet entreprise
                <ArrowRight className="h-4 w-4" />
              </BoutonLien>
            </div>
          </div>

          <div className="border border-filet bg-white p-6 sm:p-8">
            <h2 className="font-display text-3xl text-encre">Préparer votre demande</h2>
            <p className="mt-3 text-sm leading-relaxed text-attenue">
              Un brief précis nous permet de répondre avec un prix et un délai, pas avec des
              questions. Voici ce qui aide :
            </p>
            <ul className="mt-5 space-y-2.5">
              {A_ENVOYER.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-attenue">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <div className="mt-7 border-t border-filet pt-5">
              <p className="text-xs leading-relaxed text-attenue">
                Vous pouvez joindre un fichier à votre email. Pour les gros fichiers, indiquez un
                lien de téléchargement (Drive, WeTransfer) : nous vous confirmerons sa réception.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <BoutonLien href={lienMail('Demande de devis — Elembo')} variante="accent">
                Écrire à l’atelier
                <ArrowRight className="h-4 w-4" />
              </BoutonLien>
              <Link
                href="/boutique"
                className="inline-flex items-center gap-2 rounded-full border border-encre px-5 py-3 text-sm font-semibold text-encre transition-colors hover:bg-encre hover:text-creme"
              >
                Voir la boutique
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-filet bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-action">Textile</p>
              <p className="mt-2 text-sm leading-relaxed text-attenue">
                Composez directement dans le configurateur. Si le prix n’est pas encore validé,
                demandez un devis depuis la page.
              </p>
              <Link href="/personnalisation" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-encre hover:text-orange-action">
                Personnaliser
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-action">Impression</p>
              <p className="mt-2 text-sm leading-relaxed text-attenue">
                Décrivez le support, le format, la quantité et joignez votre fichier si vous en
                avez un.
              </p>
              <Link href="/impression" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-encre hover:text-orange-action">
                Voir les supports
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-action">Entreprises</p>
              <p className="mt-2 text-sm leading-relaxed text-attenue">
                Identité, supports, textiles en quantité, événements : un interlocuteur unique.
              </p>
              <Link href="/entreprises" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-encre hover:text-orange-action">
                Offre entreprise
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
