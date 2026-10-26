/**
 * Dossier de production : ce qui transforme un paiement en commande fabriquable.
 *
 * Problème réglé ici : jusqu'ici les PNG et la fiche étaient générés **dans le navigateur du
 * client**. Si le client fermait la page après avoir payé — ou si son téléphone perdait le réseau —
 * la commande était encaissée mais l'atelier ne recevait jamais le visuel. Ce module décrit les
 * règles du dépôt ; les routes `/api/commandes/*` les appliquent.
 *
 * Règles (aucune ne doit être contournée par le client) :
 *
 *   - la transaction doit exister et être **PAYE** — un fichier déposé ne crée jamais un paiement ;
 *   - la référence envoyée doit correspondre à la commande du chemin ;
 *   - les chemins déposés doivent rester sous `dossiers/<commande>/` (pas de traversée) ;
 *   - taille, nombre et types sont bornés : un dépôt ne doit pas pouvoir coûter cher ni remplir
 *     le stockage par accident ;
 *   - un dossier déjà reçu n'est jamais écrasé : le premier dépôt d'une commande payée fait foi.
 *
 * Aucune dépendance à `next` ni à l'hébergeur : testable sans serveur, comme le service de paiement.
 */

import type { FichierDepose, Transaction } from '../momo/store';

/** Un dossier = au plus un PNG par face (2) + la fiche JSON et sa version texte. */
export const MAX_FICHIERS = 6;
export const MAX_TAILLE_FICHIER = 25 * 1024 * 1024;
export const MAX_TAILLE_TOTAL = 60 * 1024 * 1024;
export const TYPES_ACCEPTES = ['image/png', 'application/json', 'text/plain'] as const;

export type Refus = { ok: false; statut: number; motif: string };
export type Accepte = { ok: true };
export type Verdict = Accepte | Refus;

function refus(statut: number, motif: string): Refus {
  return { ok: false, statut, motif };
}

/** Préfixe d'archive d'une commande : c'est aussi ce qui borne les chemins acceptés. */
export function prefixeCommande(commande: string): string {
  return `dossiers/${commande}/`;
}

/**
 * Contrôle d'un dépôt. On valide dans l'ordre où les erreurs se comprennent :
 * paiement → commande → fichiers.
 */
/** Le paiement seul : utilisé aussi à la génération du jeton d'envoi (avant tout octet transféré). */
export function verifierAutorisation(params: {
  transaction: Transaction | undefined;
  commande: string;
}): Verdict {
  const { transaction, commande } = params;
  if (!transaction) return refus(404, 'Référence de paiement inconnue.');
  if (transaction.commande !== commande) {
    return refus(403, 'Cette référence de paiement ne correspond pas à la commande.');
  }
  if (transaction.statut !== 'PAYE') {
    return refus(409, `La commande n'est pas payée (statut ${transaction.statut}) : dossier refusé.`);
  }
  return { ok: true };
}

/** Le chemin doit rester dans le dossier de CETTE commande (pas de traversée, pas d'écrasement). */
export function verifierChemin(commande: string, chemin: string): string | null {
  const prefixe = prefixeCommande(commande);
  if (!chemin.startsWith(prefixe) || chemin.includes('..')) {
    return `Chemin d'archive hors de la commande : « ${chemin} ».`;
  }
  return null;
}

export function verifierDepot(params: {
  transaction: Transaction | undefined;
  commande: string;
  fichiers: unknown;
}): Verdict {
  const { transaction, commande, fichiers } = params;

  const autorisation = verifierAutorisation({ transaction, commande });
  if (!autorisation.ok) return autorisation;

  if (!Array.isArray(fichiers) || fichiers.length === 0) {
    return refus(422, 'Aucun fichier dans le dépôt.');
  }
  if (fichiers.length > MAX_FICHIERS) {
    return refus(422, `Trop de fichiers (${fichiers.length}, maximum ${MAX_FICHIERS}).`);
  }

  let total = 0;

  for (const brut of fichiers) {
    const f = (brut ?? {}) as Partial<FichierDepose>;
    const nom = typeof f.nom === 'string' ? f.nom.trim() : '';
    const chemin = typeof f.chemin === 'string' ? f.chemin.trim() : '';
    const taille = Number(f.taille);
    const type = typeof f.type === 'string' ? f.type.trim() : '';

    if (!nom || nom.includes('/') || nom.includes('..')) {
      return refus(422, `Nom de fichier invalide : « ${nom} ».`);
    }
    const motifChemin = verifierChemin(commande, chemin);
    if (motifChemin) return refus(422, motifChemin);
    if (!(TYPES_ACCEPTES as readonly string[]).includes(type)) {
      return refus(422, `Type de fichier refusé pour « ${nom} » : ${type || 'inconnu'}.`);
    }
    if (!Number.isFinite(taille) || taille <= 0) {
      return refus(422, `Taille invalide pour « ${nom} ».`);
    }
    if (taille > MAX_TAILLE_FICHIER) {
      return refus(422, `Fichier trop volumineux : « ${nom} » (${Math.round(taille / 1024 / 1024)} Mo, maximum 25 Mo).`);
    }
    total += taille;
  }

  if (total > MAX_TAILLE_TOTAL) {
    return refus(422, `Dépôt trop volumineux (${Math.round(total / 1024 / 1024)} Mo, maximum 60 Mo).`);
  }

  return { ok: true };
}

export function normaliserFichiers(fichiers: unknown): FichierDepose[] {
  if (!Array.isArray(fichiers)) return [];
  return fichiers.map((brut) => {
    const f = (brut ?? {}) as Partial<FichierDepose>;
    return {
      nom: String(f.nom ?? '').trim(),
      chemin: String(f.chemin ?? '').trim(),
      taille: Number(f.taille ?? 0),
      type: String(f.type ?? '').trim(),
    };
  });
}

/** Traduit un refus de dépôt en statut HTTP : le client (et les journaux) doivent pouvoir distinguer
 *  une référence inexistante d'une commande non payée ou d'un dossier déjà reçu. */
export function statutDepot(message: string): number {
  if (/déjà été reçu/.test(message)) return 409;
  if (/pas payée/.test(message)) return 409;
  if (/inconnue/.test(message)) return 404;
  if (/correspond/.test(message)) return 403;
  return 400;
}

/** Récapitulatif lisible envoyé à l'atelier (Telegram) — la fiche complète reste le JSON du dossier. */
export function recapDossier(transaction: Transaction, fichiers: FichierDepose[]): string {
  const lignes = [
    `🧾 Commande ${transaction.commande} — PAYÉE`,
    `${transaction.montantFcfa} ${transaction.devise}`,
    transaction.detail ? `Produit : ${transaction.detail}` : `Produit : ${transaction.produitId}`,
    `Téléphone client : ${transaction.msisdn.slice(0, 5)}••••${transaction.msisdn.slice(-2)}`,
    `Transaction MTN : ${transaction.financialTransactionId ?? '—'}`,
    '',
    'Fichiers reçus :',
    ...fichiers.map((f) => `• ${f.nom} (${Math.max(1, Math.round(f.taille / 1024))} Ko)`),
    '',
    'La fiche de production (JSON + texte) accompagne les visuels.',
  ];
  return lignes.join('\n');
}
