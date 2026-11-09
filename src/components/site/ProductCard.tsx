import Image from 'next/image';
import Link from 'next/link';

import type { ProduitVitrine } from '../../lib/commerce/catalogue';
import { asset } from '../../lib/site/asset';
import PrintIllustration from './PrintIllustration';
import { ArrowRight, Check } from './Icons';

export default function ProductCard({ produit }: { produit: ProduitVitrine }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden border border-filet bg-white transition-all duration-300 hover:-translate-y-0.5 hover:border-encre hover:shadow-[0_18px_40px_-28px_rgba(32,2,51,0.45)]">
      <div className="relative overflow-hidden border-b border-filet bg-[#F3EFE6]">
        {produit.badge && (
          <span className="absolute left-3 top-3 z-10 bg-encre px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-creme">
            {produit.badge}
          </span>
        )}
        <div className="aspect-[4/3] w-full">
          {produit.image ? (
            <Image
              src={asset(produit.image.src)}
              alt={produit.image.alt}
              width={1600}
              height={1067}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
            />
          ) : (
            <div className="h-full w-full p-6">
              <PrintIllustration />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-action">
          {produit.surtitre}
        </p>
        <h3 className="mt-2 font-display text-[1.45rem] leading-[1.1] text-encre">{produit.nom}</h3>
        <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-attenue">{produit.description}</p>

        <ul className="mt-4 space-y-1.5">
          {produit.points.slice(0, 2).map((point) => (
            <li key={point} className="flex items-start gap-2 text-xs leading-snug text-attenue">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-action" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto border-t border-filet pt-4">
          <p className="text-sm font-semibold text-encre">{produit.prix.libelle}</p>
          <p className="mt-0.5 text-[10px] leading-snug text-attenue">{produit.prix.note}</p>
          <Link
            href={produit.href}
            aria-label={`${produit.cta} — ${produit.nom}`}
            className="mt-4 flex w-full items-center justify-between rounded-full border border-encre px-4 py-2.5 text-xs font-semibold text-encre transition-colors hover:bg-encre hover:text-creme"
          >
            {produit.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
