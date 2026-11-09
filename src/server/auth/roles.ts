/**
 * Contrôle des rôles staff côté serveur.
 *
 * Le rôle est lu uniquement dans `app_metadata`, que l'utilisateur ne peut pas modifier
 * lui-même. `user_metadata` est volontairement ignoré : un client peut y écrire.
 *
 * Aucune route n'utilise encore `service_role` ; ce module est la brique commune des
 * routes qui l'utiliseront (devis, commandes, production, finances).
 */

export const ROLES_STAFF = ['admin', 'commercial', 'atelier', 'finance'] as const;

export type RoleStaff = (typeof ROLES_STAFF)[number];

export type ClaimsSupabase = {
  sub?: string;
  email?: string;
  app_metadata?: { role?: unknown };
  user_metadata?: { role?: unknown };
};

export class ErreurAcces extends Error {
  readonly statut = 403;

  constructor(message = 'Accès refusé') {
    super(message);
    this.name = 'ErreurAcces';
  }
}

export function roleDepuisClaims(claims: unknown): RoleStaff | null {
  if (!claims || typeof claims !== 'object') return null;
  const appMetadata = (claims as ClaimsSupabase).app_metadata;
  const role = appMetadata?.role;
  return typeof role === 'string' && (ROLES_STAFF as readonly string[]).includes(role)
    ? (role as RoleStaff)
    : null;
}

export function estStaff(claims: unknown): boolean {
  return roleDepuisClaims(claims) !== null;
}

/**
 * Exige un rôle staff explicitement autorisé.
 * Ne jamais utiliser `user_metadata` comme source de rôle.
 */
export function exigerRole(claims: unknown, roles: readonly RoleStaff[]): RoleStaff {
  const role = roleDepuisClaims(claims);
  if (!role || !roles.includes(role)) {
    throw new ErreurAcces();
  }
  return role;
}
