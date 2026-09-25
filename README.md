# Elembo — MVP Print-on-Demand

> **Uploadez votre design, voyez-le imprimé.** MVP de démonstration style Printful : le créateur uploade un design (PNG/JPG), choisit un produit et voit son design apparaître en direct sur un mockup.

**Live : https://bossygit.github.io/elembo/**

Par Smart Vision Congo (SARLU enregistrée en République du Congo).

## Fonctionnement

- **100 % client-side** : le design reste en mémoire navigateur (ObjectURL), rien n'est stocké ni envoyé.
- **Composition canvas** : photo de mockup en fond + design dessiné dans la zone d'impression prédéfinie (coordonnées normalisées par produit, technique Printful). Mouvement libre par glisser, **clip à la zone** : ce qui dépasse ne s'imprime pas.
- **Produits MVP** : t-shirt, casquette, tableau (canvas).
- **Validation** : PNG/JPG, ≤ 10 Mo, ≥ 500 px (règles pures testées).
- **Ajustements** : échelle 0,5×–1,5×, contain/stretch, réinitialisation, mode debug zone (checkbox « calage »).
- **Export** : téléchargement du mockup rendu en PNG.

## Développement

```bash
npm install --include=dev   # cette machine omet les devDependencies par défaut (npm config omit=dev)
npm test                    # vitest — 22 tests (zones, mapping print-area, validation)
npm run dev                 # http://localhost:3000
```

## Déploiement

GitHub Pages (export statique + basePath `/elembo`) :

```bash
bash scripts/deploy-gh-pages.sh
```

`DEPLOY_TARGET=gh-pages npm run build` produit `out/` → copié dans `../elembo-pages` (branche `gh-pages`, `.nojekyll` inclus) → push forcé. Sans `DEPLOY_TARGET`, le build standard reste Vercel-ready.

**Pièges intégrés (trouvés en E2E)** :
- `NEXT_PUBLIC_BASE_PATH` préfixe les chemins `public/` dans `src/lib/products.ts` — sans lui, les mockups résolvent en 404 sous Pages et le canvas reste vide (catch silencieux).
- Les handlers pointer doivent être passés en props jusqu'à l'élément `<canvas>` — des handlers définis dans Studio mais non câblés sont du code mort silencieux.

## Limites du MVP (suite prévue)

- Pas de persistance des designs (Vercel Blob/Supabase en phase 2)
- Pas de paiement (MTN MoMo / Airtel Money) ni de BAT WhatsApp
- Photos de mockups placeholders (aplats, générées par `scripts/gen-mockups.mjs`) à remplacer par les visuels réels (presse VEVOR)
- Pas de galerie de designs ni de comptes créateurs
