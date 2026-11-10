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

/**
 * Récupération d’un devis par code à usage unique : il faut un canal capable d’envoyer
 * le code. Sans fournisseur email (Resend) ni passerelle SMS, la page de récupération
 * l’annonce au lieu de laisser le client attendre un code qui n’arrivera jamais.
 */
export const recuperationDisponible = Boolean(
  ((process.env.RESEND_API_KEY ?? '').trim() && (process.env.DEVIS_EMAIL_FROM ?? '').trim()) ||
    ((process.env.SMS_API_URL ?? '').trim() && (process.env.SMS_API_KEY ?? '').trim()),
);
