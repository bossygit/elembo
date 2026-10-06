import { describe, expect, it, vi } from 'vitest';

import {
  ErreurPaiement,
  demanderPaiement,
  lireStatut,
  suivrePaiement,
  telephonePlausible,
  urlService,
} from '../src/lib/payment/momo';

function reponse(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json' },
  });
}

const DEMANDE = {
  commande: 'ELB-20261001-1800-AB',
  produitId: 'tshirt-basic',
  lignes: [{ taille: 'M', quantite: 2 }],
  villeId: 'brazzaville',
  telephone: '06 123 45 67',
};

describe('demande de paiement', () => {
  it('envoie la commande au service et récupère la référence à suivre', async () => {
    const appels: { url: string; corps: unknown }[] = [];
    const fetchFactice = (async (url: string | URL | Request, init?: RequestInit) => {
      appels.push({ url: String(url), corps: JSON.parse(String(init?.body ?? '{}')) });
      return reponse({ referenceId: 'ref-1', statut: 'PENDING', montantFcfa: 11000, devise: 'XAF' }, 201);
    }) as unknown as typeof fetch;

    const paiement = await demanderPaiement(DEMANDE, fetchFactice);

    expect(appels[0]!.url).toBe(`${urlService()}/api/momo/payer`);
    // Le navigateur n'envoie jamais de montant : seulement le choix du client.
    expect(appels[0]!.corps).toEqual(DEMANDE);
    expect(appels[0]!.corps).not.toHaveProperty('montantFcfa');
    expect(paiement).toMatchObject({ referenceId: 'ref-1', statut: 'PENDING', montantFcfa: 11000 });
  });

  it('remonte le motif de refus renvoyé par le service', async () => {
    const fetchFactice = (async () =>
      reponse({ erreur: 'Ville inconnue : Dolisie.' }, 422)) as unknown as typeof fetch;

    await expect(demanderPaiement({ ...DEMANDE, villeId: 'dolisie' }, fetchFactice)).rejects.toThrow(
      /Ville inconnue/,
    );
    await expect(demanderPaiement(DEMANDE, fetchFactice)).rejects.toBeInstanceOf(ErreurPaiement);
  });

  it('explique clairement un service injoignable', async () => {
    const fetchFactice = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(demanderPaiement(DEMANDE, fetchFactice)).rejects.toThrow(/injoignable/);
  });
});

describe('suivi du paiement', () => {
  it('s’arrête dès un état définitif', async () => {
    const suite = ['PENDING', 'PENDING', 'PAYE'];
    let i = 0;
    const fetchFactice = (async () =>
      reponse({ statut: suite[Math.min(i++, suite.length - 1)], montantFcfa: 11000, devise: 'XAF' })) as unknown as typeof fetch;
    const dormir = vi.fn(async () => undefined);

    const resultat = await suivrePaiement('ref-1', { fetchImpl: fetchFactice, dormir });

    expect(resultat.paiement.statut).toBe('PAYE');
    expect(resultat.expire).toBe(false);
    expect(dormir).toHaveBeenCalledTimes(2); // pas d'attente après l'état définitif
  });

  it('allonge progressivement l’intervalle, sans dépasser le plafond', async () => {
    const fetchFactice = (async () => reponse({ statut: 'PENDING' })) as unknown as typeof fetch;
    const attentes: number[] = [];
    const dormir = async (ms: number) => {
      attentes.push(ms);
    };

    const resultat = await suivrePaiement('ref-1', {
      fetchImpl: fetchFactice,
      dormir,
      intervalleMs: 1000,
      intervalleMaxMs: 2500,
      delaiMaxMs: 20_000,
    });

    expect(resultat.expire).toBe(true);
    expect(resultat.paiement.statut).toBe('PENDING');
    expect(attentes[0]).toBe(1000);
    expect(attentes[1]).toBe(1500);
    expect(Math.max(...attentes)).toBeLessThanOrEqual(2500);
    expect(attentes.length).toBeGreaterThan(2);
  });

  it('signale l’expiration du délai de suivi sans inventer un succès', async () => {
    const fetchFactice = (async () => reponse({ statut: 'PENDING' })) as unknown as typeof fetch;
    const resultat = await suivrePaiement('ref-1', {
      fetchImpl: fetchFactice,
      dormir: async () => undefined,
      intervalleMs: 1000,
      delaiMaxMs: 2000,
    });
    expect(resultat.expire).toBe(true);
    expect(resultat.paiement.statut).toBe('PENDING');
  });

  it('rapporte les états intermédiaires à l’appelant', async () => {
    const suite = ['PENDING', 'PAYE'];
    let i = 0;
    const fetchFactice = (async () => reponse({ statut: suite[Math.min(i++, 1)] })) as unknown as typeof fetch;
    const vus: string[] = [];
    await suivrePaiement('ref-1', {
      fetchImpl: fetchFactice,
      dormir: async () => undefined,
      onEtat: (p) => vus.push(p.statut),
    });
    expect(vus).toEqual(['PENDING', 'PAYE']);
  });

  it('transmet un échec avec sa raison', async () => {
    const fetchFactice = (async () =>
      reponse({ statut: 'ECHEC', raison: 'REJECTED', montantFcfa: 11000 })) as unknown as typeof fetch;
    const resultat = await suivrePaiement('ref-1', { fetchImpl: fetchFactice, dormir: async () => undefined });
    expect(resultat.paiement.statut).toBe('ECHEC');
    expect(resultat.paiement.raison).toBe('REJECTED');
  });

  it('lit un statut en 404 comme une erreur explicite', async () => {
    const fetchFactice = (async () => reponse({ erreur: 'Référence inconnue.' }, 404)) as unknown as typeof fetch;
    await expect(lireStatut('inconnue', fetchFactice)).rejects.toThrow(/Référence inconnue/);
  });
});

describe('validation du numéro côté navigateur', () => {
  it('accepte les écritures congolaises et les numéros de test MTN', () => {
    for (const numero of ['061234567', '06 12 34 567', '+242 06 12 34 567', '00242061234567', '242061234567', '46733123450']) {
      expect(telephonePlausible(numero), numero).toBe(true);
    }
  });

  it('refuse ce qui ne peut pas être un mobile congolais', () => {
    for (const numero of ['', '12345', '070000000', '0612345678']) {
      expect(telephonePlausible(numero), numero).toBe(false);
    }
  });
});

describe('adresse du service de paiement', () => {
  it('utilise l’adresse compilée par défaut', () => {
    expect(urlService()).toBe('http://localhost:8787');
  });

  it('privilégie l’adresse définie à l’exécution (public/api-config.js)', () => {
    const g = globalThis as unknown as { window?: unknown };
    try {
      g.window = { __ELEMBO_MOMO_API_URL__: 'https://tunnel.exemple.cg/' };
      expect(urlService()).toBe('https://tunnel.exemple.cg');

      // Valeur vide : on retombe sur l'adresse compilée plutôt que d'appeler nulle part.
      g.window = { __ELEMBO_MOMO_API_URL__: '   ' };
      expect(urlService()).toBe('http://localhost:8787');
    } finally {
      delete g.window;
    }
  });
});
