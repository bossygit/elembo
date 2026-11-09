/**
 * Le parcours devis dépend de Supabase. Tant que les variables publiques ne sont pas
 * configurées dans l’environnement de déploiement, on n’expose pas un formulaire qui
 * échouerait à l’envoi. Les variables NEXT_PUBLIC_* sont figées au build : un ajout
 * dans Vercel nécessite un redéploiement.
 */
export const devisConfigure = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
);
