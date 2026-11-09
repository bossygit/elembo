import { createHash, timingSafeEqual } from 'node:crypto';

export function jsonErreur(message: string, status: number, headers?: HeadersInit): Response {
  return Response.json(
    { erreur: message },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(headers ?? {}),
      },
    },
  );
}

export function lireCookie(request: Request, nom: string): string {
  const entete = request.headers.get('cookie') ?? '';
  for (const morceau of entete.split(';')) {
    const [cle, ...reste] = morceau.trim().split('=');
    if (cle === nom) return decodeURIComponent(reste.join('='));
  }
  return '';
}

export function comparerSecret(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function originesAutorisees(): string[] {
  const valeurs = [
    ...(process.env.APP_ORIGINS ?? '').split(','),
    process.env.NEXT_PUBLIC_SITE_URL ?? '',
  ]
    .map((v) => v.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [...new Set(valeurs)];
}

/**
 * Vérifie l'origine sur les POST publics.
 * En test, l'absence d'Origin est tolérée pour les appels directs ; en production, non.
 */
export function origineAutorisee(request: Request): boolean {
  const origine = (request.headers.get('origin') ?? '').replace(/\/+$/, '');
  if (!origine) return process.env.NODE_ENV === 'test';
  return originesAutorisees().includes(origine);
}

export function ipDepuisRequete(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const premiere = forwarded.split(',')[0]?.trim();
  return premiere || request.headers.get('x-real-ip') || 'inconnue';
}

export function cledepuisValeur(prefixe: string, valeur: string): string {
  const hash = createHash('sha256').update(valeur.trim().toLowerCase()).digest('hex').slice(0, 32);
  return `${prefixe}:${hash}`;
}
