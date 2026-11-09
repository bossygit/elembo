import { describe, expect, it } from 'vitest';

import {
  FAMILLES,
  PRODUITS_VITRINE,
  SERVICES_ENTREPRISE,
  SUPPORTS_IMPRESSION,
  formatFcfa,
  paiementEnLigneOuvert,
  prixVitrine,
} from '../src/lib/commerce/catalogue';
import { CATALOG } from '../src/lib/products/catalog';

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


describe('trois familles commerciales', () => {
  it('présente exactement les trois familles demandées', () => {
    expect(FAMILLES.map((f) => f.id)).toEqual(['textile', 'impression', 'services']);
  });

  it('couvre les produits textile prioritaires avec une fiche complète', () => {
    const textile = PRODUITS_VITRINE.filter((p) => p.famille === 'textile');
    expect(textile.map((p) => p.id)).toEqual(
      expect.arrayContaining(['tshirt-basic', 'polo-pique', 'tote-bag', 'textile-evenement', 'uniforme-personnalise']),
    );
    for (const produit of textile) {
      expect(produit.fiche, produit.id).toBeTruthy();
      expect(produit.href, produit.id).toMatch(/^\/textile\//);
      expect(produit.fiche?.tailles.length, produit.id).toBeGreaterThan(0);
      expect(produit.fiche?.couleurs.length, produit.id).toBeGreaterThan(0);
      expect(produit.fiche?.zones.length, produit.id).toBeGreaterThan(0);
      expect(produit.fiche?.technique, produit.id).toBeTruthy();
      expect(produit.fiche?.delai, produit.id).toBeTruthy();
    }
  });

  it('ne prétend pas rendre en 3D un produit sans modèle', () => {
    const ids3D = new Set(CATALOG.map((p) => p.id));
    for (const produit of PRODUITS_VITRINE) {
      if (produit.fiche?.configurable3D) {
        expect(ids3D.has(produit.fiche.produit3DId ?? ''), produit.id).toBe(true);
      } else if (produit.fiche) {
        expect(produit.fiche.avertissement, produit.id).toBeTruthy();
      }
    }
  });

  it('liste les huit supports imprimés et les services demandés', () => {
    expect(SUPPORTS_IMPRESSION.map((s) => s.id)).toEqual(
      expect.arrayContaining(['flyers', 'affiches', 'cartes-visite', 'menus', 'invitations', 'brochures', 'depliants', 'documents']),
    );
    expect(SERVICES_ENTREPRISE.map((s) => s.titre)).toEqual(
      expect.arrayContaining(['Identité visuelle', 'Création graphique', 'Communication événementielle', 'Commandes récurrentes']),
    );
  });
});
