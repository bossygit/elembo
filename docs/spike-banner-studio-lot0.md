# Banner Studio — note de spike du lot 0

**Date : 24 novembre 2026.** Suite de [`docs/audit-banner-studio.md`](audit-banner-studio.md), §9 « Lot 0 — Preuve
technique et cadrage ». Le prototype vit sur la branche `spike/banner-studio-lot0` et **ne doit pas être
fusionné** : il sert à lever les risques avant d'écrire l'interface (lots 1 à 7, branche `feature/banner-studio`).

## 1. Ce qui a été construit

| Élément | Emplacement (branche spike) | Rôle |
|---|---|---|
| Document de référence | `spike/banner-studio/document.mjs` | Modèle §4.3 en millimètres (centre, rotation autour du centre), textes, images recadrées, formes |
| Mise en page du texte partagée | `spike/banner-studio/mise-en-page.mjs` | Lignes explicites, interligne, interlettrage, alignement, ligne de base issue des métriques de la police — utilisée par l'éditeur **et** par le PDF |
| Rendu PDF serveur | `spike/banner-studio/rendu-pdf.mjs` | `pdf-lib` 1.17.1 + `@pdf-lib/fontkit` 1.1.1 : sous-ensembles TTF, découpe par tracé, `TrimBox`/`BleedBox`, panneaux ou `UserUnit`, refus explicites |
| Essais de production | `spike/banner-studio/essais.mjs` | Les cas du §7.9, avec mesures de durée, de mémoire et de poids |
| Éditeur Konva | `src/app/spike-banner/` (page `/spike-banner`) | Konva 10.9.1 : même document, texte dessiné par un `Konva.Shape` avec la mise en page partagée, déplacement, redimensionnement, rotation, export d'aperçu JPEG 1 600 px |
| Polices d'essai | `spike/banner-studio/polices/` | TTF statiques Anton, Bebas Neue, DM Serif Display (Google Fonts, OFL) — même dessin que les WOFF2 du site |

## 2. Résultats

### 2.1 PDF de production (§7.9)

| Essai | Résultat | Mesures |
|---|---|---|
| 3 × 1 m | ✅ 8 503,94 × 2 834,65 pt, 3 polices embarquées (`FontFile2`), 3 images (JPEG, PNG et son masque alpha) | 115 à 186 ms · ≤ 20 Mo · 283 Ko |
| 5 × 1 m | ✅ une page de 14 173,23 pt | 143 ms |
| 6 × 1 m, mode panneaux | ✅ 2 pages de 3 010 mm, recouvrement de 20 mm (2e page à 2 990 mm), plan de pose produit | 252 ms · 285 Ko |
| 6 × 1 m, mode `UserUnit` | ✅ une page, `UserUnit` 2, 6 000 × 1 000 mm, affichée à l'échelle par PDFKit (Aperçu) | 137 ms |
| Portrait 0,85 × 2 m | ✅ 850 × 2 000 mm | 117 ms |
| Fond perdu 10 mm | ✅ `TrimBox` 3 000 × 1 000, `BleedBox` 3 020 × 1 020 | 115 ms |
| Format excessif 61 × 2 m | ✅ refus `FORMAT_SUR_DEVIS`, aucun PDF partiel | — |
| Caractère absent de la police | ✅ refus `POLICE_GLYPHES` avec la liste (`ɛ ɔ ŋ` pour DM Serif Display) | — |
| Deux rendus du même document | ✅ octets identiques (dates fixées) : l'empreinte peut servir d'idempotence | — |

Le poids du PDF est dominé par la photo d'origine (1 600 × 2 844 px), embarquée sans réencodage. Les guides
(ourlets, œillets, plis) ne sont jamais dessinés.

### 2.2 Fidélité éditeur ↔ PDF

Le même document rendu par Konva (1 200 px de large, soit 400 px par mètre) et par le PDF (rasterisé par PDFKit à
la même largeur) se superposent : mêmes positions, mêmes coupures de lignes, même interlettrage, même rotation.
Écart moyen **6,25 / 255**, **3,7 %** de pixels au-delà du seuil, tous sur les bords des caractères (lissage
différent des deux moteurs). La mise en page partagée suffit : la table de métriques précalculée envisagée au §4.4
n'est pas nécessaire en v1.

### 2.3 Éditeur

Déplacement, redimensionnement et rotation sont répercutés exactement dans le document en millimètres (un glisser de
100 px donne +250 mm à 400 px par mètre). Aucune erreur console. À 390 px, la scène tient dans la largeur, sans
défilement horizontal. Trois pièges Konva relevés, à reprendre dès le lot 2 :

1. une `Konva.Shape` sans `fill` n'a pas de zone cliquable, même avec un `hitFunc` ;
2. un `sceneFunc` doit commencer par `beginPath()`, sinon `fillStrokeShape` remplit le tracé de découpe laissé par
   l'élément précédent (une image recadrée) ;
3. une forme dessinée à la main doit déclarer sa taille (`getSelfRect`), sinon le `Transformer` est nul.

## 3. Décisions figées par le spike

| Sujet | Décision | Justification |
|---|---|---|
| Moteur d'édition | **Konva** confirmé | Projection fidèle du document, rotation et transformation natives, texte maîtrisé par `Konva.Shape` |
| PDF | **pdf-lib + @pdf-lib/fontkit** confirmés | Dimensions exactes, boîtes, sous-ensembles, `UserUnit`, rendu déterministe, ~150 ms par bannière |
| Polices | **TTF statiques obligatoires** pour le PDF | Les WOFF2 du site sont découpés par plage (`latin` 283 glyphes / `latin-ext`) et leur mise en sous-ensemble **plante** fontkit (`RangeError`). Les WOFF2 restent pour l'affichage. |
| Grands formats | **Panneaux par défaut** au-delà de 5 080 mm, `UserUnit` en option par profil | Les deux fonctionnent ; le choix dépend du RIP de l'imprimeur |
| Couleur | **RVB** en v1, BAT recommandé | L'orange de marque diffère déjà entre le navigateur et Aperçu : la gestion de couleur doit être validée à l'impression |

## 4. Ce que le spike n'a pas couvert

- **Impression réelle** chez un imprimeur (3 × 1 m et 6 × 1 m en panneaux et en `UserUnit`) : critère de sortie du
  lot 0 et du lot 5, il faut un imprimeur pilote (décision 8 du §10).
- **Acrobat et Chrome (pdfium)** : le PDF n'a été rendu que par PDFKit (Aperçu). À ouvrir dans Acrobat et Chrome
  avant de clore le lot.
- **Gestes tactiles** et mémoire sur un vrai téléphone : seule la mise en page à 390 px a été vérifiée.
- **Texte à cheval sur une jonction de panneaux** : visible sur l'essai 6 m (le « H » et le « Tu » répétés dans le
  recouvrement). L'alerte prévue au §7.3 est à implémenter au lot 1 (`constraints`).

## 5. Écarts avec l'audit du 13 novembre

- Le dépôt compte désormais **837 tests** (et non 668) : la définition de « terminé » doit viser ce nouveau socle.
- **Elembo Partners** existe : `partenaire_capacites` porte déjà la laize maximale, les finitions et les machines
  validées de chaque imprimeur. La table `profils_impression` du §6.1 doit s'appuyer sur ces capacités validées
  (ou en être une vue), plutôt que dupliquer la laize et les finitions.
- Les banderoles sont confiées aux ateliers par **affectation** (Lot 2 Partners) : le visuel courant et son PDF
  devront être partagés avec l'atelier par ce canal (fichiers partagés d'une affectation), pas par un envoi à part.

## 6. À trancher avant le lot 1

Les huit décisions du §10 de l'audit restent ouvertes ; le spike en éclaire deux :

- **Décision 4 (polices)** : il faut des TTF statiques pour chaque famille utilisée par les modèles, et choisir des
  familles qui couvrent les caractères locaux si les modèles en ont besoin (Anton couvre `ɛ ɔ ŋ`, Bebas Neue et DM
  Serif Display non).
- **Décision 8 (imprimeur pilote)** : indispensable pour clore le lot 0 (impression des essais 3 × 1 m et 6 × 1 m).
