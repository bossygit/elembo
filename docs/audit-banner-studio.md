# Elembo Banner Studio — audit, architecture et plan de livraison

**Statut : audit d'avant intervention. Aucun code n'a été écrit.**
Date : 13 novembre 2026 · Branche : `feature/banderoles-grand-format` · Commit : `1d75d36`
Périmètre : configurateur 2D de banderoles, indépendant du configurateur 3D textile, adossé
au parcours commercial Banderoles existant.

---

## 0. Méthode et état de référence

L'audit s'appuie sur la lecture du code livré, des migrations Supabase, des tests et de la
documentation existante — pas sur les intentions supposées. Les vérifications de base ont été
exécutées sur l'arbre courant :

| Vérification | Résultat |
|---|---|
| `npx tsc --noEmit --incremental false` | aucune erreur |
| `npx vitest run` | **668 tests passés**, 32 ignorés, 54 fichiers passés, 5 fichiers ignorés |
| Dépendances graphiques | Three.js, GSAP, Zustand ; **ni Fabric.js, ni Konva.js, ni pdf-lib** |
| `sharp` | présent dans `node_modules` comme dépendance transitive de Next — **non déclaré**, à ne pas utiliser comme socle |
| Polices | 17 familles locales, 45 fichiers **WOFF2**, **aucun TTF/OTF**, **aucune italique réelle** |
| Base | migrations `0001` → `0011` ; la dernière est la migration grand format du 13/11/2026 |

Le dépôt est propre au moment de l'audit. Aucune migration n'est appliquée à distance par cette
mission.

---

## 1. Synthèse et décisions structurantes

### 1.1 Verdict

Le projet est **faisable sans reconstruire le commerce existant**. La difficulté principale
n'est pas l'éditeur : c'est la **chaîne de production** (PDF vectoriel à l'échelle physique,
polices réellement embarquées, contraintes d'impression variables selon l'imprimeur, stockage
privé et conservation). C'est là que doit porter l'effort d'ingénierie et de recette.

Le parcours commercial est déjà solide et réutilisable : une demande de banderole **est** un
devis Elembo (`famille = IMPRESSION`), les fichiers passent par le bucket privé `devis`, le
suivi client par session/OTP, la commande par `creer_commande_depuis_devis`, le paiement par le
circuit MTN existant, et l'atelier par `travaux_production`. Le Banner Studio doit s'y
**brancher**, pas créer un second circuit.

Correspondance avec les huit points demandés :

| Demande | Section |
|---|---|
| 1. Audit de l'architecture existante | §2 |
| 2. Choix argumenté Fabric.js / Konva.js | §3 |
| 3. Architecture technique proposée | §4 |
| 4. Composants à créer | §5 |
| 5. Modifications de base de données | §6 |
| 6. Stratégie de génération des fichiers | §7 |
| 7. Risques techniques | §8 |
| 8. Découpage en lots testables | §9 |

### 1.2 Décisions proposées

1. **Moteur d'édition : Konva.js** (cœur impératif, sans obligation de `react-konva`), avec un
   modèle de document JSON qui reste la seule source de vérité.
2. **Fichier de production : PDF vectoriel généré côté serveur** avec `pdf-lib` +
   `@pdf-lib/fontkit`. Jamais une capture d'écran, jamais le PNG 4 096 px du configurateur
   textile.
3. **Document en millimètres, versionné**, avec un rendu partagé entre l'éditeur, l'aperçu et le
   PDF ; les images sont référencées (pas embarquées en base64), conservées dans IndexedDB côté
   client et dans le bucket privé `devis` côté serveur.
4. **Passation vers le parcours existant** : le Studio produit un paquet (JSON + images +
   aperçu) et ouvre `/banderoles/commander?studio=…`. Aucun second panier, aucun second
   paiement, aucun nouveau statut commercial.
5. **Contraintes par imprimeur** : table `profils_impression` versionnée et validée, avec un
   profil public conservateur par support. Aucune marge n'est codée en dur.
6. **Base additive** : `profils_impression`, `visuels_banderole`, pointeur de visuel courant sur
   `demandes_grand_format`, JSON autorisé dans le bucket `devis`, permissions dédiées. Aucun
   changement de statut de devis, de commande ou de paiement.

### 1.3 Découpage recommandé

Un MVP en **8 lots testables**, environ **46 à 60 jours-développeur** (9 à 12 semaines pour une
personne, 5 à 6 semaines à deux). Le détail est au §9. Le premier lot est une **preuve technique
PDF/Konva** de 2 à 3 jours, avant toute construction d'interface : elle doit lever les risques
de page géante, de polices et de fidélité avant d'investir dans l'éditeur.

---

## 2. Audit de l'architecture existante

### 2.1 Carte des modules concernés

```
src/app/(site)/banderoles/…            vitrine + parcours de commande en 6 étapes
src/components/grand-format/           CommandeBanderole, ApercuBanderole
src/lib/grand-format/                  catalogue, estimation, validation, suivi, modèles
src/server/grand-format/               repository (création, chiffrage, travaux), conversion
src/app/api/banderoles/                création de devis + estimation serveur
supabase/migrations/…grand_format.sql  demandes_grand_format, tarifs, RPC atomique
src/app/admin/(protected)/banderoles/  back-office commercial, chiffrage, imprimeur, marge
src/lib/devis/ + src/server/devis/     validation partagée, sessions, OTP, uploads signés
src/server/storage/                    buckets privés, vérification binaire, URL signées
src/app/api/devis/…                    vérification et téléchargement des fichiers
supabase/migrations/…storage.sql       buckets `devis` et `production`
supabase/migrations/…commandes_cycle   devis → commande, copie des fichiers, transitions
src/server/dossiers/                   archive de commande (Vercel Blob), quotas
src/components/configurator/           studio textile 3D (à ne pas modifier)
src/stores/configurator-store.ts       état + historique du textile
src/lib/canvas/                        composition 2D et export PNG du textile
src/lib/fonts.ts                       catalogue de polices du textile
```

### 2.2 Configurateur T-shirt : ce qui existe réellement

Le configurateur textile est un studio 3D à cinq zones. Il ne faut pas le confondre avec un
éditeur 2D de surface libre :

- **État unique Zustand** (`src/stores/configurator-store.ts`) : produit, couleur, zone
  courante, procédé, éléments, sélection, historique (60 instantanés, fusion des gestes
  continus sur 600 ms). Toute mutation passe par `clampFor()`.
- **Moteur de composition Canvas 2D** (`src/lib/canvas/design-canvas.ts`) : mathématiques de
  placement, bornage, débordement, hit-test, rendu, mesure du texte. L'espace est normalisé
  par rapport à une `PrintArea` de produit (zone dans une texture), pas par rapport à une
  surface physique libre.
- **Export PNG** (`src/lib/canvas/export.ts`) : recomposition à la densité du procédé, avec un
  **garde-fou de 4 096 px** de côté (`productionTextureSize`). C'est adapté à une zone de
  21 × 30 cm en DTF, pas à une banderole de 3 × 1 m.
- **Persistance locale** : `localStorage` pour les projets, IndexedDB (`elembo` / `assets`) pour
  les fichiers, avec repli mémoire et tolérance aux données corrompues.
- **Polices** : 17 familles, chargées à la demande depuis `public/fonts` (WOFF2), licences
  vérifiées.
- **Tests** : store, géométrie, texte, export, physique d'impression, stockage local.

**Ce qui est réutilisable comme conception, pas comme code** : la séparation état / moteur /
rendu, l'historique par instantanés, la fusion des gestes, la validation d'upload, la tolérance
de la persistance, la logique de débordement. Le modèle de données, lui, est spécifique au
textile (produit, zones, procédé, coordonnées normalisées) et ne doit pas être importé dans le
Banner Studio.

**Ce qu'il ne faut pas faire** : réutiliser `src/lib/canvas/design-canvas.ts` en le généralisant
de force. Il faudrait y introduire des notions de surface libre, de zoom/pan, de formes, de
crop et de millimètres qui n'ont rien à voir avec une texture de vêtement. Le risque est de
casser le textile et de produire un moteur hybride illisible. Le Banner Studio doit avoir son
propre modèle et son propre moteur, en partageant seulement des **idées** et, plus tard, des
helpers génériques soigneusement isolés.

### 2.3 Parcours Banderoles existant

Le parcours livré est un formulaire en six étapes (`src/components/grand-format/CommandeBanderole.tsx`) :
utilisation, caractéristiques (support, dimensions libres au cm, quantité, finition, délai),
prestation, fichiers, prix, coordonnées. Il ne contient **aucun éditeur graphique** :

- l'aperçu (`ApercuBanderole.tsx`) est une composition CSS/SVG d'inspiration, avec des noms et
  des lieux fictifs ; ce n'est pas un document éditable ;
- les « modèles » (`src/lib/grand-format/modeles.ts`) sont des modèles d'**inspiration** figés,
  pas des templates JSON modifiables ;
- les fichiers sont ajoutés par le client (PDF, PNG, JPEG, WEBP, ZIP), dans la limite de
  **5 fichiers, 25 Mo par fichier, 50 Mo au total** ;
- l'estimation est calculée côté serveur (`POST /api/banderoles/estimation`) à partir de
  `tarifs_grand_format` ; seul un tarif `VALIDE` produit un prix ; sinon « sur devis » ;
- la création de la demande passe par `POST /api/banderoles` → `traiterCreationDevis` →
  `creer_demande_grand_format`.

Ce parcours est le bon point d'ancrage : le Studio doit produire un **paquet de fichiers** que ce
formulaire sait déjà envoyer, puis laisser le devis, l'acceptation, la commande et le paiement
suivre leur cours.

### 2.4 Stockage privé et gestion des fichiers

Le socle est déjà conforme aux exigences de sécurité :

- deux buckets **privés** (`supabase/migrations/20261109130005_storage.sql`) :
  - `devis` : PDF, PNG, JPEG, WEBP, ZIP, **25 Mo** ;
  - `production` : PDF, PNG, JPEG, JSON, TXT, **50 Mo** ;
- aucune politique `anon`/`authenticated` ; le serveur (`service_role`) délivre des URL signées
  après contrôle du devis/commande et du rôle ;
- vérification binaire réelle (`src/server/storage/verification.ts`) : signatures PNG/JPEG/PDF/
  ZIP/WEBP, extension cohérente, taille, nom sans traversée ni double extension, SHA-256 ;
- envoi direct du navigateur vers Supabase via URL signée (pas de transit par une fonction
  Vercel limitée à 4,5 Mo) ;
- téléchargement après vérification et statut d'analyse `PROPRE`
  (`src/app/api/devis/[reference]/fichiers/[fichierId]/url/route.ts`) ;
- quota de l'archive de commande (Vercel Blob) : 12 fichiers, 25 Mo par fichier, 120 Mo au total
  (`src/server/dossiers/dossier.ts`).

**Constats importants pour le Studio** :

1. Le bucket `devis` **n'accepte pas `application/json`**. Or le projet doit être conservé en
   JSON structuré et joint à la demande. Il faut l'ajouter, avec une vérification dédiée
   (lecture UTF-8, parsing JSON, schéma, taille maximale) — la signature binaire générique ne
   s'applique pas au JSON.
2. La limite **5 fichiers / 50 Mo** est insuffisante pour un paquet Studio (jusqu'à 6 images +
   JSON + aperçu). Il faut une limite spécifique au parcours banderole (proposition : 10
   fichiers / 80 Mo), sans changer les limites du formulaire de devis général.
3. `marquerFichierVerifie()` laisse `statut_analyse = 'NON_ANALYSE'` ; un fichier n'est
   téléchargeable que si `verifie = true` **et** `statut_analyse = 'PROPRE'`. Les fichiers
   **générés par le serveur** (PDF, JSON canonique) doivent donc être enregistrés directement en
   `PROPRE`, avec `analyse_moteur = 'elembo-banner'`. Les sources client restent
   `NON_ANALYSE` ; le serveur peut les lire pour le rendu, mais elles ne sont pas exposées au
   téléchargement sans dérogation.
4. La conversion devis → commande copie les lignes `fichiers_devis` **avec leur `expire_le`**
   (90 jours). Pour un fichier de production, la conservation cible est de 24 mois. Il faut une
   étape d'archivage/copie à la conversion, ou une correction de l'échéance dans
   `fichiers_commande`. C'est un point à traiter dans le lot d'intégration, pas un détail.
5. Les fichiers générés pour un devis restent dans le bucket `devis`, et `bucketSupabase()`
   déduit le bucket du préfixe du chemin. Si l'on copie le PDF vers `production/<commande>/…`
   à la commande, l'administration continue de fonctionner ; sinon il faut accepter que des
   fichiers de commande vivent dans le bucket `devis` et adapter la conservation.

### 2.5 Devis, commandes, paiements, atelier

Le circuit existant est complet et ne doit pas être dupliqué :

- **Devis** : `creer_devis_atomique` (idempotence, client, notifications), statuts
  `NOUVEAU → EN_ANALYSE → PROPOSE → ACCEPTE/REFUSE/EXPIRE`, `transitionner_devis`.
- **Demande grand format** : `creer_demande_grand_format` crée devis + paramètres structurés
  dans une transaction ; `demandes_grand_format` porte les dimensions, la finition, la
  prestation, l'estimation et le chiffrage interne.
- **Commande** : `creer_commande_depuis_devis` exige un devis `ACCEPTE` et un montant proposé ;
  elle copie les fichiers du devis, crée une ligne unique et l'historique. Les transitions sont
  vérifiées en base.
- **Paiement** : MTN MoMo (tunnel direct, callback, réconciliation) et confirmation manuelle
  staff ; aucune modification nécessaire.
- **Atelier** : `initialiserTravaux()` crée les tâches `Impression grand format`,
  `Création graphique`, `Livraison`, `Autres frais` à partir du chiffrage ; les triggers
  recalculent coût et marge. L'imprimeur est un `partenaire` avec ses dimensions maximales et
  ses tarifs négociés.
- **Fichiers** : `fichiers_devis` → copie vers `fichiers_commande` ; l'atelier télécharge le
  PDF via la route admin protégée.

Conclusion : le Banner Studio n'a **rien à ajouter** au cycle commercial. Il doit seulement
produire un PDF et un JSON de qualité, les rattacher au devis, et laisser la conversion faire
son travail. La seule modification de flux à prévoir est l'archivage du paquet visuel au moment
de la conversion (retention + chemin de production).

### 2.6 Authentification, session et reprise du travail

Il n'existe **pas de compte client** sur Elembo. Le suivi d'un devis repose sur :

- un cookie de session signé HMAC (`elembo_devis_session`), lié au devis, HttpOnly, 30 jours
  (`src/server/devis/session.ts`) ;
- un jeton de suivi dans le lien de la demande ;
- une récupération par référence + code OTP à 6 chiffres (email/SMS), qui recrée une session
  (`src/server/devis/otp.ts`) ;
- Supabase Auth uniquement pour le **staff** (`src/server/auth/session.ts`, `src/proxy.ts`).

Conséquences pour la reprise :

- **Avant la demande** : aucune session serveur n'existe. La reprise fiable est **locale**
  (IndexedDB + export JSON). On ne peut pas promettre une reprise multi-appareil avant le devis
  sans inventer un compte ou un mécanisme de brouillon anonyme.
- **Après la demande** : la session du devis (ou l'OTP) permet de retrouver le visuel attaché,
  son aperçu et son PDF. Une reprise d'édition est possible tant que le devis n'est pas accepté ;
  après acceptation, toute modification doit passer par le staff ou un nouveau devis.
- Un mécanisme de **brouillon serveur anonyme** (cookie + table + code de récupération) est
  possible, mais c'est un chantier à part. Il ne fait pas partie du MVP.

### 2.7 Bibliothèques graphiques et polices déjà présentes

- `three` + `@react-three/fiber` + `@react-three/drei` : 3D du configurateur textile. Inutile
  pour une surface plane, et trop lourd pour un éditeur 2D mobile.
- `gsap` : animation d'interface, pas un moteur graphique.
- `zustand` : état, réutilisable pour le nouveau store.
- `sharp` : présent transitivement (optimisation d'images Next), **non déclaré**. Ne pas bâtir
  la génération PDF ou les vignettes dessus sans l'ajouter explicitement et valider le runtime.
- Aucune bibliothèque de canvas objet (Fabric/Konva), aucun moteur PDF, aucun rasteriseur SVG
  côté serveur.
- Polices : 17 familles, WOFF2 uniquement, pas d'italiques réelles. Le navigateur synthétise
  l'italique ; un PDF ne peut pas se contenter de cette synthèse s'il embarque la police
  droite. Il faut des fichiers TTF/OTF statiques (droite, gras, italique) pour le rendu PDF, et
  une stratégie de couverture des glyphes (les langues congolaises utilisent des caractères
  comme `ɛ`, `ɔ`, `ŋ`).

### 2.8 Build, déploiement et contraintes Next.js

- Next.js **16.3.6**, React **19.2.8**, TypeScript strict, Vitest 5.
- Routes API en runtime Node.js (`export const runtime = 'nodejs'`), adaptées à Supabase,
  Redis, aux vérifications binaires et à un moteur PDF.
- `next.config.ts` prévoit un export statique GitHub Pages (`DEPLOY_TARGET=gh-pages`) : le
  Banner Studio, qui dépend de routes serveur, ne peut pas y fonctionner. Il doit être désactivé
  ou limité à une démo locale dans ce mode.
- Le layout public `(site)` charge l'en-tête, le pied de page, WhatsApp et la barre mobile. Un
  éditeur plein écran ne doit pas hériter de cet habillage : prévoir un **groupe de routes
  dédié** (`(studio)`) avec son propre layout minimal.
- Les polices TTF du rendu PDF devront être incluses dans le bundle des fonctions serveur
  (`outputFileTracingIncludes` dans `next.config.ts`) ou chargées depuis un module bundlé ;
  un fichier de `public/` n'est pas garanti présent dans la fonction.
- `react-konva` 19.3.2 exige React `^19.3.0` ; le projet est en 19.2.8. Si l'on choisit
  `react-konva`, il faut épingler une 19.2.x. La recommandation est de ne pas en dépendre :
  Konva est utilisé impérativement, ce qui évite ce couplage.

### 2.9 Constats à retenir

| # | Constat | Gravité | Conséquence |
|---|---|---|---|
| 1 | Aucun éditeur 2D ni bibliothèque objet | bloquant | Ajouter Konva (ou Fabric) et un modèle dédié |
| 2 | Aucun moteur PDF/vectoriel | bloquant | Ajouter `pdf-lib` + fontkit côté serveur |
| 3 | Export textile plafonné à 4 096 px | bloquant pour le grand format | Ne pas réutiliser `renderPrintPng` |
| 4 | Bucket `devis` sans `application/json` | bloquant | Migration additive + vérification JSON |
| 5 | Limite 5 fichiers / 50 Mo | bloquant pour le paquet Studio | Limite spécifique banderole |
| 6 | Téléchargement conditionné à `PROPRE` | à corriger | Fichiers générés marqués `PROPRE` |
| 7 | `expire_le` de 90 jours recopié en commande | risque de conservation | Archivage/copie à la conversion |
| 8 | Pas de compte client | limite produit | Reprise locale avant devis, session/OTP après |
| 9 | Polices WOFF2 sans TTF/italique | bloquant pour le PDF | Catalogue TTF + couverture des glyphes |
| 10 | IndexedDB textile partagée | risque de perte de données | Base/store séparés pour le Studio |
| 11 | Layout public autour de l'éditeur | gêne UX | Groupe de routes `(studio)` |
| 12 | Export statique GitHub Pages | incompatibilité | Désactiver le Studio dans ce mode |
| 13 | `prestation` sans « STUDIO » | décision commerciale | Mapper sur `FICHIER_PRET` ou ajouter une valeur |
| 14 | 6 usages contre 7 catégories de modèles | écart de taxonomie | Taxonomie de templates séparée + mapping |
| 15 | Grille tarifaire vide ou en test | risque de prix inventé | Réutiliser l'estimation serveur, jamais calculer côté client |
| 16 | Pas de job d'analyse antivirus | risque de blocage | Sources client non téléchargeables ; fichiers serveur `PROPRE` |

---

## 3. Fabric.js ou Konva.js ?

### 3.1 Méthode

Les deux bibliothèques sont comparées sur le **besoin réel** : un éditeur de surface plane,
avec zoom/pan, sélection, poignées de redimensionnement/rotation, calques, textes, images,
formes, contraintes physiques, sur desktop et mobile, avec un rendu de production **séparé**.
Le fait qu'elles soient toutes deux des bibliothèques Canvas 2D est central : **aucune ne produit
un PDF vectoriel**. Le fichier de production sera généré par un autre moteur ; le choix de
l'éditeur ne doit donc pas être motivé par l'export.

### 3.2 Tableau comparatif

| Critère | Fabric.js 7.4 | Konva.js 10.9 | Poids pour le Studio |
|---|---|---|---|
| Licence | MIT | MIT | égalité |
| Taille (gzip, Bundlephobia) | ≈ 92 Ko | ≈ 57 Ko | Konva |
| Modèle objet / sérialisation | très riche, mature | scène graphique claire, groupes, calques | Fabric |
| Intégration React/Next | impérative, pas de wrapper officiel | cœur impératif + `react-konva` optionnel | Konva |
| Transformer (poignées, rotation, ratio) | puissant mais à customiser | `Transformer` très complet, `boundBoxFunc`, snaps | Konva |
| Tactile / mobile | correct, moins prévisible | très bon, pensé pour les gestes | Konva |
| Édition de texte dans le canvas | `IText`/`Textbox`, édition intégrée | pas d'édition intégrée ; overlay HTML à écrire | Fabric |
| Interlettrage / interligne | `charSpacing`, `lineHeight` | `letterSpacing`, `lineHeight` | égalité |
| Formes / chemins | SVG parser, `Path`, `clipPath` | `Path`, `clip`, `crop`, formes natives | Fabric |
| Calques / performance | cache objet, un canvas | multi-calques, `listening(false)`, cache | Konva |
| Rendu serveur | `fabric/node` + node-canvas (natif) | backends canvas/Skia (natif) | égalité (à éviter) |
| Export vectoriel | SVG possible, mais polices/PDF non | non | égalité (non décisif) |
| Courbe d'apprentissage / TS | moyenne | bonne, API simple | Konva |

Mesures : [Bundlephobia Konva 10.9.1](https://bundlephobia.com/package/konva@10.9.1),
[Bundlephobia Fabric 7.4.0](https://bundlephobia.com/package/fabric@7.4.0).
Documentation : [Transformer Konva](https://konvajs.org/docs/select_and_transform/Transformer.html),
[IText Fabric](https://fabricjs.com/docs/classes/IText.html).

### 3.3 Pourquoi Konva pour ce produit

1. **Le geste est le cœur de l'expérience.** Une banderole se compose en déplaçant, agrandissant
   et tournant des blocs. Le `Transformer` de Konva gère nativement les poignées, la rotation,
   le ratio, les limites (`boundBoxFunc`) et les repères de rotation ; le porter sur Fabric
   demanderait plus de code custom et de tests tactiles.
2. **Le mobile n'est pas une version réduite.** Konva est conçu autour d'une scène et de gestes
   tactiles ; ses calques permettent d'isoler le fond statique, le contenu et les repères, ce
   qui est exactement la structure d'un éditeur. Fabric redessine l'ensemble du canvas et
   demande plus d'attention pour tenir la fluidité sur un Android milieu de gamme.
3. **L'édition de texte ne justifie pas Fabric.** Fabric a un vrai avantage avec `IText`
   (édition dans le canvas). Mais pour une banderole, les textes sont grands, souvent composés
   au clavier, et un panneau latéral (ou une feuille mobile) avec un vrai `<textarea>` est plus
   accessible, plus fiable avec les claviers mobiles et les IME, et plus simple à tester. On
   perd le « double-clic dans le canvas » ; on gagne en robustesse et en accessibilité.
4. **La production est indépendante.** Puisque le PDF est généré par `pdf-lib`, l'export SVG de
   Fabric ne sert pas. On peut donc choisir l'éditeur pour l'interaction, pas pour l'export.
5. **Poids et couplage React.** 57 Ko gzip contre 92 Ko, sans dépendance, et un usage impératif
   qui garde le moteur indépendant de React. `react-konva` reste possible (épinglé en 19.2.x
   pour React 19.2.8), mais n'est pas nécessaire.

### 3.4 Quand Fabric serait le bon choix

- Si l'on voulait un éditeur de texte riche **dans le canvas** (sélection de mots, styles par
  caractère, curseur, édition directe) comme cœur du produit.
- Si l'on voulait importer des SVG utilisateurs complexes et les manipuler comme des objets
  Fabric, avec un rendu SVG natif.
- Si l'on acceptait un bundle plus lourd et un travail tactile plus important.

Ce n'est pas le périmètre de la première livraison : les textes sont des blocs, les images sont
des photos/logos, les formes sont paramétriques, et la fidélité de production est assurée par le
PDF, pas par le canvas.

### 3.5 Décision

**Konva.js 10.x, cœur impératif, dans un composant client `StudioCanvas`.** Le moteur ne
connaît que le modèle de document et des fonctions de layout pures ; React ne sert qu'à
l'habillage et aux panneaux. On n'installe pas `react-konva` dans le MVP. Si l'équipe préfère le
déclaratif, `react-konva@19.2.x` est compatible avec React 19.2.8 ; la 19.3.x exige React
19.3.0 et ne doit pas être installée telle quelle.

---

## 4. Architecture technique proposée

### 4.1 Principes

1. **Un seul document, plusieurs rendus.** Le `BannerDocument` (JSON, millimètres) est la seule
   source de vérité. L'éditeur Konva, l'aperçu SVG/JPEG et le PDF de production sont des
   **adaptateurs** du même modèle et des mêmes fonctions de layout. Aucun rendu ne réinvente
   les positions.
2. **Le moteur graphique est indépendant du commerce.** Aucun composant du Studio ne calcule un
   prix, ne crée un devis, ne paie. Il produit un paquet de fichiers et délègue au parcours
   existant.
3. **Le serveur est l'autorité de production.** Le PDF est généré côté serveur à partir du JSON
   validé et des sources vérifiées, jamais à partir d'une capture du navigateur.
4. **Les contraintes sont des données, pas des constantes.** Un profil d'impression versionné,
   validé et associé à un imprimeur décrit marges, œillets, ourlets, fourreaux, laize, fond
   perdu, densité minimale et mode de pagination. Le Studio ne suppose rien.
5. **Le commerce existant est réutilisé.** Devis, session, OTP, uploads signés, commande,
   paiement, tâches d'atelier et back-office restent les circuits uniques.

### 4.2 Vue d'ensemble

```
┌──────────────────────────────── CLIENT ────────────────────────────────┐
│  Banner Studio (React + Konva)                                          │
│  ├─ BannerDocument (Zustand) + historique                               │
│  ├─ IndexedDB « elembo-banner » : document + assets                     │
│  ├─ Konva Stage : fond / contenu / repères                              │
│  └─ Paquet : projet-banner.json + images + aperçu                       │
│                              │                                          │
│                     « Finaliser ma demande »                            │
│                              ▼                                          │
│  /banderoles/commander?studio=…  (parcours commercial existant)          │
│   - dimensions/support verrouillés, finition/quantité/délai/contact     │
│   - estimation serveur, uploads signés                                  │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ POST /api/banderoles (existant)
                               ▼
┌──────────────────────────── SUPABASE ──────────────────────────────────┐
│ devis (privé) : images sources, projet JSON, PDF, JSON canonique        │
│ production (privé) : aperçu basse résolution                            │
│ tables : devis, demandes_grand_format, fichiers_devis, visuels_banderole│
│ RLS : aucun accès anon ; service_role côté serveur                      │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ POST /api/banderoles/[ref]/visuel
                               ▼
┌────────────────────────── SERVEUR (Node) ──────────────────────────────┐
│ 1. session devis + CSRF + statut                                         │
│ 2. validation JSON/schéma/cotes + droits sur les fichiers                │
│ 3. profil d'impression (partenaire ou public) + snapshot                │
│ 4. layout partagé + préflight (zones, œillets, DPI, plis)               │
│ 5. rendu PDF vectoriel (pdf-lib + fontkit + TTF)                        │
│ 6. stockage privé + fichiers_devis PROPRE + visuels_banderole            │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │
          ┌────────────────────┼──────────────────────────┐
          ▼                    ▼                          ▼
   suivi client          back-office banderoles      devis → commande
   (session/OTP)         (aperçu, alertes,          (fichiers copiés,
   aperçu + PDF           régénération, profil)      tâches atelier)
```

### 4.3 Modèle de document (version 1)

Le document est en **millimètres**, avec l'origine en haut à gauche de la surface finie. Les
éléments sont ordonnés du calque le plus bas au plus haut (l'index fait le z-order). Les textes
ont des **lignes explicites** : la première version ne fait pas de retour à la ligne
automatique en continu ; une commande « Couper les lignes » peut insérer les retours à la ligne
selon la largeur du bloc. C'est un choix de simplicité et de fidélité : le PDF dessine
exactement les mêmes lignes que l'éditeur.

```json
{
  "schema": "elembo.banner",
  "version": 1,
  "id": "3f0c…",
  "nom": "Hommage Papa Joseph",
  "creeLe": "2026-11-13T10:00:00.000Z",
  "modifieLe": "2026-11-13T10:24:00.000Z",
  "support": "BANDEROLE",
  "categorie": "DEUIL",
  "modeleId": "hommage-portrait",
  "dimensions": { "largeurMm": 3000, "hauteurMm": 1000 },
  "finition": "OEILLETS",
  "profil": { "id": "…", "version": 3 },
  "contraintes": {
    "margeSecuriteMm": 50,
    "ourletMm": 50,
    "fondPerduMm": 0,
    "laizeMaxMm": 3200,
    "oeillets": { "actifs": true, "diametreMm": 20, "espacementMm": 500, "margeMm": 30 },
    "fourreaux": { "hautMm": 0, "basMm": 0 },
    "dpiMin": 72,
    "dpiRecommande": 150
  },
  "fond": { "type": "couleur", "couleur": "#0D0B10" },
  "assets": [
    {
      "id": "asset-1",
      "nom": "portrait.jpg",
      "mime": "image/jpeg",
      "largeurPx": 2400,
      "hauteurPx": 3000,
      "sha256": "…"
    }
  ],
  "elements": [
    {
      "id": "text-001",
      "type": "texte",
      "nom": "Titre",
      "xMm": 1500,
      "yMm": 420,
      "largeurMm": 2400,
      "hauteurMm": 260,
      "rotationDeg": 0,
      "opacite": 1,
      "verrouille": false,
      "visible": true,
      "texte": {
        "contenu": "Papa Joseph Malonga",
        "policeId": "playfair-display",
        "corpsMm": 150,
        "couleur": "#FBF7EE",
        "alignement": "center",
        "graisse": 700,
        "italique": false,
        "interlettrageEm": 0,
        "interligne": 1.1
      }
    },
    {
      "id": "image-001",
      "type": "image",
      "nom": "Portrait",
      "xMm": 300,
      "yMm": 250,
      "largeurMm": 600,
      "hauteurMm": 600,
      "rotationDeg": 0,
      "opacite": 1,
      "verrouille": false,
      "visible": true,
      "image": {
        "assetId": "asset-1",
        "recadrage": { "x": 0.1, "y": 0.05, "l": 0.8, "h": 0.8 },
        "ajustement": "cover"
      }
    },
    {
      "id": "forme-001",
      "type": "forme",
      "nom": "Filet or",
      "xMm": 1500,
      "yMm": 760,
      "largeurMm": 1600,
      "hauteurMm": 4,
      "rotationDeg": 0,
      "opacite": 1,
      "verrouille": false,
      "visible": true,
      "forme": { "nature": "rect", "fond": "#D9C08A", "contour": null, "epaisseurMm": 0, "rayonMm": 0 }
    }
  ],
  "qualite": { "distanceLectureM": 3 },
  "meta": { "versionRendu": 1, "policesVersion": "2026-11", "createur": "client" }
}
```

Points de conception :

- `xMm/yMm` = centre de l'élément ; `largeurMm/hauteurMm` = cadre non pivoté ; la rotation
  s'applique autour du centre. C'est la convention la plus simple pour l'éditeur, le PDF et le
  hit-test.
- Les images ne sont **pas** embarquées : `assetId` (local) et `sha256` permettent de retrouver
  et vérifier le fichier. Le JSON produit par le client **ne contient pas de `fichierId`** : au
  moment de l'envoi, chaque asset est déposé sous un nom déterministe
  `studio-<assetId>.<ext>` ; après vérification des uploads, le client transmet au serveur la
  correspondance `assetId → fichierId`. Le serveur contrôle que chaque fichier appartient au
  devis, qu'il est vérifié, que son type est autorisé et que son SHA-256 correspond au JSON,
  puis ajoute `fichierId` dans le **JSON canonique** qu'il archive. Un JSON exporté côté client
  reste ainsi portable (il ne dépend pas des identifiants d'un environnement). Le document
  reste petit et peut être stocké en `jsonb`.
- Les textes n'ont pas de `lignes` dans le document : les lignes sont **explicites** dans
  `contenu` (retours à la ligne). Une commande de coupe automatique les matérialise.
- `contraintes` est un **snapshot** de ce que le client a vu. Le serveur re-résout le profil
  courant au rendu et stocke le sien ; le snapshot ne fait pas autorité pour la production.
- `qualite.distanceLectureM` sert à choisir les seuils de définition d'image (1 m, 3 m, 10 m) ;
  il est enregistré pour la traçabilité.
- Aucune URL externe, aucun chemin absolu, aucune donnée personnelle inutile.

### 4.4 Rendu partagé et fidélité

Le module `src/lib/banner/layout.ts` (fonctions pures, testables) calcule :

- la boîte de chaque élément après rotation (OBB) ;
- les positions des zones de sécurité, ourlets, œillets, fourreaux, fond perdu, plis ;
- les dimensions réelles de l'image après recadrage et le DPI effectif ;
- les avertissements (`critique`, `avertissement`, `info`).

Les trois rendus consomment ce layout :

| Rendu | Technologie | Usage |
|---|---|---|
| Éditeur | Konva `Stage`/`Layer`/`Transformer` | interaction temps réel |
| Aperçu | canvas Konva (JPEG 1 600 px) + SVG pur pour les vignettes | tracking, back-office, modèles |
| Production | `pdf-lib` + `@pdf-lib/fontkit` | PDF vectoriel |

**Texte.** Pour éviter les divergences entre le canvas et le PDF, le texte est dessiné par un
`Konva.Shape` personnalisé (et non par `Konva.Text`) : même police, même corps en mm, mêmes
lignes explicites, même interligne, même interlettrage, même alignement. Le PDF dessine les
mêmes lignes, avec les mêmes métriques de police. Les largeurs de ligne sont mesurées par le
canvas côté client et par la police (fontkit) côté serveur ; l'écart est inférieur au pixel sur
les cas courants, et les retours à la ligne étant explicites, il ne peut pas changer le contenu.
Une table de métriques précalculée est une évolution possible si l'on veut une égalité
mathématique parfaite.

**Images.** Le cadre, le recadrage, l'ajustement (`cover`/`contain`) et la rotation sont
calculés une fois. L'éditeur utilise un bitmap de travail réduit (≤ 2 048 px) pour la fluidité ;
le PDF embarque l'original. Le recadrage PDF se fait par un chemin de découpe (`clip`) et un
placement de l'image, pas par une ré-encodage.

**Formes.** Rectangles (avec rayon), ellipses, lignes, cadres et chemins décoratifs normalisés
dans une viewBox carrée. Les décorations sont des chemins SVG originaux (étoile, éclat, croix,
anneaux, ruban, vague, coin) ; ils sont dessinés par Konva `Path` et `pdf-lib.drawSvgPath`. On
limite les chemins à une échelle uniforme (formes carrées) pour éviter les matrices non
uniformes dans le PDF.

### 4.5 Contraintes physiques et profils d'impression

Un **profil d'impression** décrit ce que l'imprimeur peut réellement faire :

| Champ | Rôle |
|---|---|
| `support` | BANDEROLE, BACHE, ROLL_UP, KAKEMONO, X_BANNER, PANNEAU |
| `partenaire_id` / `est_public` | profil d'un imprimeur, ou profil public de secours |
| `statut` | BROUILLON, A_VALIDER, VALIDE, ARCHIVE |
| `version` | version fonctionnelle ; toute modification d'une valeur sensible incrémente et invalide |
| `laize_max_mm`, `longueur_max_mm` | dimensions maximales réellement imprimables |
| `marge_securite_mm`, `ourlet_mm`, `fond_perdu_mm` | zones de sécurité et débords |
| `oeillets_*` | actifs, diamètre, espacement, marge au bord |
| `fourreaux_*` | bandes haute/basse réservées |
| `dpi_min`, `dpi_recommande` | seuils de définition d'image |
| `page_max_mm` | taille maximale d'une page PDF (5 080 mm par défaut) |
| `mode_grand_format` | `PANNEAUX` (tuilage) ou `PAGE_UNIQUE_USERUNIT` (si validé par l'imprimeur) |
| `fichier_inclut_ourlet`, `marques_impression` | ce que l'imprimeur attend dans le fichier |
| `notes` | consignes internes |

Le Studio utilise le **profil public validé** du support. À l'affectation d'un imprimeur, le
back-office résout le profil du partenaire ; si les contraintes diffèrent, le PDF est régénéré
et le visuel passe en `A_REVOIR` avec les nouveaux avertissements. Si aucun profil n'est validé,
un profil public `A_VALIDER` conservateur est utilisé, et la demande est signalée « contraintes
à confirmer ». C'est le même principe que la grille de prix : **on n'invente pas une capacité
d'imprimeur**.

Géométrie :

- surface finie : `[0, 0, largeurMm, hauteurMm]` ;
- zone sûre : inset de `ourletMm + margeSecuriteMm` (ou `margeSecuriteMm` si pas d'ourlet) ;
- ourlets : bandes intérieures de `ourletMm` sur les bords concernés ;
- œillets : centres régulièrement espacés le long du périmètre, à `oeilletMargeMm` du bord,
  avec une zone de exclusion de `diametre/2 + marge` ;
- fourreaux : bandes haute/basse de `fourreauHautMm`/`fourreauBasMm` ;
- fond perdu : bande extérieure à la surface finie, remplie par le fond et les images de fond ;
- plis de panneaux : lignes de coupe/recouvrement quand le format dépasse `page_max_mm`.

**Laize et longueur.** La laize contraint le **petit côté** du support (la largeur du rouleau,
en travers du sens d'impression), pas la longueur : une banderole de 5 × 1 m tient dans une
laize de 3,2 m parce que son côté de 1 m passe en travers. `longueur_max_mm` contraint le grand
côté, dans le sens du déroulé. L'estimation existante applique déjà cette règle
(`Math.min(largeur, hauteur) > laize` → hors gabarit). Le Studio doit afficher le sens de
lecture et, si les deux dimensions dépassent la laize, proposer l'assemblage ou le devis manuel.

Règles d'alerte :

| Code | Sévérité | Déclencheur |
|---|---|---|
| `HORS_FORMAT` | critique | un élément sort de la surface finie (il sera coupé) |
| `ZONE_SECURITE` | avertissement (texte) / info (image) | chevauchement de la zone sûre |
| `OURLET` | avertissement | texte dans une bande d'ourlet |
| `OEILLET` | avertissement | texte/image dans une zone d'œillet |
| `FOURREAU` | avertissement | texte/image dans une bande de fourreau |
| `IMAGE_MANQUANTE` | critique | asset absent ou illisible |
| `IMAGE_DPI_INSUFFISANT` | avertissement fort | DPI effectif < seuil minimal |
| `IMAGE_DPI_FAIBLE` | info | DPI < recommandé |
| `POLICE_GLYPHES` | critique | glyphe manquant dans la police choisie |
| `POLICE_INDISPONIBLE` | critique | fichier de police absent côté serveur |
| `PLIURE_PANNEAU` | avertissement | texte à cheval sur un pli de panneau |
| `PLACEHOLDER` | critique | image de modèle non remplacée |
| `PROFIL_A_VALIDER` | info | contraintes non validées par l'imprimeur |
| `FOND_PERDU_NON_COUVERT` | info | fond/image n'atteint pas le bord du fond perdu |

Le client voit les alertes en direct (badge + panneau + contours sur le canvas). Le serveur
recalcule le même préflight et l'enregistre ; le back-office le montre avant de convertir en
commande. Seuls les `critique` bloquent la génération du PDF ; les avertissements sont portés à
la connaissance du staff, qui décide. Une création artistique ne doit pas être bloquée parce
qu'un texte frôle un œillet, mais l'atelier doit le savoir.

### 4.6 Persistance et reprise

| Niveau | Contenu | Durée |
|---|---|---|
| IndexedDB `elembo-banner` | document courant, projets nommés, assets (Blob) | sur l'appareil, jusqu'à suppression |
| Export fichier | `projet-banner.json` (références d'assets, pas les images) | l'utilisateur |
| Serveur `devis` | sources, JSON canonique, PDF | 90 jours si non converti, 24 mois si commande |
| Serveur `production` | aperçu JPEG | idem, et copie éventuelle en commande |
| Base | `visuels_banderole` (JSON + préflight + avertissements + versions) | lié au devis |

Règles :

- lecture **tolérante** : JSON corrompu → projet vide + message, jamais une exception ;
- version de schéma inconnue → lecture seule + message, pas de rendu ;
- quota IndexedDB → bandeau, export JSON possible, édition en mémoire ;
- assets manquants → placeholders + avertissement, export bloqué jusqu'à remplacement ;
- autosave debounce 800 ms ; bouton « Sauvegarder » explicite ; statut visible
  (« Enregistré sur cet appareil ») ;
- la **base IndexedDB du textile ne doit pas être réutilisée** : `elembo` / `assets` est déjà
  utilisée et son élagage supprimerait les images de banderoles non référencées par le textile.
  Créer `elembo-banner` / `assets` (ou un store namespacé avec un GC par application).

Reprise :

- **avant la demande** : locale, sur le même appareil ;
- **après la demande** : le suivi du devis (session ou OTP) affiche l'aperçu et le PDF ;
  « Reprendre dans le Studio » est possible tant que le devis n'est pas accepté, et crée une
  nouvelle version du visuel ; après acceptation, lecture seule ;
- **multi-appareil avant demande** : non supporté par les mécanismes existants ; à traiter
  séparément si le besoin est confirmé (brouillon anonyme avec code de récupération).

### 4.7 Passation vers le parcours commercial

Le Studio ne recrée pas le formulaire de commande. Il prépare un **paquet** et ouvre le parcours
existant :

1. Le Studio stocke le document et les assets dans IndexedDB.
2. « Finaliser ma demande » navigue vers
   `/banderoles/commander?studio=<projectId>&usage=<slug>&support=<id>`.
3. `CommandeBanderole` charge le paquet, préremplit les dimensions, le support et la finition,
   initialise la quantité à 1, et **verrouille** dimensions/support (un lien permet de revenir au
   Studio).
4. À l'étape « Fichiers », le paquet est présenté comme un seul bloc (« Visuel Banner Studio ») ;
   l'utilisateur n'a pas à réimporter les images. Le paquet est ajouté à la liste des fichiers
   annoncés au serveur.
5. À l'envoi, le parcours existant crée le devis et renvoie les URL signées ; le navigateur
   envoie les images, le JSON et l'aperçu directement au bucket privé. La vérification des
   uploads renvoie les `fichierId` ; le client conserve la correspondance
   `assetId → fichierId` et l'identifiant du JSON source.
6. Le client appelle `POST /api/banderoles/[reference]/visuel` (session + CSRF) avec
   `projetFichierId` et le manifeste des assets ; le serveur contrôle l'appartenance, les
   checksums et le schéma, rend le PDF, l'attache au devis et enregistre la version du visuel.
7. Redirection vers `/devis/[reference]` : le suivi affiche le visuel, son aperçu, les alertes
   éventuelles et le PDF ; le prix suit le circuit existant.

La prestation par défaut est `FICHIER_PRET` (le client fournit un visuel prêt), avec une mention
« Visuel réalisé avec Elembo Banner Studio ». Le client peut néanmoins choisir `CREATION` dans
l'étape « Prestation » s'il souhaite un accompagnement. La prestation n'est **pas modifiable**
dans le back-office actuel (`ChampsChiffrage` ne l'inclut pas) : si Smart Vision veut pouvoir
requalifier une demande après coup, il faudra ajouter ce champ (petite évolution, hors périmètre
v1) ou gérer le cas manuellement. **Décision commerciale à confirmer** : ne pas ajouter de frais
de création automatique sans validation de Smart Vision.

### 4.8 Sécurité serveur

- Aucun accès direct du navigateur aux tables ou aux buckets ; `service_role` uniquement côté
  serveur.
- Route de finalisation : session de devis + CSRF, statut autorisé, limitation de débit par
  devis et par IP.
- Les identifiants de fichiers du JSON ne sont **jamais** des chemins : le serveur vérifie que
  le fichier appartient au devis, qu'il est vérifié, de type image/JSON, et résout son chemin
  depuis la base.
- Validation stricte du JSON : version, bornes de dimensions, nombre d'éléments, longueurs de
  texte, polices autorisées, couleurs `#RRGGBB`/`#RRGGBBAA`, formes connues, pas d'URL, pas de
  HTML, pas de caractères de contrôle.
- Vérification binaire et SHA-256 des images ; limite de pixels (50 Mpx) et de taille pour
  éviter les bombes de décompression.
- Le PDF ne contient ni JavaScript, ni lien externe, ni fichier embarqué ; les textes sont
  échappés par `pdf-lib`.
- Les aperçus SVG sont échappés (texte et attributs) ; aucun HTML brut.
- Journalisation des rendus, échecs, régénérations et téléchargements (audit existant).
- Aucun secret, chemin absolu ou donnée interne dans le JSON ou le PDF.

### 4.9 Organisation des modules

```
src/lib/banner/
  model.ts            types, version, fabriques, migrations
  schema.ts           validation runtime stricte + bornes
  geometry.ts         mm, boîtes, OBB, hit-test, clamp, alignements
  layout.ts           layout partagé (éléments, texte, images, formes)
  constraints.ts      profils, zones, œillets, fourreaux, évaluations
  quality.ts          DPI, distance de lecture, seuils
  formats.ts          formats prédéfinis par support
  categories.ts       les 7 catégories de modèles + mapping usage
  templates/          JSON des modèles + index + validation
  render/svg.ts       aperçu/vignettes (pur, testable)
  render/pdf.ts       rendu serveur (pdf-lib) — voir src/server/banner/
  handoff.ts          paquet client, export/import JSON

src/stores/banner-studio-store.ts       état, historique, sélection, zoom, autosave

src/components/banner-studio/
  BannerStudio.tsx        coquille, chargement, raccourcis
  StudioTopBar.tsx        nom, dimensions, undo/redo, sauvegarde, finaliser
  StudioCanvas.tsx        Konva, layout, gestes, repères
  StudioLeftPanel.tsx     modèles, textes, images, formes, fond, calques
  StudioInspector.tsx     propriétés de l'élément
  TemplateGallery.tsx     galerie par catégorie
  ImageCropDialog.tsx     recadrage/ratio
  ProductionChecks.tsx    alertes + zones
  FinishingPanel.tsx      finition/quantité (préremplissage)
  MobileStudio.tsx        barre mobile + feuilles
  StudioOnboarding.tsx    première utilisation

src/app/(studio)/banderoles/studio/     page plein écran + layout dédié
src/app/api/banderoles/profils/         profil public (cache)
src/app/api/banderoles/[reference]/visuel/  finalisation + statut + aperçu
src/server/banner/                      repository, profils, rendu, stockage, archivage
```

### 4.10 Interface et frontières

**Desktop (≥ 1024 px)** — quatre zones, comme demandé :

```
┌──────────────────────────────────────────────────────────────────────┐
│ Nom du projet · 300 × 100 cm · ↶ ↷ · Enregistré · Aperçu · Finaliser │
├───────────────┬──────────────────────────────────────┬───────────────┤
│ Modèles       │             PLAN DE TRAVAIL           │ Propriétés    │
│ Textes        │   règles cm, zoom, zones de sécurité  │ de l'élément  │
│ Images        │   sélection, poignées, calques        │ ou du fond    │
│ Formes        │                                      │               │
│ Fond/Calques  │                                      │ Contrôles     │
└───────────────┴──────────────────────────────────────┴───────────────┘
```

- Barre supérieure : nom éditable, dimensions, annuler/rétablir, état de sauvegarde,
  « Aperçu », « Finaliser ma demande ».
- Panneau gauche : onglets Modèles / Textes / Images / Formes / Fond / Calques, avec un bouton
  d'ajout toujours visible.
- Centre : plan de travail aux proportions réelles, règles en cm, zoom (ajuster, 25–400 %),
  déplacement à la souris/trackpad, repères de sécurité/ourlets/œillets/fourreaux, grille
  optionnelle.
- Panneau droit : propriétés de l'élément sélectionné (position, taille, rotation, opacité,
  verrouillage, ordre, styles texte/image/forme), plus le panneau « Contrôles » (alertes).
- Les panneaux sont repliables ; en dessous de 1280 px, le panneau droit devient un tiroir.

**Tablette** : panneaux gauche/droit en tiroirs, canvas plein, propriétés en colonne de 300 px
quand la place le permet.

**Mobile (< 768 px)** — une interface **pensée pour le tactile**, pas une miniature :

- barre supérieure condensée : retour, nom, annuler/rétablir, menu (sauvegarde, export,
  aide) ;
- canvas plein écran entre la barre et une barre d'actions basse ;
- barre basse : Modèles · Ajouter (Texte/Image/Forme) · Calques · Réglages ;
- élément sélectionné : barre contextuelle courte (dupliquer, supprimer, calques) et ouverture
  de la feuille de propriétés ;
- feuilles plein écran pour les modèles, le texte (textarea natif + styles), le recadrage, les
  contrôles et la production ;
- gestes : un doigt déplace l'élément, un doigt sur le vide déplace la vue, pincement pour
  zoomer, poignées de 44 px minimum ; `touch-action: none` sur le canvas ;
- les zones de sécurité et les alertes restent accessibles via un badge ; pas de panneau
  permanent qui mange la surface ;
- le clavier mobile est géré par les feuilles (pas de canvas clavier).

**Accessibilité** : tous les contrôles sont des éléments DOM natifs et étiquetés ; la liste des
calques permet de sélectionner un élément sans le canvas ; les champs numériques offrent une
alternative aux gestes ; les alertes sont annoncées (`aria-live`) et jamais uniquement par la
couleur ; le canvas a un texte alternatif décrivant le document ; le focus visible et
`prefers-reduced-motion` sont respectés.

**Première utilisation** : un empty state propose « Choisir un modèle », « Ajouter un texte »,
« Importer une image » et rappelle les 3 gestes essentiels (glisser, poignées, zones de
sécurité). Aucune formation n'est nécessaire pour produire une banderole simple.

**Frontières de responsabilité** :

| Couche | Ne connaît pas | Connaît |
|---|---|---|
| Moteur (`lib/banner`) | React, Supabase, prix | document, mm, géométrie, contraintes |
| Éditeur (`components/banner-studio`) | prix, devis, stockage serveur | document, Konva, interactions |
| Passation (`handoff`) | rendu PDF, commerce | IndexedDB, paquet, navigation |
| Commerce existant | Konva, document | devis, prix, commande, paiement |
| Serveur (`server/banner`) | Konva, interface | JSON, profils, PDF, stockage |

---

## 5. Composants à créer

### 5.1 Moteur et modèle

| Composant | Responsabilité | Tests |
|---|---|---|
| `lib/banner/model.ts` | types, version, valeurs par défaut, migration | round-trip, versions |
| `lib/banner/schema.ts` | validation stricte, bornes, erreurs lisibles | cas valides/invalides |
| `lib/banner/geometry.ts` | mm, OBB, rotation, hit-test, clamp, alignement | géométrie pure |
| `lib/banner/layout.ts` | boîtes, lignes de texte, images, formes | snapshots de layout |
| `lib/banner/constraints.ts` | profils, zones, œillets, fourreaux, alertes | intersections, positions |
| `lib/banner/quality.ts` | DPI effectif, seuils par distance | images cropées |
| `lib/banner/formats.ts` | formats prédéfinis par support | cohérence catalogue |
| `lib/banner/categories.ts` | 7 catégories + mapping `UsageId` | alignement |
| `lib/banner/templates/*.json` | 10 modèles éditables | schéma + rendu |
| `stores/banner-studio-store.ts` | état, historique, autosave, sélection | store, undo/redo |

### 5.2 Interface

| Composant | Responsabilité | Mobile |
|---|---|---|
| `BannerStudio` | orchestration, chargement, erreurs, raccourcis | plein écran |
| `StudioTopBar` | nom, dimensions, undo/redo, sauvegarde, finaliser | condensé |
| `StudioCanvas` | Konva, zoom/pan, sélection, transformer, repères | gestes tactiles |
| `StudioLeftPanel` | modèles/textes/images/formes/fond/calques | feuilles |
| `StudioInspector` | position, taille, rotation, opacité, styles | feuille |
| `TemplateGallery` | catégories, vignettes, application | 2 colonnes |
| `ImageCropDialog` | recadrage, ratio, aperçu | plein écran |
| `ProductionChecks` | alertes, zones, « ajuster » | feuille + badge |
| `FinishingPanel` | finition, quantité, format | feuille |
| `MobileStudio` | barre d'actions, feuilles, clavier | natif |
| `StudioOnboarding` | 3 étapes, aide contextuelle | idem |

### 5.3 Serveur et back-office

| Composant | Responsabilité |
|---|---|
| `server/banner/repository.ts` | visuels, versions, fichiers, profils, audit |
| `server/banner/profils.ts` | résolution public/partenaire, validation |
| `server/banner/render.ts` | préflight + PDF + vérification du PDF produit |
| `server/banner/storage.ts` | upload privé, noms déterministes, URL signées |
| `server/banner/archive.ts` | copie du paquet à la conversion en commande |
| `api/banderoles/profils` | profil public sans données imprimeur |
| `api/banderoles/[reference]/visuel` | finalisation, statut, aperçu |
| `admin/banderoles/profils` | CRUD + validation des profils |
| `admin/banderoles/[id]` (ajout) | carte visuel : aperçu, PDF, alertes, régénération |
| `SuiviDevis` (ajout) | bloc « Votre visuel », reprise, téléchargement |
| `CommandeBanderole` (ajout) | préremplissage Studio, paquet, verrouillage |

### 5.4 Ce qui est réutilisé tel quel

| Élément existant | Réutilisation |
|---|---|
| `lib/grand-format/catalogue.ts` | supports, finitions, usages, limites, libellés |
| `lib/grand-format/estimation.ts` + API | prix indicatif, jamais recalculé côté client |
| `server/devis/creation.ts` | création atomique, uploads signés, session |
| `server/devis/session.ts`, `otp.ts` | suivi client, reprise |
| `server/storage/verification.ts` | signatures, noms, tailles, SHA-256 (extension JSON) |
| `server/grand-format/repository.ts` | création de la demande, chiffrage, travaux |
| `supabase/…/commandes_cycle.sql` | devis → commande, copie des fichiers |
| `server/admin/*`, `lib/admin/*` | back-office, permissions, audit |
| `lib/fonts.ts` | métadonnées et polices d'affichage (PDF : TTF à ajouter) |

### 5.5 Ce qui ne doit pas être réutilisé

- `src/lib/canvas/design-canvas.ts` et `export.ts` : dépendants des `PrintArea` textiles et du
  plafond 4 096 px ; concepts seulement.
- `src/stores/configurator-store.ts` : produit/zone/procédé textiles ; un nouveau store.
- `src/lib/storage/asset-store.ts` : même base IndexedDB et GC global ; base séparée.
- `src/lib/projects/project-storage.ts` : clés `localStorage` du textile ; clés séparées.
- `ApercuBanderole.tsx` / `modeles.ts` : inspiration marketing, pas le document éditable.

---

## 6. Modifications de base de données

Toutes les modifications sont **additives**. Aucun statut de devis, de commande ou de paiement
n'est ajouté. Aucune donnée existante n'est réécrite. Les noms de colonnes sont donnés à titre
de spécification ; la migration finale sera écrite et testée dans un lot dédié.

### 6.1 `profils_impression`

```sql
create table public.profils_impression (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(trim(nom)) between 2 and 120),
  support text not null check (support in ('BANDEROLE','BACHE','ROLL_UP','KAKEMONO','X_BANNER','PANNEAU')),
  partenaire_id uuid references public.partenaires (id) on delete cascade,
  est_public boolean not null default false,
  statut text not null default 'A_VALIDER'
    check (statut in ('BROUILLON','A_VALIDER','VALIDE','ARCHIVE')),
  version integer not null default 1 check (version > 0),
  laize_max_mm integer check (laize_max_mm is null or laize_max_mm > 0),
  longueur_max_mm integer check (longueur_max_mm is null or longueur_max_mm > 0),
  marge_securite_mm integer not null default 50 check (marge_securite_mm >= 0),
  fond_perdu_mm integer not null default 0 check (fond_perdu_mm >= 0),
  ourlet_mm integer not null default 0 check (ourlet_mm >= 0),
  oeillets_actifs boolean not null default false,
  oeillet_diametre_mm integer check (oeillet_diametre_mm > 0),
  oeillet_espacement_mm integer check (oeillet_espacement_mm > 0),
  oeillet_marge_mm integer check (oeillet_marge_mm >= 0),
  fourreau_haut_mm integer not null default 0 check (fourreau_haut_mm >= 0),
  fourreau_bas_mm integer not null default 0 check (fourreau_bas_mm >= 0),
  dpi_min integer check (dpi_min between 30 and 600),
  dpi_recommande integer check (dpi_recommande between 30 and 600),
  page_max_mm integer not null default 5080 check (page_max_mm between 500 and 5080),
  mode_grand_format text not null default 'PANNEAUX'
    check (mode_grand_format in ('PANNEAUX','PAGE_UNIQUE_USERUNIT')),
  fichier_inclut_ourlet boolean not null default false,
  marques_impression boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 2000),
  valide_par uuid references auth.users (id) on delete set null,
  valide_par_email text,
  valide_le timestamptz,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint profils_impression_public check (not est_public or partenaire_id is null),
  constraint profils_impression_prive check (est_public or partenaire_id is not null),
  constraint profils_impression_validation
    check (statut <> 'VALIDE' or (valide_par_email is not null and valide_le is not null))
);

create unique index profils_impression_public_unique
  on public.profils_impression (support)
  where est_public and statut <> 'ARCHIVE';
create unique index profils_impression_partenaire_unique
  on public.profils_impression (partenaire_id, support)
  where partenaire_id is not null and statut <> 'ARCHIVE';
```

- Un trigger `reinitialiser_validation_profil_impression()` retire la validation dès qu'une
  valeur sensible change (marges, œillets, laize, pagination), sur le modèle de
  `reinitialiser_validation_tarif_grand_format`.
- Seed : un profil public **A_VALIDER** par support, avec des valeurs conservatrices
  (sécurité 50 mm, ourlet 50 mm, œillets 20 mm/500 mm/30 mm, DPI 72/150). Aucun profil n'est
  déclaré `VALIDE` sans acte explicite de Smart Vision.
- Relation avec `partenaires` : `largeur_max_m`/`longueur_max_m`/`types_impression` restent
  l'information d'affectation commerciale ; le profil est la **source des marges, œillets,
  fourreaux et de la pagination**. À la création d'un profil partenaire, l'interface reprend les
  dimensions du partenaire, puis les fige dans le profil (avec contrôle de cohérence). Éviter
  deux vérités : si elles diffèrent, le profil validé fait foi pour le rendu, et l'écart est
  signalé dans le back-office.
- RLS : lecture staff (`admin`, `commercial`, `atelier`, `finance`), écriture `service_role`.
  La route publique lit avec `service_role` et ne renvoie que des champs sûrs.

### 6.2 `visuels_banderole`

```sql
create table public.visuels_banderole (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references public.devis (id) on delete cascade,
  version integer not null check (version >= 1),
  statut text not null default 'RENDU'
    check (statut in ('RENDU','A_REVOIR','ECHEC','ARCHIVE')),
  categorie_modele text check (categorie_modele in (
    'DEUIL','EGLISE','MARIAGE','ANNIVERSAIRE','PUBLICITE','EVENEMENT_CONFERENCE','INSTITUTION')),
  projet jsonb not null check (jsonb_typeof(projet) = 'object'),
  projet_version integer not null check (projet_version >= 1),
  profil_id uuid references public.profils_impression (id) on delete set null,
  profil_version integer,
  contraintes jsonb not null default '{}'::jsonb check (jsonb_typeof(contraintes) = 'object'),
  preflight jsonb not null default '{}'::jsonb check (jsonb_typeof(preflight) = 'object'),
  avertissements jsonb not null default '[]'::jsonb check (jsonb_typeof(avertissements) = 'array'),
  fichier_projet_id uuid references public.fichiers_devis (id) on delete set null,
  fichier_production_id uuid references public.fichiers_devis (id) on delete set null,
  apercu_chemin text,
  checksum_projet text,
  checksum_production text,
  erreur text,
  rendu_le timestamptz,
  cree_par uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  unique (devis_id, version),
  unique (devis_id, id),
  check (octet_length(projet::text) < 1048576)
);
```

- `projet` est le JSON **canonique** validé, pas le fichier client brut.
- `fichier_projet_id` et `fichier_production_id` pointent vers les fichiers serveur `PROPRE`.
- `apercu_chemin` pointe vers le bucket `production` (aperçu JPEG), pas vers `fichiers_devis`.
- `unique (devis_id, id)` permet une clé étrangère composite depuis `demandes_grand_format`.

### 6.3 Pointeur et profil sur `demandes_grand_format`

```sql
alter table public.demandes_grand_format
  add column if not exists visuel_courant_id uuid,
  add column if not exists profil_impression_id uuid references public.profils_impression (id) on delete set null;

alter table public.demandes_grand_format
  add constraint demandes_grand_format_visuel_courant_fk
  foreign key (devis_id, visuel_courant_id)
  references public.visuels_banderole (devis_id, id)
  on delete set null (visuel_courant_id);
```

La liste de colonnes de `ON DELETE SET NULL` est supportée depuis PostgreSQL 15
(`supabase/config.toml` déclare `major_version = 15`) : elle évite de mettre `devis_id` à NULL,
colonne qui est `not null`. Sans cette syntaxe, il faudrait un trigger `BEFORE UPDATE` ou une
clé simple + contrôle applicatif.

La colonne `visuel_courant_id` est nullable : les demandes existantes restent valides et
affichent « aucun visuel Studio ». La clé composite garantit qu'un visuel courant appartient
bien au même devis.

### 6.4 Fichiers et bucket

- Ajouter `application/json` aux types autorisés du bucket `devis` (mise à jour de
  `storage.buckets`, additive) et au mapping MIME de `src/lib/devis/validation.ts` et
  `src/server/storage/supabase.ts`.
- Ajouter une vérification JSON dédiée : taille ≤ 1 Mo, UTF-8 sans BOM, `JSON.parse`, objet,
  schéma `elembo.banner`, version supportée. Ne pas faire passer le JSON par la vérification de
  signature binaire.
- Les fichiers générés par le serveur (PDF, JSON canonique) sont insérés avec
  `verifie = true`, `statut_analyse = 'PROPRE'`, `analyse_moteur = 'elembo-banner'`,
  `checksum` SHA-256 et `type_fichier` :
  - `VISUEL_IMPRESSION` pour le PDF ;
  - `SOURCE` pour le JSON canonique (nom explicite `projet-banner-v1.json`).
- Les sources client restent `SOURCE` / `NON_ANALYSE` ; elles servent au rendu, pas au
  téléchargement public.
- Limite spécifique banderole : **10 fichiers, 25 Mo par image, 80 Mo au total** (à ajuster).
  Le formulaire de devis général conserve 5/50 Mo.

### 6.5 Permissions et RLS

- Ajouter `grand_format.profils` à `src/lib/admin/permissions.ts` : `admin`, `atelier`.
  `grand_format.voir` donne la lecture aux rôles commerciaux/finance.
- `profils_impression` : RLS activée, `select` pour les rôles staff, écriture `service_role`.
- `visuels_banderole` : RLS activée, `select` pour `admin`, `commercial`, `finance`, `atelier`
  (le visuel ne contient ni coût ni marge), écriture `service_role`.
- `demandes_grand_format` : policies existantes inchangées ; la colonne
  `visuel_courant_id` est couverte par la policy de la table.
- Aucune permission `anon` sur les nouvelles tables. La route publique des profils est la seule
  exposition, avec des champs filtrés.

### 6.6 Migration, retour arrière, reprise de données

- Une migration `20261114…_banner_studio.sql` additive ; un rollback
  `…_banner_studio_down.sql` qui supprime les colonnes/tables et rétablit les MIME du bucket.
- Aucun backfill : `visuel_courant_id` et `profil_impression_id` restent null pour les demandes
  existantes.
- Les fichiers restent dans le stockage après un rollback ; le rollback documente leur
  nettoyage manuel.
- Tests SQL : création des profils, validation, unicité public/partenaire, contrainte du
  visuel courant, RLS, cascade devis, copie des fichiers à la commande.

---

## 7. Stratégie de génération des fichiers de production

### 7.1 Artefacts

| Artefact | Où | Format | Rôle |
|---|---|---|---|
| Aperçu basse résolution | bucket `production` | JPEG ≤ 1 600 px, qualité 0,82 | suivi client, back-office, BAT rapide |
| PDF de production | bucket `devis` | PDF 1.7 vectoriel, 1:1 | impression |
| Projet JSON canonique | bucket `devis` | JSON versionné | modification, traçabilité, régénération |
| Sources images | bucket `devis` | JPEG/PNG originaux | régénération, réimpression |
| Fiche de production | bucket `devis` | TXT/JSON | dimensions, finitions, pages, alertes |
| Fichier raster (option) | — | non livré en v1 | à ajouter si un imprimeur l'exige |

Le PDF et le JSON sont des fichiers `fichiers_devis` attachés à la demande ; l'aperçu est un
artefact du visuel, pas un fichier de production. La fiche de production peut être ajoutée en
`FICHE_PRODUCTION` si l'atelier la demande.

### 7.2 Pourquoi un PDF vectoriel

- **Indépendant de la résolution** : le texte et les formes sont vectoriels ; les images sont
  embarquées à leur résolution native. Il n'y a pas de « 150 dpi » arbitraire qui rasterise tout.
- **Fidèle aux dimensions physiques** : la page est en points (1 mm = 72/25,4 pt), avec
  `MediaBox`, `TrimBox`, `BleedBox` et `CropBox`. Un imprimeur peut mesurer le fichier.
- **Polices réellement intégrées** : sous-ensemble embarqué ; pas de substitution silencieuse.
- **Poids maîtrisé** : quelques mégaoctets pour une bannière, contre des centaines de Mo pour un
  PNG à 150 dpi.
- **Adapté aux très grands formats** : pagination/tuilage ou `UserUnit`, selon le profil.

Un PNG haute résolution est **techniquement impossible** pour les grands formats dans un
navigateur : 3 × 1 m à 150 dpi = 17 716 × 5 906 px ≈ 105 Mpx (≈ 420 Mo en RGBA), au-delà des
limites de canvas et de mémoire mobile. 5 × 1 m à 150 dpi = 174 Mpx. Le plafond 4 096 px du
configurateur textile est encore plus loin du compte. La capture d'écran est donc exclue.

### 7.3 Géométrie de page, fond perdu et plis

- Page 1:1, en points, dimensions = surface finie + fond perdu selon le profil.
- `TrimBox` = surface finie ; `BleedBox` = surface + fond perdu ; `MediaBox` = page.
- Fond perdu par défaut 0 ; activable par profil. Le fond (couleur/image) est dessiné sur toute
  la page, y compris le fond perdu ; les éléments de premier plan sont dessinés dans la surface
  finie, avec un débordement contrôlé.
- Ourlets/œillets/fourreaux sont des **guides de conception** : ils ne sont pas imprimés dans le
  PDF. La fiche de production les décrit.
- Si le profil demande que le fichier inclue la matière de l'ourlet, la page est agrandie et le
  `TrimBox` reste la surface finie ; c'est un choix explicite du profil, pas une supposition.

**Limite PDF** : la spécification PDF plafonne une page à 14 400 unités, soit 200 pouces
(5 080 mm) par côté ([PDFTron](https://pdftron.freshdesk.com/support/solutions/articles/35000174586/),
[Datalogics](https://kb.datalogics.com/article/18/how-large-can-a-pdf-document-be-in-inches-101.html)).
Au-delà :

- **mode par défaut : panneaux**. Découper la dimension longue en pages de ≤ 5 000 mm, avec un
  recouvrement de 20 mm, et un plan de pose dans la fiche (numéro de page, offset, recouvrement).
  Les textes à cheval sur un pli sont signalés. C'est la solution la plus compatible avec les
  RIP et les imprimeurs.
- **mode `PAGE_UNIQUE_USERUNIT`** : une seule page avec `/UserUnit` pour les imprimeurs qui le
  supportent (PDF 1.6, page jusqu'à 50,8 m avec UserUnit 10). À n'activer qu'après un test
  d'impression concluant avec l'imprimeur ; certains RIP l'ignorent ou refusent.
  ([callas pdfChip](https://hilfe.callassoftware.com/m/pdfchip/l/818527-very-large-page-sizes-with-userunit),
  [big.faceless.org](https://big.faceless.org/blog/2018/03/22/how_to_create_very_very_large_pages_in_pdf/)).

Pour la première livraison : **panneaux** pour les formats > 5 080 mm, page unique sinon. Le
`UserUnit` est prévu dans le modèle de profil mais implémenté seulement après validation
imprimeur. Un plafond de 12 pages et de 100 m² protège la fonction serveur ; au-delà, la demande
passe en « sur devis » et n'est pas rendue automatiquement.

### 7.4 Polices

- Catalogue de polices **dédié aux banderoles**, avec pour chaque famille les fichiers
  **TTF/OTF statiques** : regular, bold, italic, bold-italic réellement disponibles.
- Les WOFF2 existants restent utilisés pour l'affichage dans le navigateur ; le Studio charge
  une feuille CSS séparée pour les italiques, sans modifier le CSS du configurateur textile.
- Le PDF embarque un **sous-ensemble** de la police avec `pdf-lib` + `@pdf-lib/fontkit`
  (`subset: true`). Si une police ne peut pas être embarquée, le rendu **échoue** avec un
  message clair ; aucune substitution silencieuse.
- **Couverture des glyphes** : vérifier chaque caractère du texte contre la police choisie
  (latin étendu, `ɛ`, `ɔ`, `ŋ`, `œ`, `€`, `—`, apostrophes typographiques). Un glyphe manquant
  est une erreur `POLICE_GLYPHES` avec la liste des caractères ; l'utilisateur change de police
  ou retire le caractère.
- Les polices sont des fichiers locaux versionnés, avec licence OFL/Apache conservée. Pas de
  police système, pas de téléchargement au moment du rendu.
- Les fichiers TTF doivent être inclus dans le bundle des fonctions serveur
  (`outputFileTracingIncludes`) ; un accès à `public/` n'est pas garanti.
- Les polices variables sont évitées : utiliser des instances statiques, plus fiables avec
  fontkit/pdf-lib.

### 7.5 Images et définition

- Import : JPEG, PNG, WEBP (converti en PNG côté navigateur) ; pas de SVG/GIF/HEIC en v1.
  Max 25 Mo, max 50 Mpx, min 200 px ; orientation EXIF normalisée à l'import ; pas d'image
  animée.
- Métadonnées conservées : nom, MIME, largeur/hauteur natives, SHA-256, dimensions après
  orientation.
- DPI effectif = pixels de la zone **recadrée** / taille imprimée en pouces, dans les deux axes,
  on retient le minimum. Le seuil dépend de la distance de lecture :
  - 1 m : 300 dpi recommandé, 150 minimum ;
  - 3 m : 150 recommandé, 72 minimum ;
  - 10 m : 72 recommandé, 30 minimum.
  On combine avec les seuils du profil (`max` des minimums, `max` des recommandés).
- Les images insuffisantes sont **signalées**, pas silencieusement acceptées ; les images
  manquantes bloquent le rendu. Le back-office voit le DPI effectif par image.
- Le PDF embarque l'original (JPEG en DCT, PNG avec alpha) ; l'éditeur travaille sur une copie
  réduite (≤ 2 048 px) pour la fluidité mobile. Aucune double compression inutile.

### 7.6 Couleur

- Le PDF est en **RVB** (l'espace de travail de l'éditeur est sRGB ; le PDF n'embarque pas de
  profil ICC), car `pdf-lib` ne gère pas nativement les profils ICC et la
  conversion colorimétrique CMJN (il sait écrire des couleurs CMJN, mais sans gestion de profil).
  Les imprimeurs grand format convertissent en CMJN ; une dérive est possible, notamment sur
  l'orange de marque.
- Pour la v1 : mention explicite dans la fiche de production (« RVB sRGB — conversion CMJN par
  l'imprimeur ; BAT recommandé ») et test d'impression avec chaque partenaire. Pas de fausse
  promesse « PDF/X ».
- Évolution : PDF/X-4 + profil ICC (ISO Coated v2) via une chaîne dédiée (Ghostscript ou
  service), ou conversion CMJN validée. À ne pas improviser avec une formule RVB→CMJN naïve.

### 7.7 Nommage, stockage, conservation

Noms déterministes (idempotence) :

```
devis/<devisId>/<uuid>-portrait.jpg          (source client)
devis/<devisId>/<uuid>-logo.png              (source client)
devis/<devisId>/<uuid>-projet-source.json    (JSON client)
devis/<devisId>/projet-banner-v1.json        (JSON canonique serveur)
devis/<devisId>/visuel-banner-v1.pdf         (PDF serveur)
production/visuels/<devisId>/apercu-v1.jpg   (aperçu)
```

Le suffixe `-vN` suit `visuels_banderole.version`. Une nouvelle version du visuel (reprise,
changement de finition, changement d'imprimeur) produit des noms `-v2`, `-v3`… et ne réutilise
jamais un nom déjà pris : la contrainte `unique (devis_id, nom)` de `fichiers_devis` l'interdit.
Les versions antérieures restent archivées et téléchargeables pour l'audit.

- Tous les objets sont privés ; URL signées 5 minutes pour le téléchargement, 10 minutes pour
  l'envoi, jamais d'URL publique.
- À la conversion en commande, copier le PDF, le JSON canonique et l'aperçu vers
  `production/<commande>/<uuid>-…`, mettre à jour `fichiers_commande` (chemin, checksum,
  `verifie=true`, `expire_le = now() + 24 months`) et journaliser. Si la copie échoue, la
  commande reste fonctionnelle avec le chemin `devis/` ; une alerte et un bouton « réessayer »
  sont proposés. C'est l'étape qui corrige l'échéance de 90 jours recopiée par la RPC.
- Conservation : 90 jours pour un devis non converti (règle existante), 24 mois pour les
  fichiers de production, 10 ans pour les factures (inchangé). L'aperçu suit le visuel.
- Un job de nettoyage des objets orphelins peut être ajouté ; il ne supprime jamais un objet
  référencé par une commande non clôturée.

### 7.8 Préflight et vérification du PDF

Après génération, le serveur **relit le PDF** avec `pdf-lib` et vérifie :

- nombre de pages attendu ;
- dimensions de `MediaBox`/`TrimBox` à ±0,2 pt ;
- présence des polices embarquées (`FontFile2`/`FontFile3`) ;
- présence des images attendues (XObjects) ;
- absence de repères/guides (le rendu de production ne les dessine jamais) ;
- checksum SHA-256 et taille.

Le préflight métier est enregistré dans `visuels_banderole.preflight` : dimensions, pages,
profil, polices, DPI par image, alertes, plan de pose. La fiche de production en est dérivée.

### 7.9 Tests de production

| Test | Attendu |
|---|---|
| Page 3 × 1 m | 8 503,94 × 2 834,65 pt ±0,2 |
| Page 5 × 1 m | 14 173,23 pt, une page |
| Page 6 × 1 m | 2 panneaux, recouvrement 20 mm, plan de pose |
| Format portrait 0,85 × 2 m | proportions et orientation exactes |
| Fond perdu 10 mm | `TrimBox` = format fini, `BleedBox` = +10 mm |
| Police | `FontFile2` présent, glyphes couverts |
| Image | XObject présent, orientation/recadrage corrects |
| Guides | aucun opérateur de repère dans le flux |
| Deux rendus identiques | même page/tailles/checksum de contenu (hors métadonnées) |
| Format excessif | refus explicite « sur devis », pas de PDF partiel |

Un test avec le **vrai imprimeur** est obligatoire avant validation : dimensions mesurées,
polices, couleurs, œillets, ourlets, plis, sens de lecture. C'est un critère de sortie du lot 5.

---

## 8. Risques techniques

| # | Risque | Impact | Probabilité | Mitigation | Lot |
|---|---|---|---|---|---|
| 1 | PDF > 5,08 m refusé ou mal interprété | production impossible | moyenne | panneaux par défaut ; `UserUnit` seulement après test ; plan de pose | 0/5 |
| 2 | Fidélité éditeur ↔ PDF (texte, images) | BAT différent du tirage | moyenne | layout partagé, lignes explicites, texte dessiné sur mesure, tests de parité | 1/5 |
| 3 | Polices non embarquées / glyphes manquants | texte remplacé ou vide | moyenne | TTF statiques, subset, couverture des glyphes, échec explicite | 0/5 |
| 4 | Couleur RVB → CMJN | dérive de l'orange | élevée | PDF sRGB + mention, BAT, test imprimeur ; PDF/X en évolution | 5 |
| 5 | Limites mémoire/durée Vercel | rendu échoué | moyenne | plafonds pages/Mpx, images ≤ 80 Mo, tests de charge, `maxDuration` | 5 |
| 6 | Contraintes imprimeur mal configurées | zones fausses | moyenne | profils A_VALIDER, validation nominative, snapshot, re-rendu | 6 |
| 7 | Upload/stockage malveillant | XSS/DoS/fuite | moyenne | allowlist MIME, signatures, parsing JSON strict, SHA, pas d'URL externe, bucket privé | 1/5 |
| 8 | Perte des assets locaux | projet incomplet | moyenne | export JSON, message clair, assets serveur après devis | 4 |
| 9 | Reprise multi-appareil impossible | frustration | élevée | assumer la limite, OTP après devis, brouillon anonyme en option | 4/7 |
| 10 | Performance mobile | éditeur inutilisable | moyenne | bitmaps réduits, calques, pas de filtres, tests Android | 2/3 |
| 11 | Passage Studio → devis incohérent | prix/format faux | moyenne | dimensions verrouillées, validation serveur, mapping prestation explicite | 7 |
| 12 | Conservation des fichiers de commande | perte après 90 jours | moyenne | archivage/copie à la conversion, `expire_le` 24 mois, test | 6 |
| 13 | Conflit avec le configurateur textile | régression | faible | aucun import des modules textile ; tests existants conservés | tous |
| 14 | Export statique GitHub Pages | studio cassé | faible | désactiver la route dans ce mode, message clair | 2 |
| 15 | Complexité des templates | contenu de mauvaise qualité | moyenne | 10 modèles revus, validation JSON, noms fictifs, pas de photos tierces | 4 |
| 16 | Dépendances `react-konva`/React | build cassé | faible | Konva impératif ; si `react-konva`, épingler 19.2.x | 0 |

---

## 9. Découpage en lots testables

Chaque lot se termine par une démonstration, des tests automatisés et une revue de code. Les
estimations sont en jours-développeur, hors contenu graphique des modèles (à valider par Smart
Vision).

### Lot 0 — Preuve technique et cadrage (2–3 j)

- **Objectif** : lever les risques avant l'interface.
- **Contenu** : spike Konva (3 × 1 m, texte, image, rotation), spike PDF serveur (3 × 1 m,
  5 × 1 m, 6 × 1 m), test de police TTF embarquée, test de page `UserUnit`/panneaux, mesure
  mémoire/durée, validation avec un imprimeur.
- **Livrables** : note de spike, décisions figées (Konva, pdf-lib, TTF, panneaux), prototype
  jetable non fusionné.
- **Tests** : dimensions PDF au 0,1 mm, police embarquée, image correcte, 6 m en 2 pages,
  ouverture Acrobat/Chrome.
- **Sortie** : aucun blocage technique ; sinon révision du choix avant de coder.

### Lot 1 — Modèle, géométrie, contraintes (4–5 j)

- **Contenu** : `model`, `schema`, `geometry`, `layout`, `constraints`, `quality`, `formats`,
  `categories`, profils types, validateur JSON, tests de propriétés.
- **Livrables** : bibliothèque pure, document de référence, 60+ tests.
- **Tests** : OBB/rotation, hit-test, clamp, zones sûres, œillets (positions/exclusions),
  ourlets/fourreaux, DPI avec recadrage, alertes, versions/migrations, refus des JSON invalides.
- **Sortie** : un document de référence se valide, se layout et produit les alertes attendues.

### Lot 2 — Coquille éditeur et canvas Konva (7–9 j)

- **Contenu** : route `(studio)`, top bar, panneaux, Konva stage, zoom/pan, sélection,
  déplacement, redimensionnement, rotation, calques, undo/redo, raccourcis, autosave
  IndexedDB, layout desktop/mobile.
- **Livrables** : éditeur utilisable pour texte/image/forme de base ; E2E de base.
- **Tests** : créer/déplacer/redimensionner/rotation, undo/redo, rechargement, clavier,
  mobile 390 px sans débordement horizontal, pas d'erreur console.
- **Sortie** : un utilisateur peut composer une bannière simple et la retrouver après refresh.

### Lot 3 — Textes, images, formes, fonds (8–10 j)

- **Contenu** : panneau texte complet (police, corps, couleur, alignement, gras, italique,
  interligne, interlettrage), chargement des polices, import/crop/remplacement d'images, ratio,
  formes et décorations, fond uni/image, alertes DPI, panneau propriétés.
- **Livrables** : édition de contenu complète ; E2E photo + logo + texte stylé.
- **Tests** : styles, polices indisponibles, glyphes, crop, remplacement, DPI, formes, fond,
  persistance/rechargement.
- **Sortie** : tous les besoins de contenu du MVP sont couverts.

### Lot 4 — Modèles, sauvegarde, export JSON, passation (6–8 j)

- **Contenu** : 7 catégories, 10 modèles JSON, galerie, application, variables de modèle,
  projets locaux, export/import JSON, reprise, paquet Studio, route `/banderoles/commander`
  préremplie, verrouillage dimensions/support, pièce jointe du paquet.
- **Livrables** : parcours complet modèle → édition → devis, sans second formulaire.
- **Tests** : chaque catégorie a ≥ 1 modèle valide, application/undo, JSON round-trip, import
  corrompu, paquet, préremplissage, création de devis avec fichiers.
- **Sortie** : un client crée une demande à partir d'un modèle, le devis contient le paquet.

### Lot 5 — Rendu PDF serveur et stockage (8–10 j)

- **Contenu** : rendu `pdf-lib` (texte, images, formes, fond, rotation, opacité), polices TTF
  et subset, fond perdu, `TrimBox`/`BleedBox`, panneaux, préflight, vérification du PDF,
  upload privé, lignes `fichiers_devis` `PROPRE`, `visuels_banderole`, route de finalisation,
  idempotence, erreurs, fiche de production.
- **Livrables** : PDF de production attaché au devis, JSON canonique, aperçu.
- **Tests** : tailles 1×1, 3×1, 5×1, 6×1, portrait, fond perdu, polices, images, guides
  absents, checksum, double rendu, échec explicite.
- **Sortie** : test d'impression réel concluant sur un format standard et un format panneaux.

### Lot 6 — Profils imprimeurs, base, back-office (5–7 j)

- **Contenu** : migration `profils_impression`/`visuels_banderole`, RLS, permissions, route
  publique, écran admin des profils, carte visuel dans la fiche banderole, régénération au
  changement d'imprimeur, archivage à la conversion, tests SQL.
- **Livrables** : contraintes pilotées par la base ; back-office complet.
- **Tests** : validation/invalidation, unicité, RLS, visuel courant, re-rendu, copie commande,
  conservation 24 mois, absence d'accès anon.
- **Sortie** : Smart Vision configure un profil, l'affecte, le visuel est régénéré et alerté.

### Lot 7 — Intégration commerciale, mobile, qualité (6–8 j)

- **Contenu** : prix indicatif dans le Studio (API existante), finition/quantité, suivi client
  avec visuel/aperçu/PDF, reprise, accessibilité, performances, tests de sécurité, E2E complet,
  documentation, runbook de déploiement.
- **Livrables** : parcours de bout en bout, documentation, captures, checklist de mise en
  production.
- **Tests** : scénario complet (modèle → texte → photo → zones → devis → PDF → commande),
  mobile, clavier, lecteur d'écran sur les panneaux, budget de performance, tests d'abus.
- **Sortie** : mise en production contrôlée, avec un imprimeur pilote.

**Total : ≈ 46–60 j** (9–12 semaines pour une personne, 5–6 semaines à deux). MVP conseillé :
lots 0–5 + un minimum des lots 6–7 (profils publics, carte visuel, suivi), soit ≈ 40–53 j
(8–11 semaines pour une personne, 5–6 semaines à deux). Les lots 6–7 complets ajoutent
2–3 semaines.

### Définition de « terminé » (commune)

- `tsc` sans erreur, tests unitaires et SQL verts, E2E du lot vert.
- Aucune régression des 668 tests existants.
- Aucune modification des fichiers du configurateur textile (`src/components/configurator/*`,
  `src/stores/configurator-store.ts`, `src/lib/canvas/*`, `src/types/configurator.ts`,
  `src/lib/products/*`, `src/lib/three/*`).
- Aucun secret, chemin absolu ou donnée personnelle inutile dans les fichiers produits.
- Documentation mise à jour et captures ajoutées.

---

## 10. Décisions à confirmer avant le lot 1

1. **Prestation commerciale** : mapper le Studio sur `FICHIER_PRET` (pas de frais de création
   automatique) ou ajouter une prestation `STUDIO` avec un tarif dédié. Recommandation :
   `FICHIER_PRET` + requalification staff, pour ne pas modifier la grille ni les CHECK.
2. **Plafond self-service** : proposition 12 pages / 100 m² / 20 m de long ; au-delà, devis
   manuel. Les limites commerciales 0,2–50 m restent inchangées.
3. **Couleur** : accepter un PDF RVB/sRGB avec conversion imprimeur et BAT, ou attendre une
   chaîne CMJN/PDF-X. Recommandation : RVB + test imprimeur pour la v1.
4. **Polices** : valider l'ajout de 2–3 familles événementielles (Great Vibes, Cinzel,
   éventuellement Cormorant) et des italiques réelles pour les familles utilisées dans les
   modèles. Vérifier la couverture des caractères locaux.
5. **Aperçu** : JPEG client 1 600 px + SVG de secours, ou génération serveur (rasteriseur
   supplémentaire). Recommandation : JPEG client + SVG pur pour les vignettes, sans rasteriseur
   serveur.
6. **Reprise** : locale avant devis, session/OTP après ; pas de brouillon anonyme
   multi-appareil en v1. Confirmer que c'est acceptable.
7. **Modèles** : 10 modèles (1–2 par catégorie) revus par Smart Vision, noms/lieux fictifs,
   aucune photo tierce, placeholders pour les portraits.
8. **Impression** : désigner un imprimeur pilote pour les tests 3 × 1 m et 6 × 1 m, valider
   panneaux/recouvrement, ourlets, œillets, couleur et sens de lecture.

---

## Annexe A — Références vérifiées

### Code et documentation du dépôt

- Configurateur textile : `src/components/configurator/Configurator.tsx`,
  `src/stores/configurator-store.ts`, `src/lib/canvas/design-canvas.ts`,
  `src/lib/canvas/export.ts`, `src/lib/projects/project-storage.ts`,
  `src/lib/storage/asset-store.ts`, `src/lib/fonts.ts`.
- Parcours banderoles : `src/components/grand-format/CommandeBanderole.tsx`,
  `src/lib/grand-format/catalogue.ts`, `src/lib/grand-format/estimation.ts`,
  `src/server/grand-format/repository.ts`, `src/app/api/banderoles/`.
- Stockage : `supabase/migrations/20261109130005_storage.sql`,
  `src/server/storage/verification.ts`, `src/server/storage/supabase.ts`,
  `src/server/dossiers/dossier.ts`, `docs/fichiers-production.md`.
- Sessions : `src/server/devis/session.ts`, `src/server/devis/otp.ts`,
  `src/server/auth/session.ts`, `src/proxy.ts`.
- Commandes : `supabase/migrations/20261109130008_commandes_cycle.sql`,
  `docs/commandes-cycle.md`, `src/server/grand-format/conversion.ts`.
- Documentation existante : `docs/banderoles-grand-format.md`,
  `docs/integration-configurateur-tshirt.md`, `docs/audit-configurateur-tshirt.md`.

### Références externes

- PDF, limite de page 14 400 unités / 200 pouces :
  [PDFTron](https://pdftron.freshdesk.com/support/solutions/articles/35000174586/),
  [Datalogics](https://kb.datalogics.com/article/18/how-large-can-a-pdf-document-be-in-inches-101.html).
- PDF `/UserUnit` pour les très grandes pages :
  [callas pdfChip](https://hilfe.callassoftware.com/m/pdfchip/l/818527-very-large-page-sizes-with-userunit),
  [big.faceless.org](https://big.faceless.org/blog/2018/03/22/how_to_create_very_very_large_pages_in_pdf/).
- Konva `Transformer` : [konvajs.org](https://konvajs.org/docs/select_and_transform/Transformer.html).
- Fabric `IText` : [fabricjs.com](https://fabricjs.com/docs/classes/IText.html).
- Tailles de bundle : [Konva 10.9.1](https://bundlephobia.com/package/konva@10.9.1),
  [Fabric 7.4.0](https://bundlephobia.com/package/fabric@7.4.0).
- `pdf-lib` : [pdf-lib.js.org](https://pdf-lib.js.org/).
- `react-konva` (compatibilité React) : [npm](https://www.npmjs.com/package/react-konva).

---

## Annexe B — Ce que la première livraison ne fait pas

- Pas de comptes clients, pas de synchronisation multi-appareil avant devis.
- Pas de CMYK/PDF-X, pas de gestion ICC, pas de tons directs.
- Pas de retour à la ligne automatique en continu (commande de coupe explicite).
- Pas de dégradés vectoriels, pas de masques de fusion, pas d'effets Photoshop.
- Pas d'import SVG utilisateur, pas de HEIC, pas de GIF animé.
- Pas de retouche photo (luminosité, contraste, suppression de fond) dans le Studio.
- Pas de collaboration temps réel, pas de commentaires, pas de versions multiples
  simultanées.
- Pas de génération raster 150 dpi ; à ajouter seulement si un imprimeur l'exige.
- Pas de facturation automatique du Studio ; la prestation reste une décision commerciale.

Ces exclusions sont assumées : elles protègent le délai, la qualité de production et la
stabilité du parcours commercial existant.
