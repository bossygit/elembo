// Commande de tableaux recalculée côté serveur : c'est ce montant qui part chez MTN.
// Miroir de `tests/tableaux.test.ts` (navigateur) — les deux grilles sont comparées par
// `tests/coherenceCatalogues.test.ts`.

import { describe, expect, it } from 'vitest';

import { FORMATS_TABLEAU, PRODUIT_TABLEAU, formatTableau, palierTableau } from '../src/catalogue.ts';
import { ErreurCommande, calculerMontant } from '../src/pricing.ts';

const ville = 'brazzaville';

function montantTableau(tableaux: { formatId: string; support: string; quantite: number }[], villeId = ville) {
  return calculerMontant({ produitId: PRODUIT_TABLEAU, lignes: [], tableaux, villeId });
}

describe('tableaux : montant recalculé', () => {
  it('facture une toile seule au prix du format', () => {
    const m = montantTableau([{ formatId: '40x60', support: 'toile-seule', quantite: 1 }]);
    expect(m.sousTotalFcfa).toBe(formatTableau('40x60')!.prixToileSeuleFcfa);
    expect(m.montantFcfa).toBe(m.sousTotalFcfa + 100); // livraison de test
    expect(m.produitNom).toBe('Tableau canvas');
    expect(m.lignesTableaux).toHaveLength(1);
    expect(m.lignesTableaux![0].remisePct).toBe(0);
  });

  it('facture le montage sur châssis plus cher', () => {
    const toileSeule = montantTableau([{ formatId: '40x60', support: 'toile-seule', quantite: 1 }]);
    const chassis = montantTableau([{ formatId: '40x60', support: 'chassis', quantite: 1 }]);
    expect(chassis.sousTotalFcfa).toBeGreaterThan(toileSeule.sousTotalFcfa);
    expect(chassis.sousTotalFcfa).toBe(formatTableau('40x60')!.prixChassisFcfa);
  });

  it('applique la remise de palier sur la quantité', () => {
    const un = montantTableau([{ formatId: '40x60', support: 'chassis', quantite: 1 }]);
    const deux = montantTableau([{ formatId: '40x60', support: 'chassis', quantite: 2 }]);
    const cinq = montantTableau([{ formatId: '40x60', support: 'chassis', quantite: 5 }]);
    expect(palierTableau(2).remisePct).toBe(5);
    expect(deux.sousTotalFcfa).toBe(Math.ceil((un.sousTotalFcfa * 2 * 0.95) / 500) * 500);
    expect(cinq.sousTotalFcfa).toBe(Math.ceil((un.sousTotalFcfa * 5 * 0.9) / 500) * 500);
    expect(cinq.sousTotalFcfa / 5).toBeLessThan(un.sousTotalFcfa);
  });

  it('additionne plusieurs formats dans une même commande', () => {
    const m = montantTableau([
      { formatId: '30x40', support: 'chassis', quantite: 1 },
      { formatId: '50x70', support: 'toile-seule', quantite: 2 },
    ]);
    expect(m.lignesTableaux).toHaveLength(2);
    expect(m.quantiteTotale).toBe(3);
    // La remise de palier s'applique LIGNE PAR LIGNE : 1 tableau monté (0 %),
    // puis 2 toiles seules (5 %).
    const ligne2 = Math.ceil((formatTableau('50x70')!.prixToileSeuleFcfa * 2 * 0.95) / 500) * 500;
    expect(m.sousTotalFcfa).toBe(formatTableau('30x40')!.prixChassisFcfa + ligne2);
    expect(m.sousTotalFcfa).toBe(37_000);
    expect(m.montantFcfa).toBe(m.sousTotalFcfa + 100);
  });

  it('ajoute les frais de livraison de la ville', () => {
    const brazza = montantTableau([{ formatId: '20x30', support: 'toile-seule', quantite: 1 }], 'brazzaville');
    const pnr = montantTableau([{ formatId: '20x30', support: 'toile-seule', quantite: 1 }], 'pointe-noire');
    expect(brazza.fraisLivraisonFcfa).toBe(100);
    expect(pnr.fraisLivraisonFcfa).toBe(100);
  });

  it('annonce un délai compatible avec l’engagement de 3 jours', () => {
    expect(montantTableau([{ formatId: '40x60', support: 'toile-seule', quantite: 1 }]).delaiJours).toBe(1);
    expect(montantTableau([{ formatId: '40x60', support: 'chassis', quantite: 2 }]).delaiJours).toBe(2);
    expect(montantTableau([{ formatId: '40x60', support: 'chassis', quantite: 10 }]).delaiJours).toBe(3);
    expect(montantTableau([{ formatId: '60x90', support: 'chassis', quantite: 50 }]).delaiJours).toBeLessThanOrEqual(3);
  });
});

describe('tableaux : ce qui doit être refusé', () => {
  it('refuse un format inconnu', () => {
    expect(() => montantTableau([{ formatId: '100x200', support: 'chassis', quantite: 1 }])).toThrow(ErreurCommande);
  });

  it('refuse un support inconnu', () => {
    expect(() => montantTableau([{ formatId: '40x60', support: 'cadre-dore', quantite: 1 }])).toThrow(
      /Support inconnu/,
    );
  });

  it('refuse une quantité nulle, négative ou déraisonnable', () => {
    for (const quantite of [0, -1, 51, 2.5]) {
      expect(() => montantTableau([{ formatId: '40x60', support: 'chassis', quantite }]), `quantité ${quantite}`).toThrow(
        ErreurCommande,
      );
    }
  });

  it('refuse une commande de tableau sans ligne', () => {
    expect(() => calculerMontant({ produitId: PRODUIT_TABLEAU, lignes: [], tableaux: [], villeId: ville })).toThrow(
      /sans format/,
    );
  });

  it('refuse une ville inconnue', () => {
    expect(() => montantTableau([{ formatId: '40x60', support: 'chassis', quantite: 1 }], 'dolisie')).toThrow(
      /Ville inconnue/,
    );
  });
});

describe('catalogue des tableaux', () => {
  it('expose cinq formats cohérents', () => {
    expect(FORMATS_TABLEAU.map((f) => f.id)).toEqual(['20x30', '30x40', '40x60', '50x70', '60x90']);
    for (const f of FORMATS_TABLEAU) {
      expect(f.prixToileSeuleFcfa % 500, `${f.id} toile seule`).toBe(0);
      expect(f.prixChassisFcfa % 500, `${f.id} châssis`).toBe(0);
      expect(f.prixChassisFcfa).toBeGreaterThan(f.prixToileSeuleFcfa);
    }
  });
});
