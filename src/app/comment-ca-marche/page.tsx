import type { Metadata } from 'next';

import { ArrowRight, Check } from '../../components/site/Icons';
import { BoutonLien, Etiquette } from '../../components/site/ui';
import { BoutonWhatsApp } from '../../components/site/WhatsApp';
import { WHATSAPP } from '../../lib/site/marque';

export const metadata: Metadata = {
  title: 'Comment ça marche',
  description:
    'Du choix du support à la livraison : personnalisation, validation, paiement MTN MoMo ou devis, production et livraison à Brazzaville et Pointe-Noire.',
};

const ETAPES = [
  {
    numero: '01',
    titre: 'Choisir le support',
    texte:
      'Textile, tableau canvas ou impression graphique. Chaque famille a son parcours : le textile se configure en ligne, l’impression passe par un devis.',
  },
  {
    numero: '02',
    titre: 'Personnaliser ou décrire',
    texte:
      'Pour le textile, ajoutez textes et images dans le configurateur. Pour l’impression, décrivez le format, le papier, la quantité et joignez votre fichier si vous en avez un.',
  },
  {
    numero: '03',
    titre: 'Vérifier le rendu',
    texte:
      'L’aperçu montre le visuel à la taille réelle de la zone d’impression. Un élément qui dépasse est signalé : ce qui dépasse ne sera pas imprimé.',
  },
  {
    numero: '04',
    titre: 'Valider le prix',
    texte:
      'Le montant du textile est recalculé côté atelier à partir de la grille tarifaire. Pour l’impression et les projets sur mesure, un devis fixe le prix avant production.',
  },
  {
    numero: '05',
    titre: 'Payer ou accepter le devis',
    texte:
      'Paiement MTN Mobile Money pour les produits ouverts à la vente en ligne. Un devis accepté conserve le prix convenu, même si la grille change ensuite.',
  },
  {
    numero: '06',
    titre: 'Produire et livrer',
    texte:
      'Nous imprimons, pressons ou coordonnons le partenaire, puis nous contrôlons avant livraison. Brazzaville et Pointe-Noire sont desservies.',
  },
];

export default function CommentCaMarchePage() {
  return (
    <>
      <section className="border-b border-filet">
        <div className="mx-auto w-full max-w-[90rem] px-4 py-14 sm:px-8 sm:py-20">
          <Etiquette>Comment ça marche</Etiquette>
          <h1 className="titre-editorial mt-5 max-w-3xl text-5xl text-encre sm:text-6xl">
            Un parcours simple, un atelier joignable.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-attenue">
            Vous n’achetez pas un fichier : vous commandez un objet fabriqué. Le parcours est donc
            fait de validations claires, pas de boutons qui promettent plus que la production.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[90rem] px-4 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {ETAPES.map((etape) => (
            <article key={etape.numero} className="border-t border-filet pt-5">
              <p className="font-mono text-xs font-semibold text-orange-action">{etape.numero}</p>
              <h2 className="mt-3 font-display text-2xl text-encre">{etape.titre}</h2>
              <p className="mt-2 text-sm leading-relaxed text-attenue">{etape.texte}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-filet bg-white">
        <div className="mx-auto grid w-full max-w-[90rem] gap-10 px-4 py-16 sm:px-8 sm:py-20 lg:grid-cols-2">
          <div>
            <p className="surtitre text-orange-action">Paiement</p>
            <h2 className="titre-editorial mt-3 text-4xl text-encre">MTN Mobile Money, côté serveur.</h2>
            <p className="mt-4 text-sm leading-relaxed text-attenue">
              Le montant est toujours recalculé par le serveur à partir de la grille tarifaire :
              le navigateur ne décide jamais du prix. La confirmation vient de MTN, jamais d’un
              simple retour de page.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                'Demande envoyée sur le téléphone du client',
                'Validation dans les 5 minutes',
                'Aucun second débit pour une commande déjà payée',
                'Paiement en ligne ouvert uniquement sur les prix validés',
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-attenue">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="surtitre text-orange-action">Livraison</p>
            <h2 className="titre-editorial mt-3 text-4xl text-encre">Brazzaville & Pointe-Noire.</h2>
            <p className="mt-4 text-sm leading-relaxed text-attenue">
              Les frais et le délai sont annoncés avant validation. Le délai dépend de la
              quantité et du support ; il ne dépasse pas trois jours pour le textile et les
              tableaux, hors cas particulier signalé dans le devis.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                'Retrait à l’atelier sur rendez-vous',
                'Livraison à Brazzaville',
                'Livraison à Pointe-Noire',
                'Remise convenue pour les commandes d’entreprise',
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-attenue">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[90rem] px-4 py-16 sm:px-8 sm:py-20">
        <h2 className="titre-editorial text-4xl text-encre">Questions fréquentes</h2>
        <div className="mt-8 divide-y divide-filet border-y border-filet">
          {[
            {
              q: 'Puis-je commander sur WhatsApp ?',
              r: `Oui. Écrivez-nous au ${WHATSAPP.affichage} avec votre idée, votre photo ou votre texte : nous préparons la maquette avec vous, confirmons le prix en FCFA et le délai, puis vous payez par MTN MoMo.`,
            },
            {
              q: 'Puis-je commander sans créer de compte ?',
              r: 'Oui. Le parcours actuel ne demande pas de compte : nous avons besoin de votre nom, de votre contact et de l’adresse de livraison au moment de la commande.',
            },
            {
              q: 'Le rendu à l’écran est-il exact ?',
              r: 'L’aperçu est fidèle en position et en proportions, mais les couleurs peuvent varier légèrement entre l’écran, le textile et le papier. Pour les séries, un BAT peut être validé avant production.',
            },
            {
              q: 'Que se passe-t-il si mon fichier est de mauvaise qualité ?',
              r: 'Nous le signalons avant impression. Une photo trop petite peut rester acceptable sur un petit format et devenir floue sur un grand : le configurateur indique la limite.',
            },
            {
              q: 'Puis-je payer autrement que par MTN MoMo ?',
              r: 'Le paiement en ligne est MTN MoMo. Pour les entreprises et les commandes sur devis, les modalités sont précisées dans la proposition. Airtel Money arrive bientôt.',
            },
            {
              q: 'Les prix affichés sont-ils définitifs ?',
              r: 'Les prix en cours de validation sont affichés « sur demande ». Nous ne facturons jamais un tarif de test comme un prix commercial.',
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
            <h2 className="titre-editorial text-4xl text-creme">Une question avant de commander ?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-creme/70">
              Écrivez-nous : nous répondons avec un prix, un délai et la prochaine étape.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <BoutonWhatsApp variante="clair">Écrire sur WhatsApp</BoutonWhatsApp>
            <BoutonLien
              href="/contact"
              variante="secondaire"
              className="border-creme/40 text-creme hover:bg-creme hover:text-encre"
            >
              Autres contacts
              <ArrowRight className="h-4 w-4" />
            </BoutonLien>
          </div>
        </div>
      </section>
    </>
  );
}
