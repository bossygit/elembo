# Elembo — plateforme commerciale de Smart Vision Congo

> **Personnalisation textile, impression graphique et communication visuelle.** Elembo réunit
> la vitrine publique, le configurateur 3D, le tunnel de paiement MTN MoMo et le dossier de
> production de l’atelier. Les évolutions de la plateforme sont planifiées dans
> [`docs/plan-implementation.md`](docs/plan-implementation.md) ; l’état réel est décrit dans
> [`docs/audit-phase1.md`](docs/audit-phase1.md).

**Live : https://elembo.vercel.app**

Par Smart Vision Congo (SARLU enregistrée en République du Congo).

## Boutique publique

| Page | Rôle |
|---|---|
| `/` | accueil commercial : promesse, familles, produits, processus, CTA |
| `/boutique` | catalogue unifié (textile, tableaux, impression, services) |
| `/personnalisation` | configurateur 3D cinq zones, éditeur, panier local et tunnel textile |
| `/panier` | panier et créations enregistrées sur l'appareil |
| `/impression` | flyers, affiches, cartes, menus, brochures, documents |
| `/entreprises` | offre B2B, identité visuelle, textiles en quantité, événements |
| `/comment-ca-marche` | parcours, paiement, livraison, FAQ |
| `/contact` | email atelier, préparation d’un devis |
| `/tableau` | studio 2D prépositionné sur le tableau canvas |
| `/studio` | studio 2D historique (outil de composition) |

**Règle de prix** : un produit dont le prix n’est pas `valide` dans `tarifs/grille.json`
affiche « Prix sur demande » et le paiement en ligne est fermé. La règle est appliquée **côté
serveur** : un appel direct à `/api/momo/payer` est refusé (`422`) tant que le prix est `test`
ou `provisoire`, sauf dérogation explicite `MOMO_ALLOW_TEST_PRICES=1`. Pour rouvrir le bouton
dans un environnement de recette, poser aussi `NEXT_PUBLIC_PAIEMENT_TEST=1` — jamais en
production publique.

## Base de données (cible Supabase)

Le schéma commercial, les relations, la RLS et le plan d'intégration sont décrits dans
[`docs/supabase-architecture.md`](docs/supabase-architecture.md). Les migrations versionnées
sont dans `supabase/migrations/` : 0001 → 0007 sont appliquées sur `elembo-staging` depuis le
2026-11-09. Les migrations 0008 (cycle des commandes) et 0009 (commandes MTN directes) sont locales et n’ont pas été appliquées à distance. Le
fichier [`supabase/README.md`](supabase/README.md) décrit la mise en service, les variables et
les tests RLS.

### Commandes MTN MoMo et Supabase

Le tunnel direct du configurateur crée la commande dans Supabase **avant** l'appel à MTN : la
référence `ELB-…`, le client, les lignes, les quantités et le montant y sont enregistrés. Le
paiement est ensuite synchronisé depuis le suivi de statut, le callback MTN et la réconciliation.
Le paiement confirmé passe la commande `PAYEE`, mais la production reste `A_FAIRE` jusqu'à la
prise en charge par l'atelier.

L'écriture est conditionnée à la présence de `NEXT_PUBLIC_SUPABASE_URL` et
`SUPABASE_SERVICE_ROLE_KEY` dans l'environnement serveur. Sans ces variables, le tunnel MTN
historique continue de fonctionner sans persistance Supabase. Avec elles, la migration
`20261109130009_commandes_momo.sql` doit être appliquée à la base cible avant le premier paiement.
Les secrets ne sont jamais exposés au navigateur.

Sécurité des rôles et opérations `service_role` :
[`docs/supabase-securite.md`](docs/supabase-securite.md). Robustesse des paiements :
[`docs/paiements-robustesse.md`](docs/paiements-robustesse.md). Vérification des fichiers et
conservation : [`docs/fichiers-production.md`](docs/fichiers-production.md). Procédure de
connexion et de validation sur le projet staging :
[`docs/supabase-staging.md`](docs/supabase-staging.md). Parcours devis, sessions et back-office :
[`docs/devis-lot-2.2.md`](docs/devis-lot-2.2.md).

Principe : Postgres/Supabase est la référence commerciale ; Redis reste le journal rapide des
paiements. Le navigateur ne parle pas directement aux tables métier : les écritures passent par
les routes serveur, avec `service_role` côté serveur uniquement.

## Fonctionnement

- **Composition côté navigateur** : le design reste en mémoire (ObjectURL) tant que le client
  n'a pas commandé. Il n'est envoyé qu'après un paiement confirmé, vers l'archive privée des
  dossiers de production (`dossiers/<commande>/`) — jamais dans un stockage public.
- **Composition canvas** : photo de mockup en fond + design dessiné dans la zone d'impression prédéfinie (coordonnées normalisées par produit, technique Printful). Mouvement libre par glisser, **clip à la zone** : ce qui dépasse ne s'imprime pas.
- **Produits du studio 2D** : t-shirt, casquette (démonstration uniquement, non vendable) et tableau (canvas).
- **Validation** : PNG/JPG, ≤ 10 Mo, ≥ 500 px (règles pures testées).
- **Ajustements** : échelle 0,5×–1,5×, contain/stretch, réinitialisation, mode debug zone (checkbox « calage »).
- **Export** : téléchargement du mockup rendu en PNG.

## Configurateur 3D — studio de personnalisation (`/personnalisation`)

Le configurateur vit sur **`/personnalisation`** (l'ancienne URL `/configurator` redirige).
Vue 3D temps réel du **T-shirt Elembo à cinq zones** : on tourne, on zoome, on change la couleur
du tissu, on compose des images **et** des textes sur chacune des cinq zones (avant, dos, manche
gauche, manche droite, intérieur du col) — le tout **dans le navigateur**, sans service externe.
Les techniques historiques `uv` et `decal` restent supportées pour les autres produits du
catalogue (voir plus bas), et le studio 2D reste disponible sur `/studio`.

Le studio est décrit de bout en bout — architecture, zones, éditeur, profils, persistance,
export, tests — dans [`docs/integration-configurateur-tshirt.md`](docs/integration-configurateur-tshirt.md).
L'état d'avant intervention est figé dans [`docs/audit-configurateur-tshirt.md`](docs/audit-configurateur-tshirt.md).

```
Gestes + panneau (calques, couleur, procédé)   ─┐
                                                ├─→ Zustand (état unique) ─→ CanvasTexture par zone ─→ Three.js
Canvas 2D (composition, drawComposition) ───────┘        └──────────────→ PNG de production (dpi du procédé)
```

Le texte est un **élément 2D du design**, pas un objet 3D : il est dessiné dans le canvas de
composition (donc il suit le vêtement, tourne avec lui, respecte les UV, et peut être
reconstruit en haute résolution pour l'impression). Aucun mesh supplémentaire n'est créé.

- `src/types/configurator.ts` — types partagés (5 zones, `DesignElement`, `ConfiguratorConfig` v3)
- `src/stores/configurator-store.ts` — état unique + actions + historique annuler/rétablir + `serializeConfig()` v3
- `src/lib/products/catalog.ts` — catalogue (modèle GLB, technique, zones, couleurs, `vue` par zone) ;
  `src/lib/products/production.ts` — procédés et dimensions imprimables (`production/profils.json`)
- `src/lib/fonts.ts` + `src/lib/fonts.generated.ts` — 17 polices (licence vérifiée) et utilitaires typographiques
- `src/lib/canvas/{design-canvas,export}.ts` — maths de placement/borne, composition des éléments,
  export PNG à la densité du procédé (garde-fou 4 096 px)
- `src/lib/three/{models,materials,textures,zones,framing}.ts` — nœuds, matériaux PBR, textures par zone,
  scène à surfaces d'impression, cadrage automatique de la caméra
- `src/lib/order/order.ts` — positionnement en centimètres et fiche de production v2
- `src/lib/projects/` + `src/lib/storage/` — brouillon, créations et panier (`localStorage`), images (`IndexedDB`)
- `src/components/configurator/*` — viewer 3D, éditeur de zone, rail de zones, sélecteur de procédé,
  contrôles d'élément, commande, export, historique
- `src/components/cart/Panier.tsx` — panier et créations ; `src/app/panier/page.tsx` — page `/panier`
- `src/app/personnalisation/page.tsx` — page du studio ; `src/app/studio/page.tsx` — studio 2D ;
  `src/app/configurator/page.tsx` — redirection depuis l'ancienne URL

Le studio 2D reste disponible sur `/studio` (aucune fonctionnalité supprimée) ; les deux
partagent `src/lib/validate.ts` et `src/lib/printQuality.ts`.

### Éditeur de design (images + textes, cinq zones)

- **Cinq zones indépendantes** : chaque élément porte sa zone ; changer de zone ne recharge rien,
  les visuels des autres zones sont conservés. Le rail de zones affiche une vignette réelle de
  chaque zone, le nombre d'éléments et le statut de production.
- **Ajouter** : « Ajouter une image » (upload validé : PNG/JPG, ≤ 10 Mo, ≥ 500 px, transparence
  conservée) ou « Ajouter du texte ».
- **Éléments indépendants** : chacun a sa position, son échelle, sa rotation, sa zone et son
  calque ; plusieurs textes et plusieurs images cohabitent (« LOGO » + « CONGO » + « 2026 »).
- **Texte** : contenu multiligne, police, taille, couleur (palette + sélecteur libre + code
  hexadécimal), graisse, italique, alignement, interlettrage, hauteur de ligne.
- **Gestes souris et tactiles** : clic dans l'éditeur 2D pour sélectionner, glisser pour déplacer,
  poignées orange pour redimensionner et pivoter, flèches du clavier pour affiner, `Suppr` pour
  retirer, `Ctrl+D` pour dupliquer.
- **Annuler / rétablir** : `Ctrl+Z` / `Ctrl+Shift+Z` (ou boutons), avec fusion des gestes continus —
  un glisser ou un curseur = un seul « annuler ».
- **Calques** : liste des éléments de la zone active — sélection, visibilité, ordre d'empilement
  (`z`), duplication, suppression.
- **Zone d'impression** : un élément trop grand est signalé et peut être ramené à la taille utile
  en un clic (« Ajuster à la zone »), avec une marge de sécurité ; rien ne peut sortir de la zone
  réellement imprimable du procédé choisi.
- **Impression** : le fichier est **recomposé** à partir des paramètres du design (le texte est
  redessiné à la résolution cible, les images repartent de l'original), jamais une capture d'écran.

### Commande et production

Le tunnel de commande transforme un design validé en **dossier de production** :

- **Validation** : aperçu de chaque zone personnalisée (ce que le client voit est ce qui sera
  imprimé), tailles et quantités, ville de livraison, récapitulatif FCFA.
- **Procédé de production** : le procédé est choisi dans le studio (DTF, flex, DTG, sublimation)
  et pilote les dimensions réellement imprimables et la densité des fichiers, lues dans
  **`production/profils.json`**. Un procédé ou une zone encore **non validés par l'atelier**
  (`a-valider`) restent composables mais **bloquent la commande**, avec le motif affiché ; un
  procédé `indisponible` ne peut pas être commandé. Aucune zone non fabricable n'est encaissée.
- **Livraison** : **100 FCFA** par commande pour Brazzaville comme pour Pointe-Noire — prix de
  test décidé le 06/10/2026 pour les essais de paiement réel (tarifs arbitrés à rétablir :
  Brazzaville 1 000, Pointe-Noire 2 000) ; le délai varie avec la quantité mais **ne dépasse
  jamais 3 jours**. Une ville dont le tarif n'est pas fixé bloque la validation de la commande
  plutôt que d'afficher un montant inventé — les deux sources de prix (application et service
  MoMo) sont comparées par `tests/coherenceCatalogues.test.ts`.
- **Fichiers générés** : un **PNG transparent par zone réellement personnalisée**, à la densité
  du procédé (300 dpi en DTF, 150 dpi en sublimation) et à la taille physique de la zone, nommé
  exactement `front.png`, `back.png`, `left-sleeve.png`, `right-sleeve.png`, `collar.png` ; plus
  une **fiche de production** (`.txt` pour WhatsApp/e-mail + `.json` pour la traçabilité)
  contenant le procédé et son `dpi`, et pour chaque élément : type, contenu, police et corps en
  cm, couleur, alignement, **position du centre en centimètres depuis le coin haut-gauche de la
  zone**, dimensions en cm, rotation, et l'avertissement si l'élément déborde (donc rogné). Un
  imprimeur peut travailler directement avec ça.
- **Panier et reprise** : le brouillon est sauvegardé sur l'appareil, les créations peuvent être
  enregistrées et mises au panier (page `/panier`), puis rouvertes dans le studio avec leurs
  cinq zones et leurs images. Le paiement MTN reste **mono-création** : une création à la fois,
  le tunnel de paiement existant n'ayant pas été modifié.
- **Paiement** : après validation de l'aperçu, le client paie le montant par **MTN Mobile Money**
  (bouton « Payer … par MTN MoMo »). Le navigateur appelle `POST /api/momo/payer` — une route de
  **la même application** — puis **sonde le statut** ; les fichiers d'impression et la fiche de
  production ne sont générés **qu'après un `PAYE` confirmé**. Un échec ou un dépassement du délai
  de 5 minutes ne produit aucun fichier. Le dossier (PNG + fiche) est ensuite **déposé côté
  serveur** : il ne dépend plus du navigateur du client ni de sa connexion au moment de la
  confirmation (voir ci-dessous). **Depuis le 9/11/2026, ce bouton n'apparaît que pour un prix
  commercial `valide`** ; le serveur refuse de son côté tout prix `test` ou `provisoire`.
- **Atelier** : un repli explicite « générer les fichiers sans paiement » reste disponible
  (replié sous le bouton de paiement) pour les essais d'impression.

**Où tourne le paiement** : dans l'application elle-même — `src/server/momo/`, exposé par les routes
`src/app/api/momo/*`, hébergé sur **Vercel**. Plus de service séparé, plus de tunnel Cloudflare,
plus de Mac à laisser allumé : le site et l'encaissement partagent le même domaine, donc plus de
CORS obligatoire ni d'adresse à republier. L'état des transactions vit dans **Redis** (intégration Redis de Vercel,
variable `REDIS_URL` ; l'API REST Upstash/Vercel KV reste supportée), parce qu'une fonction
serverless n'a pas de disque ; **sans journal, le service refuse d'encaisser** (`503`, aucun appel
à MTN). `GET /api/sante` exécute un `PING` réel : un déploiement vert ne peut pas masquer une base
injoignable. Mise en service détaillée : [`docs/vercel.md`](docs/vercel.md).

**Le dossier de production ne reste pas dans le navigateur** — c'était le trou : un client qui
fermait la page après avoir payé laissait une commande encaissée sans visuel pour l'atelier. Après
`PAYE`, l'écran envoie les PNG et les fiches vers une **archive privée** (Vercel Blob, `dossiers/<commande>/`)
via une URL signée délivrée par `POST /api/commandes/<commande>/upload` — délivrée **uniquement si
la transaction est `PAYE`** — puis enregistre les métadonnées par `POST /api/commandes/<commande>/fichiers`,
qui prévient l'atelier (Telegram) et reste idempotent. L'atelier relit et télécharge par les routes
`/api/commandes/<commande>/fichiers…` protégées par `ATELIER_TOKEN` ; l'URL de l'archive n'est jamais
exposée au navigateur. Envoi direct navigateur → archive, donc un visuel de 15 Mo ne bute pas sur la
limite de 4,5 Mo d'une fonction Vercel. Si l'envoi échoue, l'écran le dit et invite à transmettre les
fichiers par WhatsApp avec la référence — jamais de faux succès. Détail et preuves :
[`docs/vercel.md`](docs/vercel.md#6-dossier-de-production--du-paiement-à-latelier).

Prix : lus dans **`tarifs/grille.json`**, la source unique, importée à la compilation par
l'application comme par le calcul du montant. Plus de service à redémarrer après un changement de
barème : un redéploiement suffit. `GET /api/momo/tarifs` renvoie les tarifs réellement appliqués par
l'instance en cours (`chargeLe` = son démarrage) — c'est la vérification à faire avant d'envoyer un
lien de paiement.


Le champ `priceFcfa` du catalogue porte un **prix de test de 100 FCFA** (décidé le 05/10/2026
pour les essais de paiement réel entre collègues ; le tarif commercial reste à arbitrer), en
attendant le tableau de bord qui le rendra configurable ; si un prix ou des frais de livraison
manquent, la commande est refusée avec le motif affiché plutôt que de facturer un montant inventé.
Le statut `test` de ce prix est explicite dans `tarifs/grille.json` : il ferme le paiement en
ligne et l'affichage public du montant.

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

Le **modèle par défaut** est le T-shirt Elembo à cinq zones
`public/models/elembo-tshirt/elembo-tshirt.glb` (2,4 Mo, 40 600 triangles, unités en mètres,
`+Z` devant) : cinq surfaces d'impression indépendantes — avant, dos, manche gauche, manche
droite, intérieur du col — chacune avec son maillage, son matériau `PRINT_*` et ses UV propres.
La couleur est portée par les seuls matériaux du tissu (`FABRIC`, `FABRIC_RIB`) ; les visuels
sont composés dans une texture transparente par zone, jamais teintée. Les dimensions
**imprimables** viennent de `production/profils.json` (DTF : 21 × 30 cm devant, 25 × 32,4 cm au
dos, 9 × 9 cm sur les manches, 8 × 4,5 cm au col), pas des textures 3D.

Deux anciens T-shirts fournisseur restent disponibles pour les techniques historiques
(`uv` et `decal`), interchangeables depuis le sélecteur de produit :

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

Ces deux modèles ont un maillage sans zone d'impression réservée : le visuel est **projeté sur la
surface** (technique `decal`) dans un cadre exprimé en unités du modèle et déduit du maillage
avec :

```bash
node scripts/inspect-glb.mjs "chemin/vers/modele.glb"        # dimensions, UV, profondeur de surface
node scripts/glb-meshes.mjs  "chemin/vers/modele.glb"        # un maillage par ligne (parent, UV, taille)
node scripts/decal-frame.mjs "chemin/vers/modele.glb" 100 21 30 7  # cadre d'impression (unité cm, 21×30 cm, 7 cm sous le col)
```

La technique `uv` (nœuds `FrontPanel` / `BackPanel` / `Body`) reste supportée pour des
modèles qui réserveraient une zone d'impression ; le placeholder
`tshirt-placeholder.glb` (`node scripts/gen-tshirt-glb.mjs`) l'exerce et sert aux tests.
Les trois techniques sont décrites dans `public/models/README.md` ; l'intégration complète du
modèle Elembo (architecture, zones, export, tests) dans
[`docs/integration-configurateur-tshirt.md`](docs/integration-configurateur-tshirt.md).
Scripts utiles : `node scripts/glb-zones.mjs` (noms et dimensions réelles du GLB Elembo),
`node scripts/prepare-zone-templates.mjs` (gabarits d'éditeur publiés dans `public/zones/`).

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
`tarifs/grille.json` (les deux moteurs — application et calcul du montant côté serveur — en
dérivent ; `tests/coherenceCatalogues.test.ts` échoue s'ils divergent).

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

## Ancien service de paiement local (archive)

Jusqu'au 26/10/2026, le paiement tournait dans un processus séparé (`momo-service/`) sur le MacBook,
exposé par un **tunnel Cloudflare** dont l'adresse changeait à chaque redémarrage, avec un agent
`launchd` qui relançait service et tunnel toutes les 5 minutes et republiait l'adresse sur la
branche `gh-pages` (`scripts/service-paiement.sh`, `scripts/installer-service-paiement.sh`,
`scripts/demarrer-paiement.sh`).

Cette chaîne n'est **plus utilisée** : le service est désormais dans l'application, sur Vercel
(`docs/vercel.md`). Les scripts et `momo-service/` restent dans le dépôt à titre d'archive, le temps
que la production Vercel ait encaissé un vrai paiement. Pour arrêter l'agent local :

```bash
launchctl bootout gui/$(id -u)/cg.smartvision.elembo.paiement
rm ~/Library/LaunchAgents/cg.smartvision.elembo.paiement.plist
```

Le registre historique des transactions de production reste dans
`~/.elembo/elembo-service/data/transactions.json` — à conserver (il contient la trace des
encaissements réels faits par le tunnel), mais il n'est plus alimenté.

## Développement

```bash
npm install --include=dev   # cette machine omet les devDependencies par défaut (npm config omit=dev)
npm test                    # vitest — 428 tests passés, 32 ignorés sans projet Supabase de test (intégrations)
npm run lint
npm run build
npm run dev                 # http://localhost:3000  ·  / (boutique)  ·  /personnalisation (configurateur 3D)  ·  /studio (studio 2D)
```

## Déploiement

**Production : Vercel** (site + routes de paiement dans le même projet Next.js).

```bash
# une fois : importer le dépôt dans Vercel, créer l'intégration Upstash Redis,
# puis renseigner les variables de .env.example (voir docs/vercel.md)
vercel            # aperçu (Preview) — penser à MOMO_MOCK=1 en Preview
vercel --prod     # production
```

`vercel.json` fixe la région `cdg1` (Paris, plus proche du Congo que le défaut américain). Les
routes `/api/momo/*` déclarent `maxDuration = 30` : MTN peut être lent, et le défaut de 10 s coupe
un `requesttopay` un peu chargé.

**Ancien déploiement : GitHub Pages** (archive, ne reçoit plus de paiements).

```bash
bash scripts/deploy-gh-pages.sh
```

`DEPLOY_TARGET=gh-pages npm run build` produit `out/` → copié dans `../elembo-pages` (branche `gh-pages`, `.nojekyll` inclus) → push forcé. Ce mode n'a **pas** de routes API : les boutons de paiement y échouent. Il ne sert plus qu'à garder une trace du site statique.

**Pièges intégrés (trouvés en E2E)** :
- `NEXT_PUBLIC_BASE_PATH` préfixe les chemins `public/` dans `src/lib/products.ts` — sans lui, les mockups résolvent en 404 sous Pages et le canvas reste vide (catch silencieux). Idem pour le GLB via `resolveModelUrl()`.
- Les handlers pointer doivent être passés en props jusqu'à l'élément `<canvas>` — des handlers définis dans Studio mais non câblés sont du code mort silencieux.
- **glTF : les index doivent être de type `SCALAR`.** Écrits en `VEC1`, le loader construit une géométrie sans index, la scène se charge sans erreur et… le modèle est invisible (aucun pixel rendu). `scripts/gen-tshirt-glb.mjs` refuse désormais d'écrire un GLB non conforme.
- **Ne jamais multiplier couleur × texture sur un panneau imprimé** : la couleur du vêtement est composée dans la texture (albédo) et le matériau du panneau reste blanc, sinon un T-shirt noir rend le visuel noir. Le matériau garde roughness/metalness/normalMap par clone.
- La caméra ne doit réorienter le produit **que** sur demande (changement de face ou vue initiale) ; un lissage permanent annule la rotation et le zoom de l'utilisateur.

## Limites actuelles (état au 9 novembre 2026)

- **Boutique publique livrée** : vitrine commerciale et pages de devis en place ; le configurateur 3D
  reste l'outil de personnalisation. La commande native et la production restent planifiées dans
  `docs/plan-implementation.md`.
- **Prix de test en production** : T-shirts et livraison à 100 FCFA pour les essais de paiement.
  Les tarifs commerciaux (livraison 1 000 / 2 000 FCFA, produits à arbitrer) ne sont pas encore
  activés. Un produit sans prix validé ne doit pas être présenté comme une offre commerciale.
- **Aucune commande persistée** : seule la transaction de paiement est conservée (référence,
  téléphone, montant). Le nom, l'adresse et le détail textile ne sont pas encore enregistrés.
- **Dossier généré par le navigateur** : après `PAYE`, le client envoie les PNG et la fiche vers
  l'archive privée. S'il ferme la page avant l'envoi, l'atelier ne reçoit rien — la
  régénération serveur est planifiée.
- **Back-office** : `/admin/devis` traite les demandes et `/admin/commandes` suit le cycle
  commercial (paiement, production, contrôle qualité, livraison, clôture). Les fonctions stock,
  coûts et marges restent à développer. Voir [`docs/commandes-cycle.md`](docs/commandes-cycle.md).
- **Devis** : parcours public, sessions, OTP, upload vérifié et notifications sont implémentés ;
  voir [`docs/devis-lot-2.2.md`](docs/devis-lot-2.2.md).
- **Paiement** : MTN MoMo uniquement. Airtel Money n'est pas intégré.
- **Photos** : les mockups du studio 2D sont des visuels de travail à remplacer par les photos
  réelles de l'atelier.
- **Casquette** : présente dans le studio 2D comme support de démonstration, mais non vendable —
  aucun accessoire de presse (mug, casquette, assiette) n'est disponible.
