# Paiements MTN — robustesse, idempotence et réconciliation

Statut : conception validée sur le schéma, **non encore branchée aux routes**. Aucun paiement
réel n'a été déclenché pendant cette revue.

## 1. Principe : la base est la vérité, Redis est le filet

```
Navigateur → POST /api/commandes → commande + lignes en base
Navigateur → upload direct des visuels → bucket production privé
Navigateur → POST /api/momo/payer → paiement PENDING en base + miroir Redis → MTN
MTN → callback → événement durable → vérification MTN → paiement PAYE → trigger commande + production
```

- La commande et la ligne `paiements` existent **avant** l'appel MTN.
- Le montant est recalculé depuis la commande ; le navigateur ne fournit jamais le montant.
- Le callback ne fait jamais confiance au corps reçu : il interroge MTN avec `reference_id`.
- Redis conserve un miroir immédiat et une file d'événements à rejouer. Il ne remplace pas la
  base commerciale.

## 2. Journal durable des événements

Table `public.paiement_evenements` :

| Colonne | Rôle |
|---|---|
| `reference_id` | identifiant MTN, connu avant l'appel |
| `commande_id` | rattachement si la commande existe localement |
| `source` | `CALLBACK`, `POLL`, `RECONCILIATION`, `MANUEL` |
| `statut_recu` | statut brut renvoyé par MTN |
| `cle_evenement` | SHA-256 de `reference_id + statut + financial_tx_id + montant` |
| `payload` | corps brut, pour preuve et rejeu |
| `occurrences` | nombre de réceptions du même événement |
| `traite` / `traite_le` / `erreur` | état de traitement |

Un doublon ne crée pas de seconde ligne : `on conflict (cle_evenement) do update set
occurrences = occurrences + 1, dernier_recu_le = now()`. Il est journalisé mais **pas
retraité**. Le premier traitement reste seul responsable de la transition.

Le helper `src/server/paiements/evenements.ts` calcule la clé SHA-256 canonique et le backoff
(1, 5, 15, 60, 360, 1440 minutes) ; `tests/paiementsEvenements.test.ts` vérifie la stabilité de
la clé, la sensibilité au montant/identifiant MTN et le plafonnement du backoff.

## 3. Les cinq cas demandés

### 3.1 Callback reçu plusieurs fois

1. Calcul de `cle_evenement`.
2. `insert ... on conflict do update occurrences`.
3. Si `traite = true`, réponse `200` immédiate, aucun nouvel effet.
4. Si `traite = false`, un seul worker traite la ligne (`for update skip locked`).
5. Le second callback ne peut pas créer un second `PAYE` : index unique partiel
   `paiements_un_seul_paye_par_commande`.

### 3.2 Callback tardif

- Si le paiement est déjà `PAYE` : l'événement est enregistré, `traite = true`, aucun changement.
- Si la commande est `ANNULEE` ou `REMBOURSEMENT_A_TRAITER` : l'événement est enregistré,
  `traite = false`, une tâche `PAIEMENT_SANS_DOSSIER` ou une anomalie manuelle est créée.
  **On ne marque pas silencieusement une commande annulée comme payée.**
- Si le paiement n'existe plus ou n'a jamais été créé : l'événement reste avec `reference_id` et
  `commande_id` si connus ; la réconciliation tente de rapprocher par `reference_id`, sinon
  alerte `PAIEMENT_ORPHELIN`.
- Un callback tardif après un remboursement ne réencaisse pas : il crée une tâche de
  vérification manuelle et une notification finance.

### 3.3 Supabase temporairement indisponible

Le callback doit **toujours répondre 200 à MTN**, sinon MTN rejoue en boucle.

```
1. Écrire l'événement dans Redis (clé idempotente, TTL 7 jours minimum)
2. Tenter l'insertion Supabase
3. Si Supabase échoue :
   - conserver l'événement Redis avec a_rejouer = true
   - répondre 200
   - alerter (log + notification ops)
4. Le cron de réconciliation rejoue les événements Redis non traités
```

Si Redis est aussi indisponible, le callback reste `200` et MTN rejouera ; le cron interroge
MTN par `reference_id` pour les paiements `PENDING` dont la référence est connue. Le paiement
n'est jamais considéré comme encaissé sans trace MTN vérifiée.

### 3.4 MTN confirme, Supabase n'enregistre pas immédiatement

- La ligne `paiements` a été créée **avant** l'appel MTN ; elle porte `reference_id`.
- L'événement MTN est journalisé dès réception (Redis puis `paiement_evenements`).
- La réconciliation :
  1. lit les événements non traités ;
  2. interroge MTN par `reference_id` ;
  3. si `SUCCESS` et montant identique : `update paiements set statut='PAYE'` (idempotent) ;
  4. le trigger met à jour la commande et crée `INITIALISATION` ;
  5. marque l'événement `traite = true`.
- Si le paiement n'existe pas en base mais que MTN confirme : création d'un paiement de
  rapprochement avec `source = RECONCILIATION`, `commande_id` retrouvé par la référence de
  commande ; si la commande est introuvable, alerte `PAIEMENT_ORPHELIN` et **aucune production**.

### 3.5 Échec de création de la tâche de production après paiement

Deux barrières :

1. **Transactionnelle** : le trigger `synchroniser_paiement_commande`, dans la même transaction
   que `paiements.statut = 'PAYE'`, insère `travaux_production (etape = 'INITIALISATION')`.
   Si l'insertion échoue, le paiement n'est pas marqué `PAYE` : pas d'encaissement fantôme.
2. **Réconciliation** : si une commande est `PAYEE` sans aucune tâche (données historiques,
   incident), le cron crée `INITIALISATION` et une tâche `PRODUCTION_SANS_TACHE` pour audit.

L'atelier ne dépend donc pas d'un appel applicatif après le callback.

## 4. File de reprise

Table `public.taches_reconciliation` :

- `type` : `PAIEMENT_PENDING`, `PAIEMENT_SANS_DOSSIER`, `PRODUCTION_SANS_TACHE`,
  `NOTIFICATION_ECHEC`, `FICHIER_ORPHELIN` ;
- `statut` : `A_FAIRE`, `EN_COURS`, `TERMINE`, `ECHEC`, `ANNULE` ;
- `tentatives`, `prochaine_tentative`, `derniere_erreur`, `metadata`.

Backoff proposé : 1 min, 5 min, 15 min, 1 h, 6 h, 24 h. Après 3 échecs, notification admin.
Le worker réclame les lignes avec `for update skip locked`, par lots de 50, pour éviter deux
exécutions concurrentes.

## 5. Contrat du cron `/api/momo/reconcilier`

1. Vérifier `CRON_SECRET`.
2. Traiter les `taches_reconciliation` échues.
3. Balayer les `paiements` `PENDING` de plus de 5 minutes : interroger MTN.
4. Balayer les `paiements` `PAYE` sans `travaux_production` : créer la tâche initiale.
5. Balayer les `paiements` `PAYE` sans fichier `verifie` : alerte atelier.
6. Rejouer les événements Redis `a_rejouer`.
7. Écrire un résumé dans `journal_audit` et `notifications` (admin).
8. Répondre `200` même si un élément échoue ; les échecs restent dans la file.

Le cron ne doit jamais créer un paiement `PAYE` sans vérification MTN. Un `PAYE` manuel exige
le rôle `finance`/`admin` et une note.

## 6. Tests

- `tests/supabaseLifecycle.integration.test.ts` couvre : montant erroné, `PAYEE` sans paiement,
  double `PAYE`, tâche de production créée, transition interdite.
- Les callbacks dupliqués/tardifs et la panne Supabase seront testés avec le service MTN mock
  au lot 3.2, sans paiement réel.
- Aucun test ne pointe vers la production ; `SUPABASE_TEST_*` et `MOMO_MOCK=1` uniquement.

## 7. Risques résiduels

- Le callback MTN doit être rejouable : si MTN ne rejoue pas et que Redis + Supabase sont
  indisponibles simultanément, la détection dépend du cron et de la référence connue.
- La durée de rétention Redis doit couvrir la fenêtre de panne (7 jours proposés).
- La réconciliation des paiements orphelins nécessite un accès MTN en lecture ; à valider avec
  l'opérateur.
- Aucun paiement réel ne doit être utilisé pour recetter ces cas.
