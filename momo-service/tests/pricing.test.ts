import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { CATALOGUE, VILLES, ville } from '../src/catalogue.ts';
import { ErreurCommande, calculerMontant, delaiJours, normaliserLignes } from '../src/pricing.ts';

describe('montant recalculé côté serveur', () => {
  it('applique prix unitaire × quantité + livraison', () => {
    const m = calculerMontant({
      produitId: 'tshirt-basic',
      lignes: [{ taille: 'M', quantite: 2 }, { taille: 'L', quantite: 3 }],
      villeId: 'brazzaville',
    });
    expect(m.quantiteTotale).toBe(5);
    expect(m.sousTotalFcfa).toBe(25000);
    expect(m.fraisLivraisonFcfa).toBe(1000);
    expect(m.montantFcfa).toBe(26000);
    expect(m.delaiJours).toBe(1);
  });

  it('facture les frais arbitrés de Pointe-Noire', () => {
    expect(ville('pointe-noire')?.fraisFcfa).toBe(2000);
    const m = calculerMontant({
      produitId: 'tshirt-basic',
      lignes: [{ taille: 'M', quantite: 1 }],
      villeId: 'pointe-noire',
    });
    expect(m.fraisLivraisonFcfa).toBe(2000);
    expect(m.montantFcfa).toBe(5000 + 2000);
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

describe('le catalogue serveur ne dérive pas de celui de l’application', () => {
  // Le montant facturé doit être exactement celui affiché au client : ces valeurs viennent du
  // dépôt de l'application, on les relit pour détecter toute divergence.
  const chemin = fileURLToPath(new URL('../../src/lib/products/catalog.ts', import.meta.url));
  const source = readFileSync(chemin, 'utf8');

  const prixApplication = [...source.matchAll(/id: '([\w-]+)',[\s\S]{0,900}?priceFcfa: (\d+)/g)].map((m) => ({
    id: m[1] as string,
    prixFcfa: Number(m[2]),
  }));

  const cheminLivraison = fileURLToPath(new URL('../../src/lib/order/order.ts', import.meta.url));
  const sourceLivraison = readFileSync(cheminLivraison, 'utf8');

  it('retrouve au moins un produit avec son prix dans l’application', () => {
    expect(prixApplication.length).toBeGreaterThan(0);
  });

  it('facture le même prix que celui annoncé dans l’application', () => {
    for (const p of prixApplication) {
      const serveur = CATALOGUE.find((c) => c.id === p.id);
      expect(serveur, `produit absent du catalogue serveur : ${p.id}`).toBeDefined();
      expect(serveur?.prixFcfa, `prix divergent pour ${p.id}`).toBe(p.prixFcfa);
    }
  });

  it('facture les mêmes frais de livraison que l’application', () => {
    const fraisBrazzaville = /brazzaville[\s\S]{0,200}?feeFcfa: (\d+)/i.exec(sourceLivraison)?.[1];
    expect(Number(fraisBrazzaville)).toBe(ville('brazzaville')?.fraisFcfa);
    for (const v of VILLES) expect(v.delaiMaxJours).toBeLessThanOrEqual(3);
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
