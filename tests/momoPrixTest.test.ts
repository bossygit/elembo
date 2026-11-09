/**
 * Barrière de facturation : un prix de test ne doit jamais être encaissé en mode réel, même si
 * l'appel ne vient pas de la vitrine. Le bouton masqué n'est pas une sécurité.
 */

import { describe, expect, it } from 'vitest';

import { lireConfig, type Config } from '../src/server/momo/config';
import { creerClientMock } from '../src/server/momo/mock-mtn';
import { creerGestionnaire } from '../src/server/momo/service';
import { StoreMemoire } from '../src/server/momo/store';

const COMMANDE = {
  commande: 'ELB-20261109-1200-AB',
  produitId: 'tshirt-basic',
  lignes: [{ taille: 'M', quantite: 1 }],
  villeId: 'brazzaville',
  telephone: '06 123 45 67',
};

function configReelle(extra: Record<string, string> = {}): Config {
  return lireConfig({
    MOMO_ENV: 'mtncongo',
    MOMO_SUBSCRIPTION_KEY: 's',
    MOMO_API_USER: 'u',
    MOMO_API_KEY: 'k',
    MOMO_DATA_FILE: '/tmp/elembo-test-transactions.json',
    ...extra,
  });
}

function serviceAvec(config: Config) {
  return creerGestionnaire({
    config,
    client: creerClientMock({ delaiMs: 0 }),
    store: new StoreMemoire(),
    journal: () => {},
  });
}

describe('prix non validés', () => {
  it('refuse un paiement réel sur un prix de test, avant tout appel MTN', async () => {
    const config = configReelle();
    expect(config.mode).toBe('reel');
    expect(config.autoriserPrixTest).toBe(false);

    const service = serviceAvec(config);
    const r = await service.payer(COMMANDE);
    expect(r.statut).toBe(422);
    expect(String((r.corps as { erreur: string }).erreur)).toMatch(/pas validé commercialement/);
  });

  it('accepte le même paiement quand la dérogation serveur est explicite', async () => {
    const config = configReelle({ MOMO_ALLOW_TEST_PRICES: '1' });
    expect(config.autoriserPrixTest).toBe(true);

    const service = serviceAvec(config);
    expect((await service.payer(COMMANDE)).statut).toBe(201);
  });

  it('refuse le barème tableaux provisoire en mode réel', async () => {
    const service = serviceAvec(configReelle());
    const r = await service.payer({
      commande: 'ELB-20261109-1300-CD',
      produitId: 'tableau',
      lignes: [],
      tableaux: [{ formatId: '30x40', support: 'chassis', quantite: 1 }],
      villeId: 'brazzaville',
      telephone: '06 123 45 67',
    });
    expect(r.statut).toBe(422);
    expect(String((r.corps as { erreur: string }).erreur)).toMatch(/barème des tableaux/);
  });

  it('le mode démonstration autorise les prix de test (aucun argent réel)', () => {
    const config = lireConfig({ MOMO_MOCK: '1' });
    expect(config.mode).toBe('mock');
    expect(config.autoriserPrixTest).toBe(true);
  });
});
