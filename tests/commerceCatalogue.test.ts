import { describe, expect, it } from 'vitest';

import {
  PRODUITS_VITRINE,
  formatFcfa,
  paiementEnLigneOuvert,
  prixVitrine,
} from '../src/lib/commerce/catalogue';

describe('prix de la vitrine', () => {
  it('masque un prix de test ou provisoire', () => {
    const test = prixVitrine(100, 'test');
    expect(test.montant).toBeNull();
    expect(test.libelle).toMatch(/Prix sur demande/);
    expect(test.note).toMatch(/test/i);

    const provisoire = prixVitrine(7500, 'provisoire');
    expect(provisoire.montant).toBeNull();
    expect(provisoire.note).toMatch(/validation/i);
  });

  it('affiche un prix validé en FCFA', () => {
    const valide = prixVitrine(12500, 'valide');
    expect(valide.montant).toBe(12500);
    expect(valide.libelle).toBe('12 500 FCFA');
    expect(valide.note).toMatch(/TTC/);
  });

  it('formate les milliers avec une espace, jamais une virgule', () => {
    expect(formatFcfa(1000)).toBe('1 000 FCFA');
    expect(formatFcfa(12500)).toBe('12 500 FCFA');
  });

  it('n’ouvre le paiement que pour un prix validé (hors dérogation de recette)', () => {
    expect(paiementEnLigneOuvert('valide')).toBe(true);
    expect(paiementEnLigneOuvert('test')).toBe(false);
    expect(paiementEnLigneOuvert('provisoire')).toBe(false);
  });

  it('le catalogue public ne présente aucun montant non validé', () => {
    for (const produit of PRODUITS_VITRINE) {
      expect(produit.prix.libelle, produit.id).toMatch(/Prix sur demande|FCFA/);
      if (produit.prix.montant !== null) {
        expect(produit.prix.statut, produit.id).toBe('valide');
      }
    }
  });
});
