import type { Metadata } from 'next';
import Link from 'next/link';

import Configurator from '../../components/configurator/Configurator';
import { ArrowRight } from '../../components/site/Icons';
import { Etiquette } from '../../components/site/ui';
import { paiementEnLigneOuvert } from '../../lib/commerce/catalogue';
import { statutPrixProduit } from '../../lib/tarifs/grille';

export const metadata: Metadata = {
  title: 'Atelier de personnalisation',
  description:
    'Composez votre T-shirt ou votre mug Elembo en 3D : zones d’impression, couleur, textes et images. Aperçu temps réel, procédé de production réel, fabrication à Brazzaville.',
};

export default function PersonnalisationPage() {
  const paiementOuvert = paiementEnLigneOuvert(statutPrixProduit('tshirt-basic'));

  return (
    <>
      <section className="trame bg-encre text-creme">
        <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden sm:inline-flex"><Etiquette sombre>L’atelier de création</Etiquette></span>
            <h1 className="titre-editorial text-xl text-creme sm:text-3xl">
              Composez <span className="accent-serif text-orange">votre création.</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-creme/65">
            <span><strong className="text-creme">T-shirt</strong> · 5 zones · <strong className="text-creme">Mug</strong> · pourtour</span>
            <span aria-hidden className="hidden text-orange sm:inline">✦</span>
            <span><strong className="text-creme">Aperçu 3D</strong> temps réel</span>
            <span aria-hidden className="hidden text-orange sm:inline">✦</span>
            <span><strong className="text-creme">8 couleurs</strong> + HEX</span>
            <Link
              href="/comment-ca-marche"
              className="inline-flex items-center gap-1.5 font-semibold text-orange underline underline-offset-4 hover:text-creme"
            >
              Les étapes
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {!paiementOuvert && (
            <div className="w-full rounded-xl bg-creme px-4 py-2 text-xs text-encre">
              <p>
                <strong>Le paiement en ligne est en cours d’ouverture.</strong> Vous pouvez
                composer et générer les fichiers de production ; aucune commande ne sera
                facturée à un prix de test.
              </p>
            </div>
          )}
        </div>
      </section>

      <Configurator />
    </>
  );
}
