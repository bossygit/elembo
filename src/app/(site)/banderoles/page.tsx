import type { Metadata } from 'next';
import Link from 'next/link';

import ApercuBanderole from '@/components/grand-format/ApercuBanderole';
import { ArrowRight, ArrowUpRight, Check } from '@/components/site/Icons';
import { BoutonLien, Etiquette, Surtitre } from '@/components/site/ui';
import { devisConfigure } from '@/lib/devis/configuration';
import { FINITIONS, PRESTATIONS, USAGES, formatDimensions } from '@/lib/grand-format/catalogue';
import { MODELES, modeleParId, modelePrincipal } from '@/lib/grand-format/modeles';
import { lienWhatsApp } from '@/lib/site/marque';

export const metadata: Metadata = {
  title: 'Banderoles & supports grand format',
  description:
    'Banderoles de deuil, d’église, d’événement, publicitaires et institutionnelles, roll-ups et bâches à Brazzaville. Création graphique, impression par nos partenaires, devis rapide.',
};

const ETAPES = [
  { titre: 'Choisissez', texte: 'L’occasion, le format et la finition. Les dimensions sont libres, au centimètre près.' },
  { titre: 'Envoyez vos éléments', texte: 'Votre fichier, ou vos photos, logos et textes : notre studio compose le visuel.' },
  { titre: 'Validez le devis', texte: 'Smart Vision confirme le prix, le délai et la maquette. Rien n’est imprimé sans votre accord.' },
  { titre: 'Payez, recevez', texte: 'Paiement MTN Mobile Money à la commande validée, production, contrôle qualité, livraison.' },
];

const FICHIER = [
  'PDF ou image haute résolution, aux proportions de la banderole',
  '100 à 150 dpi à la taille réelle suffisent pour un grand format',
  'Gardez 5 cm de marge sans texte sur les bords (œillets, ourlets)',
  'Textes vectorisés et couleurs en CMJN si possible',
];

const FAQ = [
  {
    q: 'Pourquoi un devis plutôt qu’un prix immédiat ?',
    r: 'Le prix d’une banderole dépend de la surface, de la matière, des finitions, de la création graphique et du délai. Lorsque Smart Vision a validé ses tarifs pour un support, une estimation s’affiche pendant votre commande ; sinon vous recevez un devis précis, gratuit et sans engagement.',
  },
  {
    q: 'Pouvez-vous produire en urgence, pour un deuil par exemple ?',
    r: 'Oui, nous traitons les demandes urgentes en priorité, en particulier pour les deuils. Choisissez « Urgent » : nous vérifions immédiatement la faisabilité avec l’imprimeur et vous confirmons le délai réel avant de lancer la production.',
  },
  {
    q: 'Qui imprime ma banderole ?',
    r: 'Smart Vision travaille avec des imprimeurs grand format partenaires de Brazzaville, sélectionnés pour leur qualité. Nous restons votre unique interlocuteur : création, contrôle du fichier, suivi de production, contrôle qualité et livraison.',
  },
  {
    q: 'Comment se passe le paiement ?',
    r: 'Une fois le devis accepté, la commande est créée et vous payez par MTN Mobile Money. Aucun paiement n’est demandé au moment de la demande.',
  },
  {
    q: 'Mes photos et fichiers sont-ils protégés ?',
    r: 'Oui. Vos fichiers sont déposés dans un espace de stockage privé, accessible uniquement à l’équipe qui traite votre demande. Ils ne sont jamais publiés.',
  },
];

function lienCommande(params: Record<string, string>): string {
  return `/banderoles/commander?${new URLSearchParams(params).toString()}`;
}

export default function PageBanderoles() {
  const vedette = modeleParId('croisade')!;
  const hommage = modeleParId('hommage-papa')!;
  const mariage = modeleParId('mariage')!;
  const lienDevis = devisConfigure ? lienCommande({ prestation: 'ACCOMPAGNEMENT' }) : '/contact';

  return (
    <>
      {/* ---------------------------------------------------------------- hero ---- */}
      <section className="relative overflow-hidden border-b border-filet">
        <div className="mx-auto grid w-full max-w-[90rem] gap-10 px-4 py-12 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <div>
            <Etiquette>Banderoles & grand format</Etiquette>
            <h1 className="titre-editorial mt-5 max-w-2xl text-5xl text-encre sm:text-6xl lg:text-7xl">
              Votre message, <span className="font-accent font-normal italic text-orange-action">en grand.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-attenue">
              Hommages, croisades, mariages, ouvertures de boutique, campagnes de sensibilisation : des
              banderoles soignées, conçues à Brazzaville et livrées à temps. Avec ou sans création graphique.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <BoutonLien href="/banderoles/commander" variante="accent">
                Commander une banderole
                <ArrowRight className="h-4 w-4" />
              </BoutonLien>
              <BoutonLien href={lienDevis} variante="secondaire">
                Demander un devis
              </BoutonLien>
            </div>
            <ul className="mt-8 grid max-w-xl gap-2.5 text-sm text-attenue sm:grid-cols-2">
              {['Dimensions libres, au centimètre', 'Création graphique sur demande', 'Maquette validée avant impression', 'Paiement MTN Mobile Money'].map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <ApercuBanderole modele={vedette} scene cadre={2} className="w-full rounded-[2rem] border border-encre/10" />
            <div className="mt-4 grid grid-cols-2 gap-4">
              <ApercuBanderole modele={hommage} cadre={3 / 1.25} className="w-full rounded-2xl bg-sable" />
              <ApercuBanderole modele={mariage} cadre={3 / 1.25} className="w-full rounded-2xl bg-sable" />
            </div>
            <p className="mt-3 text-right text-xs text-attenue">Modèles d’inspiration — noms et lieux fictifs.</p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- catégories ---- */}
      <section id="categories" className="mx-auto w-full max-w-[90rem] px-4 py-16 sm:px-8 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Surtitre numero="01">Pour chaque moment</Surtitre>
            <h2 className="titre-editorial mt-3 text-4xl text-encre sm:text-5xl">Choisissez votre occasion.</h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-attenue">
            Chaque usage a ses codes : la sobriété d’un hommage, l’éclat d’une croisade, la lisibilité
            d’une promotion. Nous les connaissons.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {USAGES.map((usage) => {
            const modele = modelePrincipal(usage.id);
            return (
              <article key={usage.id} id={usage.slug} className="group flex flex-col border border-filet bg-white">
                <Link href={lienCommande({ usage: usage.slug })} className="block bg-sable p-4" tabIndex={-1} aria-hidden>
                  <ApercuBanderole modele={modele} cadre={16 / 9} finition="OEILLETS" className="w-full transition-transform duration-500 ease-sortie group-hover:scale-[1.02]" />
                </Link>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-display text-2xl text-encre">{usage.titre}</h3>
                  <p className="mt-1 text-sm font-medium text-orange-action">{usage.accroche}</p>
                  <p className="mt-3 text-sm leading-relaxed text-attenue">{usage.description}</p>
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {usage.occasions.map((o) => (
                      <li key={o} className="rounded-full border border-filet px-2.5 py-1 text-xs text-attenue">
                        {o}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-6">
                    <BoutonLien href={lienCommande({ usage: usage.slug })} variante="primaire" className="w-full">
                      {usage.id === 'AUTRE' ? 'Commander un support' : 'Commander'}
                      <ArrowRight className="h-4 w-4" />
                    </BoutonLien>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------ modèles ---- */}
      <section id="modeles" className="border-y border-filet bg-encre text-creme">
        <div className="mx-auto w-full max-w-[90rem] px-4 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Surtitre numero="02" sombre>
                Modèles d’inspiration
              </Surtitre>
              <h2 className="titre-editorial mt-3 text-4xl sm:text-5xl">Partez d’un modèle.</h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-creme/70">
              Choisissez une composition : notre studio la réinvente avec vos noms, vos photos, vos dates et vos couleurs.
            </p>
          </div>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {MODELES.map((m) => {
              const usage = USAGES.find((u) => u.id === m.usage)!;
              return (
                <li key={m.id} className="group flex flex-col rounded-2xl bg-creme/[0.04] p-4 ring-1 ring-creme/10">
                  <ApercuBanderole modele={m} cadre={16 / 9} className="w-full rounded-xl bg-creme/[0.06]" />
                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3 px-1">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-creme/50">{usage.titre}</p>
                      <p className="mt-1 font-semibold">{m.nom}</p>
                      <p className="text-xs text-creme/60">{formatDimensions(m.format.largeurM, m.format.hauteurM)}</p>
                    </div>
                    <Link
                      href={lienCommande({ usage: usage.slug, modele: m.id, prestation: 'CREATION' })}
                      className="inline-flex items-center gap-1.5 rounded-full bg-creme px-4 py-2 text-sm font-semibold text-encre transition-colors hover:bg-orange"
                    >
                      Personnaliser
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------- parcours ---- */}
      <section className="mx-auto w-full max-w-[90rem] px-4 py-16 sm:px-8 sm:py-20">
        <Surtitre numero="03">Comment ça marche</Surtitre>
        <h2 className="titre-editorial mt-3 text-4xl text-encre sm:text-5xl">Quatre étapes, un seul interlocuteur.</h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ETAPES.map((e, i) => (
            <li key={e.titre} className="border-t-2 border-encre pt-5">
              <span className="font-mono text-sm text-orange-action">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-2 font-display text-2xl text-encre">{e.titre}</h3>
              <p className="mt-2 text-sm leading-relaxed text-attenue">{e.texte}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ----------------------------------------------------------- prestations ---- */}
      <section className="border-y border-filet bg-white">
        <div className="mx-auto w-full max-w-[90rem] px-4 py-16 sm:px-8 sm:py-20">
          <Surtitre numero="04">Avec ou sans visuel</Surtitre>
          <h2 className="titre-editorial mt-3 text-4xl text-encre sm:text-5xl">Trois façons de commander.</h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PRESTATIONS.map((p, i) => (
              <article key={p.id} className={`flex flex-col p-6 sm:p-8 ${i === 1 ? 'bg-encre text-creme' : 'border border-filet bg-creme'}`}>
                <p className={`surtitre ${i === 1 ? 'text-orange' : 'text-orange-action'}`}>{['Fichier prêt', 'Création graphique', 'Accompagnement'][i]}</p>
                <h3 className="mt-3 font-display text-3xl">{p.nom}</h3>
                <p className={`mt-3 text-sm leading-relaxed ${i === 1 ? 'text-creme/75' : 'text-attenue'}`}>{p.description}</p>
                <p className={`mt-2 text-xs ${i === 1 ? 'text-creme/60' : 'text-attenue'}`}>{p.aide}</p>
                <div className="mt-auto pt-6">
                  <BoutonLien
                    href={p.id === 'ACCOMPAGNEMENT' ? lienDevis : lienCommande({ prestation: p.id })}
                    variante={i === 1 ? 'accent' : 'secondaire'}
                    className="w-full"
                  >
                    {['Commander une banderole', 'Personnaliser mon visuel', 'Demander un devis'][i]}
                  </BoutonLien>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- finitions et fichier ---- */}
      <section className="mx-auto grid w-full max-w-[90rem] gap-10 px-4 py-16 sm:px-8 sm:py-20 lg:grid-cols-2">
        <div>
          <Surtitre numero="05">Finitions</Surtitre>
          <h2 className="titre-editorial mt-3 text-4xl text-encre">Bien accrochée, longtemps.</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {FINITIONS.filter((f) => f.id !== 'AUTRE' && f.id !== 'SANS').map((f) => (
              <li key={f.id} className="border border-filet bg-white p-4">
                <ApercuBanderole modele={modeleParId('ouverture')!} finition={f.id} cadre={4 / 1.6} className="w-full bg-sable" label={`Finition ${f.nom}`} />
                <p className="mt-3 font-semibold text-encre">{f.nom}</p>
                <p className="mt-1 text-xs leading-relaxed text-attenue">{f.description}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="border border-encre bg-sable p-6 sm:p-8 lg:self-start">
          <p className="surtitre text-orange-action">Vous avez votre fichier ?</p>
          <h3 className="mt-3 font-display text-3xl text-encre">Prêt à imprimer en grand.</h3>
          <ul className="mt-6 space-y-2.5">
            {FICHIER.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-attenue">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs leading-relaxed text-attenue">
            Chaque fichier est contrôlé avant impression. S’il doit être corrigé, nous vous le disons — ou nous le reprenons pour vous.
          </p>
          <BoutonLien href={lienCommande({ prestation: 'FICHIER_PRET' })} variante="primaire" className="mt-6">
            Envoyer mon fichier
            <ArrowRight className="h-4 w-4" />
          </BoutonLien>
        </div>
      </section>

      {/* ------------------------------------------------------------------ FAQ ---- */}
      <section className="border-t border-filet bg-white">
        <div className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-8 sm:py-20">
          <h2 className="titre-editorial text-4xl text-encre">Questions fréquentes</h2>
          <div className="mt-8 divide-y divide-filet border-y border-filet">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-encre">
                  {f.q}
                  <span aria-hidden className="text-xl text-orange-action transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-attenue">{f.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- appel final ---- */}
      <section className="bg-orange">
        <div className="mx-auto flex w-full max-w-[90rem] flex-col items-start justify-between gap-6 px-4 py-12 sm:px-8 md:flex-row md:items-center">
          <div>
            <h2 className="titre-editorial text-4xl text-encre sm:text-5xl">Une échéance approche ?</h2>
            <p className="mt-2 max-w-xl text-encre/80">Décrivez votre banderole en deux minutes. Nous revenons vers vous rapidement.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <BoutonLien href="/banderoles/commander" variante="primaire">
              Commander une banderole
              <ArrowRight className="h-4 w-4" />
            </BoutonLien>
            <a
              href={lienWhatsApp('Bonjour Elembo, je souhaite commander une banderole.')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-encre px-6 py-3.5 text-sm font-semibold text-encre transition-colors hover:bg-encre hover:text-creme"
            >
              Écrire sur WhatsApp
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
