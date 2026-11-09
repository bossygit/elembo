import Link from 'next/link';

import { ArrowRight } from '../components/site/Icons';

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col justify-center px-4 py-20 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-action">Erreur 404</p>
      <h1 className="titre-editorial mt-4 text-5xl text-encre sm:text-6xl">Cette page n’existe pas.</h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-attenue">
        Le lien a peut-être changé. La boutique, le configurateur et les supports d’impression
        restent accessibles depuis le menu.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/boutique"
          className="inline-flex items-center gap-2 rounded-full bg-encre px-5 py-3 text-sm font-semibold text-creme transition-colors hover:bg-orange hover:text-encre"
        >
          Retour à la boutique
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 rounded-full border border-encre px-5 py-3 text-sm font-semibold text-encre transition-colors hover:bg-encre hover:text-creme"
        >
          Nous contacter
        </Link>
      </div>
    </section>
  );
}
