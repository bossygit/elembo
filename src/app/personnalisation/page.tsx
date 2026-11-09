import type { Metadata } from 'next';
import Link from 'next/link';

import Configurator from '../../components/configurator/Configurator';
import { ArrowRight } from '../../components/site/Icons';
import { Etiquette } from '../../components/site/ui';
import { paiementEnLigneOuvert } from '../../lib/commerce/catalogue';
import { statutPrixProduit } from '../../lib/tarifs/grille';

export const metadata: Metadata = {
  title: 'Personnalisation textile',
  description:
    'Personnalisez un T-shirt en 3D : couleur, texte, logo, face avant et arrière. Aperçu avant commande, fabrication à Brazzaville.',
};

export default function PersonnalisationPage() {
  const paiementOuvert = paiementEnLigneOuvert(statutPrixProduit('tshirt-basic'));

  return (
    <>
      <section className="border-b border-filet">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Etiquette>Personnalisation</Etiquette>
              <h1 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">Composez votre textile.</h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-attenue">
                Choisissez le modèle et la couleur, ajoutez vos textes et vos images, puis
                vérifiez le rendu sur les deux faces. Le fichier de production part vers
                l’atelier après validation.
              </p>
            </div>
            <Link
              href="/comment-ca-marche"
              className="inline-flex items-center gap-2 text-sm font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4 hover:text-orange-action"
            >
              Voir les étapes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {!paiementOuvert && (
            <div className="mt-6 border border-encre bg-[#F3EFE6] px-4 py-3 text-sm text-encre">
              <p className="font-semibold">Le paiement en ligne est en cours d’ouverture.</p>
              <p className="mt-1 text-xs leading-relaxed text-attenue">
                Vous pouvez composer votre textile et générer un aperçu. Le tarif commercial
                n’étant pas encore validé, aucune commande ne sera facturée : demandez un devis
                pour obtenir un prix ferme et un délai engagé.
              </p>
            </div>
          )}
        </div>
      </section>

      <Configurator />
    </>
  );
}
