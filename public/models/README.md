# Modèles 3D Elembo

Un dossier par produit : `public/models/<produit>/<produit>.glb`.
Le catalogue (`src/lib/products/catalog.ts`) référence le chemin racine ; le basePath
du déploiement est ajouté par `resolveModelUrl()`.

## Convention obligatoire (UV mapping et nommage)

Un modèle Elembo doit exposer **trois nœuds nommés exactement** :

| Nœud         | Rôle                                                        | UV                          |
| ------------ | ----------------------------------------------------------- | --------------------------- |
| `FrontPanel` | panneau avant, reçoit la texture du visuel                  | `TEXCOORD_0` sur (0,0)-(1,1) |
| `BackPanel`  | panneau arrière, reçoit la texture du visuel                | (0,0)-(1,1), u inversé en X |
| `Body`       | manches, tranches, tout le reste (couleur unie, sans motif) | quelconque                  |

Règles :

1. **UV dédiés à la zone d'impression.** Le visuel est composé en Canvas 2D dans
   l'espace UV du panneau, puis appliqué en texture sur `FrontPanel` / `BackPanel`.
   Les UV doivent donc couvrir le panneau de façon **plane** (projection orthogonale
   sur l'axe de la face), sinon le visuel apparaîtra déformé.
2. **`BackPanel` : u le long de −X.** Vue de dos, l'image doit se lire normalement :
   sans cette inversion, le visuel apparaît en miroir au dos.
3. **Zone d'impression déclarée dans le catalogue**, pas dans le modèle : `printAreas`
   de `src/lib/products/catalog.ts`, en fractions de la texture (0..1) + taille
   physique en cm. `validateProduct()` refuse une zone incohérente, et notamment une
   conversion pixels → cm non isotrope (un visuel carré doit s'imprimer carré).
4. **Matériau PBR conservé.** Le configurateur ne remplace jamais le matériau : il en
   clone une copie et ne modifie que `color` et `map`. `roughness`, `metalness`,
   `normalMap`, `aoMap` et les textures PBR peuvent donc être fournis tels quels.
5. **Échelle du modèle** : 1 unité ≈ 50 cm, torse ≈ 1,0 × 1,2 × 0,3 unité (cf. le
   placeholder). Un modèle à une autre échelle s'ajuste via `panel` dans le catalogue.

## Fichier actuel

`tshirt/tshirt.glb` est un **placeholder généré par nous** (torse + 2 manches, 36
triangles, 5,4 Ko), produit par :

```bash
node scripts/gen-tshirt-glb.mjs
```

Il sert à faire fonctionner et à tester tout le configurateur sans dépendre d'un
asset tiers. Il respecte la convention ci-dessus, donc le remplacer par un vrai
T-shirt (UV correctes, textures PBR) ne demandera **aucune** modification de code :
déposez le fichier au même chemin, gardez les trois noms de nœuds.

> Aucun modèle dont la licence est inconnue n'est téléchargé ou committé ici.
