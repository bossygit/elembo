import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let admin: SupabaseClient | null = null;
let anon: SupabaseClient | null = null;

function url(): string {
  const valeur = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!valeur) throw new Error('NEXT_PUBLIC_SUPABASE_URL manquant.');
  return valeur.replace(/\/+$/, '');
}

function cleAnon(): string {
  const valeur = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!valeur) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY manquant.');
  return valeur;
}

export function supabaseAdmin(): SupabaseClient {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!cle) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant.');
  if (!admin) {
    admin = createClient(url(), cle, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'X-Client-Info': 'elembo-server' } },
    });
  }
  return admin;
}

export function supabaseAnon(): SupabaseClient {
  if (!anon) {
    anon = createClient(url(), cleAnon(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return anon;
}

export async function verifierJwtSupabase(token: string) {
  const { data, error } = await supabaseAnon().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
