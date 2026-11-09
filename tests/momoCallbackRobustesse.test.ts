/**
 * Robustesse du callback MTN : la notification ne doit jamais provoquer de boucle chez
 * l'opérateur, et un montant formaté différemment ne doit pas être pris pour une fraude.
 *
 * Ces tests complètent `momoService.test.ts` sans réseau ni clé : le client MTN est injecté.
 */

import { describe, expect, it } from 'vitest';

import { produit, ville } from '../src/server/momo/catalogue';
import { lireConfig } from '../src/server/momo/config';
import type { ClientMomo, StatutPaiement } from '../src/server/momo/mtn';
import { creerGestionnaire, type Gestionnaire } from '../src/server/momo/service';
import { StoreMemoire, type JournalTransactions } from '../src/server/momo/store';

const COMMANDE = {
  commande: 'ELB-20261109-1200-AB',
  produitId: 'tshirt-basic',
  lignes: [{ taille: 'M', quantite: 2 }],
  villeId: 'brazzaville',
  telephone: '06 123 45 67',
};

const MONTANT = 2 * produit('tshirt-basic')!.prixFcfa! + ville('brazzaville')!.fraisFcfa!;

function monter(client: ClientMomo): { service: Gestionnaire; store: StoreMemoire } {
  const config = lireConfig({ MOMO_MOCK: '1', APP_ORIGINS: 'http://localhost:3000' });
  const store = new StoreMemoire();
  const service = creerGestionnaire({
    config,
    client,
    store,
    journal: () => {},
  });
  return { service, store };
}

const clientQuiEchoue: ClientMomo = {
  demarrerPaiement: async () => undefined,
  statut: async () => {
    throw new Error('MTN injoignable');
  },
};

const clientMontantDecimal: ClientMomo = {
  demarrerPaiement: async () => undefined,
  statut: async (): Promise<StatutPaiement> => ({
    statut: 'SUCCESSFUL',
    montant: `${MONTANT}.0`,
    devise: 'XAF',
    financialTransactionId: 'FT-DECIMAL',
    raison: null,
  }),
};

describe('callback MTN — robustesse', () => {
  it('répond 200 et laisse la transaction PENDING si la vérification MTN échoue', async () => {
    const { service, store } = monter(clientQuiEchoue);
    const creation = await service.payer(COMMANDE);
    expect(creation.statut).toBe(201);
    const { referenceId } = creation.corps as { referenceId: string };

    const r = await service.callback({ referenceId });
    expect(r.statut).toBe(200);
    expect(r.corps).toMatchObject({ recu: true, traite: false, statut: 'PENDING' });

    const transaction = await store.parReferenceId(referenceId);
    expect(transaction?.statut).toBe('PENDING');
  });

  it('accepte un montant « 300.0 » quand la commande vaut 300 (comparaison numérique)', async () => {
    const { service } = monter(clientMontantDecimal);
    const creation = await service.payer(COMMANDE);
    const { referenceId } = creation.corps as { referenceId: string };

    const r = await service.callback({ referenceId });
    expect(r.corps).toMatchObject({ traite: true, statut: 'PAYE' });
  });

  it('refuse une référence de commande dangereuse avant tout appel MTN', async () => {
    const { service } = monter(clientQuiEchoue);
    const r = await service.payer({ ...COMMANDE, commande: '../../etc/passwd' });
    expect(r.statut).toBe(422);
    expect(String((r.corps as { erreur: string }).erreur)).toMatch(/invalide/);
  });

  it('répond 200 même si le journal est injoignable (pas de boucle MTN)', async () => {
    const storeInjoignable = {
      verifier: async () => {},
      parReferenceId: async () => {
        throw new Error('Redis injoignable');
      },
      parCommande: async () => [],
      toutes: async () => [],
      creer: async () => {
        throw new Error('Redis injoignable');
      },
      maj: async () => {
        throw new Error('Redis injoignable');
      },
    } as unknown as JournalTransactions;

    const config = lireConfig({ MOMO_MOCK: '1', APP_ORIGINS: 'http://localhost:3000' });
    const service = creerGestionnaire({
      config,
      client: clientQuiEchoue,
      store: storeInjoignable,
      journal: () => {},
    });

    const r = await service.callback({ referenceId: 'ELB-20261109-1200-AB' });
    expect(r.statut).toBe(200);
    expect(r.corps).toMatchObject({ recu: true, traite: false });
  });
});
