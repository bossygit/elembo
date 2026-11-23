# Elembo Partners — Lot 2 : affectation des travaux et exécution par les ateliers

**Statut : cadrage validé le 19 novembre 2026 — sous-lots 2.1 à 2.5 livrés et testés en local ; migration `0013` appliquée en staging et en production le 20/11/2026 ; reste la recette finale.**
Références : `docs/elembo-partners.md` (Lot 1), `docs/banderoles-grand-format.md`, code de `main`
au commit `618f4fa` (Lot 1 fusionné et déployé ; migrations `0001` → `0012` appliquées en staging
et en production).

> Le cahier des charges Elembo Partners v1.0 (note Obsidian) n'est pas dans le dépôt. Ce plan
> s'appuie sur les reports explicites du dépôt — `affectations_production`, instantanés de tarif,
> droits des travaux affectés, purge des brouillons — et sur les points laissés ouverts du CDC
> (§23-7 photos, §23-8 urgences, §23-9 rémunération). Les décisions ont été validées le
> 19 novembre 2026 (voir §1.4) : le périmètre est figé.

---

## 0. Résumé

Le Lot 1 a livré le référencement, la validation, les tarifs négociés et le portail atelier.
L'affectation des travaux, elle, est restée **manuelle et strictement interne** : le staff choisit
un imprimeur dans `travaux_production.partenaire_id` ou `demandes_grand_format.partenaire_id`,
l'atelier ne voit rien, le tarif n'est pas figé et aucune acceptation n'est tracée.

Le Lot 2 transforme cette sélection en **offre de travaux** :

1. Smart Vision propose un travail à un atelier validé, avec une échéance et un tarif figé ;
2. l'atelier accepte ou refuse depuis son portail, avec un motif en cas de refus ;
3. le tarif retenu est **instantané** (id, version, montant) : une version ultérieure ne réécrit
   jamais un coût accepté ;
4. les deux parties suivent l'exécution (proposé, accepté, refusé, annulé, expiré, terminé) ;
5. seuls les fichiers utiles au travail sont partagés, par URL signée et sous audit ;
6. les dossiers `BROUILLON` abandonnés depuis plus de 90 jours sont archivés et leurs fichiers
   supprimés.

Le Lot 2 **ne fait pas** le matching automatique, la réservation de capacité, la note de
performance, ni les paiements aux ateliers : ce sont des sujets du Lot 3 ou de la finance.

Volume proposé : **5 sous-lots, 17 à 22 jours ouvrés** (hors recette finale), dont 4 à 5 jours
pour le seul socle de données et de sécurité.

---

## 1. Périmètre

### 1.1 Dans le Lot 2

| Thème | Contenu |
|---|---|
| Socle de données | Table `affectations_production`, historique `affectations_evenements`, liens fichiers ; contraintes, index, RLS, fonctions, retour arrière |
| Proposition d'affectation | Depuis une tâche de production et depuis une banderole ; sélection d'un atelier validé, d'un tarif en vigueur, d'une échéance, d'une priorité, d'instructions et de fichiers |
| Instantané tarifaire | Tarif retenu copié (id, lignée, version, mode, prix unitaire, quantité de base, montant) ; immuable ; source et motif tracés |
| Portail atelier | `/partenaire/travaux` (liste et fiche), accepter, refuser avec motif, signaler terminé ; montant visible du seul responsable |
| Notifications | Proposition, acceptation, refus, annulation, expiration, rappel ; envoi immédiat quand possible, cron quotidien en filet |
| Back-office | Bloc d'affectation dans le dossier de production et la fiche banderole ; liste `/admin/affectations` ; onglet « Travaux » de la fiche partenaire |
| Droits | Nouvelles permissions staff `affectations.*`, nouveaux droits portail `travaux.*`, correction de `DROITS_DOSSIER` |
| Fichiers (si D4 retenu) | Partage sélectif de fichiers de commande avec l'atelier, URL signées 60 s, journalisation des téléchargements |
| Urgences (si D5 retenu) | Priorité `NORMALE` / `URGENTE`, affichage et notification ; aucun barème d'urgence |
| Entretien | Archivage des `BROUILLON` abandonnés (> 90 jours), désactivation des accès, suppression des fichiers, expiration des propositions |
| Audit | Nouvelles entités `affectation`, actions `AFFECTATION_*`, journal staff uniquement |

### 1.2 Hors du Lot 2

| Sujet | Lot cible |
|---|---|
| Matching automatique capacité ↔ demande, suggestions algorithmiques | Lot 3 |
| `capacite_totale` / `capacite_reservee`, contrôle de surcharge | Lot 3 (calcul à partir des affectations acceptées) |
| Note de performance visible du partenaire | Lot 3 (reste interne au Lot 2) |
| Paiements, relevés de rémunération, pénalités, barème d'urgence | Finance / Lot 3 (voir D5 et D6) |
| Photos obligatoires dans le dossier | À trancher (D7) ; sinon hors Lot 2 |
| Sous-traitance en cascade | Livrée au Lot 1 (déclarée sur le service) |
| Rendu ou validation graphique du fichier d'impression (Banner Studio) | Chantier Banner Studio |
| Application mobile ou notification push | Hors périmètre |

### 1.3 Décisions à faire valider

| # | Décision | Recommandation | Conséquence si refus |
|---|---|---|---|
| **D1** | Objets affectables | **Tâches de production ET banderoles** dans le même socle | Si banderoles exclues : elles restent manuelles, le Lot 2 ne règle qu'un tiers du problème |
| **D2** | Partenaire sans compte portail | **Aucune affectation possible** : il faut un dossier `VALIDE`, actif et au moins un compte actif ; sinon inviter d'abord (mécanisme 1.6) | Sinon prévoir un mode « affectation directe » dégradé (statut accepté d'office), à concevoir et tester |
| **D3** | Montants négociés | **Instantané immuable**, visible du seul `RESPONSABLE` de l'atelier et des rôles staff admin/finance | Sinon risque de réécriture d'un coût accepté, déjà identifié au Lot 1 (§4.7) |
| **D4** | Fichiers de production | **Partage sélectif** par le staff, URL signées 60 s, audit des téléchargements | Sinon envoi manuel (WhatsApp, e-mail) : traçabilité nulle, à documenter comme dette |
| **D5** | Urgences (§23-8) | **Priorité informative seulement** (`NORMALE`/`URGENTE`), sans supplément ni pénalité | Sinon sous-lot supplémentaire : barème express, règles de priorité, répercussion tarifaire (3 à 5 j) |
| **D6** | Rémunération (§23-9) | **Hors Lot 2** : l'instantané prépare un relevé futur ; aucun paiement | Sinon +3 à 5 j et ouverture du chantier finance (relevés, rapprochements, MTN) |
| **D7** | Photos obligatoires (§23-7) | **Restent optionnelles** ; la validation d'un dossier ne dépend pas des photos | Sinon règle de complétude à ajouter au dossier et à la file de validation (1 à 2 j) |
| **D8** | Délai de réponse | **72 h par défaut**, modifiable à la proposition ; expiration quotidienne | Sinon propositions sans fin, tâches bloquées sans relance |
| **D9** | Purge des brouillons | **Archivage doux** à 90 jours + suppression des fichiers + désactivation des accès ; jamais de suppression de ligne ni de compte Auth | Sinon suppression de lignes (perte d'audit) à éviter |
| **D10** | Qui décide côté atelier | **Responsable seul** ; `PRODUCTION` exécute et signale terminé, `LECTURE` consulte | Sinon ouvrir la décision à `PRODUCTION` (moins de contrôle commercial) |

### 1.4 Décisions validées — 19 novembre 2026

Le propriétaire a validé l'ensemble des recommandations du §1.3. Le périmètre du Lot 2 est figé
ainsi :

| # | Décision retenue |
|---|---|
| **D1** | Tâches de production **et** banderoles dans le même socle |
| **D2** | Aucune affectation sans dossier `VALIDE`, actif et au moins un compte portail actif |
| **D3** | Instantané tarifaire immuable ; montants visibles du seul `RESPONSABLE` de l'atelier et des rôles staff admin/finance |
| **D4** | Partage sélectif des fichiers de production, URL signées 60 s, audit des téléchargements |
| **D5** | Priorité informative seulement (`NORMALE`/`URGENTE`), sans barème ni pénalité |
| **D6** | Rémunération (relevés, paiements) **hors Lot 2** ; l'instantané prépare le Lot 3 |
| **D7** | Photos **optionnelles** ; la validation d'un dossier n'en dépend pas |
| **D8** | Délai de réponse de **72 h** par défaut, expiration quotidienne |
| **D9** | **Archivage doux** des `BROUILLON` à 90 jours, suppression des fichiers, désactivation des accès |
| **D10** | **Responsable seul** décide ; `PRODUCTION` exécute et signale terminé ; `LECTURE` consulte |
| **Point 9** | `SUR_DEVIS` autorisé avec **montant provisoire > 0**, motif obligatoire et permission `affectations.couts` ; aucune affectation à montant nul |

Le chiffrage du §8 reste celui de cette version : **17 à 22 jours ouvrés**, hors recette finale.

---

## 2. État de référence vérifié

| Élément | Constat |
|---|---|
| Migrations | `0001` → `0012` appliquées en staging **et** en production (vérifié le 19/11/2026) ; `0013` écrite et appliquée sur la base **locale** (19/11/2026), puis sur **staging** et en **production** (20/11/2026) |
| Lot 1 | Sous-lots `1.1` à `1.6` livrés, fusionnés et déployés ; portail et back-office fonctionnels |
| Affectation actuelle | `travaux_production.partenaire_id` + `interne`, `demandes_grand_format.partenaire_id`, contrôlés par `verifierAffectation` ; aucune trace d'acceptation |
| Tarifs | `partenaire_tarifs` versionnés par lignée, paliers contigus, versions validées ; pas d'instantané ailleurs |
| Calcul du coût banderole | `src/lib/partenaires/coutGrandFormat.ts` sait calculer un montant, mais ne retourne ni `tarif_id` ni `version` — à étendre |
| Droits portail | `DROITS_DOSSIER = Object.keys(DROITS)` inclut **tous** les droits : contraire au commentaire de `droits.ts` qui exclut les travaux ; à corriger |
| Notifications | File `notifications` + cron quotidien `0 6 * * *` ; envoi immédiat possible par `after()` (pattern des devis) |
| Crons Vercel | Plan Hobby : **2 crons déjà utilisés** (`/api/momo/reconcilier`, `/api/cron/notifications`) ; ne pas en ajouter un troisième |
| Fichiers | Bucket `production` privé, table `fichiers_commande` ; accès staff `production.fichiers` |
| Capacités | Laizes, finitions, délais et disponibilités disponibles ; réservation reportée au Lot 3 |
| Données de production | Aucune affectation existante à reprendre ; la production ne contenait aucun prestataire au moment des migrations (16/11/2026). Les éventuelles valeurs `partenaire_id` posées à la main restent des affectations historiques non liées |

---

## 3. Décisions de conception

### 3.1 Une seule source de vérité : `affectations_production`

`travaux_production.partenaire_id` et `demandes_grand_format.partenaire_id` restent les colonnes
lues par l'atelier, les listes et les coûts. Elles deviennent **la conséquence d'une affectation
acceptée**, jamais la source de la décision :

- créer une proposition n'écrit **pas** `partenaire_id` ;
- l'acceptation l'écrit (trigger de synchronisation) ;
- une annulation après acceptation l'efface, uniquement si la valeur vient de cette affectation.

Ainsi, aucune dualité : l'historique et l'état de l'offre vivent dans `affectations_production`,
et les écrans existants continuent de fonctionner sans réécriture profonde.

### 3.2 Cycle de vie

```
PROPOSEE ──accepte──▶ ACCEPTEE ──termine──▶ TERMINEE
   │  │                   └────annule───▶ ANNULEE
   │  ├──refuse──▶ REFUSEE
   │  └──expire──▶ EXPIREE
```

| Transition | Qui | Conditions |
|---|---|---|
| `—` → `PROPOSEE` | staff (`affectations.gerer`) | Partenaire `VALIDE`, actif, avec au moins un compte actif ; aucune autre affectation active sur l'objet |
| `PROPOSEE` → `ACCEPTEE` | atelier (`RESPONSABLE`) | Avant `date_limite_reponse` ; l'utilisateur est rattaché à l'entreprise, actif |
| `PROPOSEE` → `REFUSEE` | atelier (`RESPONSABLE`) | Motif obligatoire, avant l'échéance |
| `PROPOSEE` → `ANNULEE` | staff | Motif obligatoire |
| `PROPOSEE` → `EXPIREE` | système (cron) | `date_limite_reponse` dépassée |
| `ACCEPTEE` → `ANNULEE` | staff | Motif obligatoire ; libère l'affectation de l'objet |
| `ACCEPTEE` → `TERMINEE` | atelier (`RESPONSABLE` ou `PRODUCTION`) | Signale la fin du travail ; **ne change pas** le statut de la tâche, que le staff confirme dans l'atelier |

Règles :

- une seule affectation **active** (`PROPOSEE` ou `ACCEPTEE`) par tâche et par banderole ;
- une réaffectation se fait par annulation puis nouvelle proposition : **on ne modifie jamais une
  affectation passée** ;
- une proposition expirée ne peut plus être acceptée, même si le cron n'est pas encore passé :
  la fonction de décision vérifie l'horodatage ;
- les transitions sont vérifiées en base (`affectation_transition_autorisee`) **et** en TypeScript
  (`src/lib/partenaires/affectations.ts`), comme pour les statuts du Lot 1.

### 3.3 Instantané tarifaire

À la proposition, si un tarif est choisi :

1. il doit appartenir au partenaire, être `VALIDE` et en vigueur à la date du jour ;
2. le serveur calcule le montant (fonctions pures `paliers.ts` / `coutGrandFormat.ts`) à partir de
   la quantité de base (m² arrondis au m² supérieur pour l'impression, pièces ou heures sinon) ;
3. la ligne conserve : `tarif_id`, `tarif_lignee_id`, `tarif_version`, `tarif_nom`,
   `tarif_mode_calcul`, `tarif_prix_unitaire_fcfa`, `quantite_base`, `montant_fcfa`,
   `tarif_source`, `tarif_motif`.

Sources possibles :

| `tarif_source` | Sens | Règle |
|---|---|---|
| `TARIF_VALIDE` | Tarif négocié validé, en vigueur | `tarif_id` obligatoire, montant calculé |
| `ANCIEN_PRIX` | Ancien `prix_m2_fcfa` (fiche héritée), signalé « non validé » | `tarif_id` nul, motif conseillé |
| `MANUEL` | Négociation ponctuelle | Motif obligatoire + permission `affectations.couts` |
| `SUR_DEVIS` | Prix non arrêté au moment de la proposition | Montant **provisoire** obligatoire (> 0), motif obligatoire, permission `affectations.couts` ; la question 9 du §12 tranche s'il faut l'autoriser |

**Immuabilité** : un trigger refuse toute modification des colonnes de l'instantané et des données
du travail (`libelle`, dimensions, dates, instructions, priorité). Corriger une proposition =
annuler et reproposer, pour conserver la trace. Le seul champ modifiable après création est le
cycle de vie (statut et champs de décision).

Conséquences : la date limite de réponse n'est pas prolongeable — « relancer » envoie une
notification supplémentaire sans changer l'échéance ; pour laisser plus de temps, il faut annuler
et reproposer. À la création, `date_limite_reponse` doit être dans le futur (au moins une heure).

### 3.4 Synchronisation avec l'existant

| Événement | `travaux_production` | `demandes_grand_format` |
|---|---|---|
| Proposition | Rien (`partenaire_id` reste nul, la tâche reste « interne ») | Rien |
| Acceptation | `partenaire_id`, `interne = false`, `date_prevue` si nulle | `partenaire_id` |
| Refus / expiration | Rien (aucune affectation n'avait été posée) | Rien |
| Annulation après acceptation | Efface `partenaire_id` **si** c'est ce partenaire, remet `interne = true` | Efface `partenaire_id` si c'est ce partenaire |
| Fin | Rien : le staff clôture la tâche (`statut = TERMINE`) | Rien |

Conséquences d'affichage : tant que la proposition est en attente, l'écran d'atelier affiche
« Proposé à *X* — en attente de réponse » et non « Affecté à *X* ». Le filtre « commandes d'un
partenaire » ne remonte que les affectations **acceptées**, ce qui est le comportement attendu.

Le sélecteur direct de prestataire des écrans production et banderole est remplacé par le
formulaire de proposition. `verifierAffectation` reste la vérification serveur réutilisée par
`proposer_affectation` (partenaire `VALIDE` et actif), mais ne permet plus de poser un partenaire
sans acceptation.

### 3.5 Fichiers (si D4)

- le staff coche, parmi les `fichiers_commande` de la commande, ceux à partager ;
- la table `affectation_fichiers` matérialise le partage ; un trigger vérifie que le fichier
  appartient bien à la commande de l'affectation ;
- le portail ne liste que ces fichiers, jamais ceux de la commande entière ;
- téléchargement par URL signée **60 secondes**, générée côté serveur après vérification de la
  session et de l'affectation ; chaque téléchargement est journalisé ;
- aucun accès anonyme, aucune URL publique, aucun listage du bucket `production`.

### 3.6 Urgences (si D5)

- champ `priorite` (`NORMALE` / `URGENTE`) sur l'affectation ;
- affichage d'un badge, notification immédiate (pas de fenêtre d'attente) ;
- **aucun** supplément tarifaire, **aucune** pénalité, **aucune** règle de priorité automatique :
  ces règles exigent un barème et une décision commerciale (D5).

### 3.7 Purge des `BROUILLON` abandonnés

Critères stricts :

- `statut = 'BROUILLON'` ;
- `origine = 'INSCRIPTION'` (une fiche créée par le staff n'est jamais purgée) ;
- jamais soumis (`soumis_le is null`) ;
- inactif depuis plus de 90 jours (`maj_le`) ;
- aucun travail en cours (par construction impossible pour un `BROUILLON`).

Action :

1. le serveur supprime les objets du bucket `partenaires` de l'entreprise ;
2. la fonction SQL archive l'entreprise (`ARCHIVE`), désactive les rattachements, supprime les
   lignes `partenaire_fichiers`, écrit un événement d'audit `SYSTEME` ;
3. le compte Supabase Auth **n'est pas supprimé** (l'utilisateur peut être réinvité) ;
4. l'opération est idempotente et journalisée (nombre d'archives, nombre de fichiers supprimés).

L'historique des statuts du Lot 1 n'enregistre pas de motif pour `ARCHIVE` : le motif est écrit
dans `partenaires.motif_decision` et dans le journal d'audit (`PARTENAIRE_BROUILLON_PURGE`).

### 3.8 Notifications

| Événement | Destinataire | Canal | Clé d'idempotence |
|---|---|---|---|
| Proposition | Responsable + Production de l'atelier | EMAIL (sans montant) | `affectation:{id}:proposee:{userId}` |
| Acceptation / refus | Staff (Telegram + e-mail de notification) | TELEGRAM + EMAIL | `affectation:{id}:{decision}` |
| Annulation | Responsable + Production | EMAIL | `affectation:{id}:annulee:{userId}` |
| Expiration | Responsable | EMAIL | `affectation:{id}:expiree:{userId}` |
| Rappel à J-1 | Responsable + Production | EMAIL | `affectation:{id}:rappel:{userId}` |
| Fin signalée | Staff | TELEGRAM | `affectation:{id}:terminee` |

Envoi immédiat après l'action par `after(() => traiterNotifications(20))` (pattern existant des
devis), le cron quotidien restant le filet de sécurité. **Aucun montant dans les e-mails**, comme
au Lot 1.

---

## 4. Modèle de données — migration `20261119120000_affectations.sql` (additive)

### 4.1 `affectations_production`

```sql
create sequence if not exists public.affectations_reference_seq;

create table public.affectations_production (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default (
    'AFF-' || to_char(now(), 'YYMMDD') || '-'
    || lpad(nextval('public.affectations_reference_seq')::text, 4, '0')
  ),

  partenaire_id uuid not null references public.partenaires (id) on delete restrict,
  commande_id uuid not null references public.commandes (id) on delete cascade,
  tache_id uuid references public.travaux_production (id) on delete cascade,
  devis_id uuid references public.demandes_grand_format (devis_id) on delete cascade,
  objet text not null check (objet in ('TACHE_PRODUCTION', 'BANDEROLE')),
  statut text not null default 'PROPOSEE'
    check (statut in ('PROPOSEE', 'ACCEPTEE', 'REFUSEE', 'ANNULEE', 'EXPIREE', 'TERMINEE')),

  -- Travail demandé (figé à la proposition)
  libelle text not null check (char_length(trim(libelle)) between 2 and 200),
  support text check (support is null or support ~ '^[A-Z0-9_]{2,40}$'),
  quantite integer check (quantite is null or quantite > 0),
  unite text check (unite is null or unite in ('M2', 'METRE_LINEAIRE', 'PIECE', 'HEURE', 'LOT')),
  surface_m2 numeric(12, 4) check (surface_m2 is null or surface_m2 > 0),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  instructions text check (instructions is null or char_length(instructions) <= 4000),
  priorite text not null default 'NORMALE' check (priorite in ('NORMALE', 'URGENTE')),
  date_debut_prevue date,
  date_fin_prevue date,
  date_limite_reponse timestamptz not null default now() + interval '72 hours',

  -- Instantané du tarif (immuable après insertion)
  tarif_id uuid references public.partenaire_tarifs (id) on delete set null,
  tarif_lignee_id uuid,
  tarif_version integer check (tarif_version is null or tarif_version > 0),
  tarif_nom text,
  tarif_mode_calcul text,
  tarif_prix_unitaire_fcfa integer check (tarif_prix_unitaire_fcfa is null or tarif_prix_unitaire_fcfa >= 0),
  quantite_base numeric(12, 4) check (quantite_base is null or quantite_base > 0),
  montant_fcfa integer not null check (montant_fcfa >= 0),
  tarif_source text not null check (tarif_source in ('TARIF_VALIDE', 'ANCIEN_PRIX', 'MANUEL', 'SUR_DEVIS')),
  tarif_motif text check (tarif_motif is null or char_length(tarif_motif) <= 1000),

  -- Cycle de vie
  proposee_le timestamptz not null default now(),
  proposee_par uuid references auth.users (id) on delete set null,
  acceptee_le timestamptz,
  acceptee_par uuid references auth.users (id) on delete set null,
  refusee_le timestamptz,
  refusee_par uuid references auth.users (id) on delete set null,
  motif_refus text check (motif_refus is null or char_length(motif_refus) <= 1000),
  annulee_le timestamptz,
  annulee_par uuid references auth.users (id) on delete set null,
  motif_annulation text check (motif_annulation is null or char_length(motif_annulation) <= 1000),
  expiree_le timestamptz,
  terminee_le timestamptz,
  terminee_par uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),

  constraint affectations_objet_unique check (num_nonnulls(tache_id, devis_id) = 1),
  constraint affectations_objet_coherent check (
    (objet = 'TACHE_PRODUCTION' and tache_id is not null and devis_id is null)
    or (objet = 'BANDEROLE' and devis_id is not null and tache_id is null)
  ),
  constraint affectations_dates check (
    date_fin_prevue is null or date_debut_prevue is null or date_fin_prevue >= date_debut_prevue
  ),
  constraint affectations_manuel_motive check (
    tarif_source not in ('MANUEL', 'SUR_DEVIS') or btrim(coalesce(tarif_motif, '')) <> ''
  ),
  constraint affectations_tarif_valide_lie check (
    tarif_source <> 'TARIF_VALIDE' or tarif_id is not null
  ),
  constraint affectations_sur_devis_montant check (
    tarif_source <> 'SUR_DEVIS' or montant_fcfa > 0
  ),
  constraint affectations_decision_coherente check (
    (statut <> 'ACCEPTEE' or acceptee_le is not null)
    and (statut <> 'REFUSEE' or (refusee_le is not null and btrim(coalesce(motif_refus, '')) <> ''))
    and (statut <> 'ANNULEE' or (annulee_le is not null and btrim(coalesce(motif_annulation, '')) <> ''))
    and (statut <> 'EXPIREE' or expiree_le is not null)
    and (statut <> 'TERMINEE' or terminee_le is not null)
  )
);

comment on table public.affectations_production is
  'Offre de travaux d''un atelier partenaire : proposition, acceptation, exécution. Le tarif est figé à la proposition.';

create unique index affectations_une_active_tache
  on public.affectations_production (tache_id)
  where tache_id is not null and statut in ('PROPOSEE', 'ACCEPTEE');
create unique index affectations_une_active_devis
  on public.affectations_production (devis_id)
  where devis_id is not null and statut in ('PROPOSEE', 'ACCEPTEE');

create index affectations_partenaire_idx on public.affectations_production (partenaire_id, statut);
create index affectations_commande_idx on public.affectations_production (commande_id);
create index affectations_echeance_idx on public.affectations_production (statut, date_limite_reponse);
create index affectations_planning_idx on public.affectations_production (partenaire_id, date_fin_prevue);
```

### 4.2 `affectations_evenements`

```sql
create table public.affectations_evenements (
  id bigserial primary key,
  affectation_id uuid not null references public.affectations_production (id) on delete cascade,
  ancien_statut text,
  nouveau_statut text not null,
  acteur uuid references auth.users (id) on delete set null,
  acteur_type text not null check (acteur_type in ('STAFF', 'PARTENAIRE', 'SYSTEME')),
  motif text check (motif is null or char_length(motif) <= 1000),
  cree_le timestamptz not null default now()
);
create index affectations_evenements_idx on public.affectations_evenements (affectation_id, cree_le);
```

### 4.3 `affectation_fichiers` (si D4)

```sql
create table public.affectation_fichiers (
  affectation_id uuid not null references public.affectations_production (id) on delete cascade,
  fichier_id uuid not null references public.fichiers_commande (id) on delete cascade,
  ajoute_par uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  primary key (affectation_id, fichier_id)
);
```

### 4.4 Triggers

| Trigger | Rôle |
|---|---|
| `affectations_maj_le` | `set_maj_le` (fonction existante) |
| `affectations_transition` | refuse une transition non autorisée |
| `affectations_snapshot` | refuse la modification des colonnes figées |
| `affectations_objet` | vérifie que la tâche / banderole et la commande se correspondent |
| `affectations_sync` | écrit `partenaire_id` / `interne` dans `travaux_production` et `demandes_grand_format` |
| `affectation_fichiers_coherence` | le fichier partagé appartient à la commande de l'affectation |

### 4.5 Fonctions

| Fonction | Appelant | Rôle |
|---|---|---|
| `proposer_affectation(p_objet, p_commande_id, p_tache_id, p_devis_id, p_partenaire_id, p_tarif_id, p_quantite_base, p_montant_fcfa, p_tarif_source, p_donnees jsonb, p_acteur, p_acteur_email)` | serveur `service_role` | Contrôles, insertion, événement `PROPOSEE`, retour de l'id |
| `ajouter_fichiers_affectation(p_id, p_fichiers uuid[], p_acteur)` | serveur | Vérifie l'appartenance à la commande et que l'affectation est encore `PROPOSEE`, insère les liens |
| `decider_affectation(p_id, p_utilisateur, p_decision, p_motif)` | serveur | Vérifie rattachement, rôle `RESPONSABLE`, entreprise `VALIDE`, échéance ; met à jour le statut et l'événement |
| `annuler_affectation(p_id, p_acteur, p_acteur_email, p_motif)` | serveur staff | Annule une proposition ou une affectation acceptée |
| `terminer_affectation(p_id, p_utilisateur)` | serveur | `RESPONSABLE` ou `PRODUCTION` ; passe à `TERMINEE` |
| `expirer_affectations()` | cron | Expire les propositions dépassées, retourne le nombre |
| `mes_affectations()` | portail | Liste les affectations de l'entreprise, montant seulement pour `RESPONSABLE` |
| `mon_affectation(p_id)` | portail | Fiche détaillée filtrée par `partenaire_session()` + événements + fichiers autorisés |
| `brouillons_abandonnes(p_jours)` | cron | Liste les candidats à l'archivage |
| `archiver_brouillon(p_id, p_motif)` | cron | Archive, désactive les accès, supprime les lignes de fichiers |

Toutes les fonctions sont `security definer`, `set search_path = pg_catalog, public, auth`, et
révoquées de `public`/`anon`. Seules `mes_affectations()` et `mon_affectation()` sont exécutables
par `authenticated` (portail) et `service_role` ; les autres fonctions ne sont exécutables que par
`service_role`. Les fonctions de décision vérifient **elles-mêmes** le rattachement de
`p_utilisateur` (défense en profondeur, même si le serveur a déjà appelé `exigerPartenaire`).

### 4.6 RLS et droits

| Table | Staff | Partenaire |
|---|---|---|
| `affectations_production` | `is_staff()`, lecture | **aucune politique** : lecture par `mes_affectations()` / `mon_affectation()` |
| `affectations_evenements` | `is_staff()`, lecture | aucune lecture directe ; inclus dans `mon_affectation()` |
| `affectation_fichiers` | `is_staff()`, lecture | aucune lecture directe ; liens exposés par `mon_affectation()` |

Le choix de **ne pas** donner de politique partenaire sur la table est volontaire : le montant
négocié doit rester invisible d'un `PRODUCTION` ou d'un `LECTURE`, et la RLS ne sait pas masquer
une colonne. Le passage par une fonction `security definer` qui n'expose `montant_fcfa` qu'au
`RESPONSABLE` reprend le modèle de `mon_partenaire()`.

Grants et politiques :

```sql
alter table public.affectations_production enable row level security;
alter table public.affectations_evenements enable row level security;
alter table public.affectation_fichiers enable row level security;

create policy affectations_production_staff on public.affectations_production
  for select to authenticated using (public.is_staff());
create policy affectations_evenements_staff on public.affectations_evenements
  for select to authenticated using (public.is_staff());
create policy affectation_fichiers_staff on public.affectation_fichiers
  for select to authenticated using (public.is_staff());

revoke all on public.affectations_production, public.affectations_evenements,
  public.affectation_fichiers from anon, authenticated;

grant select on public.affectations_production, public.affectations_evenements,
  public.affectation_fichiers to authenticated;   -- RLS : is_staff() seulement

revoke all on public.affectations_production, public.affectations_evenements,
  public.affectation_fichiers from service_role;
grant select on public.affectations_production, public.affectations_evenements,
  public.affectation_fichiers to service_role;
-- Les écritures passent exclusivement par les fonctions ci-dessus ; aucun grant
-- insert/update/delete, aucune suppression de ligne possible.
```

### 4.7 Retour arrière

`supabase/rollbacks/20261119120000_affectations_down.sql` : suppression des triggers, fonctions,
tables et séquence dans l'ordre inverse. Aucune donnée métier existante n'est touchée : la
migration est strictement additive. Le rollback n'est utilisable qu'avant la première affectation
réelle (sinon perte de l'historique des offres). Il a été rejoué sur Supabase local le
19/11/2026, puis la migration réappliquée.

---

## 5. Règles métier

### 5.1 Éligibilité

- **Atelier** : `statut = 'VALIDE'`, `actif = true`, au moins un `partenaire_utilisateurs.actif`.
- **Objet** : tâche de production d'une commande non annulée, ou banderole dont la commande existe
  (`commandes.devis_id = demandes_grand_format.devis_id`). Une banderole sans commande ne peut pas
  être affectée : elle se chiffre d'abord, puis se convertit.
- **Capacité** : l'écran d'affectation met en avant les ateliers dont une capacité `VALIDEE`
  couvre le support et la laize ; ce n'est **pas** un contrôle bloquant au Lot 2 (le staff reste
  responsable). Le matching automatique est du Lot 3.

### 5.2 Prix et marge

- Le montant de l'affectation est le **coût atelier** (ce que Smart Vision paie).
- Il est figé et ne modifie ni `devis.montant_propose_fcfa`, ni le prix de vente.
- L'écran banderole continue d'afficher le coût estimé et la marge ; l'affectation ajoute la
  référence du tarif et la version utilisés.
- Un écart entre le coût estimé du devis et l'affectation acceptée est **signalé** (badge), jamais
  corrigé automatiquement.

### 5.3 Disponibilité et capacité

- L'écran affiche la dernière disponibilité déclarée et les volumes journaliers/hebdomadaires
  connus, à titre d'aide.
- Aucun calcul de `capacite_reservee`, aucun blocage automatique : reporté au Lot 3 (décision du
  Lot 1 §4.9).

### 5.4 Refus, annulation, réaffectation

- Un refus exige un motif, visible du staff ; il n'est pas notifié aux autres ateliers.
- Une annulation staff exige un motif, notifié à l'atelier.
- La réaffectation crée une **nouvelle** affectation ; l'ancienne reste dans l'historique.
- « Relancer » n'allonge pas l'échéance : c'est une notification supplémentaire (clé
  d'idempotence par jour). Pour donner plus de temps, annuler puis reproposer.
- Une entreprise suspendue après acceptation garde l'affectation en cours pour le staff (elle ne
  peut plus agir), mais aucune nouvelle proposition ne peut lui être faite.
- Une entreprise suspendue alors qu'une proposition est en attente ne peut plus l'accepter : la
  fonction de décision vérifie `VALIDE` et actif ; le staff annule la proposition.

### 5.5 Audit

- Entité `affectation` ajoutée à `EntiteAuditee`.
- Actions : `AFFECTATION_PROPOSEE`, `AFFECTATION_ACCEPTEE`, `AFFECTATION_REFUSEE`,
  `AFFECTATION_ANNULEE`, `AFFECTATION_EXPIREE`, `AFFECTATION_TERMINEE`,
  `AFFECTATION_FICHIERS`, `PARTENAIRE_BROUILLON_PURGE`.
- Les montants figurent dans l'audit (staff seulement), comme pour les tarifs.

---

## 6. Interfaces

### 6.1 Back-office

| Écran | Contenu | Permission |
|---|---|---|
| `/admin/production/[id]` | Bloc « Affectation » par tâche : proposer, état, annuler, relancer ; le sélecteur direct de prestataire disparaît | `affectations.gerer` (+ `affectations.couts` pour le montant manuel) |
| `/admin/banderoles/[id]` | Bloc planning existant transformé en proposition : atelier, tarif suggéré, dates, priorité, fichiers | idem |
| `/admin/affectations` | Liste filtrable (statut, partenaire, échéance, retard), compteurs, actions annuler/relancer | `affectations.voir` |
| `/admin/partenaires/[id]` | Nouvel onglet « Travaux » : historique des affectations, taux d'acceptation, montants (admin/finance) | `partenaires.voir` |
| `/admin/partenaires/validation` | Inchangé | — |

Le formulaire de proposition affiche : atelier (filtré), tarif (validé et en vigueur), quantité de
base, montant calculé (masqué sans `affectations.couts`), dates, priorité, instructions, fichiers
de la commande. Le montant manuel exige `affectations.couts` et un motif.

### 6.2 Portail atelier

| Page | Contenu |
|---|---|
| `/partenaire/travaux` | Cartes « À répondre », « En cours », « Terminés » ; badge de retard, priorité, référence, échéance ; montant visible du seul responsable |
| `/partenaire/travaux/[id]` | Détail technique (support, dimensions, quantité, finitions, instructions), fichiers partagés, historique, actions |
| Actions | Accepter ; refuser avec motif ; signaler terminé |

- Entrée « Travaux » dans la navigation, juste après « Mon dossier », droit `travaux.voir`.
- Carte « Travaux à confirmer » sur le tableau de bord quand au moins une proposition attend.
- Un partenaire dont le dossier n'est pas validé ne voit **aucune** rubrique travaux
  (`DROITS_DOSSIER` corrigé, voir §7).
- Montant : `null` pour `PRODUCTION` et `LECTURE`, exposé seulement au `RESPONSABLE` — à la fois
  par la fonction SQL et par l'affichage.

### 6.3 Notifications

Reprise de la table `notifications` et du module `src/server/devis/notifications.ts`. Les e-mails
sont mis en file, jamais bloquants ; l'envoi immédiat se fait par `after()`, le cron quotidien
reprend les échecs. Tant que la clé `RESEND_API_KEY` (et `DEVIS_EMAIL_FROM`) n'est pas configurée
côté application, les propositions restent visibles au portail mais l'atelier n'est pas prévenu
par e-mail : c'est un prérequis d'exploitation (voir §10), distinct du SMTP de Supabase Auth qui
sert aux e-mails d'inscription.

### 6.4 Fichiers (si D4)

- Sélection à la proposition, ajout/retrait possible **avant** acceptation uniquement.
- Les liens sont figés après acceptation (ajouter un fichier après acceptation = nouvelle
  proposition ou envoi manuel, selon D4).
- URL signée 60 s, nom d'origine, type MIME, taille ; journalisation à chaque téléchargement.
- Aucun accès aux autres fichiers de la commande, aucune URL publique, aucun téléchargement anonyme.

### 6.5 Fichiers à créer ou modifier

**Créés**

- `supabase/migrations/20261119120000_affectations.sql` + rollback
- `src/lib/partenaires/affectations.ts` (transitions, libellés, calcul de l'instantané)
- `src/server/admin/affectations.ts` (proposition, annulation, relance, listes)
- `src/server/partenaires/travaux.ts` (lecture et décisions du portail)
- `src/app/admin/(protected)/affectations/` (liste) et composant de proposition
- `src/app/partenaire/travaux/` (liste, fiche, actions)
- `src/components/admin/affectation.tsx`, `src/components/partenaire/travaux.tsx`
- `tests/partenairesAffectations.test.ts`, `tests/affectationsDomaine.test.ts`,
  `supabase/tests/affectations.sql`

**Modifiés**

- `src/lib/partenaires/droits.ts` (`travaux.*`, `DROITS_DOSSIER` explicite)
- `src/lib/admin/permissions.ts` (`affectations.*`)
- `src/app/partenaire/layout.tsx` et `src/app/partenaire/page.tsx` (navigation, carte)
- `src/app/admin/(protected)/layout.tsx` (menu Affectations)
- `src/app/admin/(protected)/production/[id]/page.tsx` et `actions.ts`
- `src/app/admin/(protected)/banderoles/[id]/page.tsx` et `actions.ts`
- `src/server/admin/production.ts` (`verifierAffectation` réutilisé, affectation à la place de
  l'écriture directe)
- `src/lib/partenaires/coutGrandFormat.ts` (retourner `tarif_id`, `version`, prix unitaire)
- `src/server/admin/audit.ts` (entité `affectation`)
- `src/server/admin/partenaires.ts` (notification générique multi-rôles)
- `src/app/api/cron/notifications/route.ts` (expiration, rappels, purge)
- `docs/elembo-partners.md`, guide d'utilisation

---

## 7. Droits et sécurité

### 7.1 Staff — nouvelles permissions

| Permission | Rôles |
|---|---|
| `affectations.voir` | admin, commercial, atelier, finance |
| `affectations.gerer` | admin, commercial, atelier |
| `affectations.annuler` | admin, commercial, atelier |
| `affectations.couts` | admin, finance (montants, montant manuel, motif) |

### 7.2 Portail — nouveaux droits

| Droit | Rôles |
|---|---|
| `travaux.voir` | RESPONSABLE, PRODUCTION, LECTURE |
| `travaux.decider` | RESPONSABLE |
| `travaux.executer` | RESPONSABLE, PRODUCTION |
| `travaux.montant` | RESPONSABLE |

**Correction requise** : `DROITS_DOSSIER` est aujourd'hui `Object.keys(DROITS)`, donc tous les
futurs droits « travaux » seraient accordés à un dossier `EN_ATTENTE_VALIDATION` ou `REFUSE`.
Il devient une **liste explicite** des droits du dossier (entreprise, utilisateurs, machines,
capacités, services, tarifs, disponibilités, fichiers, soumission) et un test vérifie que
`travaux.*` n'en fait pas partie.

### 7.3 Règles serveur non négociables

1. Côté portail, `partenaire_id` vient de `exigerPartenaire()` / de la fonction SQL, jamais d'un formulaire ; côté staff, il est validé par `proposer_affectation` (partenaire `VALIDE`, actif, avec compte).
2. Les actions staff vérifient `affectations.gerer` / `affectations.couts` avant toute écriture.
3. Les fonctions de décision vérifient le rattachement de `p_utilisateur`, le rôle `RESPONSABLE`,
   l'état `VALIDE` et l'échéance.
4. Toute écriture passe par une fonction `security definer` ; le navigateur n'a aucun `insert`,
   `update` ou `delete` direct.
5. Un identifiant d'affectation d'une autre entreprise renvoie 404, jamais 403.
6. Double soumission : l'index unique d'affectation active renvoie un message clair, aucune
   deuxième ligne.
7. Acceptation concurrente : verrou `for update` dans `decider_affectation`, la seconde réponse
   échoue proprement.

### 7.4 Tests de sécurité A/B

Deux ateliers A et B, un compte sans entreprise, un compte staff, un compte suspendu :

- A ne lit aucune affectation de B, ni par la fonction, ni par l'API REST directe ;
- `PRODUCTION` de A ne peut ni décider, ni lire les montants ;
- `LECTURE` de A ne peut ni décider, ni exécuter ;
- un compte non rattaché, un compte non confirmé, une entreprise suspendue ne lisent rien ;
- aucune écriture directe depuis la clé anon + JWT partenaire ;
- aucun accès aux fichiers d'une commande non affectée, ni aux fichiers d'un autre atelier.

---

## 8. Découpage et estimation

| Sous-lot | Contenu | Livrables | Durée |
|---|---|---|---|
| **2.1 — Socle données et sécurité** | Migration `0013`, tables, index, contraintes, triggers, fonctions, RLS, grants, rollback ; correction `DROITS_DOSSIER` | Migration + rollback, `supabase/tests/affectations.sql`, tests A/B | 4–5 j — ✅ 19/11 |
| **2.2 — Affectation côté Smart Vision** | Formulaire de proposition (production + banderoles), instantané tarifaire, permissions, écran `/admin/affectations`, onglet fiche partenaire | Pages, actions, modules `src/lib/partenaires/affectations.ts`, `src/server/admin/affectations.ts`, tests | 5–6 j — ✅ 19/11 |
| **2.3 — Portail atelier** | `/partenaire/travaux`, fiche, accepter/refuser/terminer, montants masqués, navigation, tableau de bord | Pages, actions, DAL, tests composants | 4–5 j — ✅ 19/11 |
| **2.4 — Notifications et fichiers** | File de notifications, envoi immédiat, rappels, partage sélectif de fichiers, audit de téléchargement | Module notifications, route de téléchargement, tests | 3–4 j — ✅ 20/11 |
| **2.5 — Purge et finitions** | Archivage des `BROUILLON` > 90 j, expiration des propositions, intégration au cron existant, doc et guide | Fonctions + route cron, tests, doc | 1–2 j — ✅ 20/11 |

Dépendances : 2.2 et 2.3 dépendent de 2.1 ; 2.4 peut démarrer en parallèle de 2.3 ; 2.5 clôt.

**Avancement du 2.1 (19/11/2026)** : migration `20261119120000_affectations.sql`, rollback
`20261119120000_affectations_down.sql`, `supabase/tests/affectations.sql` et
`tests/affectationsSchema.test.ts` livrés. Vérifié sur Supabase local : migration appliquée,
rollback rejoué, script SQL passé (acceptation, refus, immuabilité, expiration, purge, cloisonnement
A/B). `DROITS_DOSSIER` est passé en liste explicite et les droits `travaux.*` sont ajoutés
(voir §7.2).

**Avancement du 2.2 (19/11/2026)** : domaine des affectations (`src/lib/partenaires/affectations.ts`),
permissions `affectations.*`, service back-office (`src/server/admin/affectations.ts`) — liste,
proposition, annulation, relance, calcul du montant côté serveur —, écran `/admin/affectations`,
formulaire de proposition réutilisable branché dans le dossier de production et la fiche banderole,
carte « Travaux » sur la fiche partenaire. L'affectation directe par les formulaires de tâche,
de chiffrage et de planning banderole est retirée : seul le trigger d'acceptation pose l'atelier.
Tests : `partenairesAffectations.test.ts`, `affectationsService.test.ts`, garde-fous admin et
back-office adaptés. Vérifié : `npx tsc --noEmit`, `npx vitest run` (818 tests) et `next build`.

**Avancement du 2.3 (19/11/2026)** : pages `/partenaire/travaux` (liste « à confirmer / en cours /
historique » et fiche détaillée), actions accepter / refuser avec motif / signaler terminé,
entrée de navigation et alerte « travaux à confirmer » sur le tableau de bord. Les lectures
passent par `mes_affectations()` / `mon_affectation()` avec la session de l'utilisateur, les
écritures par `service_role` après `exigerPartenaire` ; le montant reste masqué hors
`RESPONSABLE`. Tests : `partenairesTravaux.test.ts`, garde-fous du portail. Vérifié :
`npx tsc --noEmit`, `npx vitest run` (823 tests) et `next build`.

**Avancement du 2.4 (20/11/2026)** : notifications de proposition, relance, décision (staff),
annulation, expiration, fin et rappel, sans aucun montant dans les messages. Envoi immédiat après
les actions (`after()`), filet quotidien dans le cron existant avec expiration et rappels J-1.
Téléchargement des fichiers partagés depuis la fiche travail : contrôle par `mon_affectation()`,
URL signée 60 s, fichier vérifié, accès limité aux affectations `PROPOSEE`/`ACCEPTEE`/`TERMINEE`,
audit `AFFECTATION_FICHIER_TELECHARGE`. Tests : `affectationsNotifications.test.ts`. Vérifié :
`npx tsc --noEmit`, `npx vitest run` (829 tests) et `next build`.

**Avancement du 2.5 (20/11/2026)** : purge des dossiers `BROUILLON` issus d'une inscription, jamais
soumis et inactifs depuis plus de 90 jours, branchée dans le cron existant. Ordre strict :
suppression des objets du bucket `partenaires`, puis archivage (`archiver_brouillon`), désactivation
des accès et suppression des lignes de fichiers ; audit `PARTENAIRE_BROUILLON_PURGE`. La fiche
partenaire et le compte Auth sont conservés. Tests : `partenairesPurge.test.ts`. Vérifié :
`npx tsc --noEmit`, `npx vitest run` (833 tests) et `next build`.

**Les cinq sous-lots du Lot 2 sont livrés en local.** Restent la **recette finale** (2 jours), la
configuration Resend (notifications) et une passe de recette navigateur. La migration `0013`
est appliquée en staging et en production (20/11/2026).

**Staging (20/11/2026)** : `0013` appliquée sur elembo-staging (`wbbvpslpagptvlnvhiqo`) par
`supabase db push --remote`, après vérification du `dry-run` (seule `20261119120000` en attente)
et sauvegarde du schéma et des données :

```text
backups/schema-wbbvpslpagptvlnvhiqo-20261120T164121Z.sql
SHA-256 : b3e258c579c01eee04ce9c1efa41ed65501cbfcf900fe3f496fa810c8f8fc47b
backups/donnees-wbbvpslpagptvlnvhiqo-20261120T164256Z.sql
SHA-256 : c9f483e2ba70b91de2d1d0add2225482899a5ef2d9607527aeeea9397d6de6a9
```

`migration list --remote` aligné de `0001` à `0013`. `supabase/tests/affectations.sql` exécuté à
distance (`db query --remote`) : toutes les assertions passent, rien ne subsiste après le
`rollback` (aucun compte `@exemple.invalid`, tables d'affectation vides). Contrôles en lecture
seule : `affectations_production`, `affectations_evenements` et `affectation_fichiers` sous RLS,
aucun droit `anon`, `authenticated` en lecture seule. Le script de retour arrière n'a pas été
rejoué sur une copie.

**Production (20/11/2026)** : `0013` appliquée sur elembo-production (`ogshtnmbeequefisqwcz`) par
`supabase db push --remote`, après `dry-run` (seule `20261119120000` en attente) et sauvegarde :

```text
backups/schema-ogshtnmbeequefisqwcz-20261120T165339Z.sql
SHA-256 : b3e258c579c01eee04ce9c1efa41ed65501cbfcf900fe3f496fa810c8f8fc47b (identique au staging en 0012)
backups/donnees-ogshtnmbeequefisqwcz-20261120T165339Z.sql
SHA-256 : 705b754cfa441e301b1cac858bbf967c5a89f38349b669ab013df1611e253512
```

`migration list --remote` aligné de `0001` à `0013`. Script de test **non exécuté** (il crée des
comptes fictifs) ; contrôles en lecture seule : les trois tables d'affectation sous RLS, aucune
table `public` sans RLS (41/41), aucun droit `anon`, `authenticated` en lecture seule ; seules
`mes_affectations` et `mon_affectation` sont exécutables par `authenticated`, aucune fonction
exécutable par `anon`. Le CLI a été relié de nouveau au staging après l'opération.

**Recette navigateur (23/11/2026)** — application locale (`next dev`) branchée sur elembo-staging,
390 px et 1 280 px, comptes et données marqués (run `HAA9Y75F`) : admin, staff `atelier`, atelier A
(`RESPONSABLE` + `PRODUCTION`), atelier B. Vérifié : proposition d'une tâche (tarif validé,
6 m² → 12 000 FCFA figé, fichier partagé) et d'une banderole (3 m² → 6 000 FCFA) ; acceptation
(la tâche et la banderole passent à l'atelier) ; refus bloqué sans motif puis motivé ;
réaffectation à B ; expiration par `expirer_affectations()` ; fin signalée puis clôture staff ;
annulation motivée ; relance ; téléchargement (URL signée, audit, 404 sur un fichier non partagé) ;
`PRODUCTION` sans montant ni décision ; staff `atelier` sans coûts (montant forcé refusé par le
serveur) ; isolation A/B à l'écran (404) et par l'API (RPC, tables, écriture refusée) ; immuabilité
(mise à jour SQL directe refusée) ; historique et file de notifications (e-mails en `ECHEC` faute
de Resend, attendu).

Défauts trouvés et corrigés : (1) le dossier de production et la fiche banderole faisaient
disparaître une affectation refusée, expirée, annulée ou terminée et réaffichaient le formulaire,
même sur une tâche clôturée ; le motif de refus n'apparaissait nulle part au back-office — ajout de
`SuiviAffectation` (dernier état, motif, consigne après une fin signalée), formulaire masqué sur
une tâche `TERMINE`/`ANNULE` et replié derrière « Proposer à nouveau » après une fin signalée,
motifs dans la liste et sur la fiche partenaire ; (2) message de relance qui citait « Lot 2.4 » ;
(3) colonne « Échéance » : date limite de réponse en attente, fin prévue ensuite ; (4) taille
« 0.00 Mo » des petits fichiers au portail. Revérifié sur les mêmes données. Données, comptes et
fichier de recette supprimés ensuite (staging revenu à vide).

Points ouverts : les alertes staff (acceptation, refus, fin) ne partent que si
`DEVIS_NOTIFY_EMAIL` ou `TELEGRAM_CHAT_ID` est défini — à vérifier dans Vercel (production) ; le
coût accepté reste dans l'affectation et n'alimente pas `travaux_production.cout_fcfa` (marges).
Non couverts : envoi réel des e-mails (Resend), route cron appelée de bout en bout, back-office
mobile.

---

## 9. Tests

### 9.1 Unitaires

- transitions d'affectation autorisées/interdites, alignées sur SQL ;
- calcul du montant et de `quantite_base` (m², pièces, heures, arrondis) ;
- sélection du tarif en vigueur et du tarif de capacité ;
- échéance, expiration, rappel ;
- droits : décision, exécution, montant, dossier non validé ;
- purge : candidats, non-candidats (fiche staff, dossier soumis, activité récente) ;
- `DROITS_DOSSIER` n'accorde aucun droit `travaux.*`.

### 9.2 SQL / RLS

- rejeu de la migration sur une base vierge, rollback puis réapplication ;
- contraintes : une seule affectation active, cohérence objet/commande, immuabilité, motifs ;
- synchronisation : acceptation → `partenaire_id` posé ; annulation → effacé si même partenaire ;
- décision impossible après l'échéance, par un autre atelier, par un rôle interdit ;
- acceptation concurrente (deux sessions) ;
- expiration par `expirer_affectations()` ;
- purge : archivage, désactivation, suppression des fichiers, idempotence ;
- A/B : aucune lecture croisée, aucun accès direct aux tables.

### 9.3 Intégration

- actions serveur staff : proposition, annulation, relance, permissions, audit ;
- actions portail : acceptation, refus, fin, notifications en file, idempotence ;
- téléchargement d'un fichier partagé : autorisé, journalisé ; fichier non partagé : 404.

### 9.4 E2E

Parcours complet sur Supabase local (Mailpit) et en 390 px puis 1 280 px :

1. atelier validé, avec tarif validé et capacité banderole ;
2. tâche de production créée, proposition avec fichier ;
3. e-mail de proposition en file, l'atelier accepte ;
4. la tâche passe à ce partenaire, le coût est figé ;
5. l'atelier signale terminé, le staff clôture ;
6. refus avec motif, réaffectation, expiration d'une proposition ;
7. tentative de lecture croisée A/B refusée.

### 9.5 Régression

`npx tsc --noEmit`, `npx vitest run`, `next build` ; parcours Banderoles, production, devis, tunnel
MoMo et portail partenaire vérifiés après chaque sous-lot.

---

## 10. Déploiement

1. **Sauvegarde** du schéma et des données de production (script existant).
2. **Staging** : appliquer `0013`, exécuter `supabase/tests/affectations.sql`, vérifier le
   rollback sur une copie.
3. **Preview** Vercel pointée sur staging ; parcours E2E.
4. **Production** : appliquer `0013` (additive, sans reprise de données), puis déployer le code.
   Le code appelle les fonctions : la migration doit être appliquée **avant** le merge.
5. Fusion dans `main`, puis vérification live **sans créer d'affectation réelle** (pages,
   permissions, affichage des états vides) ; la recette fonctionnelle complète se fait sur staging.
6. **Prérequis d'exploitation** :
   - **notifications atelier** : `RESEND_API_KEY` et `DEVIS_EMAIL_FROM` configurés dans Vercel
     (staging puis production), sinon les propositions restent visibles au portail mais aucun
     e-mail ne part ;
   - **inscription** : Resend configuré dans Supabase Auth et modèles d'e-mail installés,
     confirmation d'e-mail activée ;
   - cron : ne pas ajouter de troisième entrée Vercel (plan Hobby) — l'expiration, les rappels et
     la purge sont branchés dans la route `/api/cron/notifications` existante ;
   - vérifier `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` pour les alertes staff.

Retour arrière : redéployer le code précédent, garder `0013` (additive et sans effet si inutilisée).
Le rollback SQL n'est exécuté qu'avant la première affectation réelle.

---

## 11. Risques

| Risque | Conséquence | Prévention |
|---|---|---|
| `RESEND_API_KEY` absent | L'atelier ne voit pas la proposition par e-mail | Bandeau portail, Telegram staff, prérequis bloquant avant ouverture |
| Aucune réservation de capacité (Lot 3) | Sur-affectation d'un atelier | Affichage disponibilité et volumes, contrôle manuel ; règle assumée |
| Atelier qui accepte puis ne produit pas | Retard client | Annulation + réaffectation tracées ; note de performance au Lot 3 |
| Montant visible d'un opérateur | Fuite de coût négocié | Aucune politique partenaire sur la table, fonction filtrée, tests A/B |
| Tarif modifié après proposition | Coût réécrit | Instantané immuable, trigger, source et version affichées |
| Écart coût devis / affectation | Marge faussée | Badge d'écart, jamais de correction automatique |
| Fichiers partagés trop larges | Fuite de données client | Sélection explicite, appartenance vérifiée, URL 60 s, audit |
| Double proposition | Deux ateliers sur le même travail | Index unique d'affectation active |
| Purge d'un dossier actif | Perte de données | Critères stricts (inscription, jamais soumis, 90 j), archivage doux, audit |
| Plan Hobby : 3ᵉ cron refusé | Expiration/purge non exécutées | Brancher dans le cron existant, pas de nouvelle entrée |

---

## 12. Questions tranchées

Toutes les questions du cadrage ont été tranchées le 19 novembre 2026 (voir §1.4) : D1 à D10 sont
retenues telles que recommandées, et le point `SUR_DEVIS` est retenu avec la règle du §3.3
(montant provisoire strictement positif, motif obligatoire, permission `affectations.couts`).

Restent des prérequis d'exécution, qui ne changent pas le périmètre :

- `RESEND_API_KEY` et `DEVIS_EMAIL_FROM` configurés dans Vercel avant l'ouverture aux ateliers ;
- ne pas ajouter de troisième cron Vercel (plan Hobby) ;
- ne créer aucune affectation réelle en production pendant la recette ;
- appliquer la migration `0013` avant le déploiement du code qui l'appelle.

---

## 13. Critères de sortie du Lot 2

- Un atelier `VALIDE` avec compte reçoit une proposition depuis une tâche de production **et**
  depuis une banderole.
- Il l'accepte depuis le portail ; le staff voit l'affectation acceptée, la tâche et la banderole
  portent le bon atelier, le coût est figé et immuable.
- Un refus motivé, une annulation, une expiration et une réaffectation fonctionnent, avec
  historique complet.
- `PRODUCTION` et `LECTURE` ne voient aucun montant et ne peuvent pas décider.
- Aucun atelier ne lit les affectations ou fichiers d'un autre.
- Les fichiers partagés se téléchargent par URL courte et chaque téléchargement est audité.
- Les dossiers `BROUILLON` de plus de 90 jours sont archivés, accès désactivés, fichiers supprimés.
- `tsc`, `vitest`, `next build` verts ; tests A/B et E2E passés ; recette mobile et desktop.
- La documentation (`docs/elembo-partners.md`, guide d'utilisation) renvoie au présent plan et
  décrit le parcours d'affectation.
