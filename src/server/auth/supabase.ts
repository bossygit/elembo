import type { ClaimsSupabase } from '@/server/auth/roles';
import { verifierJwtSupabase } from '@/server/supabase/client';

/** Lit un JWT staff uniquement dans l'en-tête Authorization. */
export async function lireClaimsDepuisRequete(request: Request): Promise<ClaimsSupabase | null> {
  const entete = request.headers.get('authorization') ?? '';
  if (!entete.toLowerCase().startsWith('bearer ')) return null;
  const token = entete.slice(7).trim();
  if (!token) return null;

  const utilisateur = await verifierJwtSupabase(token);
  if (!utilisateur) return null;

  return {
    sub: utilisateur.id,
    email: utilisateur.email ?? undefined,
    app_metadata: utilisateur.app_metadata as ClaimsSupabase['app_metadata'],
  };
}
