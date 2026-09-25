import Studio from '../components/Studio';

export default function Home() {
  return (
    <main className="flex-1">
      <section className="border-b border-neutral-200 bg-[#FEFCF6]">
        <div className="mx-auto w-full max-w-5xl px-4 py-16">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#E85F00]">
            Elembo — par Smart Vision Congo
          </p>
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
            Uploadez votre design, voyez-le imprimé.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-neutral-600">
            La plateforme Print-on-Demand locale : t-shirts, casquettes et tableaux
            personnalisés, livrés sous 24h-48h à Brazzaville et Pointe-Noire.
          </p>
        </div>
      </section>

      <Studio />

      <section className="border-t border-neutral-200 bg-neutral-50">
        <div className="mx-auto w-full max-w-5xl px-4 py-10">
          <p className="text-sm text-neutral-500">
            MVP de démonstration — votre design reste dans votre navigateur, rien n'est
            stocké ni envoyé. Les photos de mockups sont des placeholders à remplacer
            par les visuels réels (presse VEVOR).
          </p>
        </div>
      </section>
    </main>
  );
}
