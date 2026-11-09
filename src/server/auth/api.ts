import { roleDepuisClaims, type ClaimsSupabase, type RoleStaff } from './roles';
import { lireClaimsDepuisRequete } from './supabase';
import { jsonErreur } from '@/server/security/http';

export type Garde =
  | { ok: true; claims: ClaimsSupabase; role: RoleStaff }
  | { ok: false; reponse: Response };

export async function garderRoles(request: Request, roles: readonly RoleStaff[]): Promise<Garde> {
  const claims = await lireClaimsDepuisRequete(request);
  if (!claims) return { ok: false, reponse: jsonErreur('Authentification requise.', 401) };
  const role = roleDepuisClaims(claims);
  if (!role || !roles.includes(role)) {
    return { ok: false, reponse: jsonErreur('Accès refusé.', 403) };
  }
  return { ok: true, claims, role };
}
