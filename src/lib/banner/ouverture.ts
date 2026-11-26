/**
 * Ouverture du Banner Studio au public. Tant que `NEXT_PUBLIC_BANNER_STUDIO` ne vaut pas `1`, le
 * Studio fonctionne mais n'est lié nulle part et n'est pas indexé : mise en ligne contrôlée, avec
 * l'imprimeur pilote, sans changer le code ; la variable est lue au build, il faut donc redéployer.
 */
export const studioOuvert = process.env.NEXT_PUBLIC_BANNER_STUDIO === '1' && process.env.DEPLOY_TARGET !== 'gh-pages';
