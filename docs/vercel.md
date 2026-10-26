# Elembo sur Vercel — hébergement du site **et** du paiement

Décision : le site et le service de paiement tournent sur **Vercel**, dans le même projet Next.js.
Il n'y a plus de service séparé, plus de tunnel Cloudflare, plus de Mac à garder allumé.

**État au 26/10/2026 — en production.**

| Élément | Valeur |
|---|---|
| Site | https://elembo.vercel.app |
| Projet Vercel | `kitutupros-projects/elembo` (plan Hobby), région `cdg1`, dépôt GitHub connecté (déploiement à chaque push sur `main`) |
| Paiement | `mode reel`, `env mtncongo`, `devise XAF`, journal `redis-tcp` **joignable** (`/api/sante` → 200) |
| Base | `redis-green-plank` (intégration Redis de Vercel, variable `REDIS_URL`) |
| Service local + tunnel Cloudflare | **arrêtés** (agent launchd supprimé) |

---

## 1. Ce qui change, et pourquoi

| Avant | Après |
|---|---|
| Site statique sur GitHub Pages | Site Next.js sur Vercel (rendu serveur + routes API) |
| Service de paiement Node sur le MacBook, exposé par un tunnel Cloudflare « rapide » | Routes API `/api/momo/*` **dans la même application** |
| Adresse du service qui change à chaque redémarrage, republiée toutes les 5 min par un agent launchd | Une seule adresse stable : le domaine Vercel |
| État des transactions dans `~/.elembo/…/transactions.json` (aucune sauvegarde) | Redis (Upstash / Vercel KV), état hors du processus |
| CORS obligatoire entre le site et le service | Même origine : CORS inutile en production |
| Encaissement impossible si le Mac est éteint | Encaissement indépendant de toute machine personnelle |

**Pourquoi c'était bloqué avant** : une fonction serverless **n'a pas de disque**. Le journal des
transactions ne pouvait donc pas rester un fichier JSON. C'est ce point — et lui seul — qui
imposait un serveur permanent. Il est réglé par `StoreRedis` (`src/server/momo/store.ts`) : le
service écrit chaque demande de paiement dans Redis **avant** d'appeler MTN, exactement comme il
écrivait dans le fichier.

Règle conservée : **sans journal, pas d'encaissement**. Si Redis est injoignable, `payer` répond
`503` et ne contacte jamais MTN (vérifié en essai : voir §6).

---

## 2. Architecture

```
                     ┌─────────────────────────────────────────────┐
  Navigateur ───────▶│  Vercel — projet Next.js (région cdg1)      │
                     │                                             │
                     │  /  /studio  /configurator   (pages)        │
                     │  /api/momo/payer      ← montant recalculé   │
                     │  /api/momo/statut     ← le navigateur sonde │
                     │  /api/momo/callback   ← appelé par MTN      │
                     │  /api/momo/tarifs     ← prix réellement     │
                     │  /api/sante           ← état + stockage     │
                     └───────────┬─────────────────────┬───────────┘
                                 │                     │
                     Redis (Upstash / Vercel KV)   MTN MoMo (proxy.momoapi.mtn.com)
                     journal des transactions      requesttopay + statut
```

Le code serveur vit dans `src/server/momo/` :

| Fichier | Rôle |
|---|---|
| `service.ts` | La logique (payer / callback / statut / tarifs / santé). Aucune dépendance à `next` : testable sans serveur. |
| `store.ts` | Journal des transactions : `StoreRedis` (production), `StoreFichier` (local), `StoreMemoire` (démo, tests). |
| `config.ts` | Lecture de l'environnement, refus explicite si incomplet. |
| `mtn.ts` / `mock-mtn.ts` | Client MTN réel / simulateur (table officielle du sandbox). |
| `catalogue.ts` / `pricing.ts` | Catalogue et recalcul du montant, depuis `tarifs/grille.json` (source unique). |
| `instance.ts`, `http.ts` | Câblage unique et enveloppe HTTP (JSON, CORS de transition, erreurs lisibles). |

Les routes (`src/app/api/…/route.ts`) ne font qu'appeler `service.ts` : ce sont des enveloppes.

---

## 3. Variables d'environnement (Vercel → Settings → Environment Variables)

| Variable | Portée | Valeur |
|---|---|---|
| `MOMO_ENV` | Production | `mtncongo` |
| `MOMO_SUBSCRIPTION_KEY` | Production | clé Collections (mail MTN du 27/10/2025) |
| `MOMO_API_USER` | Production | Collection API USER |
| `MOMO_API_KEY` | Production | Collection API KEY |
| `MOMO_CALLBACK_URL` | Production | `https://<domaine>/api/momo/callback` |
| `APP_ORIGINS` | Production | `https://<domaine>` (le domaine exact, sans barre oblique finale) |
| `REDIS_URL` | Production + Preview | injectée par l'intégration Redis de Vercel (*Storage → Redis*) |
| `MOMO_MOCK=1` | **Preview uniquement** | paiements simulés, aucune clé, aucun franc |

L'intégration Redis de Vercel fournit une **connexion TCP** (`rediss://…`), pas l'API HTTP
d'Upstash : le journal la consomme via `ioredis` (`StoreRedisUrl`). L'API REST reste supportée
(`UPSTASH_REDIS_REST_URL` / `KV_REST_API_URL`) si l'hébergement du journal change un jour — même
code métier, seul le transport diffère. Piège rencontré : pendant la création de la base, `REDIS_URL`
vaut `database_provisioning_in_progress` ; la configuration refuse cette valeur et le dit
explicitement plutôt que de démarrer sans journal.

Deux règles à ne pas inverser :

1. **Les clés MTN vont en Production seulement.** Si `MOMO_ENV=mtncongo` et `MOMO_MOCK=1`
   coexistaient, le service refuse de démarrer (on ne simule pas la production) — mais mieux vaut
   ne pas les mettre en Preview du tout : un aperçu de branche ne doit jamais pouvoir demander un
   vrai paiement.
2. `MOMO_MOCK=1` en Preview évite de dépendre d'une clé pour tester une branche ; le stockage
   mémoire y suffit alors, Redis n'est pas nécessaire.

Les variables `KV_REST_API_URL` / `KV_REST_API_TOKEN` (Vercel KV) sont acceptées à la place des
variables Upstash : les deux noms sont lus.

---

## 4. Mise en service, pas à pas

1. **Importer le dépôt** dans Vercel (`Add New… → Project → bossygit/elembo`). Framework détecté :
   Next.js. Aucune commande de build à changer (`npm run build`). Ne pas cocher d'export statique :
   `DEPLOY_TARGET=gh-pages` est réservé à l'ancien déploiement Pages.
2. **Créer le stockage** : onglet *Storage* → **Redis** (intégration officielle) → *Create* →
   effectuer les choix (`Region=cdg1`, `RAM only`, `HighAvailability=None`) → *Connect to Project*.
   La variable `REDIS_URL` est ajoutée automatiquement, pour Production, Preview et Development.
   En CLI : `vercel integration add redis --metadata Region=cdg1 --metadata "StorageType=RAM only"
   --metadata HighAvailability=None` (l'acceptation des conditions du marketplace se fait une fois
   dans le navigateur).
3. **Renseigner les variables** du §3, puis *Redeploy* (les variables ne sont lues qu'au
   démarrage d'une nouvelle fonction).
4. **Vérifier** :
   ```bash
   curl -s https://<domaine>/api/sante
   # {"ok":true,"mode":"reel","env":"mtncongo","devise":"XAF","stockage":"redis"}

   curl -s https://<domaine>/api/momo/tarifs | head -c 300
   # les prix réellement appliqués, lus dans tarifs/grille.json
   ```
5. **Pointer le callback MTN** : `MOMO_CALLBACK_URL=https://<domaine>/api/momo/callback`.
   Aucune démarche chez MTN n'est nécessaire — l'URL voyage dans l'en-tête `X-Callback-Url` à
   chaque demande. L'ancienne URL déclarée (`https://smartvision.cg/wp-json/momo/v1/callback`)
   peut rester en place : elle n'est plus utilisée, et de toute façon **le statut fait foi par
   interrogation de l'API**, jamais par le callback.
6. **Test à 1 FCFA / 100 FCFA** en production, sur un vrai numéro : `payer` → validation sur le
   téléphone → `statut` = `PAYE` → vérifier la ligne dans Redis. C'est le seul test qui prouve la
   chaîne complète (le sandbox ne prouve pas l'encaissement réel).
7. **Retirer le tunnel** : arrêter l'agent launchd et le service local une fois l'étape 6 réussie
   (voir §7).

---

## 5. Domaine

`https://elembo.vercel.app` fonctionne sans rien configurer. Un domaine dédié (par exemple
`elembo.cg` ou `boutique.smartvision.cg`) s'ajoute dans *Settings → Domains*, puis il faut mettre à
jour **`MOMO_CALLBACK_URL` et `APP_ORIGINS`** avec le nouveau domaine, et redéployer.

Attention : `APP_ORIGINS` sert au CORS. Sur Vercel, le site et l'API partagent la même origine :
le navigateur n'envoie donc pas de requête préalable, et une valeur `APP_ORIGINS` absente ou
périmée ne casse rien. Elle ne compte que pour un client externe (ancien site Pages).

---

## 6. Dossier de production : du paiement à l'atelier

Avant ce lot, les PNG d'impression et la fiche étaient produits **dans le navigateur du client**,
au moment où le paiement passait à `PAYE`. Si le client fermait la page, coupait le réseau ou
perdait le téléphone, la commande était encaissée et l'atelier n'avait **rien**. C'est le trou qui
empêchait de vendre sans être présent.

Le dossier est maintenant déposé côté serveur avant d'être considéré comme reçu :

```
navigateur (canvas)                       archive privée (Vercel Blob)
      │ 1. POST /api/commandes/<ref>/upload  ── autorise (transaction PAYE) ──► URL signée
      │ 2. PUT des octets ───────────────────────────────────────────────────► dossiers/<ref>/…
      │ 3. POST /api/commandes/<ref>/fichiers ── enregistre dans Redis ──► Telegram (atelier)
      └─ 4. message : « dossier transmis à l'atelier » (ou « envoi échoué », jamais un faux succès)
```

| Route | Rôle | Protection |
|---|---|---|
| `POST /api/commandes/[ref]/upload` | délivre une URL signée d'envoi | transaction existante, `PAYE`, référence ↔ commande, chemin `dossiers/<ref>/`, types `image/png`/`application/json`/`text/plain`, 25 Mo max, 15 min |
| `POST /api/commandes/[ref]/fichiers` | enregistre les métadonnées, prévient l'atelier | mêmes contrôles + bornes (6 fichiers, 60 Mo), **idempotent** : un dépôt rejoué ne duplique rien |
| `GET /api/commandes/[ref]/fichiers` | liste les dossiers reçus | `x-atelier-token: $ATELIER_TOKEN` |
| `GET /api/commandes/[ref]/fichiers/[nom]` | télécharge un fichier | même jeton ; l'URL de l'archive n'est jamais exposée au navigateur |

Points de conception qui comptent :

- **Envoi direct du navigateur vers l'archive** — une requête de fonction Vercel est plafonnée à
  4,5 Mo de corps ; un PNG de toile fait souvent 5 à 15 Mo. Le fichier ne traverse donc jamais la
  fonction : seule l'autorisation passe par elle (variante *presigned*, authentifiée par OIDC —
  aucun jeton statique à stocker).
- **Un dossier n'est enregistré que si le paiement est `PAYE`** — un fichier ne peut pas créer une
  commande. Le premier dépôt d'une commande fait foi : rien n'est écrasé.
- **Échec de notification ≠ échec de commande** — le fichier est archivé et journalisé ; la réponse
  porte `notifie: false` et son motif, et `/api/sante` affiche l'état du canal.
- **Le client garde ses téléchargements** — si l'envoi échoue après paiement, l'écran le dit
  explicitement et l'invite à transmettre les fichiers par WhatsApp avec la référence.

Variables ajoutées :

| Variable | Rôle |
|---|---|
| `BLOB_STORE_ID` | injectée par le stockage Vercel Blob `elembo-dossiers` (accès **privé**, région `cdg1`) |
| `ATELIER_TOKEN` | jeton des routes de consultation/téléchargement atelier |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | avis automatique à l'atelier (facultatif : sans eux, le dépôt fonctionne, `notifie: false`) |

Vérifié de bout en bout sur un serveur local (paiement MTN simulé, archive réelle, 26/10/2026) avec
`scripts/e2e-dossier.mjs` : paiement `PAYE` → envoi de 2 fichiers vers l'archive privée →
enregistrement `201` → rejeu `200 dejaRecu` → `401` sans jeton atelier, `200` avec → téléchargement
**identique octet pour octet** → référence inconnue `404` → fichiers d'essai supprimés.

---

## 7. Vérifications faites avant livraison (26/10/2026)

| Vérification | Résultat |
|---|---|
| `npm test` (Vitest) | **339 tests verts** — dont 22 pour le dossier de production (autorisation, chemins, notification) |
| `npx tsc --noEmit` | aucun diagnostic |
| `npm run build` | build production OK, routes `/api/momo/*` et `/api/sante` en dynamique (`ƒ`) |
| Flux complet sur le build de production (mock) | payer → PENDING → PAYE, doublon `422`, commande payée `422`, callback par corps et par chemin, commande tableaux 2 × 40×60 monté = 33 600 FCFA |
| Chemin Redis réel (faux Upstash local, protocole REST) | écriture `HSETNX`, `HGET`, `HGETALL` ; transaction retrouvée **après redémarrage complet** ; double débit toujours refusé |
| Redis injoignable | `503` « Journal des transactions indisponible », **aucun appel à MTN** |
| CORS | origine listée reflétée, origine inconnue sans en-tête |
| Dossier de production (`scripts/e2e-dossier.mjs`) | paiement `PAYE` → 2 fichiers dans l'archive privée → `201` → rejeu `200 dejaRecu` → atelier `401`/`200` → octets identiques → inconnue `404` |

Vérifications **sur la production déployée** (26/10/2026, `https://elembo.vercel.app`) :

| Vérification | Résultat |
|---|---|
| `GET /api/sante` | `200` — `{"mode":"reel","env":"mtncongo","devise":"XAF","stockage":"redis-tcp","stockageJoignable":true}` |
| `GET /api/momo/tarifs` | `200` — prix réellement appliqués depuis `tarifs/grille.json` |
| `POST /api/momo/payer` avec produit inconnu | `422` « Produit inconnu » — validation **avant** tout appel MTN et avant toute écriture |
| `POST /api/momo/callback` avec référence inconnue | `200` `{recu:true, traite:false}` — MTN ne boucle pas |
| `PUT /api/momo/callback/<référence>` | `200` — variante par chemin opérationnelle |
| `GET /api/momo/statut` avec référence inconnue | `404` |
| Écriture réelle dans la base Vercel | transaction créée (`HSETNX`), passée `PAYE` (`HSET`), relue, doublon refusé, puis **entrée de test supprimée** — journal vérifié vide après coup |
| Ancien service local + tunnel Cloudflare | arrêtés ; agent launchd `cg.smartvision.elembo.paiement` supprimé |

---

## 8. Après la bascule — nettoyage

Ces éléments ne servent plus, mais ils sont laissés en place tant que la production Vercel n'a pas
encaissé un vrai paiement (retour arrière possible en une minute) :

- `momo-service/` — l'ancien service séparé, remplacé par `src/server/momo/`. Ses tests ont été
  portés dans `tests/momo*.test.ts` ; le code source y est conservé à titre d'archive.
- `scripts/service-paiement.sh`, `scripts/installer-service-paiement.sh`, `scripts/demarrer-paiement.sh`
  — superviseur, tunnel Cloudflare, agent launchd.
- `momo-service/.env` et `.env.production` — **contiennent les clés MTN**. Ils ne sont pas versionnés.
  Après avoir collé les clés dans Vercel : les supprimer du disque et **faire tourner les clés**
  chez MTN (elles ont vécu sur un poste de travail).
- Branche `gh-pages` — l'ancien site statique. À conserver comme archive, sans plus y publier.

Commande d'arrêt du superviseur local :

```bash
launchctl unload ~/Library/LaunchAgents/com.elembo.paiement.plist 2>/dev/null
launchctl list | grep -i elembo   # doit ne rien renvoyer
```

---

## 9. Points de vigilance

- **Plan Vercel** : l'offre Hobby est gratuite et suffisante techniquement, mais les conditions
  d'utilisation réservent Hobby aux usages non commerciaux. Pour une boutique qui encaisse, prévoir
  le plan Pro (≈ 20 $/mois) — c'est le même ordre de grandeur qu'un VPS, sans administration.
- **Fonction serverless = processus jetable** : le jeton MTN est mis en cache par instance, pas
  globalement. C'est sans conséquence (MTN accepte plusieurs jetons), mais il ne faut jamais
  s'appuyer sur un état en mémoire pour la vérité métier — c'est le rôle de Redis.
- **Fuseau et horloge** : les dates des transactions sont en UTC (ISO 8601). L'affichage local est
  un problème d'affichage, jamais de stockage.
- **Le fichier d'impression reste généré dans le navigateur du client** (inchangé par cette
  migration). C'est le prochain chantier d'exploitation : sans envoi du fichier au serveur, une
  commande payée peut rester sans fichier si le client ferme la page.
