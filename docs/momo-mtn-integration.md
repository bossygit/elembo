# Paiement MTN Mobile Money (MoMo) — intégration Elembo

> État des lieux issu des échanges avec MTN Congo (boîte `bienvenu.kitutu@smartvision.cg`,
> chaîne « DEMANDE DES API », interlocuteur Diderot LITSOKI). **Aucune clé n'est recopiée
> dans ce document** : ce sont des secrets, à stocker côté serveur.

## 1. Ce dont Smart Vision dispose déjà

| Élément | Valeur / état |
| --- | --- |
| Produit souscrit | **Collections** (encaissement) — c'est celui d'un site marchand |
| Clés | Livrées le **27/10/2025** (mail « RE: SMART VISION-MTN-DEMANDE DES API ») : `Collection API USER`, `Collection API KEY`, `Clé primaire`, `Clé secondaire` |
| Où les récupérer | Ce mail, ou le portail https://momoapi.mtn.com/developer |
| URL de callback déclarée chez MTN | `https://smartvision.cg/wp-json/momo/v1/callback` |
| Adresse mail du portail | `store@smartvision.cg` |
| Dossier KYC | Formulaires KYC, KYC MoMoPay, AML/FT, Data privacy, Cash Collection + RCCM, NIU, patente, statuts, bail, CNI (transmis juillet→octobre 2025) |
| Interlocuteurs | Diderot LITSOKI (diderot.litsoki@mtn.com, **absent** — sa réponse automatique renvoie vers **Carl ASHIE <Carl.Ashie@mtn.com>**) ; momoapi.cg@mtn.com ; Hermann GONDZIA ; Guinela OBAKAMA |

## 2. Paramètres techniques (MTN Congo)

| Paramètre | Valeur |
| --- | --- |
| Base URL production | `https://proxy.momoapi.mtn.com` |
| Base URL sandbox | `https://sandbox.momodeveloper.mtn.com` |
| `X-Target-Environment` | **`mtncongo`** |
| Devise | **XAF** |
| En-tête d'abonnement | `Ocp-Apim-Subscription-Key: <clé primaire ou secondaire>` |
| Référence de transaction | `X-Reference-Id` — **UUID v4 obligatoire** |

### Flux « Request to Pay » (le client paie)

```
1) POST /collection/token/
   Authorization: Basic base64(CollectionApiUser:CollectionApiKey)
   Ocp-Apim-Subscription-Key: <clé>
   → 200 { access_token, expires_in }

2) POST /collection/v1_0/requesttopay
   Authorization: Bearer <access_token>
   Ocp-Apim-Subscription-Key: <clé>
   X-Reference-Id: <uuid v4 généré par nos soins>
   X-Target-Environment: mtncongo
   X-Callback-Url: https://<notre-domaine>/api/momo/callback   (facultatif si callback déclaré)
   { "amount": "26000", "currency": "XAF", "externalId": "ELB-20261001-1347-2C",
     "payer": { "partyIdType": "MSISDN", "partyId": "24206XXXXXXX" },
     "payerMessage": "Commande Elembo", "payeeNote": "T-shirt personnalisé" }
   → 202 Accepted  (le client reçoit une demande sur son téléphone)

3) GET /collection/v1_0/requesttopay/{referenceId}
   → { status: PENDING | SUCCESSFUL | FAILED, amount, currency, financialTransactionId, … }
```

MTN appelle aussi l'URL de callback à chaque changement d'état. **Le statut fait foi** : ne
jamais se fier au retour du navigateur.

## 3. Pourquoi Elembo ne peut pas encaisser seul

Elembo est aujourd'hui **100 % client-side** (export statique, GitHub Pages). Or :

- la clé API ne doit **jamais** être dans le navigateur (elle donnerait le droit d'initier des
  paiements au nom de l'entreprise) ;
- `requesttopay` doit partir d'un **serveur** vers MTN ;
- le **callback** de MTN doit arriver sur une URL publique **stable** ;
- la confirmation de paiement doit être **vérifiée côté serveur** avant de lancer la production.

Il faut donc un petit service (3 routes) : c'est le seul travail restant avant de pouvoir
payer en ligne.

## 4. À construire (côté serveur)

| Route | Rôle |
| --- | --- |
| `POST /api/momo/payer` | Reçoit `{ commande, montant, telephone }` ; **recalcule le montant côté serveur** depuis la commande (jamais celui du navigateur) ; génère la référence UUID ; appelle token + requesttopay ; stocke `{ reference, commande, montant, statut: PENDING }` ; renvoie la référence au client |
| `PUT/POST /api/momo/callback` | Reçoit la notification MTN ; **revérifie le statut par l'API** (GET requesttopay/{ref}) ; compare le montant à celui de la commande ; marque `PAYE` si `SUCCESSFUL` ; idempotent (un callback peut être rejoué) |
| `GET /api/momo/statut?ref=…` | Le navigateur sonde le statut ; répond `PENDING / PAYE / ECHEC` |

Variables d'environnement à définir (jamais dans le dépôt) :

```
MOMO_SUBSCRIPTION_KEY=<clé primaire ou secondaire>
MOMO_API_USER=<Collection API USER>
MOMO_API_KEY=<Collection API KEY>
MOMO_ENV=mtncongo          # sandbox : sandbox
MOMO_BASE_URL=https://proxy.momoapi.mtn.com
MOMO_CALLBACK_URL=https://<notre-domaine>/api/momo/callback
```

Règles à respecter (sources d'incident classiques) :

- `X-Reference-Id` = UUID **v4** ; le réutiliser renvoie 409 ;
- devise **XAF** en production (`EUR` en sandbox) ;
- montants **entiers**, sans séparateur ni caractère spécial ;
- le token expire : le redemander, ne pas le mettre en cache trop longtemps ;
- si un statut reste `PENDING` au-delà de ~2 minutes, considérer la commande comme non payée ;
- enregistrer chaque tentative : référence, montant, statut, réponse brute (traçabilité litige).

## 5. Test avant mise en production

1. Souscrire aussi le produit en **sandbox** sur https://momodeveloper.mtn.com et obtenir une
   clé de test (les clés de production ne doivent pas servir aux essais).
2. Parcours complet : création de commande → `requesttopay` → validation sur le téléphone →
   callback → statut `SUCCESSFUL` → production lancée.
3. Cas d'échec : refus du client, solde insuffisant, numéro inconnu, double callback.
4. Vérifier que le montant encaissé == montant de la commande (recalcul serveur).

## 6. État dans Elembo

Le tunnel est prêt jusqu'au paiement : validation de l'aperçu, tailles/quantités, ville
(Brazzaville 1 000 FCFA, délai ≤ 3 jours), récapitulatif FCFA, génération des PNG d'impression
et de la fiche de production (positionnement en cm, textes, couleurs, consignes).

Il manque : le service des 3 routes ci-dessus, et le **prix unitaire** de chaque produit
(champ `priceFcfa` du catalogue — volontairement vide : la commande refuse de valider plutôt
que d'afficher un montant inventé).
