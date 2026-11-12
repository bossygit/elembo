import Image from 'next/image';
import Link from 'next/link';

import type { ProduitVitrine } from '../../lib/commerce/catalogue';
import { asset } from '../../lib/site/asset';
import PrintIllustration from './PrintIllustration';
import { ArrowUpRight, Chat } from './Icons';

/**
 * Carte produit : toute la carte est cliquable (confort tactile), l'image respire,
 * le prix et l'action restent lisibles sans survol.
 */
export default function ProductCard({ produit }: { produit: ProduitVitrine }) {
  const contain = produit.image?.cadrage === 'contain';
  // Les produits « commande assistée » pointent vers WhatsApp, hors du site.
  const externe = /^https?:\/\//.test(produit.href);

  const contenu = (
    <>
      <div className={`relative overflow-hidden ${contain ? 'bg-white' : 'bg-sable'}`}>
        {produit.badge && (
          <span className="surtitre absolute left-3 top-3 z-10 bg-encre px-2.5 py-1.5 text-creme">{produit.badge}</span>
        )}
        <div className="aspect-square w-full">
          {produit.image ? (
            <Image
              src={asset(produit.image.src)}
              alt={produit.image.alt}
              width={1000}
              height={1250}
              // Les sources sont en paysage, recadrées au carré : on demande plus large que la carte.
              sizes="(min-width: 1024px) 50vw, (min-width: 640px) 75vw, 150vw"
              className={`h-full w-full ${contain ? 'object-contain' : 'object-cover'} transition-transform duration-[900ms] ease-sortie group-hover:scale-[1.06]`}
            />
          ) : (
            <div className="h-full w-full p-8">
              <PrintIllustration />
            </div>
          )}
        </div>
        {/* Pastille d'action : glisse depuis le coin au survol, toujours visible au tactile. */}
        <span className="absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-full bg-creme text-encre transition-[background-color,transform] duration-300 ease-sortie group-hover:scale-110 group-hover:bg-orange">
          {externe ? <Chat className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5 transition-transform duration-300 ease-sortie group-hover:rotate-45" />}
        </span>
      </div>

      <div className="flex flex-1 flex-col pt-4">
        <p className="surtitre text-orange-action">{produit.surtitre}</p>
        <h3 className="mt-2 font-display text-[1.4rem] leading-[1.08] text-encre">{produit.nom}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-attenue">{produit.description}</p>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-encre/15 pt-3 [margin-block-start:1rem]">
          <div>
            <p className="text-base font-semibold text-encre">{produit.prix.libelle}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-attenue">{produit.prix.note}</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4">
            {produit.cta}
          </span>
        </div>
      </div>
    </>
  );

  const classe = 'group flex h-full flex-col';
  return (
    <article data-anim="monte" className="h-full">
      {externe ? (
        <a
          href={produit.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${produit.nom} — ${produit.cta} (s’ouvre dans WhatsApp)`}
          className={classe}
        >
          {contenu}
        </a>
      ) : (
        <Link href={produit.href} aria-label={`${produit.nom} — ${produit.cta}`} className={classe}>
          {contenu}
        </Link>
      )}
    </article>
  );
}
