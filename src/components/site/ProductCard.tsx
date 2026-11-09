import Image from 'next/image';
import Link from 'next/link';

import type { ProduitVitrine } from '../../lib/commerce/catalogue';
import { asset } from '../../lib/site/asset';
import PrintIllustration from './PrintIllustration';
import { ArrowRight, Check } from './Icons';

export default function ProductCard({ produit }: { produit: ProduitVitrine }) {
  return (
    <article className="group flex h-full flex-col border border-filet bg-white transition-colors duration-200 hover:border-encre">
      <div className="relative overflow-hidden border-b border-filet bg-[#F3EFE6]">
        {produit.badge && (
          <span className="absolute left-3 top-3 z-10 bg-encre px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-creme">
            {produit.badge}
          </span>
        )}
        <div className="aspect-[4/5] w-full">
          {produit.image ? (
            <Image
              src={asset(produit.image.src)}
              alt={produit.image.alt}
              width={1600}
              height={1067}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
              className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="h-full w-full p-5">
              <PrintIllustration />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-action">
          {produit.surtitre}
        </p>
        <h3 className="mt-2 font-display text-2xl leading-tight text-encre">{produit.nom}</h3>
        <p className="mt-3 text-sm leading-relaxed text-attenue">{produit.description}</p>

        <ul className="mt-4 space-y-1.5">
          {produit.points.map((point) => (
            <li key={point} className="flex items-start gap-2 text-xs leading-snug text-attenue">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-action" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-6">
          <p className="text-base font-semibold text-encre">{produit.prix.libelle}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-attenue">{produit.prix.note}</p>
          <Link
            href={produit.href}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4 transition-colors hover:text-orange-action"
          >
            {produit.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
