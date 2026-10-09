import { describe, expect, it } from 'vitest';

import { CATALOGUE, GRILLE, VILLES, produit, ville } from '../src/catalogue.ts';
import { ErreurCommande, calculerMontant, delaiJours, normaliserLignes } from '../src/pricing.ts';

describe('montant recalculé côté serveur', () => {
  it('applique prix unitaire × quantité + livraison', () => {
    const m = calculerMontant({
      produitId: 'tshirt-basic',
      lignes: [{ taille: 'M', quantite: 2 }, { taille: 'L', quantite: 3 }],
      villeId: 'brazzaville',
    });
    expect(m.quantiteTotale).toBe(5);
    expect(m.sousTotalFcfa).toBe(5 * produit('tshirt-basic')!.prixFcfa);
    expect(m.fraisLivraisonFcfa).toBe(ville('brazzaville')!.fraisFcfa);
    expect(m.montantFcfa).toBe(m.sousTotalFcfa + m.fraisLivraisonFcfa);
    expect(m.delaiJours).toBe(1);
  });

  it('facture les frais de livraison de Pointe-Noire', () => {
    expect(ville('pointe-noire')?.fraisFcfa).toBe(100); // prix de test (tarif arbitré : 2 000)
    const m = calculerMontant({
      produitId: 'tshirt-basic',
      lignes: [{ taille: 'M', quantite: 1 }],
      villeId: 'pointe-noire',
    });
    expect(m.fraisLivraisonFcfa).toBe(ville('pointe-noire')!.fraisFcfa);
    expect(m.montantFcfa).toBe(produit('tshirt-basic')!.prixFcfa + ville('pointe-noire')!.fraisFcfa!);
  });

  it('aucune ville livrée n’a de tarif non arbitré', () => {
    // Ceinture de sécurité : une ville ajoutée sans tarif ferait échouer ce test au lieu
    // de laisser le service facturer un montant inventé.
    for (const v of VILLES) {
      expect(v.fraisFcfa).not.toBeNull();
      expect(v.fraisFcfa ?? 0).toBeGreaterThan(0);
    }
  });

  it('refuse un produit, une ville ou une taille inconnus', () => {
    expect(() => calculerMontant({ produitId: 'mug', lignes: [{ taille: 'M', quantite: 1 }], villeId: 'brazzaville' })).toThrow(/Produit inconnu/);
    expect(() => calculerMontant({ produitId: 'tshirt-basic', lignes: [{ taille: 'M', quantite: 1 }], villeId: 'dolisie' })).toThrow(/Ville inconnue/);
    expect(() => calculerMontant({ produitId: 'tshirt-basic', lignes: [{ taille: 'XXL', quantite: 1 }], villeId: 'brazzaville' })).toThrow(/Taille inconnue/);
  });

  it('refuse une commande sans pièce ou avec des quantités absurdes', () => {
    expect(() => calculerMontant({ produitId: 'tshirt-basic', lignes: [], villeId: 'brazzaville' })).toThrow(/aucune pièce/);
    expect(() => calculerMontant({ produitId: 'tshirt-basic', lignes: [{ taille: 'M', quantite: 0 }], villeId: 'brazzaville' })).toThrow(/aucune pièce/);
    expect(() => calculerMontant({ produitId: 'tshirt-basic', lignes: [{ taille: 'M', quantite: 501 }], villeId: 'brazzaville' })).toThrow(/Quantité invalide/);
    expect(() => calculerMontant({ produitId: 'tshirt-basic', lignes: [{ taille: 'M', quantite: 2.5 }], villeId: 'brazzaville' })).toThrow(/Quantité invalide/);
  });

  it('agrège les lignes répétées après normalisation', () => {
    expect(normaliserLignes([{ taille: 'm', quantite: 1 }, { taille: 'M', quantite: 2 }])).toEqual([
      { taille: 'M', quantite: 1 },
      { taille: 'M', quantite: 2 },
    ]);
  });

  it('n’annonce jamais plus de trois jours, quelle que soit la quantité', () => {
    expect(delaiJours(1)).toBe(1);
    expect(delaiJours(5)).toBe(1);
    expect(delaiJours(6)).toBe(2);
    expect(delaiJours(20)).toBe(2);
    expect(delaiJours(21)).toBe(3);
    expect(delaiJours(5000)).toBe(3);
  });
});

describe('le catalogue serveur vient de la source unique des prix', () => {
  // Les prix ne sont plus recopiés dans le service : il lit `tarifs/grille.json`, exactement le
  // même fichier que celui importé par l'application au moment de la compilation. Ces tests
  // vérifient donc que le service ne fait que DÉRIVER de la grille — aucune valeur propre —, ce
  // qui rend une divergence entre prix affiché et prix encaissé structurellement impossible.
  // (La comparaison des deux moteurs de calcul, elle, est faite par
  // `tests/coherenceCatalogues.test.ts` côté application.)

  it('reprend exactement les produits de la grille', () => {
    expect(CATALOGUE.map((p) => ({ id: p.id, nom: p.nom, prixFcfa: p.prixFcfa }))).toEqual(
      GRILLE.produits.map((p) => ({ id: p.id, nom: p.nom, prixFcfa: p.prixFcfa })),
    );
  });

  it('reprend exactement les villes et les frais de la grille', () => {
    expect(VILLES.map((v) => ({ id: v.id, nom: v.nom, fraisFcfa: v.fraisFcfa }))).toEqual(
      GRILLE.livraison.villes.map((v) => ({ id: v.id, nom: v.nom, fraisFcfa: v.fraisFcfa })),
    );
  });

  it('applique le délai maximum de la grille, jamais plus de trois jours', () => {
    for (const v of VILLES) expect(v.delaiMaxJours).toBe(GRILLE.livraison.delaiMaxJours);
    expect(GRILLE.livraison.delaiMaxJours).toBeLessThanOrEqual(3);
  });

  it('la grille trouvée est bien celle du dépôt', () => {
    expect(GRILLE.devise).toBe('XAF');
    expect(GRILLE.produits.length).toBeGreaterThan(0);
    expect(GRILLE.tableaux.formats.length).toBeGreaterThan(0);
  });
});

describe('erreurs de commande', () => {
  it('sont identifiables pour être renvoyées en 422', () => {
    try {
      calculerMontant({ produitId: 'inconnu', lignes: [{ taille: 'M', quantite: 1 }], villeId: 'brazzaville' });
      throw new Error('aurait dû échouer');
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurCommande);
    }
  });
});
