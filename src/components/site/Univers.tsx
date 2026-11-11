import Image from 'next/image';
import Link from 'next/link';

import { GAMMES, type Gamme } from '@/lib/commerce/catalogue';
import { nombreTextesAValider, type Collection, type KitEvenement, type Univers } from '@/lib/commerce/univers';
import { asset } from '@/lib/site/asset';
import { MESSAGES_WHATSAPP } from '@/lib/site/marque';

import AfficheCollection from './AfficheCollection';
import { ArrowUpRight, Check } from './Icons';
import { LienWhatsApp } from './WhatsApp';

const LIBELLE_GAMME: Record<Gamme, string> = Object.fromEntries(GAMMES.map((g) => [g.id, g.titre])) as Record<
  Gamme,
  string
>;

/** Carte d'un univers : une image pleine, un cartouche qui s'allume au survol. */
export function CarteUnivers({
  univers,
  compacte = false,
  className = 'aspect-[4/5]',
}: {
  univers: Univers;
  compacte?: boolean;
  /** Proportions et placement dans la grille. */
  className?: string;
}) {
  return (
    <Link
      href={`/univers/${univers.id}`}
      data-anim="monte"
      className={`group relative block overflow-hidden bg-encre ${className}`}
    >
      <Image
        src={asset(univers.image.src)}
        alt=""
        width={1000}
        height={1300}
        sizes="(min-width: 1024px) 50vw, (min-width: 640px) 75vw, 150vw"
        className="h-full w-full object-cover transition-transform duration-[900ms] ease-sortie group-hover:scale-[1.07]"
      />
      <span className="absolute left-3 top-3 bg-creme px-2 py-1 font-mono text-[11px] font-semibold text-encre">
        {univers.numero}
      </span>
      <span className="absolute inset-x-3 bottom-3 block bg-creme p-4 transition-colors duration-300 group-hover:bg-orange">
        <span className="flex items-start justify-between gap-3">
          <span className="font-display text-xl leading-[1.05] text-encre sm:text-2xl">{univers.titre}</span>
          <ArrowUpRight className="mt-0.5 h-5 w-5 shrink-0 text-encre transition-transform duration-300 ease-sortie group-hover:rotate-45" />
        </span>
        <span className="mt-2 block text-sm leading-snug text-encre/75">{univers.accroche}</span>
        {!compacte && (
          <span className="mt-3 block text-xs leading-relaxed text-encre/60">
            {univers.occasions.slice(0, 3).join(' · ')}
          </span>
        )}
      </span>
    </Link>
  );
}

/** Une collection, en détail : son affiche, puis ce qu'elle contiendra. */
export function CarteCollection({ collection }: { collection: Collection }) {
  const enAttente = nombreTextesAValider(collection);
  const languesEnAttente = [...new Set(collection.textes.filter((t) => t.aValider).map((t) => t.langue))];

  return (
    <div data-anim="monte" className="flex flex-col">
      <AfficheCollection collection={collection} />
      <p className="mt-4 text-sm leading-relaxed text-attenue">{collection.description}</p>
      {enAttente > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-attenue">
          Les textes en {languesEnAttente.join(' et ')} sont écrits avec des locuteurs natifs,
          pour que chaque mot sonne juste.
        </p>
      )}
      <p className="mt-2 text-xs text-attenue">Sur : {collection.supports.join(' · ')}</p>
      <div className="mt-3">
        <LienWhatsApp message={MESSAGES_WHATSAPP.collection(collection.titre)} className="text-sm">
          Être prévenu·e du lancement
        </LienWhatsApp>
      </div>
    </div>
  );
}

export function CarteKit({ kit }: { kit: KitEvenement }) {
  return (
    <article
      data-anim="monte"
      className="group flex h-full flex-col border border-encre/15 bg-creme p-6 transition-colors duration-300 hover:border-encre"
    >
      <p className="surtitre text-orange-action">Gamme {LIBELLE_GAMME[kit.gamme]}</p>
      <h3 className="mt-3 font-display text-2xl leading-tight text-encre">{kit.titre}</h3>
      <p className="mt-2 text-sm leading-relaxed text-attenue">{kit.description}</p>
      <ul className="mt-4 space-y-2">
        {kit.contenu.map((element) => (
          <li key={element} className="flex items-start gap-2 text-sm leading-snug text-encre/80">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
            <span>{element}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-6">
        <LienWhatsApp message={MESSAGES_WHATSAPP.kit(kit.titre)} className="text-sm">
          Demander ce kit
        </LienWhatsApp>
      </div>
    </article>
  );
}

/** Les trois gammes et les principes d'accessibilité (prix, paiement, commande). */
export function SectionGammes() {
  return (
    <div>
      <div className="grid gap-px overflow-hidden border border-encre/15 bg-encre/15 md:grid-cols-3">
        {GAMMES.map((gamme, index) => (
          <article key={gamme.id} data-anim="monte" className="bg-creme p-6">
            <p className="titre-geant text-5xl text-orange">0{index + 1}</p>
            <h3 className="mt-4 font-display text-2xl text-encre">{gamme.titre}</h3>
            <p className="mt-2 text-sm leading-relaxed text-attenue">{gamme.description}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-encre/60">
              {gamme.exemples.join(' · ')}
            </p>
          </article>
        ))}
      </div>
      <ul data-anim="monte" className="mt-8 flex flex-wrap gap-2">
        {[
          'Prix affichés en FCFA',
          'Commande depuis le téléphone',
          'Paiement MTN Mobile Money',
          'Commande assistée sur WhatsApp',
          'Dès une pièce pour les T-shirts et les cadeaux',
          'Livraison à Brazzaville et Pointe-Noire',
        ].map((principe) => (
          <li
            key={principe}
            className="inline-flex items-center gap-2 rounded-full border border-encre/15 px-3.5 py-2 text-sm text-encre"
          >
            <Check className="h-4 w-4 shrink-0 text-orange-action" />
            {principe}
          </li>
        ))}
      </ul>
    </div>
  );
}
