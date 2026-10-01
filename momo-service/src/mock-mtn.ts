/**
 * Simulateur MTN (mode démonstration, MOMO_MOCK=1).
 *
 * Il reproduit la logique de la table officielle des valeurs de test du sandbox
 * (`momodeveloper.mtn.com/api-documentation/testing`), et non une convention inventée :
 *
 *   « Any other number results in Success » — le SUCCÈS EST LE CAS PAR DÉFAUT.
 *   La table ne décrit que les échecs et les états intermédiaires :
 *
 *     46733123450 échec    …51 rejeté    …52 expiré    …53 en cours (reste PENDING)
 *     …54 différé (réussit tardivement)   …55 introuvable    …56 bénéficiaire non autorisé
 *     …57 non autorisé    …58 environnement cible    …59 hôte de callback invalide
 *     …60 devise invalide    …61 erreur interne    …62 service indisponible
 *     …63 transaction impossible    …64 type de transfert inconnu
 *
 * Aucun accès réseau : la recette complète du tunnel (commande → paiement → production) se fait
 * sans clé et sans dépenser un franc.
 */

import type { ClientMomo, DemandePaiement, StatutPaiement } from './mtn.ts';

export type OptionsMock = {
  delaiMs?: number;
  maintenant?: () => number;
};

type Transaction = DemandePaiement & {
  payeA: number | null;
  issue: StatutPaiement['statut'];
  raison: string | null;
};

type Scenario = { issue: StatutPaiement['statut']; raison: string | null };

/** Scénarios officiels du sandbox MTN, par numéro de test. */
const SCENARIOS: Record<string, Scenario> = {
  '46733123450': { issue: 'FAILED', raison: 'FAILED' },
  '46733123451': { issue: 'FAILED', raison: 'REJECTED' },
  '46733123452': { issue: 'FAILED', raison: 'EXPIRED' },
  // Le client ne valide jamais : reste PENDING jusqu'à la fin de la fenêtre de 5 minutes.
  '46733123453': { issue: 'PENDING', raison: 'ONGOING' },
  // Validation tardive : finit par réussir, après un délai plus long.
  '46733123454': { issue: 'SUCCESSFUL', raison: 'DELAYED' },
  '46733123455': { issue: 'FAILED', raison: 'PAYER_NOT_FOUND' },
  '46733123456': { issue: 'FAILED', raison: 'PAYEE_NOT_ALLOWED_TO_RECEIVE' },
  '46733123457': { issue: 'FAILED', raison: 'NOT_ALLOWED' },
  '46733123458': { issue: 'FAILED', raison: 'NOT_ALLOWED_TARGET_ENVIRONMENT' },
  '46733123459': { issue: 'FAILED', raison: 'INVALID_CALLBACK_URL_HOST' },
  '46733123460': { issue: 'FAILED', raison: 'INVALID_CURRENCY' },
  '46733123461': { issue: 'FAILED', raison: 'INTERNAL_PROCESSING_ERROR' },
  '46733123462': { issue: 'FAILED', raison: 'SERVICE_UNAVAILABLE' },
  '46733123463': { issue: 'FAILED', raison: 'COULD_NOT_PERFORM_TRANSACTION' },
  '46733123464': { issue: 'FAILED', raison: 'TRANSFER_TYPE_UNKNOWN' },
};

/** Le succès est le cas par défaut (voir « Any other number results in Success »). */
export function scenarioPourMsisdn(msisdn: string): Scenario {
  return SCENARIOS[msisdn] ?? { issue: 'SUCCESSFUL', raison: null };
}

export function creerClientMock(opts: OptionsMock = {}): ClientMomo {
  const delaiMs = opts.delaiMs ?? 4000;
  const maintenant = opts.maintenant ?? (() => Date.now());
  const transactions = new Map<string, Transaction>();

  return {
    async demarrerPaiement(demande) {
      if (transactions.has(demande.referenceId)) {
        throw new Error(`Référence déjà utilisée : ${demande.referenceId}`);
      }
      const { issue, raison } = scenarioPourMsisdn(demande.telephone);
      // Le scénario « différé » ne se dénoue qu'après un délai plus long.
      const attente = raison === 'DELAYED' ? delaiMs * 3 : delaiMs;
      transactions.set(demande.referenceId, {
        ...demande,
        issue,
        raison,
        payeA: issue === 'SUCCESSFUL' ? maintenant() + attente : null,
      });
    },

    async statut(referenceId) {
      const t = transactions.get(referenceId);
      if (!t) throw new Error('Référence de transaction inconnue chez MTN.');
      if (t.issue === 'PENDING') {
        return { statut: 'PENDING', montant: t.montant, devise: t.devise, financialTransactionId: null, raison: null };
      }
      if (t.issue === 'FAILED') {
        return {
          statut: 'FAILED',
          montant: t.montant,
          devise: t.devise,
          financialTransactionId: null,
          raison: t.raison,
        };
      }
      const echeance = t.payeA ?? maintenant();
      if (maintenant() < echeance) {
        return { statut: 'PENDING', montant: t.montant, devise: t.devise, financialTransactionId: null, raison: null };
      }
      return {
        statut: 'SUCCESSFUL',
        montant: t.montant,
        devise: t.devise,
        financialTransactionId: `MOCK-${referenceId.slice(0, 8)}`,
        raison: t.raison,
      };
    },
  };
}
