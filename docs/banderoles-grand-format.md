# Banderoles & supports grand format

Offre commerciale livrée sur la branche `feature/banderoles-grand-format` (13 novembre 2026).
Elle permet de commander une banderole (ou un roll-up, une bâche, un kakémono…) avec ou sans
création graphique, et à Smart Vision de chiffrer, proposer, sous-traiter à un imprimeur
partenaire et suivre la marge de chaque commande.

## 1. Principe : aucune architecture parallèle

Une demande de banderole **est un devis Elembo** (famille `IMPRESSION`). Elle emprunte donc
sans modification :

| Mécanisme existant | Réutilisé pour |
|---|---|
| `creer_devis_atomique`, idempotence, notifications Telegram / email | création de la demande |
| Bucket privé `devis`, URL signées, vérification binaire, statut d'analyse | fichiers du client |
| Session de suivi (`/devis/[reference]`), OTP, acceptation en ligne | suivi client et acceptation |
| `transitionner_devis` (NOUVEAU → EN_ANALYSE → PROPOSE → ACCEPTE…) | validation et proposition |
| `creer_commande_depuis_devis` (prix verrouillé) | commande |
| Statuts de commande, paiement MTN MoMo, confirmation manuelle | encaissement et production |
| `travaux_production` + `partenaires` + triggers de coût / marge (0010) | imprimeur affecté, coûts réels, marge |
| `journal_audit`, `exigerAcces`, matrice de permissions | traçabilité et droits |

**Aucun statut n'est ajouté.** L'état affiché (« Nouvelle demande », « Devis transmis »,
« En production »…) est dérivé des statuts devis + commande (`src/lib/grand-format/suivi.ts`).

## 2. Parcours client

- `/banderoles` : rubrique (6 catégories, 9 modèles d'inspiration, finitions, FAQ, appels à
  l'action « Commander une banderole », « Personnaliser mon visuel », « Demander un devis »).
- `/banderoles/commander?usage=deuil&modele=…&prestation=CREATION` : parcours en 6 étapes —
  utilisation, caractéristiques (dimensions libres au cm, quantité, finition, délai, commentaire,
  aperçu aux proportions réelles), prestation, fichiers, prix, coordonnées.
- Après envoi : redirection vers le suivi du devis existant.

Les visuels sont des compositions originales rendues en CSS/SVG (`ApercuBanderole`) ; noms et
lieux fictifs, aucune image tierce.

## 3. Prix : jamais inventé, toujours calculé côté serveur

- Grille de **vente** `tarifs_grand_format` : livrée **sans aucun montant**, en `TEST`.
- Seul un tarif `VALIDE` et actif produit une estimation. La validation est nominative et datée ;
  modifier un montant retire automatiquement la validation (trigger).
- `POST /api/banderoles/estimation` calcule l'estimation (fonction pure `estimer`, testée) ;
  la création de la demande la **recalcule** et l'enregistre (`estimation_fcfa`). Un montant
  envoyé par le navigateur est ignoré.
- Sur devis dans tous les autres cas : pas de tarif validé, urgence, accompagnement, finition ou
  création non chiffrées, format plus large que la laize, support « autre ».

Formule : `prix pièce = max(minimum, ⌈surface × prix/m² + périmètre × supplément finition/ml⌉₁₀₀)`,
`total = prix pièce × quantité + création (une fois)`, hors livraison. Calcul en centimètres
entiers (pas d'erreur flottante).

**Paiement** : le prix d'une banderole est toujours confirmé par Smart Vision (devis), puis la
commande est payée par le parcours existant (MTN MoMo, confirmation dans la fiche commande).
Aucun paiement n'est déclenché sur un montant provisoire.

## 4. Back-office

| Écran | Rôles | Contenu |
|---|---|---|
| `/admin/banderoles` | admin, commercial, finance | liste filtrable (état dérivé, utilisation, recherche), indicateurs, urgences, ventes et marge (admin/finance) |
| `/admin/banderoles/[id]` | idem | demande, fichiers (règles de téléchargement inchangées), chiffrage, proposition générée et modifiable, validation / refus, commande, planning imprimeur, rentabilité estimée vs réelle |
| `/admin/banderoles/tarifs` | admin, finance | saisie et validation de la grille d'estimation |
| `/admin/production/prestataires` | admin, atelier | imprimeurs : contact, adresse, types, dimensions max, délai ; tarifs négociés visibles et modifiables par admin/finance seulement |

Permissions ajoutées : `grand_format.voir`, `grand_format.chiffrer` (admin, commercial),
`grand_format.couts` et `grand_format.tarifs` (admin, finance). L'atelier n'a pas accès aux
demandes commerciales ; il voit l'imprimeur affecté dans sa vue Atelier habituelle.

### Rentabilité

- **Estimée** (devis) : prix de vente (impression + création facturée) − coûts estimés (imprimeur,
  création, livraison, autres). Le total est reporté dans `devis.cout_estime_fcfa` (trigger).
- **Réelle** (commande) : à la transformation en commande, le chiffrage devient des tâches
  d'atelier (`Impression grand format` avec l'imprimeur et la date, `Création graphique`,
  `Livraison`, `Autres frais`). L'équipe y remplace les estimations par les coûts payés.
  Marge brute = total facturé (livraison facturée comprise) − Σ coûts des tâches.
- Le tableau de bord global garde sa définition existante (« marge produit » = sous-total − coût,
  hors livraison facturée) : pour une banderole, l'écart entre les deux vaut les frais de
  livraison facturés.

## 5. Migration

`supabase/migrations/20261113120000_grand_format.sql` — additive :

- `partenaires` : `contact_nom`, `adresse`, `types_impression text[]`, `largeur_max_m`,
  `longueur_max_m` (+ index GIN). Les tarifs négociés réutilisent `partenaires.tarifs`.
- `tarifs_grand_format` (6 supports, sans prix) et `demandes_grand_format` (1—1 `devis`),
  contraintes CHECK, colonnes calculées (surface, prix de vente, coût estimé total).
- `creer_demande_grand_format(...)` : devis + demande dans une seule transaction.
- RLS activée, aucune permission `anon`, lecture staff seulement, écritures `service_role`.

Retour arrière : `supabase/rollbacks/20261113120000_grand_format_down.sql` (conserve les devis).
Tests SQL : `supabase/tests/grand_format.sql` (transaction annulée).

## 6. Tests

- `tests/grandFormatEstimation.test.ts` — calcul et refus d'estimation (13).
- `tests/grandFormatDomaine.test.ts` — alignement catalogue ↔ SQL, validation, statuts dérivés,
  rentabilité, proposition sans donnée confidentielle, droits (26).
- `tests/grandFormatRoutes.test.ts` — origine, validation, idempotence, prix serveur (11).
- `supabase/tests/grand_format.sql` — création atomique, idempotence, contraintes, coûts,
  validation de la grille, cycle devis → commande → marge, RLS.
- `scripts/e2e/banderoles.mjs` — scénario complet navigateur (client + back-office), à lancer
  uniquement sur un environnement local ou de test (il refuse les URL de production).

## 7. Déploiement

1. **Sauvegarde** de la base de production (`scripts/exporter-schema-supabase.sh` + données).
2. Appliquer la migration sur **staging** :
   `supabase link --project-ref <staging>` puis `supabase db push`, ou exécuter le fichier dans
   l'éditeur SQL. Lancer `supabase/tests/grand_format.sql` sur staging.
3. Déployer la branche en *preview* Vercel pointée sur staging ; dérouler le scénario e2e.
4. Appliquer la migration en **production**, puis fusionner la branche dans `main`.
   L'ordre importe : le code appelle `creer_demande_grand_format`, qui doit exister.
5. Dans `/admin/production/prestataires`, enregistrer les imprimeurs partenaires.
6. Optionnel : saisir puis **valider** la grille dans `/admin/banderoles/tarifs` pour activer
   l'estimation en ligne. Sans cela, toutes les demandes passent en devis.

Aucune nouvelle variable d'environnement. Compatible Vercel (routes Node, fichiers envoyés
directement à Supabase Storage).
