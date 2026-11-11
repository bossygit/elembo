import type { ReactNode } from 'react';

import { lienWhatsApp, MESSAGES_WHATSAPP } from '@/lib/site/marque';

import { Chat } from './Icons';
import { stylesBouton, type Variante } from './ui';

/**
 * Bouton d'assistance WhatsApp : un lien `wa.me` avec un message pré-rempli selon le contexte
 * (cadeau, événement, commande…). S'ouvre dans un nouvel onglet — sur mobile, l'application
 * WhatsApp prend le relais.
 */
export function BoutonWhatsApp({
  message = MESSAGES_WHATSAPP.general,
  children = 'Commander sur WhatsApp',
  variante = 'primaire',
  className = '',
}: {
  message?: string;
  children?: ReactNode;
  variante?: Variante;
  className?: string;
}) {
  return (
    <a
      href={lienWhatsApp(message)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-colors duration-200 ${stylesBouton[variante]} ${className}`}
    >
      <Chat className="h-4 w-4" />
      {children}
      <span className="sr-only"> (s’ouvre dans WhatsApp)</span>
    </a>
  );
}

/** Lien texte discret, pour les paragraphes et les messages d'aide. */
export function LienWhatsApp({
  message = MESSAGES_WHATSAPP.general,
  children = 'Écrivez-nous sur WhatsApp',
  className = '',
}: {
  message?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={lienWhatsApp(message)}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-semibold text-encre underline decoration-orange decoration-2 underline-offset-4 hover:text-orange-action ${className}`}
    >
      {children}
    </a>
  );
}
