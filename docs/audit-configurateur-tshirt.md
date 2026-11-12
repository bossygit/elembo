# Audit d'avant intervention — Mission 02 : T-shirt Elembo à cinq zones

**Projet** : Elembo — configurateur textile 3D (Next.js 16.3.6, React 19.2.8, React Three Fiber 9.8.1, three 0.186.1, Zustand 5.0.15)
**Objet** : état réel du configurateur, du modèle GLB `elembo-tshirt` et du tunnel de commande avant l'intégration des cinq zones d'impression.
**Date** : novembre 2026. **Auteur** : audit technique (mission 02, livrable d'avant intervention).
**Périmètre** : lecture seule du code et des fichiers 3D ; un seul fichier écrit, celui-ci. Aucun serveur lancé, aucun commit.

## 0. Périmètre, méthode et état de référence

### 0.1 État de référence

L'audit décrit **l'état d'avant intervention**, figé pour être reproductible :

| Élément | Valeur |
|---|---|
| Branche | `feat/atelier-cinq-zones` |
| HEAD | `917dc94` — « feat(3d): modèle T-shirt Elembo à cinq zones d'impression » |
| Instantané de l'arbre de travail | 12/11/2026 14:50:49 (heure locale), avant que l'intervention ne commence |
| Fichiers suivis modifiés à cet instant | `src/types/configurator.ts`, `src/lib/products/catalog.ts`, `src/lib/canvas/design-canvas.ts`, `src/lib/canvas/export.ts`, `src/lib/order/order.ts` |
| Fichiers non suivis | `production/profils.json`, `src/lib/products/production.ts`, `scripts/glb-zones.mjs` |

**Note de lecture importante.** Pendant l'audit, l'intervention a démarré dans le même arbre de travail : `git status` est passé de 2 à 12 fichiers modifiés entre 14:49 et 14:58, `src/stores/configurator-store.ts` est passé de 469 à 700+ lignes (ajout d'historique/undo), et de nouveaux composants (`ZonesProductModel.tsx`, `ZoneEditor.tsx`, `ZoneRail.tsx`, `src/lib/three/zones.ts`) sont apparus. Ces modifications **ne sont pas auditées ici**. Pour rester exact :

- les citations de `ProductModel.tsx`, `ProductViewer.tsx`, `models.ts`, `materials.ts`, `textures.ts`, `OrderPanel.tsx`, `DesignPanel.tsx`, `ElementControls.tsx`, `Configurator.tsx`, `page.tsx`, `configurator-store.ts` renvoient aux versions du commit `917dc94` (vérifiées avec `git show 917dc94:<fichier>`) ;
- les citations des cinq fichiers de migration renvoient à l'instantané ci-dessus (empreintes MD5 : `types 77170b14…`, `catalog ca3069d4…`, `design-canvas a526df92…`, `export 01d49186…`, `order d16f657f…`, `production/profils 5bd477f0…`, `production.ts b3e29f4f…`) ;
- les lignes de ces fichiers ont pu bouger depuis ; les vérifications restent reproductibles sur l'instantané.

### 0.2 Vérifications exécutées

`node scripts/glb-zones.mjs public/models/elembo-tshirt/elembo-tshirt.glb` ; inspection directe du conteneur GLB (JSON + BIN) par script Node sans création de fichier ; mesure des UV et des déformations à partir des accesseurs `POSITION`/`TEXCOORD_0` ; extraction des métadonnées PNG des textures intégrées ; `npx tsc --noEmit --incremental false` et `npx vitest run` sur l'instantané figé, puis sur un `HEAD` propre pour distinguer les régressions préexistantes ; lecture de `package.json`, `tsconfig.json`, `vitest.config.ts`, `next.config.ts` et du chargeur three.js installé. Détail en annexe A.

## 1. Synthèse

1. **Le modèle GLB est conforme, pour l'essentiel, au guide d'intégration** : 7 nœuds, 5 surfaces d'impression indépendantes, matériaux et UV tels que documentés, 40 600 triangles, 2,4 Mo, ni Draco, ni caméra, ni animation. Les écarts relevés sont documentaires (champs `userData` omis, densités de texture trompeuses, marges UV) et non bloquants — détail §5.5.
2. **Le configurateur ne sait pas rendre la technique `zones`.** `ProductModel.tsx` ne gère que `uv` et `decal` ; le produit par défaut du catalogue ayant déjà basculé sur le GLB Elembo dans l'arbre de travail, le rendu réel se retrouve sur un chemin `decal` déguisé qui, en analyse statique, lève une `TypeError` et n'applique ni couleur ni visuel (§4.2). C'est le point d'intervention n° 1.
3. **La base est cassée au moment de l'audit** : 11 erreurs TypeScript (`ProductModel`, `ProductViewer`, `models.ts`) et 14 échecs de tests dans 4 fichiers, tous causés par la migration en cours et tous absents sur un `HEAD` propre (§10). La mission annonce 16 échecs ; la mesure en donne 14 (écart expliqué §10.2).
4. **La composition Canvas et l'export PNG sont déjà largement compatibles avec les zones** : `compositionSize()` gère `textureCm`, `printAreaRect()` place la zone dans la texture, `renderPrintPng()` recadre sur la zone et compose en transparence. Il manque surtout les textures par zone (`textures.ts`), les matériaux transparents (`materials.ts`) et la transmission du `dpi`/du profil (§6).
5. **Il n'existe ni panier ni persistance de la personnalisation** : le tunnel est paiement MoMo → génération des PNG dans le navigateur → envoi Blob ; la commande serveur ne transporte que produit/tailles/ville/téléphone, jamais le design (§7).
6. **La production n'est pas encore arbitrée** : quatre profils existent (`dtf` disponible, `flex` à valider, `dtg`/`sublimation` indisponibles), les manches et le col sont « à valider » en DTF, et aucun écran ne permet de choisir un procédé ; le dossier de production est plafonné à **6 fichiers** alors que 5 zones + 2 fiches en demandent 7 (§7.4, §8).

## 2. État du dépôt et de la migration en cours

### 2.1 `git status` au moment de l'audit

Au début de l'audit (`git status --porcelain`, 14:49) : deux fichiers suivis modifiés (`src/lib/products/catalog.ts`, `src/types/configurator.ts`) et trois non suivis (`production/`, `scripts/glb-zones.mjs`, `src/lib/products/production.ts`). À l'instantané de référence (14:50:49), trois fichiers de plus venaient d'être modifiés (`design-canvas.ts` à 14:50:11, `export.ts` à 14:50:11, `order.ts` à 14:50:06). Ces horodatages montrent que la migration était encore en cours de rédaction au moment de l'audit.

### 2.2 Ce que la migration change déjà

| Fichier | Changement constaté | Conséquence pour la mission |
|---|---|---|
| `src/types/configurator.ts:12-45` | `Side` passe à 5 valeurs, `SIDES`, `SIDE_LABELS`, `SIDE_SHORT`, `SIDE_FILE` (`front.png`…), `isSide()` | Le type est prêt ; tout le reste du code doit suivre. |
| `src/types/configurator.ts:194-204` | `version: 2 \| 3`, `profileId?` | Le store n'écrit encore que la version 2 (§3.2). |
| `src/lib/products/catalog.ts:35, 76-88, 114-117, 124-125, 164-195, 197-222, 301-349, 405-422` | Technique `zones`, `ZoneModel`, `ELEMBO_TSHIRT_ZONES`, `zoneArea()`, `productSides()`, 8 couleurs, `getPrintArea(product, side, profileId)`, validation des zones | Le catalogue savait déjà décrire le modèle Elembo, mais aucun consommateur de rendu ne le lit en `zones`. |
| `src/lib/products/catalog.ts:73-74` | Commentaire : « noms et repères vérifiés par `tests/elemboModel.test.ts` » | **Faux au moment de l'audit** : ce fichier de test n'existe pas (`tests/` ne le contient pas). |
| `src/lib/canvas/design-canvas.ts:43-51, 517-523` | `compositionSize()` gère `textureCm` ; `productionTextureSize(area, dpi)` | La composition et la taille d'impression sont paramétrables par zone/procédé. |
| `src/lib/canvas/export.ts:34-83` | `dpi?`, `ratioX`/`ratioY` séparés, canvas à la taille cible | L'export recadre sur la zone ; les tests de l'ancien modèle ne valident plus l'hypothèse d'échelle (`§10.2`). |
| `src/lib/order/order.ts:13, 212-235, 312-366` | Fiche version 2, `profil`, `dpi`, `fichier: SIDE_FILE[side]` (`front.png`, `back.png`, `left-sleeve.png`, `right-sleeve.png`, `collar.png`) | Le nommage demandé est déjà produit par la fiche, pas encore transmis correctement au rendu (§7.4). |
| `production/profils.json:5-86`, `src/lib/products/production.ts:50-154` | 4 profils (DTF/Flex/DTG/Sublimation), statuts, zones, DPI ; helpers `statutZone`, `zoneCommandable`, `empechementsCommande`, `validerProfils` | **Aucun de ces helpers n'est consommé hors de `production.ts`** à l'instantané (grep). Le choix de procédé n'existe pas dans l'interface. |
| `src/lib/products/catalog.ts:307-312` et `:76-88` | `productSides()`, `ZoneModel.vue` (azimut, polaire, distance, cible) | **Définis mais inutilisés** à l'instantané (grep) : la navigation caméra par zone n'est pas branchée. |

## 3. Configurateur actuel

### 3.1 Page et orchestration

`src/app/personnalisation/page.tsx` est la page active. Son titre et sa description parlent encore de « face avant et arrière » (`page.tsx:13`, `page.tsx:31`) et l'encart paiement s'appuie sur `paiementEnLigneOuvert(statutPrixProduit('tshirt-basic'))` (`page.tsx:17`). L'ancienne URL `/configurator` redirige côté client vers `/personnalisation` (`src/app/configurator/page.tsx:13-17`).

`src/components/configurator/Configurator.tsx` assemble l'écran : `<ProductViewer cameraNonce>` importé en `dynamic(..., { ssr: false })` (`Configurator.tsx:24-31`), contrôles de vue (`:125`), puis trois panneaux latéraux — couleur, design, élément sélectionné (`:128-138`) — et le panneau Commande en pleine largeur (`:141-145`). Le viewer est collant, 34 vh sur mobile, 62 vh sur desktop (`:118-120`). Le commentaire `:14-17` indique que `DesignCanvas` (aperçu 2D éditable) et `DesignControls` ont été **retirés de l'interface** et ne sont plus importés.

### 3.2 Store Zustand

`src/stores/configurator-store.ts` est la source unique du design : `productId`, `color`, `side`, `elements[]` (image ou texte, chacun avec `side`, `z`, `x`, `y`, `scale`, `rotation`, `visible`), `selectedId`, `showGuides`, `measure`. Toute mutation repasse par `clampElement()` (`design-canvas.ts:204-227`), y compris au chargement (`configurator-store.ts:349`). Le produit initial est le produit par défaut du catalogue (`configurator-store.ts:146, 160-161`).

Constats limitants pour la mission :

- **Pas d'historique** : aucun `undo`/`redo` dans le store (grep sur la version `917dc94`).
- **Pas de duplication** d'élément (aucune fonction de copie dans le store ni dans `ElementControls.tsx`).
- **Sérialisation en version 2** (`configurator-store.ts:79-106`) : `version: 2`, pas de `profileId`, et les images ne sont jamais embarquées (`src` object URL).
- **Rechargement limité à avant/arrière** : `loadConfig` force `side` à `'back'` ou `'front'` (`:332`) et `normalizeElement` ne restaure `'back'` que pour le dos (`:420`). Une configuration comprenant `left-sleeve`, `right-sleeve` ou `collar` serait silencieusement ramenée sur la face courante.
- `elementRectFor()` (`:458`) appelle `getPrintArea()` sans profil ; il est exporté mais **consommé par aucun module** à l'instantané (grep).

### 3.3 Techniques d'impression `uv` et `decal`

Le type `PrintTechnique` vaut `'uv' | 'decal' | 'zones'` (`catalog.ts:35`), mais seules deux techniques étaient implémentées dans le rendu.

- **`uv`** : le modèle expose des nœuds `FrontPanel` / `BackPanel` / `Body` (`src/lib/three/models.ts:11-27`) ; `ProductModel` clone le matériau du panneau, y injecte une `CanvasTexture` composée (`ProductModel.tsx:75-99`) et le canvas peint le fond à la couleur du vêtement (`:197-204`). `preparePanelMaterial()` force `transparent = false` et `alphaTest = 0` (`materials.ts:50-55`).
- **`decal`** : le vêtement garde ses matériaux PBR et le visuel est projeté par `DecalGeometry` (`ProductModel.tsx:101-128, 240-271`) ; le canvas du décalque est transparent hors éléments (`ProductModel.tsx:173-188`).
- **`zones`** : **aucune branche**. `ProductModel.tsx` ne contient pas la chaîne `'zones'` à `917dc94` ; seul le catalogue la connaît. Les conséquences statiques sont détaillées §4.2.

**Produits du catalogue à l'instantané** (`catalog.ts:129, 197-288`, `configurator-store.ts:146`) :

| Produit | Rôle | GLB | Technique | Zones / prix |
|---|---|---|---|---|
| `tshirt-basic` (`DEFAULT_PRODUCT_ID`) | Produit par défaut, chargé par `/personnalisation` | `/models/elembo-tshirt/elembo-tshirt.glb` (2,4 Mo) | **`zones`** (catalogue non commité) | 5 zones déclarées, `printAreas: {}`, 8 couleurs, prix lu dans `tarifs/grille.json` (`tshirt-basic` = 100 FCFA, statut `valide`) |
| `tshirt-alt` | Second modèle commercial | `/models/tshirt-alt/tshirt.glb` | `decal` (`unitToCm = 100`) | avant 21 × 30 cm, dos 25 × 32,4 cm ; 4 couleurs ; prix 100 FCFA |
| `tshirt-demo` (`PLACEHOLDER_PRODUCT`, hors `CATALOG`) | Démonstration/tests, non commercial | `/models/tshirt/tshirt-placeholder.glb` | `uv` (`panel 50 × 60`) | avant et dos fixes ; 4 couleurs |
| *(fichiers encore présents)* | Ancien modèle raglan | `/models/tshirt/tshirt.glb` | plus référencé par le catalogue depuis la migration | — |

### 3.4 Gestion avant / arrière

Le binaire avant/arrière est présent partout : `Side` vaut `'front' | 'back'` dans `917dc94`, `OTHER = { front: 'back', back: 'front' }` (`ProductModel.tsx:35`), `setSide()` validé par `getPrintArea()` (`configurator-store.ts:197-201`), deux boutons dans `ViewControls.tsx:23-41`, sélecteur de face de l'élément dans `ElementControls.tsx:282-300`, rotation caméra animée `goal = side === 'front' ? 0 : Math.PI` (`ProductViewer.tsx:100`). `DesignPanel.tsx:35,56` affiche le libellé « avant/arrière » en dur et `OrderPanel.tsx:309,340` aussi.

### 3.5 Aperçu 2D et édition

- `src/components/configurator/DesignCanvas.tsx` existe et implémente sélection, glisser, redimensionner, tourner, clavier, repères (pointer events `:78-180`) — **mais il n'est importé nulle part** (`grep` : seul un commentaire dans `Configurator.tsx:14-17` le mentionne).
- L'édition réelle passe par `ElementControls.tsx` : contenu/police/couleur/interlettrage pour le texte, face, flèches de déplacement par pas de `ELEMENT_LIMITS.nudge` (0,01 de zone), taille, rotation, calque ±, suppression (`:216-431`). **Pas de glisser-déposer, pas de duplication, pas d'annulation.**
- Le seul aperçu 2D visible est la vignette `FacePreview` du panneau Commande (`OrderPanel.tsx:55-107`), en lecture seule, plafonnée à 300 px de large.

## 4. Moteur 3D

### 4.1 `ProductViewer.tsx`

- **Canvas R3F** `:179-228` : `shadows`, `dpr={[1,2]}`, caméra initiale `[0, 0.15, 3.4]`, `fov 35`, `gl={{ antialias: true, alpha: true }}` (`:183`). Import strictement client via `ssr: false` (`Configurator.tsx:24-31`).
- **Aucun tone mapping explicite** : `ProductViewer.tsx:183` ne règle ni `toneMapping` ni `outputColorSpace`. R3F 9.8.1 applique donc `ACESFilmicToneMapping` par défaut (vérifié dans `node_modules/@react-three/fiber/dist/events-9ce18a08.esm.js:1615`). Or le guide recommande `NeutralToneMapping` et déconseille ACES (`integration-guide.md:146-152`).
- **Éclairage** : `hemisphereLight` + `ambientLight 0.35` + `directionalLight 1.15` avec ombre 1024² + second `directionalLight 0.45` (`:229-244`) ; pas d'`Environment`/HDRI (choix documenté `:10-13`).
- **Ombres de contact** : `ContactShadows` conditionnées au cadrage (`:252-260`).
- **OrbitControls** : `enablePan={false}`, damping, `minDistance`/`maxDistance` issues du cadrage, `minPolarAngle 0.4`, `maxPolarAngle 2.5` (`:262-272`). Le `CameraRig` positionne la caméra depuis la boîte englobante (`:64-82`) puis ne gère que deux azimuts, 0 et π (`:85-102`).
- **Diagnostic dev** : `window.__elembo3d` expose scène, caméra, compteurs et lecture de pixels (`:184-227`) — utile pour les tests E2E, absent en production.

### 4.2 `ProductModel.tsx` — le point bloquant

Le composant charge `useGLTF(resolveModelUrl(product))` (`:66`), clone la scène (`:72-74`) puis aiguille :

- `isDecal = product.technique === 'decal'` (`:69`) ;
- branche `uv` seulement si `technique === 'uv'` (`:75`) ;
- sinon la branche `decal` s'exécute (`:101-128`).

Pour le produit Elembo (`technique: 'zones'`), on tombe donc dans la branche `decal` : `findGarmentMeshes()` renvoie **les 7 maillages** (2 du corps + 5 zones), chacun est cloné et teinté en blanc avec neutralisation d'albédo (`:108-122`), puis `panels = { front: null, back: null, body: null }` (`:123-127`). L'effet de couleur appelle ensuite `applyGarmentColor(panels, color)` (`:153-162`), qui ne fait rien sur des matériaux nuls (`materials.ts:68-76`) : **la couleur du vêtement n'est pas appliquée**. L'effet de composition (`:165-219`) prend le chemin `uv` : `panels[side]!.needsUpdate = true` (`:205`) sur un objet nul, et `panelKey(side)` n'accepte que `'front' | 'back'` (`textures.ts:75-77`). En analyse statique, la première exécution de cet effet lève une `TypeError` et le visuel n'est jamais posé sur les matériaux `PRINT_*`. Le `ModelErrorBoundary` du viewer (`ProductViewer.tsx:129-145`) affiche alors le parallélépipède filaire de secours. **Non vérifié en navigateur** (aucun serveur lancé pendant l'audit), mais le chemin est déterminé par le code.

### 4.3 Cadrage — `src/lib/three/framing.ts:33-65`

Fonction pure `framingFor(box, fov, aspect, margin)` : calcule centre, distance (le côté le plus contraignant l'emporte), rayon, `minDistance`/`maxDistance`, `groundY`, `shadowScale`. Testée par `tests/framing.test.ts` (passe sur `HEAD`). Elle est indépendante des unités : le modèle Elembo en mètres (0,82 × 0,75 m) sera cadré correctement, comme le placeholder.

### 4.4 Matériaux, textures, modèles

- `materials.ts` : `PanelMaterials` figé sur `front | back | body` (`:13-17`) ; `preparePanelMaterial()` clone et force l'opacité (`:35-60`) ; `applyGarmentColor()` suppose les panneaux texturés (`:72-76`) ; `prepareGarmentMaterial()` gère l'albédo neutralisé pour les modèles fournisseurs (`:90-115`).
- `textures.ts` : cache `Map<string, PanelEntry>` d'un canvas + une `CanvasTexture` par clé (`:18-38`), redessinés sans recréation (`:52-60`) ; `flipY = true` (`:33`) pour les panneaux d'aperçu ; clé `panel:front|back` (`:75-77`) ; `disposePanelTextures()` existe (`:69-72`) mais **n'est jamais appelé** (grep) ; `neutralAlbedoTexture()` utilise `flipY = false` (`:130`), convention glTF.
- `models.ts` : recherche `FrontPanel`/`BackPanel`/`Body`, repli par matériau puis par expression (`:11-51`) ; `garmentBox()` écarte les plans de décor (`:147-167`) ; `findMeshForDecal()` choisit le maillage orienté vers la zone (`:178-208`). **Aucune de ces fonctions ne connaît les noms Elembo** (`TSHIRT_FRONT_PRINT`, etc.).

## 5. Le modèle GLB Elembo — vérification du fichier réel

### 5.1 Structure réelle (`node scripts/glb-zones.mjs` + lecture directe du JSON GLB)

Conteneur : 2 470 168 octets (2,36 Mio), en-tête glTF 2.0, JSON de 13 728 octets, BIN de 2 456 412 octets. Générateur : `Khronos glTF Blender I/O v4.5.51`. La scène contient un nœud racine `ELEMBO_TSHIRT` (index 6) avec 6 enfants :

| Nœud | Maillage | Primitives | Matériau(x) | Attributs | `extras` |
|---|---|---|---|---|---|
| `TSHIRT_BODY` | `TSHIRT_BODY` | **2** | `FABRIC`, `FABRIC_RIB` | `POSITION`, `NORMAL`, `TEXCOORD_0` | `fabric_color_hex: "#F4F3EF"` |
| `TSHIRT_FRONT_PRINT` | idem | 1 | `PRINT_FRONT` | `POSITION`, `NORMAL`, `TEXCOORD_0`, `TEXCOORD_1` | `zone: "front"`, `mesh`, `material`, `print_width_cm: 63.2`, `print_height_cm: 79`, `aspect: 0.8`, `recommended_texture_px: [1580,1975]`, `uv_set: "TEXCOORD_0 (UV_PRINT)"`, `inside: false` |
| `TSHIRT_BACK_PRINT` | idem | 1 | `PRINT_BACK` | 4 attributs | `zone: "back"`, `62.4 × 78`, `aspect 0.8`, `[1560,1950]`, `inside: false` |
| `TSHIRT_LEFT_SLEEVE_PRINT` | idem | 1 | `PRINT_LEFT_SLEEVE` | 4 attributs | `zone: "left_sleeve"`, `60 × 30`, `aspect 2`, `[1200,600]`, `inside: false` |
| `TSHIRT_RIGHT_SLEEVE_PRINT` | idem | 1 | `PRINT_RIGHT_SLEEVE` | 4 attributs | `zone: "right_sleeve"`, `60 × 30`, `aspect 2`, `[1200,600]`, `inside: false` |
| `TSHIRT_COLLAR_PRINT` | idem | 1 | `PRINT_COLLAR` | 4 attributs | `zone: "collar"`, `12 × 6.7`, `aspect 1.79`, `[478,267]`, `inside: true` |

Sept matériaux au total : `PRINT_BACK`, `FABRIC`, `FABRIC_RIB`, `PRINT_COLLAR`, `PRINT_FRONT`, `PRINT_LEFT_SLEEVE`, `PRINT_RIGHT_SLEEVE`. Trois extensions : `KHR_materials_specular`, `KHR_materials_sheen`, `KHR_texture_transform` (seule requise). Aucun `KHR_draco_mesh_compression`, aucune caméra, aucune animation, aucun skin.

Conformément au guide (`integration-guide.md:47`), `TSHIRT_BODY` (2 primitives) devient un `Group` Three.js : le GLTFLoader réserve le nom du nœud puis nomme les enfants `TSHIRT_BODY_1` et `TSHIRT_BODY_2` (vérifié dans `node_modules/three/examples/jsm/loaders/GLTFLoader.js:3960, 3989-4004, 4417-4433`). Les `extras` sont recopiés dans `userData` (`GLTFLoader.js:2357-2370, 4433`).

### 5.2 Racine et couleurs

`ELEMBO_TSHIRT.userData` contient `elembo_version: 1`, `units: "meters"`, `fabric_materials: ["FABRIC","FABRIC_RIB"]` et `colors` : `white #F4F3EF`, `black #1A1A1C`, `grey #9C9EA1`, `navy #1F2A44`, `red #B3202A`, `green #1E5E3B`, `yellow #F2C230`, `orange #FF5A12` — exactement les 8 couleurs de `zones.json:74-115` et, aux libellés près, de `catalog.ts:211-220` (le catalogue écrit « Gris » là où le modèle écrit « Gris chiné »). Le `baseColorFactor` de `FABRIC`/`FABRIC_RIB` vaut, converti en sRGB, `#F4F3EF` : l'atlas est bien blanc et multiplié par la couleur du tissu, comme décrit au guide §7.

### 5.3 Zones mesurées

Mesures issues des accesseurs `POSITION`/`TEXCOORD_0` et croisées avec `zones.json` et `integration-guide.md:76-89` :

| Zone (clé GLB) | Texture (cm) | Ratio | Repère mesuré (cm, depuis le haut de la texture) | Boîte UV réelle | Silhouette sur la texture (cm) | Marge de texture |
|---|---|---|---|---|---|---|
| `front` | 63,2 × 79 | 0,800 | col : **11,85** | u 0,0223–0,9777 ; v 0,0172–0,9828 | 1,41–61,79 × 1,36–77,64 (60,4 × 76,3) | ≈ 1,4 cm en largeur (2,2 %) et 1,4 cm en hauteur (1,7 %) |
| `back` | 62,4 × 78 | 0,800 | col : **3,38** | u 0,0167–0,9833 ; v 0,0130–0,9870 | 1,04–61,36 × 1,01–76,99 (60,3 × 76,0) | ≈ 1,0 cm en largeur (1,7 %) et 1,0 cm en hauteur (1,3 %) |
| `left_sleeve` | 60 × 30 | 2,000 | tête de manche : **1,08** | u 0,0960–0,9040 ; v 0,0361–0,9639 | 5,76–54,24 × 1,08–28,92 (48,5 × 27,8) | ≈ 5,8 cm en largeur (9,6 %) et 1,1 cm en hauteur (3,6 %) |
| `right_sleeve` | 60 × 30 | 2,000 | tête de manche : **1,08** | idem manche gauche | idem | idem |
| `collar` | 12 × 6,7 | 1,791 | — (`axisTopCm: null`, aucun sommet à u ≈ 0,5) | u 0–1 ; v 0–1 | 0–12 × 0–6,7 (12 × 6,7) | 0 |

Les repères `col` (`11,85` / `3,38`) et `epaule` (`1,08`) sont **identiques** à ceux du catalogue (`catalog.ts:168,174,180,186`). Les clés GLB sont en revanche `left_sleeve`/`right_sleeve` (underscore) alors que l'application utilise `left-sleeve`/`right-sleeve` (hyphen) : une table de correspondance est nécessaire si l'on lit les `extras`, alors que `ZoneModel.mesh` permet de s'en passer.

### 5.4 Propriétés du fichier

- **Boîte englobante scène** : 0,8238 × 0,7489 × 0,1766 m, centre (0, 0, 0) — cohérent avec le guide (« 0,82 × 0,75 × 0,18 m », origine au centre) et avec `units: meters`. Le seul maillage `TSHIRT_BODY` (deux primitives, côtes comprises) couvre déjà 0,8232 × 0,7489 × 0,1759 m ; les surfaces d'impression ne changent pas sensiblement l'enveloppe.
- **Triangles** : 40 600 au total — BODY 26 836 (`FABRIC`) + 400 (`FABRIC_RIB`), avant 5 453, dos 5 643, manches 1 080 chacune, col 108. Identique à `zones.json:120-127` et au guide.
- **Textures intégrées** (9 PNG) : `fabric_atlas_basecolor` 2048², `fabric_atlas_ao` 1024², `fabric_knit_normal` 512², `fabric_rib_normal` 256², 5 placeholders **4 × 4 px entièrement transparents** (alpha 0 vérifié sur les 16 pixels de chacun). Poids des images inclus dans le BIN.
- **Matériaux** : `PRINT_*` en `alphaMode: BLEND`, `doubleSided` absent (donc une seule face), `metallicFactor 0`, `roughnessFactor 0,82`, `normalTexture` et `occlusionTexture` sur `texCoord: 1`, `map` sur le canal 0 ; `FABRIC`/`FABRIC_RIB` avec `sheen` (0,22 / 0,6), rugosité 0,93, occlusions sur le canal 0. Les `KHR_texture_transform` de normale valent 64,849365 (tissu) et 129,6987 (côtes) ; avec `meters_per_uv = 1,296987` de `zones.json:117`, le motif mesure **2 cm** pour la maille et **1 cm** pour les côtes — la maille à 2 cm est bien celle annoncée au guide §4.
- **Jeux d'UV** : `TSHIRT_BODY` n'a que `TEXCOORD_0` (atlas) ; chaque maille `*_PRINT` a `TEXCOORD_0` (UV de zone, 0..1) et `TEXCOORD_1` (atlas, maille + occlusion). Le `map` des `PRINT_*` est sur le canal 0, les normal/ao sur le canal 1 — conforme au guide §4/§9.
- **Poids** : 2 470 168 octets. **Absence de Draco**, de caméra, d'animation, de skin, de lumière (`KHR_lights_punctual` absent).

### 5.5 Écarts entre la documentation et le fichier

| # | Documentation | Fichier réel | Nature |
|---|---|---|---|
| 1 | `integration-guide.md:50` : champs `userData` = `zone`, `print_width_cm`, `print_height_cm`, `aspect`, `recommended_texture_px`, `inside` | Les `extras` contiennent **en plus** `mesh`, `material`, `uv_set` | Doc incomplète (sans impact) |
| 2 | `integration-guide.md:36` : extras racine « colors, fabric_materials, units » | Contient aussi `elembo_version: 1` | Doc incomplète |
| 3 | Rien sur `TSHIRT_BODY` dans le guide | `TSHIRT_BODY` porte `extras.fabric_color_hex: "#F4F3EF"` | Non documenté |
| 4 | `integration-guide.md:70` : « le rectangle est centré sur la pièce de tissu et la couvre entièrement » | La pièce occupe une **sous-boîte UV** du rectangle (95–97 % en avant/dos, 81 % en largeur pour les manches) ; le rectangle contient des marges vides | Ambigu, piège de placement (§9.4) |
| 5 | `integration-guide.md:88` : « les bords gauche et droit de l'image se rejoignent sous le bras » | Les bords du rectangle ne sont pas sur la géométrie : u ∈ [0,096 ; 0,904] seulement pour les manches ; les bandes de 9,6 % ne s'affichent pas | Formulation trompeuse |
| 6 | `zones.json:2-73` : clés `left_sleeve`/`right_sleeve` | `Side` applicatif : `left-sleeve`/`right-sleeve` ; `print_rects_pattern_m` utilise encore les clés `"1"`, `"2"`, `"3"`, `"4"`, `"collar"` | Convention à expliciter |
| 7 | `catalog.ts:73-74` : « vérifiés par `tests/elemboModel.test.ts` » | Ce test n'existe pas | Affirmation fausse à l'instantané |
| 8 | `integration-guide.md:76-82` : « Texture conseillée 1580 × 1975 px » etc. | Ces dimensions correspondent à 25 px/cm (≈ 63,5 dpi), 20 px/cm (≈ 50,8 dpi) et 39,8 px/cm (≈ 101 dpi) — **pas** une densité d'impression | Piège : ne pas les utiliser comme résolution de production |
| 9 | `public/models/README.md:11,15-19` : modèle commercial = raglan 19 Mo, « deux techniques » | Le produit par défaut du catalogue pointe désormais `elembo-tshirt.glb` et `technique: 'zones'` ; le README n'a pas été mis à jour | Documentation obsolète |
| 10 | `integration-guide.md:196-207` : « intégration pas faite » | Exact à l'instantané ; l'arbre de travail a ensuite commencé à l'intégrer | À re-vérifier en fin de mission |

Les écarts 1-3, 6 et 10 sont mineurs ; les écarts 4, 5, 7, 8 et 9 sont des pièges réels pour l'intégration.

### 5.6 Points non vérifiables depuis le fichier

- Le décalage de **0,4 mm** des surfaces d'impression par rapport au tissu et le sens du décalage pour le col (`integration-guide.md:48`) ne se vérifient pas sans mesure géométrique dédiée.
- L'ondulation de **≈ 2 mm** du contour du col et la recommandation de **marge de 5 mm** (`integration-guide.md:89,280`) relèvent du contrôle Blender, pas du GLB.
- Le guide affirme que le texte se lit à l'endroit dans toutes les zones ; la géométrie le confirme (voir §9.3), mais le rendu final dépend de `flipY` et de la façon dont le canvas est posé.

## 6. Textures, composition et export

### 6.1 `src/lib/three/textures.ts`

Un canvas + une `CanvasTexture` par clé (`:18-38`), redessinés au lieu d'être recréés (`:52-60`). `colorSpace = SRGBColorSpace`, `anisotropy = 4` (fixe, alors que le guide propose `renderer.capabilities.getMaxAnisotropy()`), `flipY = true` (`:33`). La clé est `panel:front` / `panel:back` (`:75-77`). `disposePanelTextures()` n'est jamais appelé.

**Pour des zones en `TEXCOORD_0`, il faut** : une entrée par zone (5 + éventuellement les anciennes), `flipY = false` (convention glTF, guide §6 `:99-101`), un nettoyage au démontage, et une taille adaptée (§9.4).

### 6.2 `src/lib/canvas/design-canvas.ts`

- `compositionSize(area, base)` gère déjà `technique === 'zones'` : l'espace prend le ratio de `area.textureCm` (`:43-51`), ex. avant DTF : 1024 × 1280 pour 63,2 × 79 cm.
- `printAreaRect(area, space)` convertit la sous-zone en pixels (`:62-71`) ; `clampElement()` borne le centre à cette zone avec une marge de `ELEMENT_LIMITS.margin = 0,015` (`types:120-122`).
- `drawComposition()` efface, remplit éventuellement `baseColor`, **clippe à la zone** et dessine les éléments dans l'ordre des calques (`:409-444`) ; sans `baseColor`, la texture est transparente hors éléments — exactement le comportement attendu pour `zones`.
- `productionTextureSize(area, dpi)` calcule les pixels depuis `cmWidth/cmHeight` et **plafonne chaque dimension à `MAX_PRINT_TEXTURE_SIZE = 4096`** (`:517-523`). Pour les zones pleines (sublimation, 63,2 × 79 cm à 150 dpi → 3732 × 4665), le plafonnement déforme le ratio (§9.4).
- `areaForSide()` (`:526-528`) lit `product.printAreas` et renverrait `null` pour un produit `zones` : ne pas l'utiliser pour la nouvelle technique.

### 6.3 `src/lib/canvas/export.ts`

`renderPrintPng({area, elements, measure, dpi?, canvas?})` (`:34-83`) : espace de composition 2048 px au format de la texture (`:42`), zone recadrée, échelles X/Y séparées (`:48-49`), canvas à la taille cible (`:51-52`), composition sans fond et sans repères (`:65-73`), PNG via `toBlob` (`:81`). **La fonction est déjà compatible avec les zones** puisque tout passe par `area`. Ce qui manque : lui transmettre le `dpi` du profil et itérer sur les cinq zones.

### 6.4 Réutilisable tel quel / à changer

| Élément | Réutilisable pour 5 zones ? | Action |
|---|---|---|
| `drawComposition`, `printAreaRect`, `clampElement`, `hitTest` | **Oui**, la zone est un sous-rectangle de la texture | Aucune, sauf marge col (§9.4) |
| `compositionSize` | **Oui**, gère déjà `textureCm` | Choisir une base raisonnable pour la mémoire |
| `renderPrintPng` / nommage `SIDE_FILE` | **Oui** (crop + transparence + nom) | Passer `dpi` du profil ; boucler sur 5 zones |
| Store (source unique) | **Oui** pour la synchro | Ajouter `profileId`, version 3, undo/redo, duplication |
| `textures.ts` | **Non en l'état** | 5 entrées de cache, `flipY = false`, disposition, taille |
| `materials.ts` | **Non en l'état** | Matériaux `PRINT_*` transparents, couleur par nom `FABRIC`/`FABRIC_RIB` |
| `models.ts` | **Non en l'état** | Recherche par `mesh`/`userData.zone` au lieu de `FrontPanel`/`Body` |
| `ProductModel.tsx` | **Non** | Branche `zones` complète (textures, couleur, composition) |
| `ProductViewer.tsx` / `CameraRig` | **Partiellement** | Azimut/polaire/distance par zone (`ZoneModel.vue`), 5 valeurs |

**Contrainte UV à respecter pour les zones** : le visuel d'une zone doit être posé comme `map` sur **`TEXCOORD_0`** (canal 0, 0..1, isotrope), avec `flipY = false`, `colorSpace = SRGBColorSpace`, `wrapS/wrapT = ClampToEdgeWrapping` et **aucun `KHR_texture_transform`** sur cette texture — exactement ce que fait le guide §6 (`integration-guide.md:93-113`) ; les textures de normales/occlusion du modèle restent sur `TEXCOORD_1`. Un canvas composé au format de `area.textureCm` et recadré sur la zone imprimable est donc directement plaçable sur le matériau `PRINT_*`, sans transformation UV supplémentaire. C'est précisément ce que ne fait pas le code actuel (`flipY = true`, matériaux opaques, clé à deux faces).

## 7. Panier, commande et sérialisation

### 7.1 Il n'existe pas de panier

Aucun module panier, aucune route, aucune page de checkout à l'instantané (grep `panier`/`checkout` dans `src/`). Le commentaire de `src/components/site/BarreMobile.tsx:12` l'assume : « Il n'y a pas de panier sur Elembo : la commande se fait dans l'atelier de création ». Le mot « panier » dans `OrderPanel.tsx:128-140` désigne seulement l'empreinte tailles/ville qui stabilise la référence de commande.

### 7.2 Tunnel réel

1. Le client compose dans `/personnalisation` ; le bouton « Payer » appelle `demanderPaiement()` (`OrderPanel.tsx:236-244`) avec **produit, tailles, ville, téléphone, nom, email** — voir `DemandePaiement` (`src/lib/payment/momo.ts:24-34`) : **aucun élément de design**.
2. Le service MTN est appelé via `/api/momo/payer` (même application Next) ; le montant est recalculé côté serveur.
3. Le client sonde `/api/momo/statut` (`suivrePaiement`, `momo.ts:146-175`, fenêtre 5 min).
4. Si `PAYE`, `genererFiles()` (`OrderPanel.tsx:167-208`) construit la fiche (`buildProductionSheet`), rend un PNG par face personnalisée (`renderPrintPng`, `:189`), déclenche les téléchargements locaux, puis `envoyerDossier()` (`src/lib/payment/dossier.ts:53-119`) dépose les Blobs par URL pré-signée vers `/api/commandes/<commande>/upload`, puis enregistre les métadonnées par `POST /api/commandes/<commande>/fichiers`. L'archive est privée ; l'atelier télécharge via `GET /api/commandes/<commande>/fichiers/<nom>`.
5. La fiche de production (texte + JSON) est téléchargée localement (`OrderPanel.tsx:199-205`) et jointe au dossier.

### 7.3 Où la personnalisation est sérialisée / persistée

- `serializeConfig()` / `loadConfig()` existent (`configurator-store.ts:79-106, 323-361`) mais **ne sont appelés que par les tests** (grep : `tests/configuratorStore.test.ts:181-262`). Aucun écran ne sauvegarde ni ne recharge un projet.
- La commande serveur (`src/server/commandes/momo.ts:137-151`) enregistre `produit_id`, `designation`, `options: { taille, produitId }` — **pas le design**.
- Seul le récapitulatif de confirmation est conservé sur l'appareil (`src/lib/order/confirmation.ts:117-120`, clé `elembo:commande:<ref>`, via `localStorage`) ; il ne contient pas les éléments graphiques.
- Conclusion : **la personnalisation n'est persistée nulle part** aujourd'hui ; elle n'existe que le temps de la session, puis dans les PNG envoyés après paiement.

### 7.4 Contraintes du dossier de production

- Noms produits par la fiche : `front.png`, `back.png`, `left-sleeve.png`, `right-sleeve.png`, `collar.png` (`types:35-41`, `order.ts:326`). `OrderPanel` s'en sert pour nommer les téléchargements (`:191`).
- **MAIS** : `OrderPanel.tsx:189` appelle `renderPrintPng` **sans `dpi`** (donc 300 par défaut) et `buildProductionSheet` (`:169-178`) **sans `profileId`** (donc profil DTF par défaut) ; `getPrintArea(product, side)` (`:64,183`) est également appelé sans profil. Un procédé flex/DTG/sublimation produirait des fichiers à la mauvaise densité.
- Le serveur limite le dépôt à **6 fichiers** (`src/server/dossiers/dossier.ts:24`, contrôle `:84-85`), 25 Mo/fichier (`:25`), 60 Mo au total. **5 PNG + fiche `.txt` + fiche `.json` = 7 fichiers** : le dossier complet d'un T-shirt cinq zones serait refusé en l'état.
- Types acceptés : `image/png`, `application/json`, `text/plain` (`dossier.ts:27`), chemin borné à `dossiers/<commande>/` (`:63-69`), premier dépôt faisant foi.

## 8. Écarts avec les exigences de la mission 02

| Exigence | Constat à l'instantané | Adaptation nécessaire | Risque |
|---|---|---|---|
| **5 zones indépendantes** | GLB : 5 maillages/matériaux/textures indépendants (vérifié §5). Applicatif : `Side` élargi mais `ProductModel` ne rend pas `zones` ; store `loadConfig` limité à 2 faces ; sélecteur de face à 2 boutons. | Branche `zones` complète, 5 textures, navigation 5 zones, sérialisation v3. | **Critique** : produit par défaut inutilisable. |
| **Navigation caméra par zone** | `ZoneModel.vue` (azimut/polaire/distance/cible) défini mais inutilisé ; `CameraRig` ne gère que 0/π ; `OrbitControls` limite la polaire à [0,4 ; 2,5] rad. | Consommer `vue` par zone, étendre `CameraRig`, câbler les 5 boutons/rail. | Élevé (col/manches inaccessibles à l'édition). |
| **Éditeur graphique (undo/redo, duplication, calques)** | Calques partiels (liste + visibilité + `z` + flèches) ; **pas d'undo/redo**, **pas de duplication** ; le canvas 2D d'édition existe mais n'est pas monté. | Historique store, duplication, montage d'un éditeur (2D ou 3D) avec glisser. | Élevé (expérience en dessous du « premium »). |
| **Synchro 2D/3D et textures indépendantes** | Source unique Zustand (bon) ; 3D : un canvas par face, seule la face active est composée, l'autre est repeinte à la couleur ; `flipY = true` ; matériaux opaques. | 5 textures transparentes (`flipY = false`), matériaux `PRINT_*` transparents, composition par zone. | **Critique** : visuel absent ou incorrect. |
| **Couleurs définies par le modèle (8 couleurs)** | 8 couleurs identiques dans le GLB et le catalogue ; aucun code ne lit `userData.colors` ni `fabricMaterials` ; pour `zones` la couleur n'est pas appliquée (branche `decal` teinte en blanc). | Lire les extras (ou le catalogue) et teinter `FABRIC`/`FABRIC_RIB` par nom de matériau (guide §7). | Élevé (couleur sans effet). |
| **Profils de production configurables** | JSON + helpers prêts ; aucun sélecteur, `getPrintArea` retombe sur DTF, `zoneCommandable`/`empechementsCommande` non appelés. | Sélecteur de procédé, gating des zones « à valider », `dpi` transmis à l'export. | Élevé (fichiers faux ; commande d'une zone non fabricable). |
| **Persistance / panier** | Inexistant : ni panier, ni projet sauvegardé, ni design côté serveur ; `serialize` utilisé seulement par les tests. | Modules de persistance (IndexedDB assets + localStorage projets/panier), restauration des images, panier. | Élevé (perte de travail, pas de reprise de commande). |
| **Export PNG transparent nommé `front.png`…** | Nommage déjà dans `SIDE_FILE`/fiche ; `renderPrintPng` compose transparent et recadre la zone ; maillage non branché ; 6 fichiers max côté serveur ; `dpi` non transmis. | Boucler 5 zones, passer le `dpi` du profil, relever `MAX_FICHIERS` à ≥ 7. | **Critique** : dossier incomplet/refusé (422). |
| **Interface premium desktop/mobile** | Base responsive soignée (viewer collant, panneaux, `dpr` adaptatif, barre mobile) ; pas de rail de zones, pas d'édition directe, `FacePreview` en 300 px max. | Rail de zones, gestes, états de chargement par zone, qualité d'aperçu. | Moyen (perçu produit). |

## 9. Points de vigilance mesurés

### 9.1 Dimensions physiques, ratios et repères

Les cinq textures de zone font 63,2 × 79 / 62,4 × 78 / 60 × 30 / 60 × 30 / 12 × 6,7 cm ; ratios 0,800 / 0,800 / 2,000 / 2,000 / 1,791 (identiques à `zones.json` et au guide §5). La correspondance stricte **px ↔ cm** n'est garantie que par le ratio : une image doit avoir exactement le ratio de la zone, sinon elle est étirée (guide §5). Le mode `zones` du catalogue calculant `w/h` depuis `textureCm`, cette contrainte est structurellement respectée par `compositionSize()`.

Les repères mesurés (§5.3) sont exploitables tels quels pour placer les zones de production ; le catalogue les a déjà recopiés. Attention au **col** : `TSHIRT_COLLAR_PRINT` n'a pas de repère d'axe médian exploitable (`axisTopCm: null`), le profil DTF utilise donc `repere: "haut"` (`production/profils.json:36-37`), et la zone imprimable 8 × 4,5 cm est placée à (2 ; 1) cm dans la texture 12 × 6,7.

### 9.2 Déformation et isotropie

Mesuré sur les arêtes des mailles (`POSITION` + `TEXCOORD_0` convertis en cm via `print_width_cm`/`print_height_cm`) et comparé au rapport `zones.json:148-174` :

| Zone | Médiane mesurée | p05–p95 mesurés | Rapport `zones.json` (médiane ; p05–p95) | Anisotropie locale (médiane ; p95) |
|---|---|---|---|---|
| Avant | 0,996 | 0,946 – 1,070 | 0,995 ; 0,944 – 1,070 | 1,011 ; 1,156 |
| Dos | 0,990 | 0,932 – 1,078 | 0,990 ; 0,930 – 1,077 | 1,011 ; 1,201 |
| Manches | 1,000 | 0,869 – 1,047 | 0,998 ; 0,873 – 1,043 | 1,021 ; 1,259 |
| Col | 1,015 | 0,754 – 1,157 | 0,996 (collar_rib) ; 0,896 – 1,051 | 1,149 ; 1,583 |

Lecture : les UV sont **presque isotropes et presque isométriques** (médiane ≈ 1, anisotropie médiane 1,01–1,15), la compression des manches se concentre sous le bras (p05 0,87), et le col est la zone la plus irrégulière (p05 0,75 mesuré sur la coque d'impression, chiffre non strictement comparable au `collar_rib` du rapport). Conclusion : un visuel carré reste visuellement carré au centre des zones, mais les bords des manches et le col subissent une déformation perceptible ; ne pas promettre une précision de repérage millimétrique sur ces deux zones.

### 9.3 Rendu, orientation, sens de lecture

- **Orientation** : `+Z` = devant (le maillage avant a une coordonnée Z moyenne positive, le dos négative) ; `+Y` = haut ; unités en mètres (`units: "meters"`). Une caméra à `[0, 0.15, 3.4]` regarde bien la face avant.
- **Sens de lecture vérifié géométriquement** : pour l'avant, u moyen passe de 0,27 (x faible) à 0,74 (x élevé) ⇒ u croît vers +X, donc de gauche à droite pour un observateur placé devant, texte non miroir. Pour le dos, u croît vers −X, ce qui est de gauche à droite vu de dos : non miroir. Pour la manche gauche, u croît vers −Z (arrière) et l'image a donc son bord gauche vers l'avant ; pour la manche droite, l'inverse — conforme au guide (`integration-guide.md:80-81`). Au col, u croît vers +X et v croît vers le bas : texte à l'endroit vu de l'avant.
- **Placeholders** : 5 PNG 4 × 4 entièrement transparents, `alphaMode: BLEND`, une seule face ⇒ le T-shirt apparaît vierge tant qu'aucun visuel n'est posé (guide §3).
- **Tone mapping** : ACES par défaut R3F alors que le guide recommande `NeutralToneMapping` (§8). À trancher avant de juger les couleurs : ACES désature notamment l'orange `#FF5A12`.
- **Poids** : 2,4 Mo dont ~2,45 Mo de BIN (textures), acceptable ; pas de Draco/KTX2, donc pas de décodeur supplémentaire, mais pas de gain de chargement possible sans retraitement.

### 9.4 Pièges de production et de performance

1. **`recommended_texture_px` n'est pas une résolution d'impression** : 25 px/cm (≈ 63,5 dpi) en avant/dos, 20 px/cm (≈ 50,8 dpi) en manches, 39,8 px/cm (≈ 101 dpi) au col. La production doit utiliser `productionTextureSize(area, profil.dpi)` (300 dpi DTF), pas ces valeurs.
2. **Plafond 4096 px** : `productionTextureSize()` plafonne chaque dimension séparément (`design-canvas.ts:517-523`). Exemples mesurés : DTG avant 35 × 40 cm à 300 dpi = 4134 × 4724 → 4096 × 4096 (ratio 1 au lieu de 0,875) ; flex avant 28 × 35 cm = 3307 × 4134 → 3307 × 4096 (0,807 au lieu de 0,8) ; sublimation avant 63,2 × 79 cm à 150 dpi = 3732 × 4665 → 3732 × 4096. **Déformation à corriger** (plafonner proportionnellement ou refuser).
3. **Zones DTF à valider** : `front`/`back` sont `disponible`, mais `left-sleeve`, `right-sleeve` et `collar` sont `a-valider` (`profils.json:16-39`). Le code ne bloque pas encore la commande (`empechementsCommande` inutilisé) ; il faut interdire l'encaissement d'une zone non disponible, pas seulement l'afficher.
4. **Marges de texture** : les bords du rectangle UV ne sont pas sur la géométrie (jusqu'à 9,6 % en largeur pour les manches) ; composer à partir de la **zone imprimable** (sous-rectangle) et non de la texture entière, sinon des éléments sont invisibles sur le 3D (mais présents dans le PNG).
5. **Marge du col** : le guide recommande 5 mm de marge ; `ELEMENT_LIMITS.margin = 0,015` de zone n'en garantit que ~1,2 mm sur une zone DTF de 8 cm. Le col est la zone la plus sujette à l'ondulation (≈ 2 mm) : prévoir une marge dédiée dans la zone de production ou dans le bornage.
6. **Mémoire des textures** : 5 canvases au format de texture (1024 × 1280 avant, 1024 × 1280 dos, 1024 × 512 par manche, 1024 × 572 col à 1024 px de large). Total ≈ 4,3 Mpx, soit ≈ 17 Mo en RGBA ; à 2048 px de large, ≈ 17,0 Mpx ≈ 68 Mo. Sur mobile, garder l'aperçu à 1024 px (ou moins) et ne monter en résolution qu'à l'export.
7. **Cycle de vie** : le cache de textures n'est jamais libéré (aucun appel à `disposePanelTextures`), et `useGLTF` n'est pas préchargé ; avec 5 zones et des allers/retours produit, vérifier le nombre de textures GPU.

## 10. État de base à corriger

Vérifications exécutées sur l'instantané figé (§0.1), puis répétées sur un `HEAD` propre pour distinguer les régressions préexistantes.

### 10.1 TypeScript — `npx tsc --noEmit --incremental false`

**11 erreurs, dans 3 fichiers** :

| Fichier | Lignes | Cause |
|---|---|---|
| `src/components/configurator/ProductModel.tsx` | 178, 193, 197, 205, 217, 225, 338 | `Side` à 5 valeurs incompatible avec `panelKey()`/`PanelMaterials`/`OTHER` et avec les tableaux `front/back/body` |
| `src/components/configurator/ProductViewer.tsx` | 261 | prop `side` du `CameraRig` typée `'front' \| 'back'` |
| `src/lib/three/models.ts` | 11, 17, 23 | `Record<Side \| 'body', …>` sans les clés `left-sleeve`, `right-sleeve`, `collar` |

Aucune erreur n'apparaît dans le catalogue, le store ni les modules de production à cet instant (le store n'était pas encore historisé).

### 10.2 Tests — `npx vitest run`

**14 échecs, 4 fichiers** (439 passés, 32 ignorés, 47 fichiers de test ; 5 fichiers de test sont entièrement ignorés, sans que le rapport permette de nommer lesquels) :

| Fichier | Tests en échec | Cause |
|---|---|---|
| `tests/catalog.test.ts` | 10 : « contient le T-shirt fournisseur en produit par défaut » (`:23`), « préfixe le chemin du modèle… » (`:53`), « refuse une face incohérente… » (`:77`), « exige une zone qui couvre toute la texture du décalque » (`:107`), « exige un cadre de projection complet » (`:113`), « exige unitToCm… » (`:119`), « refuse une zone dont la technique ne correspond pas au produit » (`:125`), « convertit les centimètres en unités du modèle » (`:131`), « place le cadre arrière… » (`:139`), « suit le format de la zone pour un décalque » (`:155`) | Écrits pour le raglan `decal` (21 × 30, `/models/tshirt/tshirt.glb`, `printAreas.front` non nul) ; le produit par défaut est devenu `zones` sans `printAreas` |
| `tests/garmentSurface.test.ts` | 1 : « le T-shirt raglan est en surface vierge » (`:69`) | `tshirt-basic` n'a plus `surface: 'blank'` |
| `tests/order.test.ts` | 1 : « décrit faces, fichiers, quantité, livraison et montant » (`:204-210`) | Le nom de fichier attendu est `ELB-…-avant.png`, la fiche produit désormais `front.png` |
| `tests/printExport.test.ts` | 2 : « le facteur ramène effectivement l'élément dans la zone » (`:59`), « redessine le texte par son contenu » (`:126-135`) | Le premier suppose que l'arrondi de taille suffit (zone désormais sous-rectangle) ; le second fige `échelle == 2480/2048`, alors que l'export divise par la largeur réelle de la zone (`2480/680,6 = 3,644` mesuré) |

**Contrôle de causalité** : sur un `HEAD` propre (sans les modifications de migration), ces 4 fichiers passent **54/54**. Les 14 échecs sont donc exclusivement imputables à la migration en cours, pas à des tests déjà cassés. Les 16 échecs annoncés par la mission ne sont pas reproduits : la mesure en donne 14 à l'instantané. **L'écart n'est pas expliqué par les vérifications effectuées** ; il devra être tranché sur l'arbre final (décompte antérieur ou arbre différent).

### 10.3 Interprétation

Ces échecs sont le **point de départ attendu** de la migration : il faut les traiter en même temps que le branchement `zones`, sans les ignorer ni les supprimer. À noter aussi qu'**aucun test ne couvre le modèle Elembo** (pas de `tests/elemboModel.test.ts`, malgré le commentaire de `catalog.ts:73-74`) ; les futurs tests devront vérifier les noms réels des maillages et les repères mesurés (§5), pas seulement la forme du catalogue.

## 11. Risques principaux et recommandations

**Trois risques majeurs, par ordre d'impact :**

1. **Rendu `zones` absent → configurateur cassé avec le produit par défaut.** Le catalogue pointe déjà le GLB Elembo, mais `ProductModel.tsx` n'a pas de branche `zones` : en analyse statique, la composition lève une `TypeError` et la couleur/le visuel ne sont pas appliqués. *Mitigation* : brancher `zones` derrière un composant dédié, conserver `ProductModel` pour `uv`/`decal`, et couvrir par un test de rendu headless (scène + matériaux + textures) avant de basculer le produit par défaut.
2. **Production incorrecte ou impossible.** Trois défauts se cumulent : `dpi`/`profilId` non transmis de bout en bout ; plafond 4096 qui déforme le ratio des grandes zones ; dossier serveur limité à 6 fichiers alors que 5 zones + 2 fiches en font 7 ; zones manches/col « à valider » non bloquées dans le tunnel. *Mitigation* : câbler le profil jusqu'à `renderPrintPng`, corriger le plafonnement proportionnel, relever `MAX_FICHIERS`, appeler `empechementsCommande` avant paiement.
3. **Personnalisation non persistée et non traçable.** Ni panier, ni brouillon, ni design côté serveur ; la sérialisation v2 ignore les zones autres que l'avant/arrière. *Mitigation* : version 3 de `ConfiguratorConfig` (`profileId`, 5 `Side`), sauvegarde locale tolérante (IndexedDB/localStorage), restauration des images, et journalisation du design dans le dossier de production — sinon une commande payée ne peut être ni reprise ni reproduite.

**Points de vigilance documentaires** : mettre à jour `public/models/README.md` (modèle par défaut et troisième technique), corriger le commentaire `catalog.ts:73-74` ou créer le test annoncé, expliciter les écarts du §5.5, et ne pas utiliser `recommended_texture_px` comme densité d'impression.

## Annexe A — Vérifications exécutées et résultats clés

| Commande / vérification | Résultat |
|---|---|
| `node scripts/glb-zones.mjs public/models/elembo-tshirt/elembo-tshirt.glb` | 7 nœuds, 7 matériaux, 5 zones avec `extras`, racine `ELEMBO_TSHIRT` (code de sortie 0) |
| Inspection JSON GLB (script Node `-e`, aucun fichier créé) | 2 470 168 octets ; scène → nœud 6 ; pas de Draco/caméra/animation/skin ; extras complets ; compte de triangles 40 600 |
| Mesure UV (POSITION + TEXCOORD_0, conversion cm) | boîtes UV, silhouettes, marges, repères `col 11,85 / dos 3,38 / épaule 1,08` ; déformation et anisotropie §9.2 |
| Extraction des PNG intégrés (IHDR + inflate) | 5 placeholders 4 × 4, alpha 0 sur les 16 pixels ; atlas 2048²/1024², normales 512²/256² |
| `npx tsc --noEmit --incremental false` (instantané) | 11 erreurs, 3 fichiers (§10.1) |
| `npx vitest run` (instantané) | 14 échecs, 4 fichiers ; 439 passés, 32 ignorés (§10.2) |
| `npx vitest run tests/catalog.test.ts tests/garmentSurface.test.ts tests/order.test.ts tests/printExport.test.ts` sur `HEAD` propre | 4 fichiers, 54 tests passés → échecs bien causés par la migration |
| Lecture du chargeur installé (`node_modules/three`) et de R3F | groupe `TSHIRT_BODY_1/2`, extras → `userData`, ACES par défaut R3F |
| Aucune exécution de serveur, aucun commit | conforme à la consigne |

*Fin du livrable. Établi le 12 novembre 2026 à partir du commit `917dc94` et de l'instantané de travail décrit au §0.1.*
