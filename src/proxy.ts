/**
 * Proxy (ex-middleware, Next 16) limité au back-office.
 *
 * Rôles :
 *  1. Rafraîchir la session Supabase : un Server Component ne peut pas réécrire de cookie. Sans
 *     ce rafraîchissement, chaque page renouvellerait le jeton sans pouvoir l'enregistrer, et
 *     la rotation des refresh tokens finirait par révoquer la session.
 *  2. Rediriger tôt vers /admin/connexion un visiteur sans session staff (confort) — ce n'est
 *     PAS la barrière de sécurité : chaque page, action et route revérifie via `exigerAcces`.
 *  3. Poser des en-têtes stricts : pas d'indexation, pas de cache, pas de Referer (les liens
 *     signés de téléchargement ne doivent fuiter vers aucun site tiers).
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { roleDepuisClaims } from '@/server/auth/roles';

const PUBLIQUES = ['/admin/connexion'];

function entetes(reponse: NextResponse): NextResponse {
  reponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  reponse.headers.set('Cache-Control', 'private, no-store, max-age=0');
  reponse.headers.set('Referrer-Policy', 'no-referrer');
  reponse.headers.set('X-Frame-Options', 'DENY');
  return reponse;
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const chemin = request.nextUrl.pathname;
  const publique = PUBLIQUES.some((p) => chemin === p || chemin.startsWith(`${p}/`));

  if (!url || !anon) {
    // Back-office indisponible sans Supabase : on ne sert aucune page protégée.
    return entetes(publique ? NextResponse.next() : NextResponse.redirect(new URL('/', request.url)));
  }

  let reponse = NextResponse.next({ request });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(liste) {
        for (const { name, value } of liste) request.cookies.set(name, value);
        reponse = NextResponse.next({ request });
        for (const { name, value, options } of liste) reponse.cookies.set(name, value, options);
      },
    },
  });

  // `getUser()` revalide le jeton auprès de Supabase Auth et le rafraîchit si besoin.
  let staff = false;
  try {
    const { data } = await supabase.auth.getUser();
    staff = Boolean(data.user && roleDepuisClaims({ app_metadata: data.user.app_metadata }));
  } catch {
    staff = false;
  }

  if (!staff && !publique) {
    const cible = new URL('/admin/connexion', request.url);
    if (chemin !== '/admin') cible.searchParams.set('suite', chemin);
    const redirection = NextResponse.redirect(cible);
    // Conserver les cookies éventuellement nettoyés par Supabase (session expirée).
    for (const cookie of reponse.cookies.getAll()) redirection.cookies.set(cookie);
    return entetes(redirection);
  }

  return entetes(reponse);
}

export const config = {
  matcher: ['/admin/:path*'],
};
