import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { roleDepuisClaims, type ClaimsSupabase, type RoleStaff } from './roles';

function url(): string {
  const valeur = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!valeur) throw new Error('NEXT_PUBLIC_SUPABASE_URL manquant.');
  return valeur;
}

function anon(): string {
  const valeur = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!valeur) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY manquant.');
  return valeur;
}

export async function creerClientAuthServeur() {
  const magasin = await cookies();
  return createServerClient(url(), anon(), {
    cookies: {
      getAll() {
        return magasin.getAll();
      },
      setAll(liste) {
        try {
          for (const { name, value, options } of liste) magasin.set(name, value, options);
        } catch {
          // Un Server Component ne peut pas écrire de cookie ; la session reste lisible.
        }
      },
    },
  });
}

export async function utilisateurCourant(): Promise<ClaimsSupabase | null> {
  const client = await creerClientAuthServeur();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return {
    sub: data.user.id,
    email: data.user.email ?? undefined,
    app_metadata: data.user.app_metadata as ClaimsSupabase['app_metadata'],
  };
}

export async function utilisateurStaff(): Promise<{ claims: ClaimsSupabase; role: RoleStaff } | null> {
  const claims = await utilisateurCourant();
  if (!claims) return null;
  const role = roleDepuisClaims(claims);
  return role ? { claims, role } : null;
}
