# Banner Studio — moteur (`src/lib/banner`)

Référence du moteur livré au **lot 1** (modèle, géométrie, contraintes). Cadre :
[`audit-banner-studio.md`](audit-banner-studio.md) ; preuve technique et décisions :
[`spike-banner-studio-lot0.md`](spike-banner-studio-lot0.md).

Le moteur est **pur** : ni React, ni Supabase, ni prix. L'éditeur Konva (lot 2), l'aperçu et le
rendu PDF serveur (lot 5) le consomment ; le serveur recalcule le même préflight que le client.

## 1. Conventions du document

- Tout est en **millimètres**, origine en haut à gauche de la surface finie, y vers le bas.
- `xMm`/`yMm` = **centre** de l'élément ; `largeurMm`/`hauteurMm` = cadre non pivoté ; la rotation
  (degrés, sens horaire à l'écran) s'applique autour du centre.
- L'ordre de `elements` est l'ordre d'empilement (le premier est au fond).
- Les textes ont des lignes **explicites** (`\n`) : pas de retour à la ligne automatique.
- Les images sont **référencées** (`assetId`), jamais embarquées ; le recadrage est en fractions
  de l'image source (`x + l ≤ 1`, `y + h ≤ 1`).
- `contraintes` est un **snapshot** de ce que le client a vu ; le serveur re-résout le profil.

Document de référence : [`tests/fixtures/banner/document-reference.json`](../tests/fixtures/banner/document-reference.json)
(banderole 3 × 1 m, ourlets + œillets, profil public).

## 2. Modules

| Module | Rôle |
|---|---|
| `model.ts` | Types (version 1), fabriques (`creerDocument`, `creerTexte`, `creerImage`, `creerForme`, identifiants et date injectables), `migrer` (chaîne de migrations, version future refusée) |
| `schema.ts` | `validerDocument` : validation stricte (clés inconnues refusées, bornes, couleurs `#RRGGBB`, références d'images, identifiants uniques, caractères de contrôle) avec chemins d'erreur ; `lireDocument` : JSON → migration → validation, **sans exception** |
| `geometry.ts` | Coins et boîte englobante d'une boîte orientée, hit-test (`contientPoint`, `elementSous`), intersections exactes (axes séparateurs, disque), `estDans`, `clamp`, `aligner`, `retrait`, `traverseLigne` |
| `layout.ts` | Mise en page partagée éditeur/PDF : `lignesTexte` (alignement, interlettrage, ligne de base issue des métriques), `encombrementTexte`, `placementImage` (`cover`/`contain`, recadrage par découpe) — la mesure des lignes est injectée et doit être **crénée** (navigateur : par défaut ; serveur : `font.layout()`, pas `widthOfTextAtSize`) |
| `quality.ts` | DPI effectif sur la zone recadrée **visible** (axe le plus faible), seuils par distance de lecture (1 m : 150/300, 3 m : 72/150, 10 m : 30/72) combinés au profil |
| `constraints.ts` | Profils d'impression (publics, prudents, `A_VALIDER`), contraintes selon la finition, zones (sûre, ourlets, fourreaux, œillets, fond perdu, plis), panneaux, contrôle du format, **préflight** `evaluer` et `bloquant` |
| `formats.ts` | Formats prédéfinis par support (formats standards repris du catalogue), finitions applicables, bornes commerciales, orientation |
| `categories.ts` | Les 7 catégories de modèles et leur usage commercial (mariage, anniversaire, conférence → `EVENEMENT`) |

## 3. Préflight

`evaluer(document, contexte)` renvoie des alertes triées par sévérité. Seules les **critiques**
bloquent la génération du PDF (`bloquant`). Le contexte permet au client et au serveur d'ajouter
ce qu'eux seuls savent : statut du profil, images réellement disponibles, polices présentes,
caractères absents de la police (fontkit, côté serveur).

| Code | Sévérité | Déclencheur |
|---|---|---|
| `HORS_FORMAT` | critique | un élément sort de la surface finie (une image peut aller dans le fond perdu, pas un texte) |
| `FORMAT_SUR_DEVIS` | critique | plus de 12 pages, 100 m² ou 20 m, ou hors des bornes 0,2–50 m |
| `HORS_LAIZE` | critique | les **deux** côtés dépassent la laize (elle contraint le petit côté) |
| `HORS_LONGUEUR` | critique | le grand côté dépasse la longueur maximale de l'imprimeur |
| `IMAGE_MANQUANTE`, `PLACEHOLDER` | critique | image introuvable, ou image d'exemple non remplacée |
| `POLICE_INDISPONIBLE`, `POLICE_GLYPHES` | critique | police absente, caractères manquants (contrôle serveur) |
| `ZONE_SECURITE` | avertissement (texte) / info (image, forme) | débord de la zone sûre |
| `OURLET` | avertissement | texte sur une bande d'ourlet |
| `OEILLET` | avertissement | texte ou image sous un œillet (disque de diamètre/2 + marge) |
| `FOURREAU` | avertissement | texte ou image dans une bande réservée (fourreau, baguette, pied de roll-up) |
| `PLIURE_PANNEAU` | avertissement | texte à cheval sur une jonction de panneaux |
| `IMAGE_DPI_INSUFFISANT` | avertissement | DPI sous le minimum |
| `IMAGE_DPI_FAIBLE` | info | DPI sous le recommandé |
| `PROFIL_A_VALIDER` | info | contraintes non validées par l'imprimeur |
| `FOND_PERDU_NON_COUVERT` | info | fond image en `contain` avec un fond perdu |

Sur le document de référence, le préflight produit exactement : portrait à 52 dpi (insuffisant),
mention dans la zone de sécurité, sur l'ourlet et sous un œillet, profil à valider, logo pivoté
hors zone sûre (info), logo à 95 dpi (faible). Aucune alerte critique.

## 4. Profils et décisions

- Profils **publics** par support (seed du §6.1 de l'audit) : sécurité 50 mm, ourlet 50 mm,
  œillets 20/500/30 mm, DPI 72/150, laize inconnue. Supports rigides : pas d'ourlet ni d'œillet ;
  bande de pied de 100 mm pour le roll-up, baguettes de 30 mm pour le kakémono. **Aucun n'est
  « validé »** : on n'invente pas une capacité d'imprimeur.
- Au lot 6, le profil d'un imprimeur s'appuiera sur ses **capacités validées Elembo Partners**
  (laize, finitions, machines) plutôt que de les dupliquer (note de spike, §5).
- Grand format : panneaux de ≤ 5 000 mm avec 20 mm de recouvrement au-delà de 5 080 mm, ou page
  unique `UserUnit` si le profil l'indique.

## 5. Tests

`tests/bannerGeometry.test.ts`, `bannerModele.test.ts`, `bannerLayoutQualite.test.ts`,
`bannerContraintes.test.ts`, `bannerCatalogue.test.ts` — 96 tests, dont des tests de propriétés
sur 200 boîtes tirées par un générateur à graine fixe (rotation et aire, hit-test, clamp,
symétrie des intersections).
