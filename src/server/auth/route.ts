/**
 * Enveloppe de route API avec contrôle de rôle.
 *
 * Chaque future route `/api/admin/*` ou route utilisant `service_role` doit passer par
 * `avecGardeRole` (ou appeler `exigerRole`) avant d'ouvrir le client serveur.
 *
 * `lireClaims` est injecté : en production, il vérifiera le JWT Supabase auprès du projet ;
 * dans les tests, on simule des claims sans réseau.
 */

import {
  roleDepuisClaims,
  type ClaimsSupabase,
  type RoleStaff,
} from './roles';

export type LecteurClaims = (
  request: Request,
) => Promise<ClaimsSupabase | null> | ClaimsSupabase | null;

export type RouteProtegee = (request: Request) => Promise<Response>;

function refus(message: string, status: 401 | 403): Response {
  return Response.json({ erreur: message }, { status });
}

export function avecGardeRole(
  roles: readonly RoleStaff[],
  lireClaims: LecteurClaims,
  handler: (request: Request, claims: ClaimsSupabase) => Promise<Response> | Response,
): RouteProtegee {
  return async (request: Request) => {
    let claims: ClaimsSupabase | null;
    try {
      claims = await lireClaims(request);
    } catch {
      return refus('Authentification requise.', 401);
    }

    if (!claims) return refus('Authentification requise.', 401);

    const role = roleDepuisClaims(claims);
    if (!role || !roles.includes(role)) return refus('Accès refusé.', 403);

    return handler(request, claims);
  };
}
