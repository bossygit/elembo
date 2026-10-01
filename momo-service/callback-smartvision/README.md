# Callback MTN MoMo sur smartvision.cg (PHP, hébergement mutualisé)

Le site `smartvision.cg` n'est plus sous WordPress, mais **c'est l'URL de callback déclarée à MTN
Congo** dans la demande d'API : `https://smartvision.cg/wp-json/momo/v1/callback`. On la conserve
telle quelle — une URL `wp-json/…` se reproduit à l'identique avec de simples dossiers PHP.

MTN envoie le résultat d'une transaction **une seule fois, sans réessai** : ce code accuse
réception immédiatement (HTTP 200), puis **revérifie le statut auprès de MTN** et compare le
montant encaissé au montant attendu. Rien n'est « cru sur parole », rien n'est inventé.

## Où va chaque fichier sur le serveur

| Dans ce dépôt | Sur le serveur (`telema`) |
| --- | --- |
| `momo-lib.php` | `~/momo/momo-lib.php` |
| `config.example.php` | `~/momo/config.php` — **hors racine web**, `chmod 600`, à remplir |
| `callback/index.php` | `~/smartvision.cg/wp-json/momo/v1/callback/index.php` |
| `statut/index.php` | `~/smartvision.cg/wp-json/momo/v1/statut/index.php` |
| `demande/index.php` | `~/smartvision.cg/wp-json/momo/v1/demande/index.php` |
| `.htaccess` | `~/smartvision.cg/wp-json/momo/v1/.htaccess` |
| (données, créé à l'exécution) | `~/momo/data/` — `chmod 700` |

Déploiement :

    scp momo-lib.php config.example.php telema:~/momo/            # puis renommer et remplir la config
    scp callback/index.php telema:~/smartvision.cg/wp-json/momo/v1/callback/
    scp statut/index.php   telema:~/smartvision.cg/wp-json/momo/v1/statut/
    scp demande/index.php  telema:~/smartvision.cg/wp-json/momo/v1/demande/
    scp .htaccess          telema:~/smartvision.cg/wp-json/momo/v1/
    ssh telema 'chmod 600 ~/momo/config.php; chmod 700 ~/momo/data; php -l ~/momo/momo-lib.php'

## Les trois routes

    PUT|POST /wp-json/momo/v1/callback              notification de MTN (les deux méthodes)
    POST     /wp-json/momo/v1/callback/{reference}  variante avec la référence dans le chemin
    POST     /wp-json/momo/v1/demande               enregistre la commande AVANT le paiement
                                                    (en-tête X-Secret obligatoire)
    GET      /wp-json/momo/v1/statut/?referenceId=… état vérifié de la transaction

`/callback` répond `200 {"recu":true}` même pour une référence inconnue : MTN ne doit pas boucler.
Une référence inconnue **ne déclenche aucun appel à MTN** (un endpoint public ne sert pas
d'amplificateur) ; l'incident est journalisé.

`/demande` est ce qui rend la vérification possible : la boutique annonce la référence de
transaction, la commande et le **montant attendu** avant d'appeler MTN. Au callback, si le montant
encaissé diffère, le statut devient `ANOMALIE` — jamais `PAYE`.

## Pourquoi un `.htaccess` dans `wp-json/momo/v1/`

Un dossier appelé par une URL **sans** barre oblique finale reçoit une redirection `301` de
LiteSpeed/Apache : MTN verrait une redirection au lieu de notre réponse, et comme il ne réessaie
jamais, la notification serait perdue. Le `.htaccess` local désactive cette redirection pour ce
dossier seulement (`DirectorySlash Off`) et route les trois chemins vers leurs `index.php`.
Il ne touche à rien d'autre sur le site.

## Ce qui a été vérifié contre le sandbox MTN

- Une notification réelle de MTN **arrive bien sur cette URL**, en **POST** (le sandbox utilise
  POST ; la documentation demande de supporter PUT *et* POST), en une à deux secondes.
- Charge utile observée (tracée au journal, numéros masqués) :

```json
{"financialTransactionId":"928274472","externalId":"<notre référence de transaction>",
 "amount":"10","currency":"EUR","payer":{"partyIdType":"MSISDN","partyId":"061****567"},
 "payeeNote":"…","status":"SUCCESSFUL"}
```

  Elle **ne contient pas `referenceId`** : la transaction est identifiée par notre `externalId`.
  Le code cherche donc la référence puis, à défaut, la commande correspondante.
- Montant correct ⇒ `PAYE` avec l'identifiant de transaction MTN ; montant attendu volontairement
  faux ⇒ `ANOMALIE` avec le motif. Les deux cas ont été obtenus sur le vrai sandbox.

## Passage en production

1. Remplacer les valeurs de `~/momo/config.php` par les clés **Collections de production** et
   mettre `'environnement' => 'mtncongo'`. La configuration actuellement en place est en
   **sandbox** (clés de test) : elle ne peut pas encaisser d'argent réel.
2. Générer un `secret` long et le partager avec la boutique (en-tête `X-Secret`).
3. Vérifier que le domaine est bien celui déclaré à MTN : la documentation exige que l'URL de
   callback soit **sur le même domaine** que le `providerCallbackHost` de l'API User.
4. Le certificat doit venir d'une autorité reconnue par MTN (le site est en Let's Encrypt, présent
   dans la liste publiée) ; sinon, les callbacks peuvent disparaître silencieusement.
5. En cas de doute sur une transaction, `GET /statut/?referenceId=…` reste la source de vérité :
   MTN recommande explicitement de ne pas dépendre du callback.
