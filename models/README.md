# Modèles 3D Elembo

Un dossier par produit : `public/models/<produit>/<produit>.glb`.
Le catalogue (`src/lib/products/catalog.ts`) référence le chemin racine ; le basePath du
déploiement est ajouté par `resolveModelUrl()`.

## Fichiers présents

| Fichier                        | Rôle                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `tshirt/tshirt.glb`            | **Modèle commercial** : T-shirt raglan fournisseur (19 Mo, 29 678 triangles, textures PBR 4k intégrées). |
| `tshirt-alt/tshirt.glb`        | **Second modèle** : T-shirt col rond (6,5 Mo, 237 940 triangles, maillages séparés avant/arrière, sans textures — teinté exactement par la couleur choisie). |
| `tshirt/tshirt-placeholder.glb` | Placeholder généré par nous (36 triangles), pour la technique `uv` et les tests.              |

## Deux techniques d'impression

Le catalogue déclare une `technique` par produit ; le rendu et le calcul s'y adaptent.

### 1. `decal` — modèle fournisseur, visuel projeté (T-shirt actuel)

Le maillage est unique et son atlas UV ne réserve pas de zone d'impression : le visuel est
donc **projeté sur la surface** (`DecalGeometry`) dans un cadre exprimé en unités du
modèle. La zone reste définie en **centimètres** dans le catalogue : c'est elle qui fait
foi pour la densité (dpi) et le fichier d'impression.

- Le vêtement conserve ses textures PBR (normal, rugosité, occlusion).
- Son **albédo est neutralisé** au chargement (`neutralAlbedoTexture`, `src/lib/three/textures.ts`) :
  le modèle fournisseur est livré bleu-teal, or teinter une texture déjà colorée donne des
  teintes fausses. On désature l'albédo (grain, coutures et plis conservés) et la couleur
  choisie est portée par le matériau.
- Le visuel imprimé n'est jamais teinté par la couleur du vêtement (matériau distinct).

⚠️ **Un modèle acheté peut porter un imprimé de son auteur.** Sur le raglan, un logo
« RUN » est gravé **à la fois** dans l'albédo **et** dans la texture de normales : la
neutralisation de l'albédo le laisse donc visible (en couleur *et* en relief). Le champ
`surface` du catalogue tranche :

| `surface`     | Albédo                | Normales / rugosité / occlusion | Quand l'utiliser                                     |
| ------------- | --------------------- | ------------------------------- | ---------------------------------------------------- |
| `vendor`      | neutralisé            | conservées                      | modèle vierge et neutre (défaut)                     |
| `flat-albedo` | ignoré                | conservées                      | l'auteur a laissé sa teinte dans l'albédo            |
| `blank`       | ignoré                | ignorées                        | imprimé d'auteur gravé aussi dans le relief          |

Pour savoir dans quel cas on se trouve, extraire les textures et les regarder :

```bash
node scripts/extract-glb-texture.mjs "modele.glb" albedo.png baseColor
node scripts/extract-glb-texture.mjs "modele.glb" relief.png normal
sips -Z 1100 albedo.png --out albedo-vue.png    # puis ouvrir l'image
```

### 2. `uv` — panneaux dédiés dans le modèle

Le modèle expose trois nœuds nommés exactement :

| Nœud         | Rôle                                                        | UV                           |
| ------------ | ----------------------------------------------------------- | ---------------------------- |
| `FrontPanel` | panneau avant, reçoit la texture du visuel                  | `TEXCOORD_0` sur (0,0)-(1,1) |
| `BackPanel`  | panneau arrière, reçoit la texture du visuel                | (0,0)-(1,1), u inversé en X  |
| `Body`       | manches, tranches, tout le reste (couleur unie, sans motif) | quelconque                   |

1. **UV planes sur les panneaux** (projection orthogonale sur l'axe de la face), sinon le
   visuel apparaît déformé.
2. **`BackPanel` : u le long de −X**, sinon le visuel de dos apparaît en miroir.
3. **Zone d'impression déclarée dans le catalogue**, pas dans le modèle : `printAreas` en
   fractions de la texture (0..1) + taille physique en cm. `validateProduct()` refuse une
   conversion pixels → cm non isotrope (un visuel carré doit s'imprimer carré).
4. **Matériau PBR conservé** : le configurateur clone le matériau et ne modifie que `color`
   et `map`.
5. **Échelle** : celle du modèle (`panel` décrit la taille physique du panneau imprimable).

## Ajouter un nouveau modèle — procédure

1. Déposer le GLB dans `public/models/<produit>/`.
2. Analyser le maillage pour connaître ses dimensions, son orientation et ses surfaces :

```bash
node scripts/inspect-glb.mjs "chemin/vers/modele.glb"
```

Le script affiche la boîte englobante, les UV des faces avant/arrière et la profondeur de
surface (Z) par bande verticale — exactement les valeurs à reporter dans
`printAreas[].projection` (`center`, `rotationY`, `depth`).

Un second script calcule directement le cadre d'impression (centre et profondeur de la
surface) à partir d'une taille d'impression en centimètres :

```bash
node scripts/glb-meshes.mjs   "modele.glb"          # un maillage par ligne : UV, taille 3D, nœud parent
node scripts/decal-frame.mjs  "modele.glb" 100 21 30 7   # unité en cm, largeur, hauteur, cm sous le col
```

### Plusieurs maillages : les deux pièges

- **La couleur doit être appliquée à tous les maillages.** Un modèle peut compter une
  dizaine de maillages (corps avant/arrière, manches, col) : n'en teinter qu'un laisse
  une partie du vêtement à sa couleur d'origine.
- **La projection se fait via `mesh.matrixWorld`.** Le cadre du catalogue est exprimé
  dans le repère d'authoring du modèle (celui que mesure le script) ; il faut le
  convertir en coordonnées monde, sinon un modèle dont la racine porte une rotation
  (exports Sketchfab, par exemple) projette dans le vide — le décalque est alors créé
  avec zéro sommet, sans aucune erreur.

3. Renseigner le produit dans `src/lib/products/catalog.ts` : `modelUrl`, `technique`,
   `unitToCm` (1 unité = 1 pouce pour le raglan → 2,54 cm ; 1 unité = 1 mètre pour le
   modèle col rond → 100), `colors`, et les zones avec leur taille physique en cm.
4. `npm test` : `validateProduct()` refuse une configuration incohérente (zone hors texture,
   projection incomplète, `unitToCm` manquant…).

## Points de vigilance

- **Cadrage caméra** : automatique (`src/lib/three/framing.ts`), donc un modèle en pouces,
  en centimètres ou en mètres s'affiche correctement. En revanche `unitToCm` doit être juste,
  sinon la zone d'impression en cm serait fausse.
- **Poids** : un GLB de 19 Mo avec textures 4k met plusieurs secondes à charger sur mobile.
  Pour la production, prévoir une variante allégée (textures 2k, maillage décimé).
- Le placeholder se régénère avec `node scripts/gen-tshirt-glb.mjs` — **ne pas** écraser le
  modèle commercial avec.

> Aucun modèle dont la licence est inconnue n'est téléchargé ou committé ici.
