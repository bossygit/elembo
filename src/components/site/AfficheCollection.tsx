import Link from 'next/link';

import type { Collection } from '@/lib/commerce/univers';
import { nombreTextesAValider, textesPublics } from '@/lib/commerce/univers';

import { ArrowUpRight } from './Icons';

/**
 * Affiche typographique d'une collection : un aplat vif, un grand mot, un titre.
 * Les collections sont en préparation — l'affiche le dit et renvoie vers ce qui existe déjà.
 */
export default function AfficheCollection({ collection, className = '' }: { collection: Collection; className?: string }) {
  const { theme } = collection;
  const extrait = textesPublics(collection)[0];
  const enEcriture = nombreTextesAValider(collection) > 0;

  return (
    <article
      id={`collection-${collection.id}`}
      className={`@container group relative flex aspect-[4/5] flex-col justify-between overflow-hidden p-5 sm:p-6 ${theme.fond} ${theme.texte} ${className}`}
    >
      <header className="relative z-10 flex items-start justify-between gap-3">
        <p className="surtitre">
          <span className="font-mono tracking-normal">{collection.numero}</span> · {collection.registre}
        </p>
        <span className="surtitre shrink-0 rounded-full border border-current px-2.5 py-1">Bientôt</span>
      </header>

      {/* Le grand mot : il déborde volontairement, et glisse au survol. */}
      <p
        aria-hidden
        className={`titre-geant pointer-events-none absolute -left-[3cqw] top-1/2 -translate-y-[58%] whitespace-nowrap text-[46cqw] transition-transform duration-[900ms] ease-sortie group-hover:-translate-x-[6cqw] ${theme.accent}`}
      >
        {collection.motif}
      </p>

      <div className="relative z-10">
        <h3 className="titre-editorial text-[9.5cqw] leading-[0.95]">{collection.titre}</h3>
        <p className="accent-serif mt-2 text-[6cqw] leading-tight">{collection.accroche}</p>
        {extrait && <p className="mt-3 text-xs opacity-80">Extrait : « {extrait.texte} »</p>}
        {enEcriture && !extrait && (
          <p className="mt-3 text-xs opacity-80">Textes en cours d’écriture avec des locuteurs natifs.</p>
        )}
        <Link
          href={collection.lien.href}
          className="mt-5 inline-flex items-center gap-2 border-b-2 border-current pb-1 text-sm font-semibold"
        >
          {collection.lien.libelle}
          <span className="sr-only"> — collection {collection.titre}</span>
          <ArrowUpRight className="h-4 w-4 transition-transform duration-300 ease-sortie group-hover:rotate-45" />
        </Link>
      </div>
    </article>
  );
}
