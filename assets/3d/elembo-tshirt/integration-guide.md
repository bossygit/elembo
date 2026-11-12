# T-shirt 3D Elembo : guide d'intégration

Ce guide présente le modèle 3D personnalisable du t-shirt Elembo. Il s'adresse aux personnes qui l'intègrent dans le configurateur web (Three.js et React Three Fiber) ou qui le retouchent dans Blender.

Le modèle est entièrement généré par script. Tous les fichiers listés ici se reproduisent à l'identique avec les commandes de la section 10.

## 1. Fichiers

| Fichier | Rôle |
|---|---|
| `public/models/elembo-tshirt/elembo-tshirt.glb` | Modèle prêt pour le web : 2,4 Mo, 40 600 triangles, textures incluses. |
| `assets/3d/elembo-tshirt/elembo-tshirt.blend` | Projet Blender modifiable : modèle, studio, 5 caméras et mannequin de simulation (masqué). |
| `assets/3d/elembo-tshirt/uv-front.png`<br>`uv-back.png`<br>`uv-left-sleeve.png`<br>`uv-right-sleeve.png`<br>`uv-collar.png` | Gabarits des zones d'impression : silhouette, maillage, grille en cm, sens de lecture. |
| `assets/3d/elembo-tshirt/preview-front.png`<br>`preview-back.png`<br>`preview-three-quarter.png`<br>`preview-sleeves.png` | Aperçus produit du t-shirt vierge, rendus avec Cycles. |
| `assets/3d/elembo-tshirt/qc/` | Visuels de test (`test-*.png`) et rendus de contrôle (`qc-*.png`). |
| `assets/3d/elembo-tshirt/zones.json` | Métadonnées : zones, dimensions, couleurs, rapport de déformation. |
| `assets/3d/elembo-tshirt/textures/` | Textures sources : atlas du tissu, occlusion, maille, côtes, textures vides des zones. |
| `scripts/blender/elembo-tshirt/` | Scripts de génération : `build.py`, `render.py`, `export_uv.py` et `make_2d.mjs`. S'y ajoute `viewer.html`, un banc d'essai Three.js. |

## 2. Repère et dimensions

Le GLB suit les conventions glTF :

- unités en mètres ;
- axe Y vers le haut ;
- devant du vêtement tourné vers +Z ;
- origine au centre de la boîte englobante du vêtement.

Le vêtement mesure 0,82 m de large (manches comprises), 0,75 m de haut et 0,18 m de profondeur. C'est un t-shirt unisexe oversize en taille M : poitrine de 58 cm à plat, épaules tombantes et col rond en côtes.

Il n'y a ni animation, ni caméra, ni lumière dans le GLB. Il n'utilise pas non plus Draco : aucun décodeur supplémentaire n'est nécessaire.

## 3. Hiérarchie, maillages et matériaux

```
ELEMBO_TSHIRT                    (nœud racine, extras : colors, fabric_materials, units)
├── TSHIRT_BODY                  tissu : 2 primitives → FABRIC (corps) + FABRIC_RIB (col côtes)
├── TSHIRT_FRONT_PRINT           zone 01 → PRINT_FRONT
├── TSHIRT_BACK_PRINT            zone 02 → PRINT_BACK
├── TSHIRT_LEFT_SLEEVE_PRINT     zone 03 → PRINT_LEFT_SLEEVE   (manche gauche du porteur, côté +X)
├── TSHIRT_RIGHT_SLEEVE_PRINT    zone 04 → PRINT_RIGHT_SLEEVE  (manche droite du porteur, côté −X)
└── TSHIRT_COLLAR_PRINT          zone 05 → PRINT_COLLAR        (intérieur du dos, sous le col)
```

À savoir avant d'intégrer :

- **`TSHIRT_BODY` devient un groupe dans Three.js.** Comme il porte deux matériaux, le `GLTFLoader` en fait un `Group` contenant `TSHIRT_BODY_1` et `TSHIRT_BODY_2`. Retrouvez donc le tissu par **nom de matériau** (`FABRIC`, `FABRIC_RIB`), pas par nom de maillage.
- **Les surfaces d'impression sont des copies exactes de la surface du tissu.** Elles sont décalées de 0,4 mm vers l'extérieur ; pour l'intérieur du col, de 0,4 mm vers l'intérieur de l'envers du tissu. Elles suivent donc chaque pli. Il ne s'agit pas de décalques flottants, et le décalage est invisible à toute distance de vue normale.
- **Chaque zone a son propre maillage, son propre matériau et sa propre texture.** Modifier une zone n'en affecte aucune autre.
- **Chaque surface d'impression porte ses métadonnées dans `userData`.** Les champs sont `zone`, `print_width_cm`, `print_height_cm`, `aspect`, `recommended_texture_px` et `inside`.

Tous les matériaux sont des PBR standard. Three.js les charge en `MeshPhysicalMaterial`, à cause du reflet satiné (`sheen`) du tissu.

| Matériau | Couleur de base | Autres réglages |
|---|---|---|
| `FABRIC`, `FABRIC_RIB` | `baseColorFactor` (couleur du tissu) × atlas blanc (coutures et surpiqûres ton sur ton) | normale de maille jersey répétée, occlusion précalculée, rugosité 0,93, reflet satiné discret |
| `PRINT_*` | texture du visuel, avec transparence (`alphaMode: BLEND`) | même maille et même occlusion que le tissu, rugosité 0,82 (encre mate), face avant seulement |

Le placeholder livré pour chaque zone est une image de 4 × 4 px entièrement transparente. Le t-shirt apparaît donc vierge tant qu'aucun visuel n'est posé.

## 4. Jeux d'UV

| Maillage | `TEXCOORD_0` (`uv`) | `TEXCOORD_1` (`uv1`) |
|---|---|---|
| `TSHIRT_BODY` | atlas du tissu | — |
| `TSHIRT_*_PRINT` | **UV de la zone d'impression**, 0..1, isotrope | atlas du tissu (maille et occlusion) |

Les UV d'une zone couvrent un rectangle du patron réel, à échelle constante : 1 pixel représente la même longueur horizontalement et verticalement. Un visuel carré s'imprime donc carré.

Pour chaque zone, le rectangle est centré sur la pièce de tissu et la couvre entièrement. Les parties du rectangle situées hors de la silhouette ne s'affichent pas : elles ne sont portées par aucun triangle. Les gabarits `uv-*.png` montrent cette silhouette.

La maille est répétée par `KHR_texture_transform`, avec un motif de 2 cm. Le `GLTFLoader` gère cette extension nativement.

## 5. Zones d'impression

| Zone | Maillage | Rectangle imprimable | Ratio L/H | Texture conseillée | Sens de lecture |
|---|---|---|---|---|---|
| 01 Devant | `TSHIRT_FRONT_PRINT` | 63,2 × 79 cm | 0,8 | 1580 × 1975 px | vu de face, haut = col |
| 02 Dos | `TSHIRT_BACK_PRINT` | 62,4 × 78 cm | 0,8 | 1560 × 1950 px | vu de dos, haut = col |
| 03 Manche gauche | `TSHIRT_LEFT_SLEEVE_PRINT` | 60 × 30 cm | 2 | 1200 × 600 px | vue de l'extérieur, haut = épaule ; gauche de l'image = avant |
| 04 Manche droite | `TSHIRT_RIGHT_SLEEVE_PRINT` | 60 × 30 cm | 2 | 1200 × 600 px | vue de l'extérieur, haut = épaule ; gauche de l'image = arrière |
| 05 Intérieur du col | `TSHIRT_COLLAR_PRINT` | 12 × 6,7 cm | 1,79 | 478 × 267 px | vu depuis l'avant, à l'intérieur de l'encolure |

Règles communes :

- **Le texte se lit à l'endroit dans toutes les zones.** Aucune zone n'est en miroir. Cela a été vérifié dans Blender et dans Three.js (section 9).
- **Une image doit avoir exactement le ratio de sa zone.** Avec un autre ratio, le visuel serait étiré. Composez-la sur un canvas de ce ratio, avec un fond transparent.
- **Les manches couvrent le tube entier.** Les bords gauche et droit de l'image se rejoignent sous le bras. La partie visible de l'extérieur est le centre de l'image ; le haut de l'image correspond à la tête de manche.
- **Intérieur du col : gardez une marge de 5 mm.** Après la simulation, le contour de cette petite zone ondule d'environ 2 mm.

## 6. Remplacer la texture d'une zone

```js
import * as THREE from 'three';

/** Pose un visuel (image, canvas ou ImageBitmap « à l'endroit ») sur une zone. */
function setPrint(root, meshName, source, renderer) {
  const mesh = root.getObjectByName(meshName); // ex. 'TSHIRT_FRONT_PRINT'
  const tex = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
  tex.flipY = false;                        // convention glTF : origine des UV en haut à gauche
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  mesh.material.map?.dispose();
  mesh.material.map = tex;                  // canal UV 0 = UV de la zone
  mesh.material.needsUpdate = true;
}
```

Pour un canvas mis à jour en continu (éditeur), conservez la même `CanvasTexture` et passez seulement `tex.needsUpdate = true` après chaque dessin.

Pour vider une zone, remettez une texture transparente, ou masquez le maillage avec `mesh.visible = false`.

## 7. Changer la couleur du tissu

```js
const FABRIC = ['FABRIC', 'FABRIC_RIB'];
function setFabricColor(root, hex) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [o.material].flat()) if (FABRIC.includes(m.name)) m.color.set(hex); // ex. '#1F2A44'
  });
}
```

La couleur ne touche que les deux matériaux du tissu. Les plis, l'occlusion, la maille et les surpiqûres sont conservés, parce que l'atlas est blanc et multiplié par la couleur. Les visuels imprimés ne sont pas affectés.

Les couleurs de référence sont dans `root.userData.colors` et dans `zones.json` :

| Couleur | Hex |
|---|---|
| Blanc | `#F4F3EF` |
| Noir | `#1A1A1C` |
| Gris chiné | `#9C9EA1` |
| Bleu marine | `#1F2A44` |
| Rouge | `#B3202A` |
| Vert | `#1E5E3B` |
| Jaune | `#F2C230` |
| Orange Elembo | `#FF5A12` |

N'importe quelle couleur hexadécimale fonctionne.

## 8. Intégration Three.js et React Three Fiber

**Rendu conseillé.** Ces réglages restituent fidèlement les couleurs des visuels :

- `renderer.toneMapping = THREE.NeutralToneMapping` ;
- un éclairage d'environnement, par exemple `RoomEnvironment` passé par `PMREMGenerator` ;
- une lumière directionnelle douce.

Évitez ACES, qui désature les couleurs vives comme l'orange Elembo.

**Banc d'essai.** `scripts/blender/elembo-tshirt/viewer.html` montre toute l'intégration en un seul fichier : chargement, couleurs, visuels de test, vues et diagnostic. Pour l'ouvrir :

```bash
python3 -m http.server 8765 --bind 127.0.0.1   # depuis la racine du dépôt
# puis http://127.0.0.1:8765/scripts/blender/elembo-tshirt/viewer.html?test=1
```

Paramètres de l'URL :

- `view` : `front`, `back`, `tq`, `left`, `right` ou `collar` ;
- `color` : couleur hexadécimale, encodée (`%23FF5A12`) ;
- `test=1` : pose les visuels de test.

Pour un diagnostic lisible par script, utilisez `window.__elemboQC`.

**Avec React Three Fiber et drei :**

```jsx
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';

// prints : { TSHIRT_FRONT_PRINT: canvas, TSHIRT_LEFT_SLEEVE_PRINT: canvas, ... }
function ElemboTshirt({ color, prints }) {
  const { scene } = useGLTF('/models/elembo-tshirt/elembo-tshirt.glb');
  const gl = useThree((s) => s.gl);
  // Copie de la scène ET des matériaux : chaque instance garde ses couleurs et ses visuels.
  const root = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((o) => {
      if (o.isMesh) o.material = o.material.clone();
    });
    return copy;
  }, [scene]);
  useEffect(() => setFabricColor(root, color), [root, color]);
  useEffect(() => {
    for (const [name, canvas] of Object.entries(prints)) setPrint(root, name, canvas, gl);
  }, [root, prints, gl]);
  return <primitive object={root} />;
}
```

**Avec le configurateur actuel du dépôt.** Le configurateur (`src/components/configurator/ProductModel.tsx`) ne gère aujourd'hui que l'avant et le dos. Il utilise deux techniques :

- `uv` : nœuds `FrontPanel` et `BackPanel`, avec la couleur du vêtement peinte dans la texture ;
- `decal` : visuel projeté sur la surface.

Ce modèle ne s'y branche pas tel quel. Il faudrait ajouter une technique `zones` au catalogue (`src/lib/products/catalog.ts`), avec les cinq zones et leurs dimensions en cm prises dans `userData`, puis :

- composer chaque zone sur un canvas **transparent**, sans peindre la couleur du vêtement dedans ;
- porter la couleur par `setFabricColor` ;
- étendre `Side` (`front | back`) aux manches et au col, dans le store et dans l'interface.

Cette intégration n'est pas faite.

## 9. Contrôle qualité réalisé

**Visuels de test.** Chaque zone a reçu un visuel distinct (`qc/test-*.png`), dans une couleur propre :

- orange pour l'avant ;
- cobalt pour le dos ;
- rose pour la manche gauche ;
- vert pour la manche droite ;
- noir pour le col.

Chaque visuel porte un texte asymétrique (« R 0x »), une flèche « haut », un cercle et une grille de 5 cm.

**Dans Blender, avec Cycles.** Les rendus sont dans `qc/qc-*.png` :

- vues de face et de dos sur tissu noir ;
- vue ¾ et manches sur tissu blanc ;
- vue de l'intérieur du col ;
- bande de quatre couleurs de tissu : jaune, marine, orange, gris.

**Dans Three.js** (r186, `GLTFLoader`) : mêmes vues, avec couleur personnalisée. Aucune erreur console.

Le diagnostic confirme la structure :

- `map` sur le canal UV 0 et `normalMap` / `aoMap` sur le canal 1 pour les zones, avec répétition de la maille appliquée ;
- matériaux d'impression transparents, face avant seulement.

**Résultats :**

- Les cinq zones sont indépendantes, et aucun texte n'apparaît en miroir.
- Les visuels suivent les plis.
- Les cercles restent ronds. La déformation est faible : le contrôle porte sur les longueurs d'arêtes entre le patron et la 3D, après simulation.

| Zone | Médiane | 90 % des arêtes |
|---|---|---|
| Devant | 0,995 | 0,94 – 1,07 |
| Dos | 0,99 | 0,93 – 1,08 |
| Manches | 1,00 | 0,87 – 1,04 |

La compression de 13 % sur les manches se concentre sous le bras, dans les plis.

- Changer la couleur ne modifie aucun visuel.

## 10. Régénérer

Depuis la racine du dépôt (Blender 4.5, environ 1 min hors rendus) :

```bash
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup -P scripts/blender/elembo-tshirt/build.py -- root=$PWD        # modèle + GLB + .blend
$B -b assets/3d/elembo-tshirt/elembo-tshirt.blend -P scripts/blender/elembo-tshirt/export_uv.py
node scripts/blender/elembo-tshirt/make_2d.mjs .                                         # gabarits + visuels de test
$B -b assets/3d/elembo-tshirt/elembo-tshirt.blend -P scripts/blender/elembo-tshirt/render.py -- samples=80
```

Réglages utiles de `build.py` :

| Paramètre | Effet | Défaut |
|---|---|---|
| `h` | densité du maillage | 1,3 cm |
| `bend` | rigidité du coton : plus élevée = moins de plis | 3,0 |
| `frames` | durée de la simulation | 30 |
| `sim=0` | supprime le drapé | — |

## 11. Limites et recommandations

- **Zone imprimable 3D et zone imprimable réelle.** Les zones couvrent les pièces entières, comme demandé. La surface réellement imprimable dépend du procédé :
  - **DTG sur t-shirt assemblé** : environ 40 × 50 cm sur le devant et le dos, sans passer sur les coutures, les manches ni les bords ;
  - **impression intégrale** (sublimation ou impression avant couture) : nécessaire pour couvrir toute la pièce.

  Le configurateur devra limiter la zone éditable selon le procédé vendu. L'élément manquant est une zone « sûre » par procédé dans le catalogue ; le modèle, lui, n'a pas à changer.
- **Coutures.** Un visuel ne traverse pas une couture : avant, dos et manches sont des zones séparées, comme sur un vrai vêtement. Sur une manche, les bords de l'image se rejoignent sous le bras.
- **Intérieur du col.** C'est l'emplacement d'une étiquette imprimée (sans étiquette cousue). La zone est petite (12 × 6,7 cm) et son contour ondule d'environ 2 mm : gardez 5 mm de marge.
- **Gris chiné.** Le chiné est rendu par une couleur unie. Un vrai chiné demanderait une texture de couleur dédiée.
- **Modèle procédural.** Le vêtement est construit et drapé par script : patrons, simulation de tissu, détails en texture. Les surpiqûres et les côtes sont dans les textures, pas dans la géométrie, ce qui convient à un usage web. Pour des gros plans photo, un retravail des ourlets en géométrie serait un plus.
- **Poids.** 2,4 Mo, dont 1,5 Mo de textures. Pour réduire encore, les textures peuvent passer en KTX2/Basis avec `gltf-transform`. Il faudrait alors ajouter `KTX2Loader` côté client.
