import { createHmac, randomBytes } from 'node:crypto';

import { comparerSecret, lireCookie } from '@/server/security/http';
import { creerSessionDevis, revoquerSessionDevis, sessionDevisValide } from './repository';

export const COOKIE_SESSION = 'elembo_devis_session';
export const COOKIE_CSRF = 'elembo_devis_csrf';

function secret(): string {
  const valeur = process.env.DEVIS_SESSION_SECRET?.trim();
  if (!valeur || valeur.length < 32) throw new Error('DEVIS_SESSION_SECRET manquant ou trop court.');
  return valeur;
}

function signature(sid: string): string {
  return createHmac('sha256', secret()).update(sid).digest('base64url');
}

export function hashSid(sid: string): string {
  return createHmac('sha256', 'elembo-sid').update(sid).digest('hex');
}

function nouveauSid(): string {
  return randomBytes(32).toString('base64url');
}

function cookieSecurise(): boolean {
  return process.env.NODE_ENV === 'production';
}

function cookie(valeur: string, httpOnly: boolean, maxAge: number): string {
  const morceaux = [
    `${httpOnly ? COOKIE_SESSION : COOKIE_CSRF}=${encodeURIComponent(valeur)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'SameSite=Lax',
  ];
  if (httpOnly) morceaux.push('HttpOnly');
  if (cookieSecurise()) morceaux.push('Secure');
  return morceaux.join('; ');
}

export type CookiesDevis = { session: string; csrf: string };

export async function creerSession(devisId: string): Promise<CookiesDevis> {
  const sid = nouveauSid();
  const expire = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await creerSessionDevis(devisId, hashSid(sid), expire.toISOString());

  const csrf = randomBytes(24).toString('base64url');
  return {
    session: `${sid}.${signature(sid)}`,
    csrf,
  };
}

export function ajouterCookiesSession(reponse: Response, cookies: CookiesDevis): void {
  const maxAge = 30 * 24 * 60 * 60;
  reponse.headers.append('Set-Cookie', cookie(cookies.session, true, maxAge));
  reponse.headers.append('Set-Cookie', cookie(cookies.csrf, false, maxAge));
  reponse.headers.set('Cache-Control', 'no-store');
}

export function effacerCookiesSession(reponse: Response): void {
  reponse.headers.append('Set-Cookie', `${COOKIE_SESSION}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  reponse.headers.append('Set-Cookie', `${COOKIE_CSRF}=; Path=/; Max-Age=0; SameSite=Lax`);
}

export function sidDepuisRequete(request: Request): string | null {
  const brut = lireCookie(request, COOKIE_SESSION);
  if (!brut) return null;
  const [sid, sig] = brut.split('.');
  if (!sid || !sig) return null;
  try {
    if (!comparerSecret(signature(sid), sig)) return null;
  } catch {
    return null;
  }
  return sid;
}

export async function devisDepuisSession(request: Request, reference: string): Promise<string | null> {
  const sid = sidDepuisRequete(request);
  if (!sid) return null;
  return sessionDevisValide(hashSid(sid), reference);
}

export function csrfValide(request: Request): boolean {
  const attendu = lireCookie(request, COOKIE_CSRF);
  const fourni = request.headers.get('x-csrf-token') ?? '';
  return comparerSecret(attendu, fourni);
}

export async function revoquerSessionCourante(request: Request): Promise<void> {
  const sid = sidDepuisRequete(request);
  if (sid) await revoquerSessionDevis(hashSid(sid), 'deconnexion');
}
