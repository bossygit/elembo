// Cohérence des DEUX catalogues de prix.
//
// Le montant affiché au client vient du navigateur (`src/lib/products/catalog.ts` et
// `src/lib/order/order.ts`), le montant ENCAISSÉ est recalculé par le service MTN
// (`momo-service/src/catalogue.ts`). Deux fichiers, deux origines possibles de vérité : si
// l'un change sans l'autre, le client voit un prix et en paie un autre. Ce test les compare
// fichier par fichier — c'est le seul garde-fou contre une dérive silencieuse.

import { describe, expect, it } from 'vitest';

import { CATALOG, PLACEHOLDER_PRODUCT } from '../src/lib/products/catalog';
import { DELIVERY } from '../src/lib/order/order';
import { CATALOGUE, VILLES } from '../momo-service/src/catalogue';

/** Produits réellement commandables : le produit de démonstration (uv/placeholder) n'en fait pas partie. */
const produitsVendables = CATALOG.filter((p) => p.id !== PLACEHOLDER_PRODUCT.id);

describe('prix du catalogue — navigateur et service identiques', () => {
  it('chaque produit vendable existe côté serveur avec le même prix', () => {
    for (const produit of produitsVendables) {
      const serveur = CATALOGUE.find((p) => p.id === produit.id);
      expect(serveur, `produit absent du catalogue serveur : ${produit.id}`).toBeDefined();
      expect(serveur?.prixFcfa, `prix divergent pour ${produit.id}`).toBe(produit.priceFcfa);
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
