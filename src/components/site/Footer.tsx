import Link from 'next/link';

import { UNIVERS } from '@/lib/commerce/univers';
import { devisConfigure } from '@/lib/devis/configuration';
import { lienWhatsApp, MARQUE, MESSAGES_WHATSAPP, WHATSAPP } from '@/lib/site/marque';

import { Chat, Mail, Pin } from './Icons';

const univers = [
  ...UNIVERS.map((u) => ({ href: `/univers/${u.id}`, label: u.titre })),
  { href: '/createurs', label: 'Créateurs congolais' },
];

const boutique = [
  { href: '/boutique', label: 'Tous les produits' },
  { href: '/personnalisation', label: 'Créer mon t-shirt' },
  { href: '/tableau', label: 'Tableaux photo' },
  { href: '/impression', label: 'Impression graphique' },
  { href: '/entreprises', label: 'Entreprises & organisations' },
];

const atelier = [
  { href: '/devis', label: 'Demander un devis' },
  { href: '/devis/suivi', label: 'Suivre mon devis' },
  { href: '/comment-ca-marche', label: 'Comment ça marche' },
  { href: '/contact', label: 'Contact' },
  { href: '/studio', label: 'Studio 2D (outil)' },
];

export default function Footer() {
  const liensAtelier = devisConfigure
    ? atelier
    : atelier.filter((lien) => !lien.href.startsWith('/devis'));

  return (
    <footer className="border-t border-creme/15 bg-encre text-creme">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.3fr_0.9fr_0.8fr_0.8fr_1fr]">
        <div>
          <Link href="/" className="text-[32px] font-bold leading-none tracking-tight text-creme">
            elembo<span className="text-orange">.</span>
          </Link>
          <p className="mt-4 font-display text-lg text-creme">{MARQUE.signature}</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-creme/65">
            La plateforme congolaise qui transforme vos idées, vos souvenirs et vos émotions en
            objets. Créée au Congo, fabriquée à Brazzaville.
          </p>
          <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-creme/60">
            Par Smart Vision Congo
          </p>
        </div>

        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-creme/60">Univers</h2>
          <ul className="mt-4 space-y-2.5">
            {univers.map((lien) => (
              <li key={lien.href}>
                <Link href={lien.href} className="text-sm text-creme/70 transition-colors hover:text-orange">
                  {lien.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-creme/60">Boutique</h2>
          <ul className="mt-4 space-y-2.5">
            {boutique.map((lien) => (
              <li key={lien.href}>
                <Link href={lien.href} className="text-sm text-creme/70 transition-colors hover:text-orange">
                  {lien.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-creme/60">Aide</h2>
          <ul className="mt-4 space-y-2.5">
            {liensAtelier.map((lien) => (
              <li key={lien.href}>
                <Link href={lien.href} className="text-sm text-creme/70 transition-colors hover:text-orange">
                  {lien.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-creme/60">Contact</h2>
          <ul className="mt-4 space-y-3 text-sm text-creme/70">
            <li className="flex items-start gap-2.5">
              <Chat className="mt-0.5 h-4 w-4 shrink-0 text-orange" />
              <a
                href={lienWhatsApp(MESSAGES_WHATSAPP.general)}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-orange"
              >
                WhatsApp {WHATSAPP.affichage}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-orange" />
              <a href="mailto:store@smartvision.cg" className="transition-colors hover:text-orange">
                store@smartvision.cg
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <Pin className="mt-0.5 h-4 w-4 shrink-0 text-orange" />
              <span>Atelier à Brazzaville — visite sur rendez-vous.</span>
            </li>
          </ul>
          <p className="mt-5 text-xs leading-relaxed text-creme/60">
            Prix en FCFA · Paiement MTN Mobile Money.
            <br />
            Livraison à Brazzaville et Pointe-Noire.
          </p>
        </div>
      </div>

      <div className="border-t border-creme/15">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-creme/60 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Smart Vision Congo. Tous droits réservés.</p>
          <p>Elembo — {MARQUE.promesse} Une plateforme Smart Vision.</p>
        </div>
      </div>
    </footer>
  );
}
