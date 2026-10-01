# Elembo — MVP Print-on-Demand

> **Uploadez votre design, voyez-le imprimé.** MVP de démonstration style Printful : le créateur uploade un design (PNG/JPG), choisit un produit et voit son design apparaître en direct sur un mockup.

**Live : https://bossygit.github.io/elembo/**

Par Smart Vision Congo (SARLU enregistrée en République du Congo).

## Fonctionnement

- **100 % client-side** : le design reste en mémoire navigateur (ObjectURL), rien n'est stocké ni envoyé.
- **Composition canvas** : photo de mockup en fond + design dessiné dans la zone d'impression prédéfinie (coordonnées normalisées par produit, technique Printful). Mouvement libre par glisser, **clip à la zone** : ce qui dépasse ne s'imprime pas.
- **Produits MVP** : t-shirt, casquette, tableau (canvas).
- **Validation** : PNG/JPG, ≤ 10 Mo, ≥ 500 px (règles pures testées).
- **Ajustements** : échelle 0,5×–1,5×, contain/stretch, réinitialisation, mode debug zone (checkbox « calage »).
- **Export** : téléchargement du mockup rendu en PNG.

## Configurateur 3D — page d'accueil (`/`)

Vue 3D temps réel du produit : on tourne, on zoome, on change la couleur, on compose son
design (images **et textes**) et on le place dans la zone d'impression — le tout **dans le
navigateur**, sans service externe.

```
Images + Textes        ─┐
                        ├─→ Zustand (état unique) ─→ Three.js (affichage)
Canvas 2D (composition) ┘                    └─ texture du panneau / décalque
```

Le texte est un **élément 2D du design**, pas un objet 3D : il est dessiné dans le canvas de
composition (donc il suit le vêtement, tourne avec lui, respecte les UV, et peut être
reconstruit en haute résolution pour l'impression). Aucun mesh supplémentaire n'est créé.

- `src/types/configurator.ts` — types partagés (`DesignElement` = `ImageElement | TextElement`, `ConfiguratorConfig`)
- `src/stores/configurator-store.ts` — état unique + actions (ajout, sélection, calques, faces…) + `serializeConfig()`
- `src/lib/products/catalog.ts` — catalogue (modèle GLB, technique d'impression, couleurs, zones)
- `src/lib/fonts.ts` + `src/lib/fonts.generated.ts` — 17 polices (licence vérifiée) et utilitaires typographiques
- `src/lib/canvas/{design-canvas,export}.ts` — maths de placement/borne, composition des éléments, export 300 dpi
- `src/lib/three/{models,materials,textures}.ts` — nœuds, matériaux PBR, textures (dont l'albédo neutralisé)
- `src/lib/three/framing.ts` — cadrage automatique de la caméra sur le modèle réel
- `src/components/configurator/*` — viewer 3D, éditeur 2D, panneau Design, contrôles d'élément,
  sélecteur de police, sélecteur de couleur
- `src/app/page.tsx` — configurateur 3D (page d'accueil) ; `src/app/studio/page.tsx` — studio 2D ;
  `src/app/configurator/page.tsx` — redirection depuis l'ancienne URL

Le studio 2D reste disponible sur `/studio` (aucune fonctionnalité supprimée) ; les deux
partagent `src/lib/validate.ts` et `src/lib/printQuality.ts`.

### Éditeur de design (images + textes)

- **Ajouter** : « Ajouter une image » (upload validé) ou « Ajouter du texte ».
- **Éléments indépendants** : chacun a sa position, son échelle, sa rotation, sa face et son
  calque ; plusieurs textes et plusieurs images cohabitent (« LOGO » + « CONGO » + « 2026 »).
- **Texte** : contenu multiligne, police, taille, couleur (palette + sélecteur libre + code
  hexadécimal), graisse, italique, alignement, interlettrage, hauteur de ligne.
- **Sélection** : clic dans l'aperçu 2D, glisser pour déplacer, poignées orange pour
  redimensionner et pivoter, flèches du clavier pour affiner, `Suppr` pour retirer.
- **Calques** : liste des éléments de la face courante — sélection, visibilité, ordre
  d'empilement (`z`), suppression. Le champ `z` est déjà en place pour un futur glisser-déposer.
- **Faces** : chaque élément porte sa face ; l'aperçu 2D et la texture 3D ne composent que la
  face affichée, donc avant et arrière ne se mélangent jamais.
- **Zone d'impression** : un élément trop grand est signalé et peut être ramené à la taille
  utile en un clic (« Ajuster à la zone »), avec une marge de sécurité.
- **Impression** : le fichier 300 dpi est **recomposé** à partir des paramètres du design
  (le texte est redessiné à la résolution cible, les images repartent de l'original).

### Commande et production

Le tunnel de commande transforme un design validé en **dossier de production** :

- **Validation** : aperçu de chaque face personnalisée (ce que le client voit est ce qui sera
  imprimé), tailles et quantités, ville de livraison, récapitulatif FCFA.
- **Livraison** : Brazzaville 1 000 FCFA ; le délai varie avec la quantité mais **ne dépasse
  jamais 3 jours**. Pointe-Noire est volontairement « à confirmer » tant que le tarif n'est pas
  arbitré — la commande refuse de valider plutôt que d'afficher un montant inventé.
- **Fichiers générés** : un **PNG 300 dpi par face réellement personnalisée** (avant, arrière)
  et une **fiche de production** (`.txt` pour WhatsApp/e-mail + `.json` pour la traçabilité)
  contenant, pour chaque élément : type, contenu, police et corps en cm, couleur, alignement,
  **position du centre en centimètres depuis le coin haut-gauche de la zone**, dimensions en cm,
  rotation, et l'avertissement si l'élément déborde (donc rogné). Un imprimeur peut travailler
  directement avec ça.
- **Paiement** : montant en FCFA à encaisser par **MTN Mobile Money** ; l'intégration MoMo
  (clés Collections déjà obtenues, 3 routes serveur à mettre en place) est décrite dans
  `docs/momo-mtn-integration.md`.

Le champ `priceFcfa` du catalogue est vide : la validation est bloquée tant que le prix
unitaire n'est pas défini, avec le motif affiché au client.

### Polices

17 familles classées par usage (sans serif, display, script, serif), **toutes sous licence
libre permettant l'usage commercial** (16 en OFL-1.1, 1 en Apache-2.0) : la licence de chaque
police est vérifiée sur le dépôt officiel `google/fonts` par le script de récupération et
consignée dans `src/lib/fonts.generated.ts`.

```bash
node scripts/fetch-fonts.mjs      # télécharge public/fonts/*.woff2 + fonts.css (idempotent)
```

Les fichiers sont **locaux** (aucune requête vers Google au chargement, build reproductible
hors ligne) et le navigateur ne télécharge une police que lorsqu'elle est réellement utilisée.
Le CSS est référencé en chemin relatif, donc valable sous n'importe quel `basePath`.

### Modèle 3D et impression

Le catalogue contient **deux T-shirts 3D**, interchangeables depuis le sélecteur de
produit (le visuel et le réglage sont conservés d'un modèle à l'autre) :

- `public/models/tshirt/tshirt.glb` — T-shirt raglan fournisseur (29 678 triangles,
  textures PBR 4k, 1 unité = 1 pouce), rendu en **surface vierge** : son auteur y a
  gravé un imprimé « RUN » (dans l'albédo *et* dans la texture de normales), donc
  aucune de ses textures n'est utilisée — le T-shirt est uniforme, à la couleur exacte
  choisie (option `surface: 'blank'` du catalogue) ;
- `public/models/tshirt-alt/tshirt.glb` — T-shirt col rond (237 940 triangles, maillages
  séparés avant/arrière, sans textures donc teinté exactement, 1 unité = 1 mètre).

Le champ `surface` du catalogue décide de l'apport du fournisseur : `vendor` (textures
PBR conservées, albédo neutralisé), `flat-albedo` (albédo ignoré, relief conservé) ou
`blank` (aucune texture — à utiliser dès qu'un imprimé d'auteur est gravé dans le
relief). Pour trancher : extraire les textures et les regarder.

```bash
node scripts/extract-glb-texture.mjs "modele.glb" texture.png baseColor   # albédo
node scripts/extract-glb-texture.mjs "modele.glb" relief.png normal       # normales
node scripts/glb-meshes.mjs  "modele.glb"        # un maillage par ligne (parent, UV, taille)
node scripts/decal-frame.mjs "modele.glb" 100 21 30 7  # cadre d'impression (unité cm, 21×30 cm, 7 cm sous le col)
```

Les deux ont un maillage sans zone d'impression réservée : le visuel est **projeté sur la
surface** (technique `decal`) dans un cadre exprimé en unités du modèle et déduit du
maillage avec :

```bash
node scripts/inspect-glb.mjs "chemin/vers/modele.glb"        # dimensions, UV, profondeur de surface
node scripts/glb-meshes.mjs  "chemin/vers/modele.glb"        # un maillage par ligne (parent, UV, taille)
node scripts/decal-frame.mjs "chemin/vers/modele.glb" 100 21 30 7  # cadre d'impression (unité cm, 21×30 cm, 7 cm sous le col)
```

La technique `uv` (nœuds `FrontPanel` / `BackPanel` / `Body`) reste supportée pour des
modèles qui réserveraient une zone d'impression ; le placeholder
`tshirt-placeholder.glb` (`node scripts/gen-tshirt-glb.mjs`) l'exerce et sert aux tests.
Détails et procédure d'ajout d'un modèle : `public/models/README.md`.

## Développement

```bash
npm install --include=dev   # cette machine omet les devDependencies par défaut (npm config omit=dev)
npm test                    # vitest — 100 tests (zones, bornes, cadrage, store, catalogue)
npm run lint
npm run build
npm run dev                 # http://localhost:3000  ·  /  (configurateur 3D)  ·  /studio  (studio 2D)
```

## Déploiement

GitHub Pages (export statique + basePath `/elembo`) :

```bash
bash scripts/deploy-gh-pages.sh
```

`DEPLOY_TARGET=gh-pages npm run build` produit `out/` → copié dans `../elembo-pages` (branche `gh-pages`, `.nojekyll` inclus) → push forcé. Sans `DEPLOY_TARGET`, le build standard reste Vercel-ready.

**Pièges intégrés (trouvés en E2E)** :
- `NEXT_PUBLIC_BASE_PATH` préfixe les chemins `public/` dans `src/lib/products.ts` — sans lui, les mockups résolvent en 404 sous Pages et le canvas reste vide (catch silencieux). Idem pour le GLB via `resolveModelUrl()`.
- Les handlers pointer doivent être passés en props jusqu'à l'élément `<canvas>` — des handlers définis dans Studio mais non câblés sont du code mort silencieux.
- **glTF : les index doivent être de type `SCALAR`.** Écrits en `VEC1`, le loader construit une géométrie sans index, la scène se charge sans erreur et… le modèle est invisible (aucun pixel rendu). `scripts/gen-tshirt-glb.mjs` refuse désormais d'écrire un GLB non conforme.
- **Ne jamais multiplier couleur × texture sur un panneau imprimé** : la couleur du vêtement est composée dans la texture (albédo) et le matériau du panneau reste blanc, sinon un T-shirt noir rend le visuel noir. Le matériau garde roughness/metalness/normalMap par clone.
- La caméra ne doit réorienter le produit **que** sur demande (changement de face ou vue initiale) ; un lissage permanent annule la rotation et le zoom de l'utilisateur.

## Limites du MVP (suite prévue)

- Modèle 3D placeholder : remplacer par un vrai T-shirt (UV correctes, textures PBR) dans `public/models/tshirt/`
- Rendu réaliste à venir : HDR d'environnement local (`public/hdri/`), normal/roughness maps, ombres douces affinées
- Pas de persistance des designs (Vercel Blob/Supabase en phase 2) ni de catalogue multi-produits (hoodie, tote bag… : ajout par le seul catalogue)
- Pas de paiement (MTN MoMo / Airtel Money) ni de BAT WhatsApp
- Photos de mockups du studio 2D placeholders (aplats, générées par `scripts/gen-mockups.mjs`) à remplacer par les visuels réels (presse VEVOR)
- Pas de galerie de designs ni de comptes créateurs
