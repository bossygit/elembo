import Link from 'next/link';

import { ArrowUpRight, Plus } from '@/components/site/Icons';
import { baseBouton, stylesBouton, Surtitre } from '@/components/site/ui';

/**
 * « Les créations de la communauté » : l'espace éditorial est PRÊT mais VIDE.
 * Aucune création, aucun artiste, aucun témoignage n'est inventé : les cases sont des
 * emplacements réservés, clairement identifiés, en attendant les premières publications.
 */
const EMPLACEMENTS = [
  { classe: 'bg-cobalt text-creme sm:col-span-2 sm:row-span-2', libelle: 'Ta création ici', note: 'Illustration' },
  { classe: 'bg-sable text-encre', libelle: 'Emplacement réservé', note: 'Photographie' },
  { classe: 'bg-citron text-encre', libelle: 'Emplacement réservé', note: 'Typographie' },
  { classe: 'bg-fuchsia text-encre', libelle: 'Emplacement réservé', note: 'Streetwear' },
  { classe: 'bg-encre text-creme', libelle: 'Emplacement réservé', note: 'Cadeau' },
];

export default function Communaute() {
  return (
    <section className="mx-auto w-full max-w-[90rem] px-4 py-20 sm:px-8 sm:py-28">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4">
          <Surtitre numero="04">Bientôt ici</Surtitre>
          <h2 data-anim="titre" className="titre-editorial mt-5 text-5xl text-encre sm:text-6xl">
            Les créations de <span className="accent-serif text-orange">la communauté.</span>
          </h2>
          <p data-anim="monte" className="mt-6 text-base leading-relaxed text-attenue">
            Cet espace mettra en avant les créations des artistes et des clients d’Elembo,
            publiées avec leur accord. Il est encore vide : la première pourrait être la tienne.
          </p>
          <div data-anim="monte" className="mt-8 flex flex-wrap gap-3">
            <Link href="/personnalisation" className={`${baseBouton} ${stylesBouton.primaire}`}>
              Créer la première
              <ArrowUpRight className="h-4 w-4 transition-transform duration-300 ease-sortie group-hover/bouton:rotate-45" />
            </Link>
            <Link href="/createurs" className={`${baseBouton} ${stylesBouton.secondaire}`}>
              Je suis créateur
            </Link>
          </div>
        </div>

        <div className="lg:col-span-8">
        <ul className="grid auto-rows-[9.5rem] grid-cols-2 gap-3 sm:auto-rows-[11rem] sm:grid-cols-4">
          {EMPLACEMENTS.map((emplacement, index) => (
            <li
              key={index}
              data-anim="monte"
              className={`group relative flex flex-col justify-between overflow-hidden p-4 ${emplacement.classe}`}
            >
              <span className="surtitre opacity-70">{emplacement.note}</span>
              <Plus className="absolute right-4 top-4 h-5 w-5 opacity-60 transition-transform duration-500 ease-sortie group-hover:rotate-90" />
              <span className={index === 0 ? 'titre-editorial text-4xl sm:text-5xl' : 'font-display text-lg leading-tight'}>
                {emplacement.libelle}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-attenue">
          Emplacements de démonstration — aucune création n’est encore publiée.
        </p>
        </div>
      </div>
    </section>
  );
}
