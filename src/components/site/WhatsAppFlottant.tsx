'use client';

import { usePathname } from 'next/navigation';

import { lienWhatsApp, MESSAGES_WHATSAPP } from '@/lib/site/marque';

import { Chat } from './Icons';

/**
 * Bouton flottant d'assistance WhatsApp, en bas à droite.
 * Masqué là où il gênerait : back-office, et pages dont le panneau de commande occupe le bas
 * de l'écran sur mobile (configurateurs, studio).
 */
const PAGES_SANS_BOUTON = ['/admin', '/personnalisation', '/configurator', '/tableau', '/studio'];

export default function WhatsAppFlottant() {
  const pathname = usePathname() ?? '/';
  const masque = PAGES_SANS_BOUTON.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (masque) return null;

  return (
    <a
      href={lienWhatsApp(MESSAGES_WHATSAPP.general)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Besoin d’aide ? Écrivez-nous sur WhatsApp (s’ouvre dans WhatsApp)"
      className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-encre px-4 py-3 text-sm font-semibold text-creme shadow-[0_12px_30px_-12px_rgba(32,2,51,0.6)] transition-colors duration-200 hover:bg-orange hover:text-encre sm:bottom-6 sm:right-6"
    >
      <Chat className="h-5 w-5" />
      <span className="hidden sm:inline">Besoin d’aide ?</span>
    </a>
  );
}
