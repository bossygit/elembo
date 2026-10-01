# Service de paiement MTN MoMo — Elembo

Ce service est la **seule** partie du système qui parle à MTN. Il existe parce qu'un site
statique ne peut pas encaisser : la clé Collections permet d'initier des paiements au nom de
Smart Vision, elle ne doit jamais atteindre un navigateur, et MTN a besoin d'une URL de callback
publique et stable.

    POST /api/momo/payer      le navigateur annonce la commande → le MONTANT EST RECALCULÉ ICI
    POST /api/momo/callback   MTN signale un changement d'état → on revérifie par l'API
    GET  /api/momo/statut     le navigateur sonde : PENDING / PAYE / ECHEC / ANOMALIE
    GET  /sante               état du service

Aucune dépendance à l'exécution : `fetch` natif, Node 20+.

## 1. Essayer tout de suite, sans compte MTN (mode démonstration)

    cd momo-service
    npm install
    MOMO_MOCK=1 npm start

Les paiements sont simulés, avec la convention des numéros de test MTN :

| Numéro se terminant par | Résultat |
| --- | --- |
| …50 (ou autre) | paiement réussi après ~4 s |
| …51 | paiement refusé (`PAYER_NOT_FOUND`) |
| …52 | reste en attente (le client ne valide jamais) |

Exemple complet :

    curl -s localhost:8787/api/momo/payer -H 'Content-Type: application/json' -d '{
      "commande": "ELB-20261001-1200-AB", "produitId": "tshirt-basic",
      "lignes": [{"taille":"M","quantite":2}], "villeId": "brazzaville",
      "telephone": "06 123 45 67" }'
    # → {"referenceId":"…","statut":"PENDING","montantFcfa":11000,…}

    curl -s "localhost:8787/api/momo/statut?referenceId=…"

## 2. Passer au sandbox MTN (vraies API, faux argent)

1. S'inscrire sur <https://momodeveloper.mtn.com> **avec l'adresse que MTN a au dossier** :
   `store@smartvision.cg` (c'est celle communiquée à MTN le 22/07/2025, reprise les 16 et
   27/10/2025 avec l'URL de callback).
2. Souscrire le produit **Collections**, puis générer :
   - une **Subscription Key** (onglet *Profile*),
   - un **API User** et une **API Key** (bouton *Generate*).
3. Renseigner un fichier `.env` **non versionné** (`momo-service/.env`, déjà ignoré) :

```
MOMO_ENV=sandbox
MOMO_SUBSCRIPTION_KEY=…
MOMO_API_USER=…
MOMO_API_KEY=…
MOMO_CALLBACK_URL=https://<votre-domaine>/api/momo/callback
APP_ORIGINS=https://bossygit.github.io,http://localhost:3000
PORT=8787
```

4. Lancer :

    set -a; . ./.env; set +a; npm start

Le sandbox impose **EUR** comme devise : la commande reste en FCFA, et un montant de test
(`MOMO_SANDBOX_AMOUNT`, 10 par défaut) part vers MTN. Utiliser les numéros de test
(`46733123450` réussi, `46733123451` refusé) — ils sont acceptés uniquement en sandbox.

## 3. Passer en production

    MOMO_ENV=mtncongo MOMO_SUBSCRIPTION_KEY=… MOMO_API_USER=… MOMO_API_KEY=… \
    MOMO_CALLBACK_URL=https://<votre-domaine>/api/momo/callback npm start

Différences automatiques : `https://proxy.momoapi.mtn.com`, devise **XAF** (le montant envoyé
est alors le montant FCFA exact), en-tête `X-Target-Environment: mtncongo`.

## 4. Règles de sécurité appliquées dans le code

- La clé d'abonnement, l'API User et l'API Key ne sortent jamais de ce processus, ne sont ni
  journalisées ni renvoyées dans une réponse.
- **Le montant n'est jamais repris du navigateur** : il est recalculé depuis le catalogue
  serveur (`src/catalogue.ts`), et si un prix ou des frais ne sont pas arbitrés, la commande est
  refusée (HTTP 422) au lieu de facturer un montant inventé.
- Le callback MTN n'est pas cru sur parole : le statut est redemandé à MTN, et le **montant
  encaissé est comparé** au montant attendu. Toute divergence donne `ANOMALIE` — jamais `PAYE`.
- Le callback est **idempotent** (il peut être rejoué) et répond toujours 200 pour ne pas
  provoquer de boucle de retry chez MTN.
- CORS limité aux origines déclarées (`APP_ORIGINS`).
- Les numéros sont masqués dans les journaux.
- Le catalogue serveur est vérifié contre celui de l'application par les tests : impossible de
  facturer un prix que le client n'a pas vu.

## 5. Tests

    npm test        # 40+ tests : téléphone, tarification, client MTN (faux fetch), routes HTTP
    npm run typecheck

Les tests couvrent notamment : le jeton mis en cache et renouvelé, la signature exacte des
appels MTN, un 409 de MTN, un montant modifié côté client, un callback rejoué, un callback dont
le montant ne correspond pas, une ville sans tarif, un numéro mal saisi.
