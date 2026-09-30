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

## Configurateur 3D — `/configurator`

Vue 3D temps réel du produit : on tourne, on zoome, on change la couleur, on dépose son
visuel et on le place dans la zone d'impression — le tout **dans le navigateur**, sans
service externe.

```
Canvas 2D (composition)  ─┐
                          ├─→ Zustand (état unique) ─→ Three.js (affichage)
édition du visuel ────────┘                                └─ texture du panneau
```

- `src/types/configurator.ts` — types partagés (`DesignTransform`, `ConfiguratorConfig`…)
- `src/stores/configurator-store.ts` — état unique + actions + `serializeConfig()`
- `src/lib/products/catalog.ts` — catalogue (modèle GLB, couleurs, zones d'impression)
- `src/lib/canvas/{design-canvas,export}.ts` — maths de placement/borne + export 300 dpi
- `src/lib/three/{models,materials,textures}.ts` — accès aux nœuds, matériaux PBR, textures
- `src/components/configurator/*` — viewer 3D, éditeur 2D, contrôles, configuration
- `src/app/configurator/page.tsx` — route (la 3D est importée en `ssr: false`)

Le studio 2D historique reste sur `/` (aucune fonctionnalité supprimée) ; les deux
partagent `src/lib/validate.ts` et `src/lib/printQuality.ts`.

### Modèle 3D

`public/models/tshirt/tshirt.glb` est un **placeholder généré par nous** (36 triangles) :

```bash
node scripts/gen-tshirt-glb.mjs   # régénère le GLB + vérifie sa conformité glTF
```

Contrat à respecter pour le modèle réel : trois nœuds `FrontPanel`, `BackPanel`,
`Body`, UV planes sur les panneaux (voir `public/models/README.md`). Le déposer au
même chemin suffit — aucun code à modifier.

## Développement

```bash
npm install --include=dev   # cette machine omet les devDependencies par défaut (npm config omit=dev)
npm test                    # vitest — 84 tests (zones, mapping, bornes, store, catalogue)
npm run lint
npm run build
npm run dev                 # http://localhost:3000  ·  /configurator  ·  /  (studio 2D)
```

## Déploiement

GitHub Pages (export statique + basePath `/elembo`) :

```bash
bash scripts/deploy-gh-pages.sh
```

`DEPLOY_TARGET=gh-pages npm run build` produit `out/` → copié dans `../elembo-pages` (branche `gh-pages`, `.nojekyll` inclus) → push forcé. Sans `DEPLOY_TARGET`, le build standard reste Vercel-ready.

**Pièges intégrés (trouvés en E2E)** :
- `NEXT_PUBLIC_BASE_PATH` préfixe les chemins `public/` dans `src/lib/products.ts` — sans lui, les mockups résolvent en 404 sous Pages et le canvas reste vide (catch silencieux). Idem pour le GLB via `resolveModelUrl()`.
- Les handlers pointer doivent être passés en props jusqu'à l'élément `<canvas>` — des handlers définis dans Studio mais non câblés sont du code mort silencieux.
- **glTF : les index doivent être de type `SCALAR`.** Écrits en `VEC1`, le loader construit une géométrie sans index, la scène se charge sans erreur et… le modèle est invisible (aucun pixel rendu). `scripts/gen-tshirt-glb.mjs` refuse désormais d'écrire un GLB non conforme.
- **Ne jamais multiplier couleur × texture sur un panneau imprimé** : la couleur du vêtement est composée dans la texture (albédo) et le matériau du panneau reste blanc, sinon un T-shirt noir rend le visuel noir. Le matériau garde roughness/metalness/normalMap par clone.
- La caméra ne doit réorienter le produit **que** sur demande (changement de face ou vue initiale) ; un lissage permanent annule la rotation et le zoom de l'utilisateur.

## Limites du MVP (suite prévue)

- Modèle 3D placeholder : remplacer par un vrai T-shirt (UV correctes, textures PBR) dans `public/models/tshirt/`
- Rendu réaliste à venir : HDR d'environnement local (`public/hdri/`), normal/roughness maps, ombres douces affinées
- Pas de persistance des designs (Vercel Blob/Supabase en phase 2) ni de catalogue multi-produits (hoodie, tote bag… : ajout par le seul catalogue)
- Pas de paiement (MTN MoMo / Airtel Money) ni de BAT WhatsApp
- Photos de mockups du studio 2D placeholders (aplats, générées par `scripts/gen-mockups.mjs`) à remplacer par les visuels réels (presse VEVOR)
- Pas de galerie de designs ni de comptes créateurs
