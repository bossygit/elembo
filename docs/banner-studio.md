# Banner Studio — moteur et éditeur

Référence du moteur livré au **lot 1** (modèle, géométrie, contraintes, `src/lib/banner`) de l'éditeur
livré au **lot 2** (§6) et de l'édition de contenu livrée au **lot 3** (§7), des modèles et du passage à la commande livrés au **lot 4**
(§8), du PDF de production livré au **lot 5** (§9), des profils d'imprimeurs et du
back-office livrés au **lot 6** (§10), et du suivi, de la reprise et de la recette livrés au **lot 7** (§11).
Mise en ligne : [`banner-studio-mise-en-production.md`](banner-studio-mise-en-production.md). Cadre :
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

Limites : 10 fichiers (8 images), 25 Mo par fichier, 45 Mo au total (pour que le
PDF tienne dans 50 Mo ; l'audit proposait 80). Elles ne s'appliquent qu'aux demandes du
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

- Si l'envoi des fichiers échoue après l'enregistrement, ils ne peuvent pas être renvoyés depuis le site : reprise
  au lot 7.
- Les sources du client restent `NON_ANALYSE`, donc non téléchargeables au back-office (règle existante) ; le PDF
  du serveur l'est (§9).
- La page n'est toujours liée nulle part.

### 8.6 Tests

`tests/bannerModeles.test.ts` (34 tests), `supabase/tests/banner_studio.sql`, et un essai de bout en bout (62
contrôles depuis le lot 5) qui crée un vrai devis **en local** (Supabase et Redis locaux, refus de toute autre adresse) :

```bash
STUDIO_SUPABASE_URL=http://127.0.0.1:54321 STUDIO_SERVICE_ROLE_KEY=… node scripts/e2e/banner-commande.mjs
```

Le serveur a besoin de `REDIS_URL`, `DEVIS_SESSION_SECRET` et `APP_ORIGINS=http://localhost:3000`.

## 9. PDF de production (lot 5)

### 9.1 Parcours

Après l'envoi des fichiers, le formulaire appelle `POST /api/banderoles/[reference]/visuel` (session du devis, CSRF,
10 appels par heure). Le navigateur ne désigne aucun fichier. Le serveur (`src/server/banner/finaliser.ts`) :

1. relit le projet déposé et son empreinte, et le revalide ;
2. **re-résout les contraintes** depuis le profil public : celles du navigateur sont ignorées ;
3. réserve une version sous verrou du devis (`reserver_visuel_banderole`) : le même projet n'est rendu qu'une fois ;
4. compare format, support et finition à la demande chiffrée ; contrôle chaque image (devis, empreinte, type,
   dimensions, orientation, couleurs) ; refait tout le préflight ;
5. rend le PDF, le **relit et le vérifie** (§9.3) ;
6. dépose `visuel-banner-vN.pdf`, `projet-banner-vN.json` (canonique) et `fiche-production-vN.txt`, copie l'aperçu, et
   enregistre le tout en une transaction (`terminer_visuel_banderole`).

Une alerte critique ou un refus de rendu donne un visuel `A_REVOIR`, sans PDF, que l'équipe voit. Un incident donne
`ECHEC`, sans fichier orphelin. Dans les deux cas la demande du client est conservée. Rien n'est rendu si le devis
n'est plus `NOUVEAU` ou `EN_ANALYSE`.

### 9.2 Rendu

`rendu.ts` (pdf-lib 1.17.1, fontkit 1.1.1) partage avec l'éditeur `lignesTexte`, `placementImage`, `placementForme` et
`decoupePages`. Texte vectoriel posé **glyphe par glyphe** avec les avances crénées ; JPEG repris octet pour octet ; PNG
opaque repris sans décodage ; formes et décorations vectorielles ; aucun repère. RVB, sans profil ICC. Panneaux de
5 m avec 20 mm de recouvrement, sur le grand côté ; `UserUnit` si le profil le demande. Octets identiques d'un rendu à
l'autre. La fiche de production décrit le plan de pose, les contraintes, les images et les points signalés, sans prix
ni coordonnées.

**Fidélité mesurée le 25/11/2026** (éditeur dans Chrome contre PDF rendu par PDFKit, 1 600 px, tolérance d'un pixel) :
entre 0,002 % et 0,17 % de pixels différents sur les dix modèles, 0,003 % sur un document de charge (rotations,
opacités, recadrages, ligatures, accents combinants, interlettrage). Les écarts restants viennent de la gestion de
couleur de PDFKit. Le PDF s'ouvre correctement dans Chrome (pdfium).

### 9.3 Contrôles du PDF

Pages, `MediaBox`, `BleedBox`, `TrimBox` à 0,2 pt ; polices embarquées ; images ; aucun contenu actif ni annotation. Et
**le tracé de chaque lettre embarquée est comparé à celui de la police d'origine** : la comparaison visuelle avait
révélé des lettres absentes (Cormorant Garamond), que ni les dimensions ni la présence des polices ne trahissaient. La
cause (glyphes non alignés, mal découpés par fontkit) est corrigée dans `scripts/polices-banner.py`.

### 9.4 Base

`20261125130000_banner_studio_visuels.sql` : table `visuels_banderole` (versions, document canonique, préflight,
empreintes), pointeur `demandes_grand_format.visuel_courant_id`, trois fonctions `service_role`, RLS (lecture du
personnel), `text/plain` et 50 Mo pour le bucket `devis` (un fichier envoyé par un client reste refusé au-delà de
25 Mo). Retour arrière fourni. Appliquée en staging et en production le 26/11/2026, avec celle du lot 4, après
sauvegarde du schéma et des données.

### 9.5 Limites et reste à faire

- **Critère de sortie non atteint : test d'impression réel** (3 × 1 m et 6 × 1 m en panneaux). Il faut l'imprimeur
  pilote. Acrobat n'a pas été essayé non plus.
- Charge mesurée en local : 8 JPEG de 27 Mpx, 64 ms et +44 Mo ; un PNG transparent de 30 Mpx, 4,9 s et +500 Mo. Les PNG
  transparents sont limités à 40 Mpx au total. Non mesuré sur Vercel.
- Un PDF de plus de 50 Mo est mis `A_REVOIR`.
- Affichage du visuel dans le suivi du client : livré au lot 7 (§11.2).

### 9.6 Tests

`tests/bannerRendu.test.ts` (39 tests, rendu réel), `supabase/tests/banner_studio.sql` et les contrôles serveur de
`scripts/e2e/banner-commande.mjs`.

## 10. Profils d'imprimeurs et back-office (lot 6)

### 10.1 Profils d'impression

Table `profils_impression` (migration `20261126120000_banner_studio_profils.sql`) : marges, ourlets, œillets, bandes
réservées, laize, longueur, définition, pagination, par support. Un profil **public** par support (les valeurs prudentes de
`PROFILS_PUBLICS`, livrées « à valider ») et, au besoin, un profil par imprimeur et par support.

- **Profil retenu** (`choisirProfil`) : celui de l'imprimeur affecté à la demande, sinon le profil public, sinon les valeurs
  intégrées. Le Studio lit les profils publics (`GET /api/banderoles/profils`, sans rien de confidentiel) ; le PDF applique
  le profil retenu et l'enregistre (`visuels_banderole.profil_id`, `profil_version`).
- **Validation nominative** : une case « l'imprimeur a confirmé ces valeurs », enregistrée au nom de la personne. Toute
  valeur qui change l'impression retire la validation et crée une version (contrôle en base). Tant qu'un profil n'est pas
  validé, le client et la fiche de production lisent « à confirmer ».
- **Elembo Partners** : un profil d'imprimeur est prérempli depuis le profil public et, pour la laize et la longueur,
  depuis la capacité grand format **validée** du partenaire. Le profil fait foi pour le rendu ; un écart avec la capacité
  est signalé sur la page.
- **Droits** : `grand_format.profils` (admin, atelier) ; l'atelier a l'entrée « Profils d'impression » au menu sans voir
  les demandes. `grand_format.visuel` (admin, commercial, atelier) pour la carte du visuel.

### 10.2 Carte du visuel

Dans la fiche d'une banderole : aperçu, état, profil appliqué, points signalés, PDF, fiche et projet, versions. Si le profil
applicable a changé depuis le rendu, la carte le dit. « Régénérer » refait le rendu du même document avec le profil
actuel (`regenererVisuel`) : nouvelle version, les précédentes restent. Possible jusqu'à l'acceptation du devis.

### 10.3 Changement d'imprimeur

Quand un imprimeur accepte une banderole (Elembo Partners), le visuel est régénéré **après la réponse**, avec son profil
(`regenererApresAffectation`). S'il ne passe plus (laize trop étroite, par exemple), il est mis « à revoir » et l'équipe
est alertée par e-mail et Telegram (une fois par version). Une erreur n'annule jamais la décision de l'imprimeur.

### 10.4 Archivage à la commande

À la conversion du devis, le PDF, le projet et la fiche du visuel courant sont recopiés dans le stockage de production
(`commandes/<commande>/…`) et conservés **24 mois** (`archiver_visuel_commande`) ; un visuel régénéré après la commande
la suit. Les sources du client gardent la règle des 90 jours. Un échec de copie ne bloque pas la commande : la carte
propose « Recopier dans la commande ».

### 10.5 Limites

- Profils publics toujours « à valider » : à faire avec l'imprimeur pilote.
- La régénération automatique ne couvre que l'acceptation d'une affectation : c'est aujourd'hui le seul chemin qui fixe
  l'imprimeur d'une banderole.
- Pas de profil `UserUnit` testé en impression réelle.

### 10.6 Tests

`tests/bannerProfils.test.ts` (17 tests), `supabase/tests/banner_studio.sql` (profils, validation, unicité, archivage,
droits) et un essai de bout en bout du back-office, 27 contrôles, en local :

```bash
STUDIO_SUPABASE_URL=http://127.0.0.1:54321 STUDIO_SERVICE_ROLE_KEY=… node scripts/e2e/banner-admin.mjs
```

## 11. Suivi, reprise et recette (lot 7)

### 11.1 Prix et quantité dans le Studio

« Finaliser ma demande » montre la finition, le nombre d'images, une **quantité** et le **prix indicatif** calculé par le
serveur (`POST /api/banderoles/estimation`, la même grille que le formulaire). Hors grille, le Studio affiche « Sur devis ».
La quantité est reprise dans le formulaire de commande (`?quantite=`). Le prix reste indicatif : le montant fait foi
dans le devis.

### 11.2 Visuel dans le suivi du client

`GET /api/devis/[reference]` renvoie un bloc `visuel` en mots simples (`visuelClient`) : version, état (`PRET`,
`VERIFICATION`, `PREPARATION`), lien signé de l'aperçu, identifiant du PDF téléchargeable, identifiant du projet et
`modifiable`. Rien d'interne ne sort : ni alertes du préflight, ni profil, ni nom d'imprimeur, ni laize. Le client voit
l'aperçu, télécharge son PDF quand il est prêt et, si le projet est encore sur l'appareil, « Modifier mon visuel ».

### 11.3 Reprise d'une demande

Tant que le devis est `NOUVEAU` ou `EN_ANALYSE`, le client peut corriger son visuel sans refaire de demande :

1. Le Studio reconnaît le projet déjà envoyé (`lireEnvoi`) et propose « Mettre à jour la demande DEV-… » ou
   « Nouvelle demande ».
2. `POST /api/banderoles/[reference]/reprise` (session du devis, CSRF, 10 par heure) vérifie que le **format, le support
   et la finition** sont ceux de la demande (sinon 409 : un autre format change le prix, il faut une nouvelle demande),
   valide les fichiers et attribue la révision suivante : `projet-banner-r2.json`, `apercu-banner-r2.jpg`, …,
   jusqu'à `r19`. Les images déjà reçues et vérifiées ne sont pas renvoyées.
3. Le rendu (`finaliserVisuel`) prend le **dernier** projet vérifié : nouvelle version du visuel, les précédentes restent
   dans le back-office.

Les anciennes révisions suivent la règle des 90 jours des fichiers du client.

### 11.4 Ouverture au public

`NEXT_PUBLIC_BANNER_STUDIO=1` (lue au build) ouvre le Studio : bouton « Créer mon visuel en ligne » sur `/banderoles`,
lien depuis l'étape Fichiers du formulaire, page indexable. Sans elle, le Studio marche par lien direct mais n'est proposé
nulle part et porte `noindex`. Jamais ouvert sur l'export GitHub Pages.

### 11.5 Accessibilité

`scripts/e2e/banner-accessibilite.mjs` passe axe-core (WCAG 2.1 A et AA) sur le Studio en bureau et en mobile, chaque
panneau et chaque fenêtre (Projets, Aperçu, Finaliser), et échoue sur toute violation sérieuse ou critique. Résultat au
26 novembre 2026 : **aucune violation**. Le contraste au-dessus du canevas reste « à vérifier » pour axe (il ne lit pas le
dessin). La navigation au clavier et les raccourcis sont couverts par `banner-studio.mjs` (lot 2).

Non testé : lecteur d'écran réel (VoiceOver, TalkBack, NVDA). Le canevas n'est de toute façon pas lisible par un lecteur
d'écran ; les calques et le panneau de propriétés le sont.

### 11.6 Performances

`scripts/e2e/banner-performance.mjs`, réseau « 4G lente » et processeur ralenti ×4 :

| Mesure | Budget | Mesuré (26/11/2026) |
|---|---|---|
| JavaScript du Studio (compressé) | 350 Ko | 266 Ko |
| Studio prêt à l'emploi | 6 s | 3,4 s |
| Mémoire JavaScript après chargement | 60 Mo | 6 Mo |
| JavaScript de `/banderoles` et du formulaire | 220 Ko | 147 Ko et 166 Ko |

Konva n'est chargé que dans le Studio ; pdf-lib n'est jamais chargé dans le navigateur.

### 11.7 Tests d'abus

`tests/bannerRoutes.test.ts` (8 tests) : origine étrangère, corps non JSON ou démesuré, CSRF absent, devis d'un autre,
dépassement de débit, devis déjà chiffré, format changé, noms de fichiers piégés (`../`, `.html`, nom hors Studio),
fichiers trop gros ou trop nombreux, plus de 19 révisions, détail d'incident jamais renvoyé, profils indisponibles sans
cache, suivi sans fuite d'informations internes.

### 11.8 Parcours complet

`scripts/e2e/banner-parcours.mjs` enchaîne, sur la même demande, le parcours client (modèle → texte → photo → zones →
prix → finaliser → commande → PDF → suivi → modification → révision 2) et le back-office (carte du visuel, profil
d'imprimeur, régénération après changement de profil, alerte, validation nominative, archivage à la commande, droits de
l'atelier). La régénération déclenchée par l'acceptation d'un imprimeur est couverte par `tests/bannerProfils.test.ts`. Local uniquement ; refuse toute URL distante.

```bash
STUDIO_URL=http://localhost:3100 STUDIO_SUPABASE_URL=http://127.0.0.1:54321 STUDIO_SERVICE_ROLE_KEY=… \
  node scripts/e2e/banner-parcours.mjs
```

Résultat au 26 novembre 2026, sur un build de production : **95 contrôles sur 95**.

### 11.9 Limites

- Pas d'imprimeur pilote : profils publics « à valider », aucun tirage réel, seuils de netteté non confirmés.
- Testé dans Chrome (bureau et mobile émulé) seulement : ni Safari, ni Firefox, ni téléphone réel.
- « Modifier mon visuel » demande le même appareil : le projet vit dans le navigateur du client.
- Les modèles n'ont pas été relus par Smart Vision.
