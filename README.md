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
- **Livraison** : **100 FCFA** par commande pour Brazzaville comme pour Pointe-Noire — prix de
  test décidé le 06/10/2026 pour les essais de paiement réel (tarifs arbitrés à rétablir :
  Brazzaville 1 000, Pointe-Noire 2 000) ; le délai varie avec la quantité mais **ne dépasse
  jamais 3 jours**. Une ville dont le tarif n'est pas fixé bloque la validation de la commande
  plutôt que d'afficher un montant inventé — les deux sources de prix (application et service
  MoMo) sont comparées par `tests/coherenceCatalogues.test.ts`.
- **Fichiers générés** : un **PNG 300 dpi par face réellement personnalisée** (avant, arrière)
  et une **fiche de production** (`.txt` pour WhatsApp/e-mail + `.json` pour la traçabilité)
  contenant, pour chaque élément : type, contenu, police et corps en cm, couleur, alignement,
  **position du centre en centimètres depuis le coin haut-gauche de la zone**, dimensions en cm,
  rotation, et l'avertissement si l'élément déborde (donc rogné). Un imprimeur peut travailler
  directement avec ça.
- **Paiement** : après validation de l'aperçu, le client paie le montant par **MTN Mobile Money**
  (bouton « Payer … par MTN MoMo »). Le navigateur appelle le service `momo-service/`
  (`POST /api/momo/payer`), puis **sonde le statut** ; les fichiers d'impression et la fiche de
  production ne sont générés **qu'après un `PAYE` confirmé**. Un échec ou un dépassement du délai
  de 5 minutes ne produit aucun fichier.
- **Atelier** : un repli explicite « générer les fichiers sans paiement » reste disponible
  (replié sous le bouton de paiement) pour les essais d'impression.

Adresse du service : variable `NEXT_PUBLIC_MOMO_API_URL` (défaut `http://localhost:8787`). Le
service tourne séparément (voir `momo-service/README.md`) : sans lui, le bouton de paiement
affiche « service injoignable » et le repli atelier reste utilisable.

**Essais de paiement réel entre collègues** — le service doit être joignable depuis les
navigateurs des testeurs, donc exposé publiquement (il tourne sur une machine locale) :

```bash
bash scripts/demarrer-paiement.sh
```

Le script démarre le service en **production** (`momo-service/.env.production`), ouvre un tunnel
`cloudflared`, puis écrit l'adresse obtenue dans `api-config.js` de la branche `gh-pages` et la
pousse. L'application lit cette adresse **à l'exécution** (`public/api-config.js`) : rebrancher la
boutique sur un nouveau service ne demande donc ni rebuild ni redéploiement, seulement cette
écriture. Si l'adresse est absente ou vide, l'application retombe sur la valeur compilée.

L'adresse d'un tunnel rapide change à chaque redémarrage : relancer le script suffit. La machine
qui héberge le service doit rester allumée et éveillée (`caffeinate`, activé par le script).

Le catalogue (prix, frais de livraison) est lu **au démarrage du service** : après un changement
de tarif, il faut donc redémarrer le service pour qu'il facture le nouveau barème — un service
laissé en vie facture l'ancien (cas vécu le 06/10 : site à 200 FCFA, téléphone à 1 100). Le script
le fait systématiquement, et `GET /api/momo/tarifs` renvoie les tarifs réellement appliqués par le
processus en cours (`chargeLe` = date de démarrage) — c'est la vérification à faire avant d'envoyer
le lien : `curl "$URL/api/momo/tarifs"`.

Le champ `priceFcfa` du catalogue porte un **prix de test de 100 FCFA** (décidé le 05/10/2026
pour les essais de paiement réel entre collègues ; le tarif commercial reste à arbitrer), en
attendant le tableau de bord qui le rendra configurable ; si un prix ou des frais de livraison
manquent, la commande est refusée avec le motif affiché plutôt que de facturer un montant inventé.

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

## Tableaux (impression canvas) — phase 1 du catalogue

Le tableau est le premier produit **à formats** : la zone d'impression n'est pas fixe, elle est
recalculée selon le format choisi par le client, et le prix suit ce format.

| Format | Toile seule | Monté sur châssis |
|---|---|---|
| 20 × 30 cm | 5 000 | 7 500 |
| 30 × 40 cm | 7 000 | 11 000 |
| 40 × 60 cm | 10 500 | 17 500 |
| 50 × 70 cm | 13 500 | 23 000 |
| 60 × 90 cm | 19 500 | 33 000 |

Prix en FCFA, TTC. **Barème provisoire** : il est calculé (surface imprimée + montage + préparation,
arrondi au multiple de 500 FCFA supérieur), pas relevé sur le marché. Pour l'ajuster, modifier
`TARIFS` dans `src/lib/products/tableaux.ts` **et** `FORMATS_TABLEAU` dans
`momo-service/src/catalogue.ts` — `tests/coherenceCatalogues.test.ts` échoue si les deux divergent.

- **Remise de quantité par ligne** : 0 % (1), 5 % (2), 10 % (5), 15 % (10 et plus).
- **Conseil de format** : la plateforme calcule la densité de la photo sur chaque format et annonce
  « votre photo convient jusqu'à … », avec un bouton pour basculer directement dessus. Une photo de
  téléphone de 2 Mpx plafonne au 20 × 30 ; en dessous du seuil, la commande est signalée comme à
  risque sans être bloquée.
- **Aperçu à l'échelle** : la photo d'ambiance (`public/mockups/tableau-salon.png`, 1400 × 1400,
  carrée) contient un cadre d'affichage de 48 × 50 % ; `zonePourFormat()` y inscrit le rectangle au
  ratio exact du format. L'image est carrée exprès : dans une image carrée, une fraction de largeur
  et une fraction de hauteur valent la même distance en pixels, donc les ratios calculés sur les
  fractions sont exacts (c'est ce que vérifie `tests/printPhysics.test.ts`).
- **Fichier d'impression** : après paiement, le visuel est régénéré SEUL (sans la pièce) au format
  physique du tableau, à 150 dpi (`src/lib/canvas/exportZone.ts`).
- **Commande** : `produitId: 'tableau'` + `tableaux: [{ formatId, support, quantite }]`. Le service
  recalcule le montant comme pour le textile ; le détail de la commande est conservé dans la
  transaction (`detail`).

## Service de paiement en continu (launchd)

Un agent utilisateur maintient la chaîne debout sans intervention :

```bash
bash scripts/installer-service-paiement.sh     # installe (ou réinstalle) l'agent
launchctl kickstart -k gui/$(id -u)/cg.smartvision.elembo.paiement   # forcer un passage
tail -f ~/.elembo/service-paiement.log         # journal
# désinstaller :
launchctl bootout gui/$(id -u)/cg.smartvision.elembo.paiement
rm ~/Library/LaunchAgents/cg.smartvision.elembo.paiement.plist
```

L'agent se déclenche à l'ouverture de session puis **toutes les 5 minutes**, et
`scripts/service-paiement.sh` fait trois choses — rien de plus si tout va bien :

1. **service** : le relance s'il n'écoute plus sur le port 8787 ;
2. **tunnel** : le recrée si son processus est absent ou si l'adresse ne répond plus — puis
   **republie la nouvelle adresse** dans `api-config.js` sur la branche `gh-pages`. Sans cette
   republication, un tunnel relancé laisserait le site envoyer les paiements dans le vide ;
3. **veille** : empêche la mise en veille (sur secteur uniquement), sinon le tunnel tombe.

**Tout ce que l'agent exécute vit dans `~/.elembo/`** — et c'est une contrainte de macOS, pas un
choix : un agent launchd ne peut pas lire dans `~/Documents` (`Operation not permitted`, TCC
mesuré sur cette machine). L'installateur entretient donc deux copies hors de Documents :

| Chemin | Rôle |
|---|---|
| `~/.elembo/service-paiement.sh` | le superviseur (copie de `scripts/service-paiement.sh`) |
| `~/.elembo/elembo-service/` | le service de paiement en production (copie de `momo-service/`, avec ses `.env.production` et `data/transactions.json`) |
| `~/.elembo/elembo-pages/` | clone de la branche `gh-pages`, utilisé pour republier l'adresse |
| `~/.elembo/tunnel-url.txt` | adresse du tunnel en service (source de vérité locale) |

**Conséquences à connaître** : le registre des transactions de production est
`~/.elembo/elembo-service/data/transactions.json` (le dossier `momo-service/data/` du dépôt ne
reçoit plus que les essais lancés à la main) ; rejouer l'installateur après toute modification du
service ou du superviseur, sinon la copie reste sur l'ancien code.

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
