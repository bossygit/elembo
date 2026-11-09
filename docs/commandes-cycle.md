# Cycle commercial des commandes

## Principe

Le devis et la commande sont deux objets distincts :

1. le client demande un devis ou paie un produit configurable ;
2. un devis accepté peut être converti en **commande** par le staff ;
3. la commande possède sa référence, son client, ses lignes, ses fichiers, ses montants et ses
   statuts ;
4. le paiement confirmé et la fabrication restent deux étapes séparées.

Un devis accepté ne devient jamais une commande automatiquement. La conversion est une action
staff explicite, idempotente et tracée.

## Parcours

Découverte → sélection → personnalisation ou fichiers → calcul du prix → récapitulatif →
validation client → paiement ou devis → confirmation → transmission atelier → fabrication →
contrôle qualité → livraison → clôture.

Dans le back-office :

- `/admin/devis` traite la demande, la proposition et la décision du client ;
- depuis un devis `ACCEPTE`, le formulaire « Transmission à l'atelier » crée une commande
  `BROUILLON` avec mode de paiement, frais de livraison, ville, adresse et date prévue ;
- `/admin/commandes` liste les commandes et `/admin/commandes/[id]` permet de suivre et de faire
  avancer le cycle ;
- le client retrouve l'avancement de sa commande dans le suivi de son devis, protégé par sa
  session.

## Statuts

Commande :

`BROUILLON` → `EN_ATTENTE_DE_VALIDATION` → `EN_ATTENTE_DE_PAIEMENT` → `PAYEE` →
`A_PRODUIRE` → `EN_PRODUCTION` → `CONTROLE_QUALITE` → `PRETE` → `EN_LIVRAISON` → `LIVREE`.

Statuts terminaux ou exceptionnels : `ANNULEE`, `REMBOURSEMENT_A_TRAITER`.

Sous-statuts :

- paiement : `NON_REQUIS`, `EN_ATTENTE`, `PAYE`, `ECHEC`, `ANOMALIE`, `REMBOURSE` ;
- production : `A_FAIRE`, `EN_COURS`, `TERMINE`, `BLOQUE`, `ANNULE` ;
- livraison : `A_LIVRER`, `EN_LIVRAISON`, `LIVREE`, `ECHEC`.

Les transitions sont vérifiées par `transition_commande_autorisee` dans la base. Une transition
invalide ne modifie ni les dates ni l'historique.

## Invariants

- **Référence unique** : `ELB-AAAAMMJJ-XXXXXXXX`, générée côté serveur ; l'unicité est aussi
  garantie par un index.
- **Coordonnées client** : `contact_snapshot` est copié au moment de la commande, en plus du lien
  vers `clients` ; une modification ultérieure de la fiche client ne réécrit pas l'historique.
- **Lignes et quantités** : `lignes_commande` porte la désignation, la quantité, le prix unitaire,
  le coût et le total. Pour une prestation issue d'un devis, la quantité demandée et les
  spécifications restent dans `options`.
- **Fichiers** : les fichiers du devis sont copiés dans `fichiers_commande` dans la même
  transaction que la commande.
- **Montants** : sous-total + livraison = total ; la livraison est saisie par le staff, jamais
  inventée.
- **Paiement** : la commande ne peut passer `PAYEE` sans un enregistrement `paiements` au statut
  `PAYE` et au bon montant. La confirmation manuelle crée un paiement réel (PENDING → PAYE) et
  laisse une trace.
- **Production** : le trigger de paiement crée une tâche `INITIALISATION` dans
  `travaux_production`, mais ne passe jamais la commande en production. Le staff doit la passer à
  `A_PRODUIRE`, puis à `EN_PRODUCTION`.
- **Dates** : `valide_le`, `paye_le`, `production_demarree_le`, `controle_qualite_le`, `prete_le`,
  `livraison_demarree_le`, `livree_le`, `cloture_le`, `annulee_le`,
  `remboursement_demande_le` sont posées dans la transaction de transition.
- **Remboursement** : `REMBOURSEMENT_A_TRAITER` est un statut de traitement, pas une preuve de
  remboursement effectif ; le paiement peut ensuite être marqué `REMBOURSE`.

## RPC

- `creer_commande_depuis_devis(...)` : crée la commande, sa ligne, copie les fichiers et
  l'historique ; idempotente par devis et par clé.
- `transitionner_commande(...)` : applique une transition et journalise l'acteur.
- `confirmer_paiement_manuel(...)` : enregistre un paiement hors passerelle, sans appel MTN.

Toutes les RPC sont `SECURITY DEFINER`, révoquées pour `anon` et `authenticated`, accordées
uniquement à `service_role`.

## Limites actuelles

- La migration `20261109130008_commandes_cycle.sql` est testée en local ; elle n'est pas appliquée
  sur le projet Supabase distant.
- Le tunnel de paiement direct du configurateur (MTN) possède son propre journal Redis et son
  archive de production. Il n'est pas encore branché sur `commandes` : la conversion implémentée
  ici concerne les devis acceptés. Le raccordement du paiement direct est un lot séparé.
- Aucun fournisseur d'email/SMS n'est configuré : les notifications de commande ne sont pas
  envoyées.
- Le stock, les coûts de revient et les marges ne sont pas encore alimentés par ce parcours.
