# Casquette Elembo — modèle 3D de l'atelier

Casquette baseball 6 panneaux structurée, visière pré-courbée, fermeture snapback, générée
de façon procédurale par `build.py` (Blender 4.5). Le visuel n'est jamais cuit dans le
modèle : les cinq surfaces d'impression sont livrées transparentes et l'atelier 3D y pose
une texture par zone.

## Régénérer

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  -P assets/3d/elembo-casquette/build.py -- root=$PWD [previews=0] [templates=0] [samples=64]
```

Environ 30 s sans rendus, 3 min avec. Le script écrit :

| Fichier | Rôle |
|---|---|
| `public/models/elembo-casquette/elembo-casquette.glb` | Modèle servi à l'atelier (≈ 2,7 Mo, ≈ 88 k triangles) |
| `zones.json` | Dimensions, zones, matériaux, couleurs et **contrôle d'isotropie** des UV |
| `uv-<zone>.png` → `public/zones/<zone>.png` | Gabarits : surface réellement couverte, grille en cm, sens « HAUT » |
| `public/mockups/casquette-elembo-3d.jpg` | Visuel de la fiche boutique |
| `preview-*.png`, `qc/zones-*.png` | Aperçus Cycles et contrôle des zones (gabarits posés sur le modèle) |
| `elembo-casquette.blend`, `textures/` | Projet Blender et textures procédurales |

Après une régénération : `npx vitest run tests/elemboCasquette.test.ts` vérifie les noms
de maillages et de matériaux, les UV, l'isotropie et que chaque zone de chaque procédé
(`production/profils.json`) tombe entièrement sur le tissu.

## Conventions

- glTF : mètres, Y vers le haut, visière vers +Z, gauche du porteur vers +X, origine au
  centre de la base.
- Zones (`Side`) : `cap-front`, `cap-left`, `cap-right`, `cap-back`, `visor`. Maillages
  `CAP_*_PRINT`, matériaux `MAT_CAP_PRINT_*` (un par zone, `alphaMode: BLEND`), décalés de
  0,35 mm au-dessus du tissu.
- UV d'impression (`TEXCOORD_0`) : chaque surface est **dépliée à étirement minimal** (SLIM)
  puis recalée sur l'axe de la zone : 1 cm de texture = 1 cm de tissu (écart ≤ 6 % sur 95 %
  de la surface, voir `zones.json`). glTF V = 0 en haut de l'image ; U croît vers la droite
  de l'observateur qui regarde la zone. Pour la visière, le haut de l'image est côté calotte.
- Textures (cm) : avant 14 × 8 (depuis 0,4 cm au-dessus de la base), côtés 10 × 7 (depuis
  0,6 cm), arrière 10 × 5,5 (au-dessus de l'ouverture, 5,4 cm), visière 16 × 6 (depuis
  0,6 cm du bord intérieur). Les zones imprimables de chaque procédé y sont placées par
  `production/profils.json` (repère `haut`).
- Couleur : portée par les matériaux `CAP_FABRIC`, `CAP_BUTTON`, `CAP_LINING`, `CAP_BINDING`,
  `CAP_SWEATBAND`, `CAP_VISOR`, `CAP_UNDERVISOR`, `CAP_STRAP` (`material.color`, qui multiplie
  l'atlas des coutures et surpiqûres). Jamais par les surfaces d'impression.
- Sheen : l'exportateur glTF écrit la teinte de sheen sans son poids ; le poids est donc
  porté par la teinte (0,08), sinon three.js voile de blanc les tissus foncés.
