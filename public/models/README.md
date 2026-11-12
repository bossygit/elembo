# Modèles 3D Elembo

Un dossier par produit : `public/models/<produit>/<produit>.glb`.
Le catalogue (`src/lib/products/catalog.ts`) référence le chemin racine ; le basePath du
déploiement est ajouté par `resolveModelUrl()`.

## Fichiers présents

| Fichier | Rôle |
| --- | --- |
| `elembo-tshirt/elembo-tshirt.glb` | **Modèle par défaut du configurateur** (produit `tshirt-basic`, technique `zones`) : T-shirt Elembo oversize, 2,4 Mo, 40 600 triangles, 2 470 168 octets, cinq surfaces d'impression indépendantes (avant, dos, deux manches, intérieur du col). Généré par les scripts Blender de `scripts/blender/elembo-tshirt/`. |
| `tshirt/tshirt.glb` | Ancien modèle commercial fournisseur (raglan 19 Mo, 29 678 triangles, textures PBR 4k, 1 unité = 1 pouce) — **plus le modèle par défaut** ; conservé pour la technique `decal` et pour ne pas casser les liens. |
| `tshirt-alt/tshirt.glb` | Second modèle fournisseur : T-shirt col rond (237 940 triangles, maillages séparés avant/arrière, sans textures — teinté exactement par la couleur choisie, 1 unité = 1 mètre). |
| `tshirt/tshirt-placeholder.glb` | Placeholder généré par nous (36 triangles), pour la technique `uv` et les tests. |

Les cinq gabarits de zone du modèle Elembo ne sont **pas** dans ce dossier : ils sont publiés
dans `public/zones/` (voir plus bas).

## Trois techniques d'impression

Le catalogue déclare une `technique` par produit ; le rendu, la composition et l'export s'y
adaptent. Les techniques `uv` et `decal` sont historiques et restent supportées telles quelles ;
`zones` est celle du modèle Elembo livré.

### 1. `zones` — modèle Elembo à cinq surfaces d'impression (défaut)

Le GLB expose une surface d'impression par zone, chacune avec son **maillage dédié**, son
**matériau dédié** (`PRINT_*`) et ses **UV propres**. La couleur du vêtement est portée par les
deux matériaux du tissu (`FABRIC`, `FABRIC_RIB`) ; chaque surface d'impression reçoit une texture
**transparente** composée par le Canvas 2D. Changer une zone ne touche donc jamais les autres, et
changer la couleur ne touche jamais les visuels.

```
ELEMBO_TSHIRT                    (racine ; extras : units, colors, fabric_materials, elembo_version)
├── TSHIRT_BODY                  tissu : 2 primitives → FABRIC (corps) + FABRIC_RIB (col côtes)
├── TSHIRT_FRONT_PRINT           zone 01 → PRINT_FRONT
├── TSHIRT_BACK_PRINT            zone 02 → PRINT_BACK
├── TSHIRT_LEFT_SLEEVE_PRINT     zone 03 → PRINT_LEFT_SLEEVE   (manche gauche du porteur)
├── TSHIRT_RIGHT_SLEEVE_PRINT    zone 04 → PRINT_RIGHT_SLEEVE  (manche droite du porteur)
└── TSHIRT_COLLAR_PRINT          zone 05 → PRINT_COLLAR        (intérieur du col)
```

Conventions vérifiées dans le fichier (`node scripts/glb-zones.mjs`) et par
`tests/elemboModel.test.ts` :

- unités **mètres**, `+Y` vers le haut, `+Z` devant, origine au centre de la boîte englobante ;
- ni Draco, ni animation, ni caméra, ni lumière ; extensions `KHR_texture_transform` (requise),
  `KHR_materials_sheen`, `KHR_materials_specular` ;
- surfaces d'impression : `TEXCOORD_0` = **UV de la zone** (0..1, isotropes), `TEXCOORD_1` =
  **atlas tissu** (maille et occlusion) ; la maille est répétée par `KHR_texture_transform`
  (motif de 2 cm) ;
- **`TSHIRT_BODY` devient un groupe dans Three.js** (deux primitives) : le tissu se retrouve par
  **nom de matériau**, pas par nom de maillage ;
- placeholders : PNG 4 × 4 entièrement transparents, le T-shirt apparaît vierge au chargement ;
- `flipY = false` côté Three.js (origine glTF en haut à gauche), sinon le visuel est retourné.

| Zone | Maillage | Texture | Ratio | Sens de lecture |
| --- | --- | --- | --- | --- |
| Avant | `TSHIRT_FRONT_PRINT` | 63,2 × 79 cm | 0,800 | de face, haut = col |
| Dos | `TSHIRT_BACK_PRINT` | 62,4 × 78 cm | 0,800 | de dos, haut = col |
| Manche gauche | `TSHIRT_LEFT_SLEEVE_PRINT` | 60 × 30 cm | 2,000 | de l'extérieur, haut = épaule, gauche = avant |
| Manche droite | `TSHIRT_RIGHT_SLEEVE_PRINT` | 60 × 30 cm | 2,000 | de l'extérieur, haut = épaule, gauche = arrière |
| Col | `TSHIRT_COLLAR_PRINT` | 12 × 6,7 cm | 1,791 | de l'avant, intérieur de l'encolure |

Les dimensions **imprimables** ne sont pas celles des textures : elles dépendent du procédé et
vivent dans `production/profils.json` (voir `docs/integration-configurateur-tshirt.md`).
`recommended_texture_px` (extras du GLB) n'est pas une résolution d'impression : la production
utilise `productionTextureSize(area, profil.dpi)`.

### 2. `decal` — modèle fournisseur, visuel projeté

Le maillage est unique et son atlas UV ne réserve pas de zone d'impression : le visuel est
**projeté sur la surface** (`DecalGeometry`) dans un cadre exprimé en unités du modèle. La zone
reste définie en **centimètres** dans le catalogue : c'est elle qui fait foi pour la densité
(dpi) et le fichier d'impression.

- Le vêtement conserve ses textures PBR (normal, rugosité, occlusion).
- Son **albédo est neutralisé** au chargement (`neutralAlbedoTexture`, `src/lib/three/textures.ts`) :
  un modèle fournisseur est souvent livré avec la teinte de son auteur, or teinter une texture
  déjà colorée donne des teintes fausses. On désature l'albédo (grain, coutures et plis
  conservés) et la couleur choisie est portée par le matériau.
- Le visuel imprimé n'est jamais teinté par la couleur du vêtement (matériau distinct).

⚠️ **Un modèle acheté peut porter un imprimé de son auteur.** Sur l'ancien raglan, un logo
« RUN » est gravé **à la fois** dans l'albédo **et** dans la texture de normales : la
neutralisation de l'albédo le laisse donc visible (en couleur *et* en relief). Le champ
`surface` du catalogue tranche :

| `surface` | Albédo | Normales / rugosité / occlusion | Quand l'utiliser |
| --- | --- | --- | --- |
| `vendor` | neutralisé | conservées | modèle vierge et neutre (défaut) |
| `flat-albedo` | ignoré | conservées | l'auteur a laissé sa teinte dans l'albédo |
| `blank` | ignoré | ignorées | imprimé d'auteur gravé aussi dans le relief |

Pour savoir dans quel cas on se trouve, extraire les textures et les regarder :

```bash
node scripts/extract-glb-texture.mjs "modele.glb" albedo.png baseColor
node scripts/extract-glb-texture.mjs "modele.glb" relief.png normal
sips -Z 1100 albedo.png --out albedo-vue.png    # puis ouvrir l'image
```

### 3. `uv` — panneaux dédiés dans le modèle

Le modèle expose trois nœuds nommés exactement :

| Nœud | Rôle | UV |
| --- | --- | --- |
| `FrontPanel` | panneau avant, reçoit la texture du visuel | `TEXCOORD_0` sur (0,0)-(1,1) |
| `BackPanel` | panneau arrière, reçoit la texture du visuel | (0,0)-(1,1), u inversé en X |
| `Body` | manches, tranches, tout le reste (couleur unie, sans motif) | quelconque |

1. **UV planes sur les panneaux** (projection orthogonale sur l'axe de la face), sinon le
   visuel apparaît déformé.
2. **`BackPanel` : u le long de −X**, sinon le visuel de dos apparaît en miroir.
3. **Zone d'impression déclarée dans le catalogue**, pas dans le modèle : `printAreas` en
   fractions de la texture (0..1) + taille physique en cm. `validateProduct()` refuse une
   conversion pixels → cm non isotrope (un visuel carré doit s'imprimer carré).
4. **Matériau PBR conservé** : le configurateur clone le matériau et ne modifie que `color`
   et `map`.
5. **Échelle** : celle du modèle (`panel` décrit la taille physique du panneau imprimable).

## Gabarits de zone — `public/zones/`

`public/zones/<zone>.png` (`front`, `back`, `left-sleeve`, `right-sleeve`, `collar`) sont les
**patrons détourés** du modèle : silhouette de la pièce, grille en cm et sens de lecture. Ils
servent de repère visuel dans l'éditeur 2D et les vignettes du rail de zones ; ils ne sont
**jamais imprimés** ni inclus dans les textures (voir `src/lib/zone-assets.ts`).

Ils sont produits par :

```bash
node scripts/prepare-zone-templates.mjs
```

Le script détoure le fond blanc des planches `assets/3d/elembo-tshirt/uv-*.png`, remet l'alpha à
zéro sur les pixels blancs, réduit la définition et écrit `public/zones/*.png`. **À relancer dès
que le modèle est régénéré** (les planches `uv-*.png` changent avec lui).

## Ajouter un nouveau modèle — procédure

1. Déposer le GLB dans `public/models/<produit>/<produit>.glb`.
2. Analyser le maillage : dimensions, orientation, surfaces, UV.

```bash
node scripts/inspect-glb.mjs "chemin/vers/modele.glb"        # boîte englobante, UV, profondeur de surface
node scripts/glb-meshes.mjs  "chemin/vers/modele.glb"        # un maillage par ligne (parent, UV, taille 3D)
node scripts/glb-zones.mjs   "chemin/vers/modele.glb"        # modèle à zones : nœuds, matériaux, mesures
node scripts/decal-frame.mjs "chemin/vers/modele.glb" 100 21 30 7   # cadre d'impression (unité cm, 21×30 cm, 7 cm sous le col)
```

3. Renseigner le produit dans `src/lib/products/catalog.ts` :
   - technique `zones` : `zones` (nom de maillage exact, `textureCm`, `reperesCm`, `vue`),
     `fabricMaterials` (noms de matériaux du tissu), `colors` ;
   - technique `decal` : `unitToCm` et les `printAreas` avec leur `projection` ;
   - technique `uv` : `panel` (taille physique du panneau) et les `printAreas` en fractions.
4. `npm test` : `validateProduct()` refuse une configuration incohérente (zone hors texture,
   projection incomplète, `unitToCm` manquant, matériaux du tissu non déclarés…) et
   `tests/elemboModel.test.ts` vérifie les noms et dimensions **réels** du GLB Elembo.

### Plusieurs maillages : les deux pièges

- **La couleur doit être appliquée à tous les maillages** (ou, pour `zones`, aux seuls matériaux
  du tissu déclarés). Un modèle peut compter une dizaine de maillages (corps avant/arrière,
  manches, col) : n'en teinter qu'un laisse une partie du vêtement à sa couleur d'origine.
- **La projection se fait via `mesh.matrixWorld`.** Le cadre du catalogue est exprimé dans le
  repère d'authoring du modèle (celui que mesure le script) ; il faut le convertir en
  coordonnées monde, sinon un modèle dont la racine porte une rotation (exports Sketchfab, par
  exemple) projette dans le vide — le décalque est alors créé avec zéro sommet, sans aucune
  erreur.

## Points de vigilance

- **Cadrage caméra** : automatique (`src/lib/three/framing.ts`), donc un modèle en pouces, en
  centimètres ou en mètres s'affiche correctement.
- **Poids** : le modèle Elembo pèse 2 470 168 octets, dont 2 456 412 de données binaires
  (géométrie et textures) ; l'ancien raglan de 19 Mo avec textures 4k reste un contre-exemple à
  éviter pour un chargement mobile. Une variante allégée (textures 2k, maillage décimé, ou KTX2/Basis)
  reste possible.
- **Le placeholder se régénère** avec `node scripts/gen-tshirt-glb.mjs` — **ne pas** écraser le
  modèle commercial avec.
- Documentation d'intégration de bout en bout : `docs/integration-configurateur-tshirt.md`
  (architecture, zones, export, tests). Audit d'avant intervention :
  `docs/audit-configurateur-tshirt.md`.

> Aucun modèle dont la licence est inconnue n'est téléchargé ou committé ici.
