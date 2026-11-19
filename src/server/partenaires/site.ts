/**
 * Adresse publique du site, pour les liens envoyés par e-mail ou partagés (invitations).
 * NEXT_PUBLIC_SITE_URL fait foi ; à défaut, l'hôte de la requête (Supabase n'honore de toute
 * façon que les redirections présentes dans sa liste autorisée).
 */

import { headers } from 'next/headers';

export async function urlSite(): Promise<string> {
  const configuree = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  if (configuree) return configuree;
  const h = await headers();
  const hote = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const protocole = h.get('x-forwarded-proto') ?? (hote.startsWith('localhost') ? 'http' : 'https');
  return `${protocole}://${hote}`;
}
