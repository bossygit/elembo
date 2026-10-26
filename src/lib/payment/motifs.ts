/**
 * Traduction des motifs de refus MTN en consignes utiles.
 *
 * MTN renvoie des codes techniques qui cumulent plusieurs causes : `LOW_BALANCE_OR_PAYEE_LIMIT_
 * REACHED_OR_NOT_ALLOWED` ne dit pas s'il faut recharger, attendre demain, ou changer de numéro.
 * Un client qui lit « paiement non abouti » sans piste abandonne ; on lui donne donc la seule chose
 * qui l'aide : quoi vérifier, et quoi faire ensuite.
 *
 * Le code brut reste affiché à côté : il sert au support, et il ne faut jamais le masquer.
 */

type Explication = {
  /** Ce que MTN a refusé, en clair. */
  constat: string;
  /** Ce qu'il faut faire maintenant. */
  action: string;
};

const MOTIFS: Record<string, Explication> = {
  LOW_BALANCE_OR_PAYEE_LIMIT_REACHED_OR_NOT_ALLOWED: {
    constat:
      'MTN refuse le débit : solde insuffisant, plafond de paiement atteint, ou numéro non autorisé à payer par ce canal.',
    action:
      'Vérifiez votre solde MoMo (*126#), attendez la réinitialisation du plafond journalier, ou essayez avec un autre numéro enregistré.',
  },
  NOT_ENOUGH_FUNDS: {
    constat: 'Solde MoMo insuffisant.',
    action: 'Rechargez votre compte puis relancez le paiement.',
  },
  PAYER_NOT_FOUND: {
    constat: 'MTN ne reconnaît pas ce numéro comme un compte MoMo actif.',
    action: 'Vérifiez le numéro saisi (10 chiffres après l’indicatif) ou utilisez le numéro réellement enregistré.',
  },
  APPROVAL_REJECTED: {
    constat: 'La demande a été refusée sur le téléphone.',
    action: 'Relancez et appuyez sur « Valider » (ou saisissez votre code secret) dans les 5 minutes.',
  },
  REJECTED: {
    constat: 'La demande a été refusée.',
    action: 'Relancez le paiement et validez la demande sur le téléphone.',
  },
  EXPIRED: {
    constat: 'La demande a expiré avant validation.',
    action: 'Relancez le paiement — aucune commande n’a été produite.',
  },
  TIMEOUT: {
    constat: 'MTN n’a pas reçu de validation dans le délai.',
    action: 'Relancez le paiement — aucune commande n’a été produite.',
  },
  INTERNAL_PROCESSING_ERROR: {
    constat: 'Erreur interne chez MTN lors du traitement.',
    action: 'Réessayez dans quelques minutes ; si cela persiste, contactez le support MTN.',
  },
  NOT_ALLOWED: {
    constat: 'Ce numéro n’est pas autorisé à payer par API.',
    action: 'Essayez un autre numéro MoMo, ou faites activer le paiement marchand sur ce compte.',
  },
};

/** Renvoie `null` si le motif est inconnu : on n'invente pas de conseil. */
export function expliquerMotif(raison: string | null | undefined): Explication | null {
  if (!raison) return null;
  return MOTIFS[raison.trim().toUpperCase()] ?? null;
}

/** Ligne prête à afficher : constat + action, ou le code brut s'il est inconnu. */
export function phraseMotif(raison: string | null | undefined): string | null {
  const explication = expliquerMotif(raison);
  if (!explication) return null;
  return `${explication.constat} ${explication.action}`;
}
