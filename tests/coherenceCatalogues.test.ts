// Cohérence des prix — désormais garantie par construction, et vérifiée ici.
//
// Depuis la mise en place de la source unique (`tarifs/grille.json`), ni le navigateur ni le
// service ne recopient un prix : les deux LISENT le même fichier — l'application à la
// compilation, le service à son démarrage. Ce test vérifie donc trois choses :
//   1. la grille est exploitable (un prix absent doit être `null` explicite, jamais zéro) ;
//   2. les deux moteurs de calcul donnent le MÊME prix pour chaque format et chaque support
//      (c'est la vraie garantie : deux formules qui divergeraient produiraient deux montants) ;
//   3. la grille et les prix attendus sont ÉPINGLÉS : une modification involontaire d'un tarif
//      échoue ici au lieu de partir en production.

import { describe, expect, it } from 'vitest';

import { CATALOG, PLACEHOLDER_PRODUCT } from '../src/lib/products/catalog';
import { DELIVERY } from '../src/lib/order/order';
import { FORMATS, PALIERS, formatParId, prixUnitaireFcfa } from '../src/lib/products/tableaux';
import { GRILLE } from '../src/lib/tarifs/grille';
import { CATALOGUE, FORMATS_TABLEAU, PALIERS_TABLEAU, VILLES } from '../momo-service/src/catalogue';

/** Produits réellement commandables : le produit de démonstration (uv/placeholder) n'en fait pas partie. */
const produitsVendables = CATALOG.filter((p) => p.id !== PLACEHOLDER_PRODUCT.id);

/** Grille de référence VALIDÉE provisoirement (elle devra être révisée après chiffrage réel). */
const GRILLE_ATTENDUE: Record<string, { toileSeule: number; chassis: number }> = {
  '20x30': { toileSeule: 5_000, chassis: 7_500 },
  '30x40': { toileSeule: 7_000, chassis: 11_000 },
  '40x60': { toileSeule: 10_500, chassis: 17_500 },
  '50x70': { toileSeule: 13_500, chassis: 23_000 },
  '60x90': { toileSeule: 19_500, chassis: 33_000 },
};

describe('source unique des prix (tarifs/grille.json)', () => {
  it('est lisible et annoncée comme provisoire', () => {
    expect(GRILLE.version).toBe(1);
    expect(GRILLE.devise).toBe('XAF');
    expect(GRILLE.statut).toMatch(/PROVISOIRE/i);
  });

  it('ne contient que des prix exploitables : nombre positif, ou null explicite', () => {
    for (const p of GRILLE.produits) {
      if (p.prixFcfa !== null) {
        expect(typeof p.prixFcfa, `prix de ${p.id}`).toBe('number');
        expect(p.prixFcfa, `prix de ${p.id}`).toBeGreaterThan(0);
      }
    }
    for (const v of GRILLE.livraison.villes) {
      if (v.fraisFcfa !== null) expect(v.fraisFcfa, `frais de ${v.id}`).toBeGreaterThan(0);
    }
  });

  it('décrit les formats dans l’ordre croissant et des paliers croissants partant de 1', () => {
    const surfaces = GRILLE.tableaux.formats.map((f) => f.largeurCm * f.hauteurCm);
    expect([...surfaces].sort((a, b) => a - b)).toEqual(surfaces);
    expect(GRILLE.tableaux.paliers[0].aPartirDe).toBe(1);
    const paliers = GRILLE.tableaux.paliers.map((p) => p.aPartirDe);
    expect([...paliers].sort((a, b) => a - b)).toEqual(paliers);
    expect(GRILLE.tableaux.tarifs.arrondiFcfa).toBeGreaterThan(0);
  });
});

describe('prix du catalogue — navigateur et service identiques', () => {
  it('chaque produit vendable existe côté serveur avec le même prix', () => {
    for (const produit of produitsVendables) {
      const serveur = CATALOGUE.find((p) => p.id === produit.id);
      expect(serveur, `produit absent du catalogue serveur : ${produit.id}`).toBeDefined();
      expect(serveur?.prixFcfa, `prix divergent pour ${produit.id}`).toBe(produit.priceFcfa);
    }
  });

  it('le prix affiché vient bien de la grille (aucune recopie cachée)', () => {
    for (const produit of produitsVendables) {
      const dansLaGrille = GRILLE.produits.find((p) => p.id === produit.id);
      expect(dansLaGrille, `produit absent de la grille : ${produit.id}`).toBeDefined();
      expect(produit.priceFcfa, `prix désynchronisé de la grille : ${produit.id}`).toBe(
        dansLaGrille!.prixFcfa,
      );
    }
  });

  it('aucun produit vendable n’est sans prix (un montant non arbitré doit manquer, pas être inventé)', () => {
    for (const produit of produitsVendables) {
      expect(produit.priceFcfa, `prix manquant pour ${produit.id}`).toBeTypeOf('number');
      expect(produit.priceFcfa ?? 0).toBeGreaterThan(0);
    }
  });

  it('chaque ville livrée existe côté serveur avec les mêmes frais et le même délai', () => {
    for (const ville of DELIVERY) {
      const serveur = VILLES.find((v) => v.id === ville.city);
      expect(serveur, `ville absente du catalogue serveur : ${ville.city}`).toBeDefined();
      expect(serveur?.fraisFcfa, `frais divergents pour ${ville.city}`).toBe(ville.feeFcfa);
      expect(serveur?.delaiMaxJours, `délai divergent pour ${ville.city}`).toBe(ville.maxDays);
    }
  });

  it('le serveur ne connaît pas de produit ou de ville hors application', () => {
    const idsApp = new Set(produitsVendables.map((p) => p.id));
    for (const p of CATALOGUE) expect(idsApp.has(p.id), `produit serveur inconnu de l’application : ${p.id}`).toBe(true);

    const villesApp = new Set<string>(DELIVERY.map((v) => v.city));
    for (const v of VILLES) expect(villesApp.has(v.id), `ville serveur inconnue de l’application : ${v.id}`).toBe(true);
  });
});

describe('prix des tableaux — navigateur et service identiques', () => {
  it('propose exactement les mêmes formats, dans le même ordre', () => {
    expect(FORMATS_TABLEAU.map((f) => f.id)).toEqual(FORMATS.map((f) => f.id));
    for (const f of FORMATS) {
      const serveur = FORMATS_TABLEAU.find((s) => s.id === f.id);
      expect(serveur, `format absent du catalogue serveur : ${f.id}`).toBeDefined();
      expect(serveur!.largeurCm).toBe(f.largeurCm);
      expect(serveur!.hauteurCm).toBe(f.hauteurCm);
    }
  });

  it('les DEUX formules de calcul donnent le même prix, pour chaque format et chaque support', () => {
    for (const f of FORMATS) {
      const local = formatParId(f.id)!;
      const serveur = FORMATS_TABLEAU.find((s) => s.id === f.id)!;
      expect(prixUnitaireFcfa(local, 'toile-seule'), `toile seule ${f.id}`).toBe(
        serveur.prixToileSeuleFcfa,
      );
      expect(prixUnitaireFcfa(local, 'chassis'), `châssis ${f.id}`).toBe(serveur.prixChassisFcfa);
    }
  });

  it('applique les mêmes paliers de quantité des deux côtés', () => {
    expect(PALIERS_TABLEAU.map((p) => ({ ...p }))).toEqual(PALIERS.map((p) => ({ ...p })));
  });

  it('la grille des tableaux correspond aux prix validés provisoirement', () => {
    for (const f of FORMATS) {
      const attendu = GRILLE_ATTENDUE[f.id];
      expect(attendu, `aucun prix de référence pour ${f.id}`).toBeDefined();
      const serveur = FORMATS_TABLEAU.find((s) => s.id === f.id)!;
      expect(serveur.prixToileSeuleFcfa, `toile seule ${f.id}`).toBe(attendu.toileSeule);
      expect(serveur.prixChassisFcfa, `châssis ${f.id}`).toBe(attendu.chassis);
    }
  });
});
