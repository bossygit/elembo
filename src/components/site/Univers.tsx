import Image from 'next/image';
import Link from 'next/link';

import { GAMMES, type Gamme } from '@/lib/commerce/catalogue';
import {
  nombreTextesAValider,
  textesPublics,
  type Collection,
  type KitEvenement,
  type Univers,
} from '@/lib/commerce/univers';
import { asset } from '@/lib/site/asset';
import { MESSAGES_WHATSAPP } from '@/lib/site/marque';

import { ArrowRight, Check } from './Icons';
import { LienWhatsApp } from './WhatsApp';

const LIBELLE_GAMME: Record<Gamme, string> = Object.fromEntries(GAMMES.map((g) => [g.id, g.titre])) as Record<
  Gamme,
  string
>;

export function CarteUnivers({ univers, compacte = false }: { univers: Univers; compacte?: boolean }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-filet bg-white shadow-sm transition-shadow hover:shadow-lg">
      <Link href={`/univers/${univers.id}`} className="block overflow-hidden" tabIndex={-1} aria-hidden>
        <div className="relative aspect-[4/3] overflow-hidden bg-[#F3EFE6]">
          <Image
            src={asset(univers.image.src)}
            alt=""
            width={1600}
            height={1067}
            sizes="(min-width: 1024px) 20vw, (min-width: 640px) 50vw, 100vw"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <span className="absolute left-3 top-3 bg-creme/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-encre">
            {univers.numero}
          </span>
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-2xl leading-tight text-encre">{univers.titre}</h3>
        <p className="mt-2 text-sm leading-relaxed text-attenue">{univers.accroche}</p>
        {!compacte && (
          <ul className="mt-4 space-y-1.5">
            {univers.occasions.slice(0, 3).map((occasion) => (
              <li key={occasion} className="flex items-start gap-2 text-xs leading-snug text-attenue">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-action" />
                <span>{occasion}</span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/univers/${univers.id}`}
          className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4 hover:text-orange-action"
        >
          Explorer l’univers
          <span className="sr-only"> {univers.titre}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export function CarteCollection({ collection }: { collection: Collection }) {
  const visibles = textesPublics(collection);
  const enAttente = nombreTextesAValider(collection);
  const languesEnAttente = [...new Set(collection.textes.filter((t) => t.aValider).map((t) => t.langue))];

  return (
    <article className="flex h-full flex-col border border-encre bg-creme p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-action">
          {collection.registre}
        </span>
        {enAttente > 0 && (
          <span className="rounded-full bg-encre px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-creme">
            Bientôt
          </span>
        )}
      </div>
      <h3 className="mt-3 font-display text-3xl leading-tight text-encre">{collection.titre}</h3>
      <p className="mt-3 text-sm leading-relaxed text-attenue">{collection.description}</p>

      {visibles.length > 0 && (
        <ul className="mt-5 space-y-2">
          {visibles.map((t) => (
            <li key={t.texte} className="border-l-2 border-orange pl-3">
              <p className="font-display text-lg leading-snug text-encre">« {t.texte} »</p>
              {t.traduction && <p className="text-xs text-attenue">{t.traduction}</p>}
            </li>
          ))}
        </ul>
      )}

      {enAttente > 0 && (
        <p className="mt-5 text-xs leading-relaxed text-attenue">
          Les textes en {languesEnAttente.join(' et ')} sont en cours d’écriture avec des locuteurs
          natifs, pour que chaque mot sonne juste.
        </p>
      )}

      <p className="mt-5 text-xs text-attenue">Sur : {collection.supports.join(' · ')}</p>
      <div className="mt-auto pt-5">
        <LienWhatsApp message={MESSAGES_WHATSAPP.collection(collection.titre)} className="text-sm">
          {enAttente > 0 ? 'Être prévenu·e du lancement' : 'Commander sur WhatsApp'}
        </LienWhatsApp>
      </div>
    </article>
  );
}

export function CarteKit({ kit }: { kit: KitEvenement }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-filet bg-white p-6 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-action">
        Gamme {LIBELLE_GAMME[kit.gamme]}
      </p>
      <h3 className="mt-3 font-display text-2xl leading-tight text-encre">{kit.titre}</h3>
      <p className="mt-2 text-sm leading-relaxed text-attenue">{kit.description}</p>
      <ul className="mt-4 space-y-1.5">
        {kit.contenu.map((element) => (
          <li key={element} className="flex items-start gap-2 text-xs leading-snug text-attenue">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-action" />
            <span>{element}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-5">
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
      <div className="grid gap-5 md:grid-cols-3">
        {GAMMES.map((gamme, index) => (
          <article key={gamme.id} className="border-t-2 border-encre pt-5">
            <p className="font-display text-4xl text-orange">0{index + 1}</p>
            <h3 className="mt-3 text-lg font-semibold text-encre">{gamme.titre}</h3>
            <p className="mt-2 text-sm leading-relaxed text-attenue">{gamme.description}</p>
            <p className="mt-3 text-xs text-attenue">{gamme.exemples.join(' · ')}</p>
          </article>
        ))}
      </div>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          'Prix affichés en FCFA',
          'Commande simple depuis votre téléphone',
          'Paiement MTN Mobile Money',
          'Commande assistée sur WhatsApp',
          'Dès une pièce pour les T-shirts et les cadeaux',
          'Livraison à Brazzaville et Pointe-Noire',
        ].map((principe) => (
          <li key={principe} className="flex items-start gap-2.5 text-sm text-encre">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
            <span>{principe}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
