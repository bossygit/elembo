/**
 * Contrôle d'accès du back-office — la couche que TOUTES les pages, actions serveur et routes
 * de /admin appellent avant de lire ou d'écrire une donnée.
 *
 * Pourquoi pas seulement le layout : dans l'App Router, un layout ne re-rend pas à la
 * navigation et ne bloque pas l'exécution des pages ni des actions serveur qu'il entoure
 * (voir node_modules/next/dist/docs/01-app/02-guides/authentication.md, « Layouts and auth
 * checks »). Le contrôle doit donc vivre au plus près de la donnée : ici.
 *
 * Source de vérité de la session : `auth.getUser()`, qui revalide le jeton auprès de Supabase
 * Auth (un cookie forgé ou expiré est refusé). Le rôle vient de `app_metadata`, que
 * l'utilisateur ne peut pas modifier lui-même.
 */

import { cache } from 'react';
import { redirect } from 'next/navigation';

import { peut, type Permission } from '@/lib/admin/permissions';
import { devisConfigure } from '@/lib/devis/configuration';
import { utilisateurStaff } from '@/server/auth/session';
import type { RoleStaff } from '@/server/auth/roles';

export type Staff = {
  id: string;
  email: string | null;
  role: RoleStaff;
};

/** Staff connecté pour la requête en cours (mémoïsé par requête), ou `null`. */
export const staffCourant = cache(async (): Promise<Staff | null> => {
  if (!devisConfigure) return null;
  try {
    const resultat = await utilisateurStaff();
    if (!resultat?.claims.sub) return null;
    return { id: resultat.claims.sub, email: resultat.claims.email ?? null, role: resultat.role };
  } catch {
    // Supabase Auth injoignable : on refuse l'accès plutôt que de l'accorder par défaut.
    return null;
  }
});

/**
 * Exige une permission pour une page ou une action serveur.
 *  - pas de session staff → page de connexion ;
 *  - session sans la permission → tableau de bord avec un message de refus.
 */
export async function exigerAcces(permission: Permission): Promise<Staff> {
  const staff = await staffCourant();
  if (!staff) redirect('/admin/connexion');
  if (!peut(staff.role, permission)) {
    redirect(`/admin?refus=${encodeURIComponent(permission)}`);
  }
  return staff;
}

/** Variante pour les routes HTTP (téléchargements, exports) : réponse 401 / 403 explicite. */
export async function verifierAccesRoute(
  permission: Permission,
): Promise<{ ok: true; staff: Staff } | { ok: false; reponse: Response }> {
  const staff = await staffCourant();
  if (!staff) {
    return {
      ok: false,
      reponse: Response.json({ erreur: 'Authentification requise.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }),
    };
  }
  if (!peut(staff.role, permission)) {
    return {
      ok: false,
      reponse: Response.json({ erreur: 'Accès refusé.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }),
    };
  }
  return { ok: true, staff };
}
