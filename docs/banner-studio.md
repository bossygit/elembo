# Banner Studio — moteur et éditeur

Référence du moteur livré au **lot 1** (modèle, géométrie, contraintes, `src/lib/banner`) de l'éditeur
livré au **lot 2** (§6) et de l'édition de contenu livrée au **lot 3** (§7), et des modèles et du passage à la commande livrés au **lot 4**
(§8). Cadre :
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

## 6. Éditeur (lot 2)

Adresse : `/banderoles/studio`. Page **non liée et non indexée** jusqu'au raccordement au devis
(lot 4) ; l'export GitHub Pages affiche un renvoi vers le formulaire.

### 6.1 Découpage

| Fichier | Rôle |
|---|---|
| `lib/banner/edition.ts` | Opérations pures sur le document (ajouter, déplacer, redimensionner, réordonner, changer de format…). Une opération sans effet rend **le même objet** : pas d'étape d'annulation vide |
| `lib/banner/historique.ts` | Annuler/rétablir : 60 étapes, fusion des modifications de même nature à moins de 600 ms |
| `lib/banner/vue.ts` | Zoom (25 % à 1 600 % de l'ajustement), déplacement de la vue, pas des règles |
| `lib/banner/peinture.ts` | Dessin 2D du document en mm : plan de travail **et** aperçu |
| `lib/banner/polices.ts`, `polices.generated.ts` | Catalogue du Studio, métriques `hhea`, caractères couverts (générés par `scripts/polices-banner.py`, §7.1) |
| `lib/banner/images.ts` | Analyse des fichiers : type, orientation, couleur, animation lus dans les octets ; 25 Mo, 200 px minimum, 50 Mpx (§7.2) |
| `lib/banner/formes.ts` | Dix décorations (chemins originaux) et placement d'une forme, contour compris |
| `lib/banner/recadrage.ts` | Recadrage en fractions de l'image source, rapports, poignées |
| `lib/banner/stockage.ts` | IndexedDB `elembo-banner`, séparée de celle du textile |
| `lib/banner/navigateur.ts` | Mesure crénée, chargement des polices, copie de travail des images (2 048 px) |
| `stores/banner-studio-store.ts` | Store zustand : source de vérité ; Konva n'en est qu'une projection |
| `components/banner-studio/*` | Coque, plan de travail Konva, panneaux, propriétés |

### 6.2 Règles de l'éditeur

- **Texte** : pas de retour à la ligne automatique ; le cadre suit le texte mesuré, le bord
  d'alignement reste fixe. Redimensionner un texte change son corps.
- **Verrouillé** : l'élément laisse passer les clics et refuse toute modification, sauf le
  déverrouillage (calques ou propriétés).
- **Débordement** : ce qui sort du format est voilé, et signalé par le préflight en direct.
- **Image** : le fichier reste sur l’appareil, intact sauf les cas du §7.2 ; le document ne contient qu'une référence.
- **Poignées** : zone de prise de 44 px au doigt, développée vers l'extérieur quand l'élément est
  petit, pour que son centre reste libre. Poignées de côté masquées sous 44 px (20 px à la souris).

### 6.3 Raccourcis

Flèches : 10 mm (Maj : 100 mm) · Suppr : retirer · Ctrl/Cmd Z, Maj Z ou Y : annuler, rétablir ·
Ctrl/Cmd D : dupliquer · `[` `]` : reculer, avancer · Ctrl/Cmd + − 0 : zoom · Échap : désélectionner ·
Ctrl/Cmd S : enregistrer. Inactifs pendant une saisie ou quand une fenêtre est ouverte.

### 6.4 Sauvegarde

Automatique, 800 ms après la dernière action, et sans attendre quand la page est masquée ou fermée.
« Enregistré sur cet appareil » n'est affiché qu'une fois la transaction validée. Sans IndexedDB,
l'édition continue en mémoire et l'éditeur le dit. Un projet illisible n'est jamais écrasé. Les
images qu'aucun projet ne cite sont supprimées à l'ouverture, après 24 h.

### 6.5 Limites connues

- Une seule sélection ; deux onglets sur le même projet : le dernier enregistrement gagne.
- Lot 5 : PDF (crénage à appliquer, voir la note de spike).
- Vérifié dans Chrome (bureau et émulation 390 px). **Ni Safari, ni Firefox, ni un vrai téléphone**
  n'ont été essayés.

### 6.6 Tests

`tests/bannerEdition.test.ts`, `tests/bannerStudioStore.test.ts` (39 tests) et l'essai de bout en bout :

```bash
STUDIO_URL=http://localhost:3000 node scripts/e2e/banner-studio.mjs
```

48 contrôles, sans écriture côté serveur ; ils lisent le document **enregistré** dans IndexedDB.

## 7. Contenu (lot 3)

### 7.1 Polices

`scripts/polices-banner.py` (fontTools) produit, depuis les fichiers officiels de google/fonts à un
commit figé, un **WOFF2 pour l'écran** (`public/fonts/studio/`) et un **TTF pour le PDF**
(`assets/banner/polices/`) tirés **des mêmes glyphes** : 20 familles, 39 variantes (les 17 du site,
plus Great Vibes, Cinzel et Cormorant Garamond). Le CSS du textile n'est pas modifié.

- **Aucune variante simulée** : gras et italique n'apparaissent que si la police les possède.
- **Licences** : une police au nom réservé n'est ni réduite ni instanciée (Righteous, Russo One, Alfa
  Slab One, Lobster, DM Serif Display ; Playfair Display vient des fichiers statiques de Google). Les
  licences sont à côté des TTF.
- **Caractères** : `COUVERTURE` liste ce que contient chaque police. Un caractère absent est une alerte
  critique, avec les polices qui le contiennent. `ɛ` et `ɔ` n'existent que dans **Montserrat, Anton et
  Great Vibes**.
- **Parité mesurée le 25/11/2026** entre Chrome et `@pdf-lib/fontkit` 1.1.1 : 390 mesures (39 fichiers TTF
  × 5 textes × 2 interlettrages), pire écart 0,001 pour un corps de 100. Condition : les variantes
  contextuelles (`calt`) sont retirées des fichiers (Caveat et Pacifico divergeaient jusqu'à 2,2 %) ; avec
  un interlettrage, le PDF devra désactiver `liga` et `clig`.

Texte : gras, italique, alignement, corps, interligne (0,5 à 3), interlettrage (−20 à 100 %), couleur
(sélecteur, code, pastilles). « Couper aux marges » matérialise des retours à la ligne. Le texte collé est
normalisé (accents composés, espaces typographiques, caractères invisibles).

### 7.2 Images

JPEG et PNG sont conservés **sans recompression**, sauf si le PDF ne pouvait pas les rendre comme l'écran :
orientation EXIF, CMJN, profil de couleur autre que sRVB (Display P3 d'un iPhone), en-tête incompris. Ils
sont alors réécrits en sRVB droit (JPEG 95 %, au plus 16,7 Mpx, limite des canvas iOS). WEBP : converti en
JPEG s'il est opaque, en PNG s'il est transparent — écart assumé avec l'audit, qui prévoyait PNG dans tous les
cas : une photo dépasserait souvent 25 Mo. Refusés : HEIC, GIF, SVG, images animées.

Recadrage non destructif (souris, doigt, clavier) : « Garder le cadre » change le contenu sans toucher au
cadre, les autres rapports donnent au cadre la forme du recadrage, à la même échelle. Remplacer garde le cadre.
Le même fichier importé deux fois n'est stocké qu'une fois (SHA-256). La définition réelle est affichée, avec la
largeur jusqu'à laquelle l'image reste nette ; le fond est contrôlé aussi.

> **Distance de lecture** : les seuils retenus sont les plus exigeants de la distance et du profil (règle de
> l'audit). Avec les profils publics (72/150 dpi), choisir 10 m ne les abaisse donc pas. À trancher avec
> l'imprimeur pilote.

### 7.3 Formes et fond

Rectangle (arrondi), ellipse, filet, et dix décorations : étoile, éclat, cœur, croix, anneaux, ruban, vague,
coin, triangle, flèche. Le contour est dessiné **à l'intérieur** du cadre : la taille affichée est la taille
imprimée (le PDF devra faire de même, `placementForme`). Les décorations gardent toujours leurs proportions.
Fond : couleur, et image en couverture ou entière.

### 7.4 Tests

`tests/bannerContenu.test.ts` (43 tests, dont 2 000 gestes de recadrage tirés à graine fixe) et l'essai de bout en
bout, 53 contrôles sur les fichiers et le document enregistrés :

```bash
STUDIO_URL=http://localhost:3000 node scripts/e2e/banner-contenu.mjs
```

## 8. Modèles, projets et passage à la commande (lot 4)

### 8.1 Modèles

Dix modèles JSON (`src/lib/banner/templates/`), au moins un par catégorie. Un modèle est un document ordinaire
dont les textes citent des variables `{{nom}}` ; le cadre de chaque texte est la **place disponible**. Un texte plus
long est réduit pour y tenir, jamais tronqué. Noms, lieux et organisations fictifs, aucune photo de tiers : les
portraits sont des emplacements d'exemple (`placeholder`), dessinés en silhouette et bloquants à la finalisation.
Une variable `personnel` (nom, date, lieu, contact) laissée à son exemple donne un avertissement `TEXTE_EXEMPLE`.

> **À faire relire par Smart Vision** (décision 7) avant la mise en ligne : textes, versets, choix graphiques.

Appliquer un modèle sur un projet non vide propose un **nouveau projet** (par défaut) ou le remplacement, annulable
en une fois.

### 8.2 Projets

Plusieurs projets par appareil : liste, ouverture, copie, suppression confirmée. L'export est le JSON du document,
**sans les images** ; l'import crée toujours un nouveau projet et propose de rattacher les images manquantes, par
empreinte SHA-256 ou par nom et dimensions. Adresses : `?projet=`, `?modele=`, `?categorie=`.

### 8.3 Passage à la commande

« Finaliser ma demande » refuse les alertes critiques, demande un accord pour les avertissements, produit l'aperçu
(JPEG 1 600 px) et ouvre `/banderoles/commander?studio=<projet>`. Le formulaire existant est réutilisé : support,
format et finition y sont verrouillés, la prestation est `FICHIER_PRET` par défaut, sans frais de création.

| Fichier déposé | Contenu |
|---|---|
| `projet-banner.json` | le document, 1 Mo au plus |
| `apercu-banner.jpg` | l'aperçu |
| `studio-<assetId>.jpg\|png` | chaque image, octet pour octet |

Limites : 10 fichiers (8 images), 25 Mo par fichier, 80 Mo au total. Elles ne s'appliquent qu'aux demandes du
Studio (`studio: true`) ; le formulaire ordinaire garde 5 fichiers et 50 Mo, et refuse le JSON. Le serveur vérifie
le JSON déposé : nom, taille, UTF-8 strict, schéma complet, version, aucune image d'exemple. Un visuel modifié après
sa préparation n'est pas envoyé.

Corrigé au passage dans le parcours de commande (toutes les banderoles) : après une erreur du serveur, la page
restait bloquée ; une coupure réseau annonçait à tort « demande enregistrée » ; le dépôt d'un fichier est réessayé
trois fois ; un second essai après une réponse perdue ne laisse plus croire que les fichiers sont partis.

### 8.4 Migration

`20261125120000_banner_studio_fichiers.sql` : le bucket privé `devis` accepte `application/json`. Additive,
idempotente, retour arrière fourni. **Appliquée en local seulement** : à appliquer en staging puis en production
avant d'ouvrir le Studio, sinon le dépôt du projet est refusé par le stockage.

### 8.5 Limites connues

- Le serveur ne compare pas encore le document aux dimensions du devis : lot 5, avec le rendu du PDF.
- Si l'envoi des fichiers échoue après l'enregistrement, ils ne peuvent pas être renvoyés depuis le site : reprise
  au lot 7.
- Les sources du client restent `NON_ANALYSE`, donc non téléchargeables au back-office (règle existante) ; le PDF
  du lot 5 le sera.
- La page n'est toujours liée nulle part.

### 8.6 Tests

`tests/bannerModeles.test.ts` (34 tests), `supabase/tests/banner_studio.sql`, et un essai de bout en bout de 53
contrôles qui crée un vrai devis **en local** (Supabase et Redis locaux, refus de toute autre adresse) :

```bash
STUDIO_SUPABASE_URL=http://127.0.0.1:54321 STUDIO_SERVICE_ROLE_KEY=… node scripts/e2e/banner-commande.mjs
```

Le serveur a besoin de `REDIS_URL`, `DEVIS_SESSION_SECRET` et `APP_ORIGINS=http://localhost:3000`.
