/**
 * Destination après connexion : uniquement une page du back-office.
 * Toute autre valeur (URL absolue, `//hôte`, remontée `..`, page de connexion) retombe sur
 * /admin — pas de redirection ouverte via le paramètre `suite`.
 */
export function destinationSure(suite: unknown): string {
  if (typeof suite !== 'string') return '/admin';
  if (!/^\/admin(?:\/[A-Za-z0-9/_\-.]*)?$/.test(suite) || suite.includes('//') || suite.includes('..')) {
    return '/admin';
  }
  if (suite.startsWith('/admin/connexion')) return '/admin';
  return suite;
}
