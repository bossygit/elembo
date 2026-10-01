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

## Configurateur 3D — page d'accueil (`/`)

Vue 3D temps réel du produit : on tourne, on zoome, on change la couleur, on dépose son
visuel et on le place dans la zone d'impression — le tout **dans le navigateur**, sans
service externe.

```
Canvas 2D (composition)  ─┐
                          ├─→ Zustand (état unique) ─→ Three.js (affichage)
édition du visuel ────────┘                    └─ texture du panneau / décalque
```

- `src/types/configurator.ts` — types partagés (`DesignTransform`, `ConfiguratorConfig`…)
- `src/stores/configurator-store.ts` — état unique + actions + `serializeConfig()`
- `src/lib/products/catalog.ts` — catalogue (modèle GLB, technique d'impression, couleurs, zones)
- `src/lib/canvas/{design-canvas,export}.ts` — maths de placement/borne + export 300 dpi
- `src/lib/three/{models,materials,textures}.ts` — nœuds, matériaux PBR, textures (dont l'albédo neutralisé)
- `src/lib/three/framing.ts` — cadrage automatique de la caméra sur le modèle réel
- `src/components/configurator/*` — viewer 3D, éditeur 2D, contrôles, configuration
- `src/app/page.tsx` — configurateur 3D (page d'accueil) ; `src/app/studio/page.tsx` — studio 2D ;
  `src/app/configurator/page.tsx` — redirection depuis l'ancienne URL

Le studio 2D reste disponible sur `/studio` (aucune fonctionnalité supprimée) ; les deux
partagent `src/lib/validate.ts` et `src/lib/printQuality.ts`.

### Modèle 3D et impression

Le catalogue contient **deux T-shirts 3D**, interchangeables depuis le sélecteur de
produit (le visuel et le réglage sont conservés d'un modèle à l'autre) :

- `public/models/tshirt/tshirt.glb` — T-shirt raglan fournisseur (29 678 triangles,
  textures PBR 4k, 1 unité = 1 pouce) ;
- `public/models/tshirt-alt/tshirt.glb` — T-shirt col rond (237 940 triangles, maillages
  séparés avant/arrière, sans textures donc teinté exactement, 1 unité = 1 mètre).

Les deux ont un maillage sans zone d'impression réservée : le visuel est **projeté sur la
surface** (technique `decal`) dans un cadre exprimé en unités du modèle et déduit du
maillage avec :

```bash
node scripts/inspect-glb.mjs "chemin/vers/modele.glb"        # dimensions, UV, profondeur de surface
node scripts/glb-meshes.mjs  "chemin/vers/modele.glb"        # un maillage par ligne (parent, UV, taille)
node scripts/decal-frame.mjs "chemin/vers/modele.glb" 100 21 30 7  # cadre d'impression (unité cm, 21×30 cm, 7 cm sous le col)
```

La technique `uv` (nœuds `FrontPanel` / `BackPanel` / `Body`) reste supportée pour des
modèles qui réserveraient une zone d'impression ; le placeholder
`tshirt-placeholder.glb` (`node scripts/gen-tshirt-glb.mjs`) l'exerce et sert aux tests.
Détails et procédure d'ajout d'un modèle : `public/models/README.md`.

## Développement

```bash
npm install --include=dev   # cette machine omet les devDependencies par défaut (npm config omit=dev)
npm test                    # vitest — 100 tests (zones, bornes, cadrage, store, catalogue)
npm run lint
npm run build
npm run dev                 # http://localhost:3000  ·  /  (configurateur 3D)  ·  /studio  (studio 2D)
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
