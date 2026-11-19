import Link from 'next/link';

import { UNIVERS } from '@/lib/commerce/univers';
import { devisConfigure } from '@/lib/devis/configuration';
import { EMAIL_CONTACT, lienWhatsApp, MARQUE, MESSAGES_WHATSAPP, RESEAUX, WHATSAPP } from '@/lib/site/marque';

import Bandeau from './Bandeau';
import { ArrowUpRight, Chat, Mail, Pin } from './Icons';

const univers = UNIVERS.map((u) => ({ href: `/univers/${u.id}`, label: u.titre }));

const creer = [
  { href: '/personnalisation', label: 'Créer mon t-shirt' },
  { href: '/tableau', label: 'Créer mon tableau photo' },
  { href: '/banderoles', label: 'Banderoles & grand format' },
  { href: '/boutique', label: 'Toute la boutique' },
  { href: '/univers#collections', label: 'Les collections' },
  { href: '/createurs', label: 'Créateurs congolais' },
];

const pratique = [
  { href: '/comment-ca-marche', label: 'Comment ça marche' },
  { href: '/devis', label: 'Demander un devis' },
  { href: '/devis/suivi', label: 'Suivre mon devis' },
  { href: '/impression', label: 'Impression graphique' },
  { href: '/entreprises', label: 'Entreprises & organisations' },
  { href: '/contact', label: 'Contact' },
  { href: '/studio', label: 'Studio 2D (outil)' },
];

function Colonne({ titre, liens }: { titre: string; liens: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="surtitre text-creme/50">{titre}</h2>
      <ul className="mt-5 space-y-3">
        {liens.map((lien) => (
          <li key={lien.href}>
            <Link href={lien.href} className="text-sm text-creme/80 transition-colors hover:text-orange">
              {lien.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  const liensPratiques = devisConfigure ? pratique : pratique.filter((lien) => !lien.href.startsWith('/devis'));

  return (
    <footer className="trame relative overflow-hidden bg-encre text-creme">
      <Bandeau
        className="border-b border-creme/10 py-4 font-accent text-2xl italic text-creme/85 sm:text-3xl"
        elements={['Nos histoires', 'Notre culture', 'Notre identité', 'Brazzaville', 'Pointe-Noire', 'Créé au Congo']}
        duree={46}
      />

      <div className="mx-auto w-full max-w-[90rem] px-4 pt-16 sm:px-8 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <p className="titre-editorial max-w-md text-4xl text-creme sm:text-5xl">
              Une idée ? <span className="accent-serif text-orange">Raconte-la-nous.</span>
            </p>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-creme/65">{MARQUE.descriptionCourte}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/personnalisation"
                className="group inline-flex items-center gap-2 rounded-full bg-orange px-6 py-3.5 text-sm font-semibold text-encre transition-colors duration-300 hover:bg-creme"
              >
                Créer mon design
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 ease-sortie group-hover:rotate-45" />
              </Link>
              <a
                href={lienWhatsApp(MESSAGES_WHATSAPP.general)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-creme/30 px-6 py-3.5 text-sm font-semibold text-creme transition-colors duration-300 hover:border-creme hover:bg-creme hover:text-encre"
              >
                <Chat className="h-4 w-4" />
                WhatsApp
              </a>
            </div>
          </div>

          <div className="grid gap-10 sm:grid-cols-3">
            <Colonne titre="Univers" liens={univers} />
            <Colonne titre="Créer" liens={creer} />
            <Colonne titre="Pratique" liens={liensPratiques} />
          </div>
        </div>

        <div className="mt-16 grid gap-8 border-t border-creme/10 pt-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-start gap-3">
            <Chat className="mt-0.5 h-5 w-5 shrink-0 text-orange" />
            <div>
              <p className="surtitre text-creme/50">WhatsApp</p>
              <a
                href={lienWhatsApp(MESSAGES_WHATSAPP.general)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 block text-sm font-semibold text-creme transition-colors hover:text-orange"
              >
                {WHATSAPP.affichage}
              </a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-orange" />
            <div>
              <p className="surtitre text-creme/50">Email</p>
              <a
                href={`mailto:${EMAIL_CONTACT}`}
                className="mt-1.5 block text-sm font-semibold text-creme transition-colors hover:text-orange"
              >
                {EMAIL_CONTACT}
              </a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Pin className="mt-0.5 h-5 w-5 shrink-0 text-orange" />
            <div>
              <p className="surtitre text-creme/50">Atelier</p>
              <p className="mt-1.5 text-sm text-creme/80">Brazzaville — visite sur rendez-vous</p>
            </div>
          </div>
          <div>
            <p className="surtitre text-creme/50">Paiement & livraison</p>
            <p className="mt-1.5 text-sm leading-relaxed text-creme/80">
              Prix en FCFA · MTN Mobile Money
              <br />
              Brazzaville et Pointe-Noire
            </p>
          </div>
        </div>

        {RESEAUX.length > 0 && (
          <ul className="mt-10 flex flex-wrap gap-3">
            {RESEAUX.map((reseau) => (
              <li key={reseau.href}>
                <a
                  href={reseau.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-creme/25 px-4 py-2 text-xs font-semibold text-creme transition-colors hover:border-orange hover:text-orange"
                >
                  {reseau.nom}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Le nom, en très grand : la signature visuelle du pied de page. */}
      <p
        aria-hidden
        className="pointer-events-none mt-12 select-none px-2 text-center font-display text-[25.5vw] font-extrabold leading-[0.78] tracking-[-0.07em] text-creme"
      >
        elembo<span className="text-orange">.</span>
      </p>

      <div className="relative border-t border-creme/10">
        <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-2 px-4 py-5 text-xs text-creme/55 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>
            © {new Date().getFullYear()} {MARQUE.editeur}. Tous droits réservés.
          </p>
          <p>Elembo — {MARQUE.promesse} Une plateforme Smart Vision.</p>
        </div>
      </div>
    </footer>
  );
}
