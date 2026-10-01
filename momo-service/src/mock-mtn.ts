/**
 * Simulateur MTN (mode démonstration, MOMO_MOCK=1).
 *
 * Il imite le comportement réel — 202 à la demande, statut qui évolue ensuite — et reprend la
 * convention des numéros de test de MTN pour choisir l'issue :
 *
 *   …50 → SUCCESSFUL     …51 → FAILED     …52 → reste PENDING
 *
 * Aucun accès réseau : on peut donc faire la recette complète du tunnel (commande → paiement →
 * production) sans clé et sans dépenser un franc.
 */

import type { ClientMomo, DemandePaiement, StatutPaiement } from './mtn.ts';

export type OptionsMock = {
  delaiMs?: number;
  maintenant?: () => number;
};

type Transaction = DemandePaiement & { payeA: number | null; issue: StatutPaiement['statut'] };

export function creerClientMock(opts: OptionsMock = {}): ClientMomo {
  const delaiMs = opts.delaiMs ?? 4000;
  const maintenant = opts.maintenant ?? (() => Date.now());
  const transactions = new Map<string, Transaction>();

  function issue(telephone: string): StatutPaiement['statut'] {
    const dernier = telephone.slice(-1);
    if (dernier === '1') return 'FAILED';
    if (dernier === '2') return 'PENDING';
    return 'SUCCESSFUL';
  }

  return {
    async demarrerPaiement(demande) {
      if (transactions.has(demande.referenceId)) {
        throw new Error(`Référence déjà utilisée : ${demande.referenceId}`);
      }
      const verdict = issue(demande.telephone);
      transactions.set(demande.referenceId, {
        ...demande,
        issue: verdict,
        payeA: verdict === 'SUCCESSFUL' ? maintenant() + delaiMs : null,
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
          raison: 'PAYER_NOT_FOUND',
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
        raison: null,
      };
    },
  };
}
