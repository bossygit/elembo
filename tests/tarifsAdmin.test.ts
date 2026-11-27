// Prix et frais de livraison pilotés depuis l'admin : lecture contrôlée de la base, montant
// recalculé avec les tarifs COURANTS, refus si le produit n'est pas vendable ou si le prix a
// changé depuis l'affichage, refus (sans appel MTN) si les tarifs sont illisibles.

import { describe, expect, it } from 'vitest';

import {
  lireLivraisonBase,
  produitFacturable,
  statutVersBase,
  tarifProduit,
  tarifsDepuisBase,
  tarifsDepuisGrille,
  tarifsIndisponibles,
  type LigneProduitBase,
  type Tarifs,
} from '../src/lib/tarifs/tarifs';
import { calculerMontant, verifierFacturable, verifierMontantAttendu } from '../src/server/momo/pricing';
import { lireConfig, type Config } from '../src/server/momo/config';
import { creerClientMock } from '../src/server/momo/mock-mtn';
import type { ClientMomo } from '../src/server/momo/mtn';
import { creerGestionnaire } from '../src/server/momo/service';
import { StoreMemoire } from '../src/server/momo/store';
import { vitrineAvecTarifs, PRODUITS_VITRINE } from '../src/lib/commerce/catalogue';
import { CAP_PRODUCT_ID } from '../src/lib/products/catalog';
import { optionsLivraison, orderTotals } from '../src/lib/order/order';

const LIVRAISON_BASE = {
  villes: [
    { id: 'brazzaville', nom: 'Brazzaville', frais_fcfa: 1500 },
    { id: 'pointe-noire', nom: 'Pointe-Noire', frais_fcfa: 2500 },
  ],
  statut_prix: 'VALIDE',
  delai_max_jours: 3,
};

function ligne(id: string, champs: Partial<LigneProduitBase> = {}): LigneProduitBase {
  return { id, nom: id, prix_fcfa: 1000, statut_prix: 'VALIDE', actif: true, disponible: true, ...champs };
}

const BASE: Tarifs = tarifsDepuisBase(
  [
    ligne('tshirt-basic', { nom: 'T-Shirt raglan', prix_fcfa: 5000 }),
    ligne(CAP_PRODUCT_ID, { nom: 'Casquette Elembo', prix_fcfa: 2000 }),
    ligne('mug-personnalise', { nom: 'Mug', prix_fcfa: null, statut_prix: 'PROVISOIRE' }),
    ligne('tshirt-alt', { nom: 'Col rond', disponible: false }),
  ],
  LIVRAISON_BASE,
);

describe('lecture des tarifs de l’admin', () => {
  it('convertit statuts, montants et vendabilité', () => {
    expect(BASE.source).toBe('base');
    expect(tarifProduit(BASE, CAP_PRODUCT_ID)).toEqual({
      id: CAP_PRODUCT_ID,
      nom: 'Casquette Elembo',
      prixFcfa: 2000,
      statutPrix: 'valide',
      vendable: true,
    });
    expect(tarifProduit(BASE, 'mug-personnalise')).toMatchObject({ prixFcfa: null, statutPrix: 'provisoire' });
    expect(tarifProduit(BASE, 'tshirt-alt')?.vendable).toBe(false);
    expect(BASE.livraison).toEqual({
      statutPrix: 'valide',
      delaiMaxJours: 3,
      villes: [
        { id: 'brazzaville', nom: 'Brazzaville', fraisFcfa: 1500 },
        { id: 'pointe-noire', nom: 'Pointe-Noire', fraisFcfa: 2500 },
      ],
    });
  });

  it('refuse des frais de livraison mal formés plutôt que d’inventer un montant', () => {
    expect(() => lireLivraisonBase(null)).toThrow(/aucune ville/);
    expect(() => lireLivraisonBase({ ...LIVRAISON_BASE, villes: [] })).toThrow(/aucune ville/);
    expect(() => lireLivraisonBase({ ...LIVRAISON_BASE, delai_max_jours: 0 })).toThrow(/délai/);
    expect(() =>
      lireLivraisonBase({ ...LIVRAISON_BASE, villes: [{ id: 'brazzaville', nom: 'B', frais_fcfa: -5 }] }),
    ).toThrow(/frais invalides/);
    expect(() =>
      lireLivraisonBase({
        ...LIVRAISON_BASE,
        villes: [LIVRAISON_BASE.villes[0], LIVRAISON_BASE.villes[0]],
      }),
    ).toThrow(/en double/);
    // Une ville « à confirmer » (null) est admise : la commande sera bloquée pour elle.
    expect(lireLivraisonBase({ ...LIVRAISON_BASE, villes: [{ id: 'brazzaville', nom: 'B', frais_fcfa: null }] }).villes[0].fraisFcfa).toBeNull();
  });

  it('un prix négatif ou décimal venu de la base est ignoré (traité comme absent)', () => {
    const t = tarifsDepuisBase([ligne('x-produit', { prix_fcfa: 12.5 })], LIVRAISON_BASE);
    expect(tarifProduit(t, 'x-produit')?.prixFcfa).toBeNull();
    expect(produitFacturable(tarifProduit(t, 'x-produit'))).toBe(false);
  });

  it('statuts : aller-retour base ↔ application', () => {
    for (const s of ['valide', 'provisoire', 'test'] as const) {
      expect(lireLivraisonBase({ ...LIVRAISON_BASE, statut_prix: statutVersBase(s) }).statutPrix).toBe(s);
    }
  });

  it('tarifs indisponibles : aucun prix, aucuns frais, villes conservées', () => {
    const t = tarifsIndisponibles();
    expect(t.produits).toEqual([]);
    expect(t.livraison.villes.length).toBeGreaterThan(0);
    expect(t.livraison.villes.every((v) => v.fraisFcfa === null)).toBe(true);
  });
});

describe('montant recalculé avec les tarifs de l’admin', () => {
  it('casquette en taille unique : prix et frais de l’admin', () => {
    const m = calculerMontant(
      { produitId: CAP_PRODUCT_ID, lignes: [{ taille: 'TU', quantite: 2 }], villeId: 'pointe-noire' },
      BASE,
    );
    expect(m).toMatchObject({ sousTotalFcfa: 4000, fraisLivraisonFcfa: 2500, montantFcfa: 6500, produitNom: 'Casquette Elembo' });
  });

  it('accepte la taille XXL envoyée par le formulaire du T-shirt', () => {
    const m = calculerMontant({ produitId: 'tshirt-basic', lignes: [{ taille: 'XXL', quantite: 1 }], villeId: 'brazzaville' }, BASE);
    expect(m.montantFcfa).toBe(5000 + 1500);
  });

  it('un changement de prix dans l’admin change le montant, sans redéploiement', () => {
    const avant = calculerMontant({ produitId: CAP_PRODUCT_ID, lignes: [{ taille: 'TU', quantite: 1 }], villeId: 'brazzaville' }, BASE);
    const apres = calculerMontant(
      { produitId: CAP_PRODUCT_ID, lignes: [{ taille: 'TU', quantite: 1 }], villeId: 'brazzaville' },
      tarifsDepuisBase([ligne(CAP_PRODUCT_ID, { prix_fcfa: 2500 })], LIVRAISON_BASE),
    );
    expect([avant.montantFcfa, apres.montantFcfa]).toEqual([3500, 4000]);
  });

  it('un produit absent de l’admin est refusé', () => {
    expect(() =>
      calculerMontant({ produitId: 'inconnu', lignes: [{ taille: 'M', quantite: 1 }], villeId: 'brazzaville' }, BASE),
    ).toThrow(/Produit inconnu/);
  });
});

describe('garde-fous du paiement', () => {
  const opts = { autoriserPrixTest: false, statutTableaux: 'valide' };

  it('ouvre le paiement pour un prix validé sur un produit vendable', () => {
    expect(() => verifierFacturable(CAP_PRODUCT_ID, BASE, opts)).not.toThrow();
  });

  it('refuse un prix non validé, ou un produit désactivé / indisponible', () => {
    expect(() => verifierFacturable('mug-personnalise', BASE, opts)).toThrow(/pas validé/);
    expect(() => verifierFacturable('tshirt-alt', BASE, opts)).toThrow(/pas ouvert à la vente/);
  });

  it('la dérogation explicite des essais encadrés lève ces refus', () => {
    expect(() => verifierFacturable('mug-personnalise', BASE, { ...opts, autoriserPrixTest: true })).not.toThrow();
  });

  it('refuse si le total affiché au client ne correspond plus au prix courant', () => {
    const m = calculerMontant({ produitId: CAP_PRODUCT_ID, lignes: [{ taille: 'TU', quantite: 1 }], villeId: 'brazzaville' }, BASE);
    expect(() => verifierMontantAttendu(3500, m)).not.toThrow();
    expect(() => verifierMontantAttendu(undefined, m)).not.toThrow();
    expect(() => verifierMontantAttendu(2100, m)).toThrow(/prix ont été mis à jour/);
    expect(() => verifierMontantAttendu('abc', m)).toThrow(/prix ont été mis à jour/);
  });
});

describe('service de paiement branché sur les tarifs de l’admin', () => {
  function monter(chargerTarifs: () => Promise<Tarifs>) {
    const config: Config = {
      ...lireConfig({ MOMO_MOCK: '1', APP_ORIGINS: 'https://elembo.vercel.app' }),
      autoriserPrixTest: false,
      delaiMockMs: 4000,
    };
    const appels: unknown[] = [];
    const mock = creerClientMock({ delaiMs: 4000 });
    const client: ClientMomo = {
      ...mock,
      async demarrerPaiement(demande) {
        appels.push(demande);
        return mock.demarrerPaiement(demande);
      },
    };
    const store = new StoreMemoire();
    const service = creerGestionnaire({ config, client, store, chargerTarifs, journal: () => {} });
    return { service, store, appels };
  }

  const COMMANDE = {
    commande: 'ELB-20261127-1200-CA',
    produitId: CAP_PRODUCT_ID,
    lignes: [{ taille: 'TU', quantite: 1 }],
    villeId: 'brazzaville',
    telephone: '06 123 45 67',
  };

  it('le montant enregistré est celui de l’admin (prix + frais)', async () => {
    const { service, store, appels } = monter(async () => BASE);
    const r = await service.payer({ ...COMMANDE, montantAttenduFcfa: 3500 });
    expect(r.statut).toBe(201);
    expect(appels).toHaveLength(1);
    const [tx] = await store.parCommande(COMMANDE.commande);
    expect(tx.montantFcfa).toBe(3500);
  });

  it('un prix changé depuis l’affichage : refus 422, MTN jamais appelé', async () => {
    const { service, appels } = monter(async () => BASE);
    const r = await service.payer({ ...COMMANDE, montantAttenduFcfa: 2100 });
    expect(r.statut).toBe(422);
    expect((r.corps as { erreur: string }).erreur).toMatch(/3 500 FCFA/);
    expect(appels).toHaveLength(0);
  });

  it('tarifs illisibles : refus 503, MTN jamais appelé', async () => {
    const { service, appels } = monter(async () => {
      throw new Error('base injoignable');
    });
    const r = await service.payer(COMMANDE);
    expect(r.statut).toBe(503);
    expect(appels).toHaveLength(0);
  });

  it('des tarifs fournis par l’appelant priment (une seule lecture par requête)', async () => {
    const { service, store } = monter(async () => {
      throw new Error('ne doit pas être relu');
    });
    const r = await service.payer(COMMANDE, { tarifs: BASE });
    expect(r.statut).toBe(201);
    const [tx] = await store.parCommande(COMMANDE.commande);
    expect(tx.montantFcfa).toBe(3500);
  });

  it('expose les tarifs appliqués, avec leur source', async () => {
    const { service } = monter(async () => BASE);
    const r = await service.tarifs();
    expect(r.corps).toMatchObject({ source: 'base' });
    expect((r.corps as { produits: { id: string; prixFcfa: number }[] }).produits.find((p) => p.id === CAP_PRODUCT_ID)?.prixFcfa).toBe(2000);
  });
});

describe('affichage aux tarifs courants', () => {
  it('la vitrine affiche le prix validé de l’admin, ou « Prix sur demande »', () => {
    const vitrine = vitrineAvecTarifs(BASE);
    expect(vitrine.find((p) => p.id === CAP_PRODUCT_ID)?.prix.libelle).toBe('2 000 FCFA');
    expect(vitrine.find((p) => p.id === 'tshirt-basic')?.prix.libelle).toBe('5 000 FCFA');
    // Indisponible dans l'admin : jamais de prix affiché.
    expect(vitrine.find((p) => p.id === 'tshirt-alt')?.prix.libelle).toBe('Prix sur demande');
    expect(vitrine.find((p) => p.id === 'mug-personnalise')?.prix.libelle).toBe('Prix sur demande');
    // Les autres fiches ne changent pas.
    const polo = PRODUITS_VITRINE.find((p) => p.id === 'polo-pique');
    expect(vitrine.find((p) => p.id === 'polo-pique')).toBe(polo);
  });

  it('tarifs indisponibles : tout passe en « Prix sur demande »', () => {
    const vitrine = vitrineAvecTarifs(tarifsIndisponibles());
    expect(vitrine.filter((p) => p.tarifId).every((p) => p.prix.libelle === 'Prix sur demande')).toBe(true);
  });

  it('le total du panier utilise les frais de l’admin', () => {
    const t = orderTotals({
      lines: [{ size: 'TU', quantity: 1 }],
      unitPriceFcfa: tarifProduit(BASE, CAP_PRODUCT_ID)!.prixFcfa,
      city: 'pointe-noire',
      delivery: optionsLivraison(BASE),
    });
    expect(t.totalFcfa).toBe(2000 + 2500);
  });

  it('repli local : la grille reprend les valeurs de départ (casquette 2 000 FCFA validée)', () => {
    expect(tarifProduit(tarifsDepuisGrille(), CAP_PRODUCT_ID)).toMatchObject({ prixFcfa: 2000, statutPrix: 'valide', vendable: true });
  });
});
