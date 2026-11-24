# Elembo Partners — audit d'avant intervention et plan du Lot 1

**Statut : audit et plan. Aucun code applicatif n'a été écrit.**
Date : 16 novembre 2026 · Branche : `feature/elembo-partners` (créée depuis
`feature/banderoles-grand-format`, commit `1d75d36`).
Source fonctionnelle : cahier des charges « Elembo Partners » v1.0 du 16/11/2026 (note Obsidian).
Périmètre de ce document : état réel du dépôt, décisions, modèle de données, sécurité et
découpage du **Lot 1 — Référencement et validation des partenaires**. Les Lots 2 et 3 ne sont
traités que là où ils contraignent le Lot 1.

---

## 0. Méthode et état de référence

L'audit s'appuie sur la lecture des migrations, du code serveur, des pages du back-office et des
tests présents sur la branche. **État vérifié le 16/11/2026** (`supabase migration list` sur elembo-staging, sondage REST en
lecture seule sur les deux projets) : **staging et production s'arrêtent à `0010`**. La `0011`
(grand format) n'y est pas appliquée : ni `demandes_grand_format`, ni `tarifs_grand_format`, ni
la colonne `partenaires.types_impression` n'existent. La `0012` (Lot 1) ne peut donc être
appliquée qu'après la `0011`. Seule la base locale est à jour (`0001` → `0012`).

| Élément | Constat |
|---|---|
| Migrations locales | `0001` → `0011`, la dernière est `20261113120000_grand_format.sql` |
| Branche de base | `feature/banderoles-grand-format`, **non fusionnée dans `main`** |
| Next.js | 16.3.6 — `src/proxy.ts` (ex-middleware), Server Actions, App Router |
| Auth | Supabase Auth via `@supabase/ssr`, rôle staff lu dans `app_metadata.role` |
| Écritures | `service_role` uniquement, après contrôle serveur (`exigerAcces`) |
| Fichier non suivi | `docs/audit-banner-studio.md` (travail Banner Studio en cours, non modifié ici) |

Conséquence de la base choisie : le Lot 1 hérite des colonnes grand format de `partenaires`
(`types_impression`, `largeur_max_m`, …), déjà présentes en base distante. **Le code de
`feature/banderoles-grand-format` doit être fusionné dans `main` avant celui d'Elembo
Partners**, pour que l'historique Git reste aligné avec l'ordre des migrations.

---

## 1. Synthèse

### 1.1 Verdict

Le module est réalisable **sans nouvelle base, ni nouveau backend, ni nouvelle dépendance**. Le
socle existant (Supabase Auth, RLS, `service_role` derrière un contrôle serveur, journal d'audit,
file `notifications`, buckets privés, URL signées) couvre les besoins techniques.

La nouveauté structurante est ailleurs : **c'est la première fois que des comptes non-staff
ouvrent une session sur Elembo.** Jusqu'ici, un utilisateur authentifié était soit du personnel,
soit rien. Toute la sécurité du Lot 1 tient à ce changement : cloisonnement A/B, séparation
staff/partenaire, inscription libre maîtrisée.

### 1.2 Décisions validées (16/11/2026)

| # | Sujet | Décision |
|---|---|---|
| D1 | Démarche | Audit + plan (ce document), puis Lot 1 sur `feature/elembo-partners` |
| D2 | Création des comptes | **Inscription libre** puis validation par Smart Vision |
| D3 | Connexion | **E-mail + mot de passe** (comme le back-office) |
| D4 | Saisie des tarifs | **Par l'imprimeur et par Smart Vision**, validation obligatoire dans les deux cas |
| D5 | Paliers de quantité | **Inclus dès le Lot 1** |
| D6 | Adresse du portail | **`/partenaire`** sur le domaine Elembo |

### 1.3 Décisions par défaut retenues (non contredites le 16/11/2026, révisables)

| # | Sujet (§23 du CDC) | Proposition |
|---|---|---|
| P1 | Plusieurs comptes par imprimeur (§23-1) | Oui. Le premier inscrit devient `RESPONSABLE` |
| P2 | Le responsable gère ses opérateurs (§23-2) | Oui, par invitation e-mail. Il ne peut pas se retirer s'il est le seul responsable |
| P3 | Coûts négociés visibles par l'atelier (§23-4) | **Non** : admin et finance uniquement (comme `grand_format.couts` aujourd'hui) |
| P4 | Sous-traitance en cascade (§23-6) | Déclarée sur le service (`realise_par_tiers` + précision), validée par Smart Vision |
| P5 | Un compte = une seule entreprise partenaire | Oui (résolution de session simple et sans ambiguïté) |
| P6 | Un compte staff ne peut pas être partenaire | Oui, imposé en base |
| P7 | Un admin/finance peut valider un tarif qu'il a lui-même saisi | Oui, journalisé (petite équipe) |
| P8 | Note de performance visible par le partenaire (§23-10) | Non, interne (Lot 3) |
| P9 | Droits de l'atelier sur la fiche partenaire | **Lecture seule**, comme la matrice du CDC (aujourd'hui l'atelier peut modifier : régression assumée) |

Les points §23-7 (photos obligatoires), §23-8 (urgences) et §23-9 (rémunération) relèvent du
Lot 2 ou sont hors périmètre.

---

## 2. Audit de l'existant

### 2.1 Ce qui existe et sera réutilisé

| Élément | Où | Réutilisation |
|---|---|---|
| `partenaires` | `0002_tables.sql` + colonnes grand format `0011` | Table pivot, enrichie (statut, identité, coordonnées) |
| `travaux_production.partenaire_id` | `0002_tables.sql` | Inchangé au Lot 1 ; `affectations_production` arrive au Lot 2 |
| Rôles staff | `src/server/auth/roles.ts`, `app_metadata.role` | Inchangé ; les partenaires n'ont **pas** de rôle dans `app_metadata` |
| Matrice des droits | `src/lib/admin/permissions.ts` | Ajout des permissions `partenaires.*` |
| Contrôle d'accès DAL | `src/server/admin/acces.ts` (`exigerAcces`) | Modèle pour `exigerPartenaire` |
| Connexion staff | `src/app/admin/connexion/actions.ts` | Modèle (limitation Redis, message d'erreur unique, journalisation) |
| Proxy | `src/proxy.ts` (matcher `/admin/:path*`) | Étendu à `/partenaire/:path*`, avec une branche dédiée |
| Journal d'audit | `src/server/admin/audit.ts` | Nouvelles entités `partenaire_*` ; acteur partenaire possible |
| Notes internes | `notes_internes` (`0010`) | Étendu à l'entité `partenaire` (notes jamais visibles du partenaire) |
| Notifications | `notifications` + `src/server/devis/notifications.ts` (EMAIL Resend, TELEGRAM) | Validation, refus, soumission, invitation |
| Stockage privé | buckets `devis`, `production` (`0005`) | Nouveau bucket privé `partenaires`, même schéma d'URL signées |
| Limitation | `src/server/security/rateLimit.ts` (Redis) | Inscription, connexion, mot de passe oublié, invitations |
| Validation tarif | trigger `reinitialiser_validation_tarif_grand_format` | Même principe pour machines, capacités et tarifs partenaires |

### 2.2 Constats qui conditionnent le Lot 1

1. **Les inscriptions Supabase sont ouvertes** (`supabase/config.toml` : `enable_signup = true`)
   **et la confirmation d'e-mail est désactivée en local** (`enable_confirmations = false`).
   N'importe qui peut déjà créer un compte via l'API publique. Aujourd'hui c'est sans effet, car
   toutes les politiques RLS exigent un rôle staff. Avec le portail, **la seule existence d'un
   compte ne doit jamais ouvrir un accès** : il faut une association `partenaire_utilisateurs`
   active **et** un e-mail confirmé. La confirmation doit être activée sur staging et production.

2. **E-mails d'authentification Supabase.** La confirmation d'inscription et le mot de passe
   oublié partent par le SMTP de Supabase. Le SMTP intégré est fortement limité en débit et
   réservé aux tests : **un SMTP personnalisé (Resend, déjà utilisé) doit être configuré sur les
   projets hébergés**, avec des modèles d'e-mail en français pointant vers
   `/partenaire/auth/confirmer` (flux `token_hash`). **Fait le 24/11/2026** : Resend configuré
   dans Supabase Auth sur staging et production (§10).

3. **`partenaires.tarifs` (jsonb) est lu par le back-office Banderoles**
   (`src/app/admin/(protected)/banderoles/[id]/page.tsx`, lignes 103, 295, 661) pour estimer le
   coût d'impression (`prix_m2_fcfa × surface`). Le Lot 1 crée la vraie table de tarifs ; il
   faut un chemin de transition (§4.8) pour ne pas casser ce calcul.

4. **Chevauchement avec le Banner Studio.** `docs/audit-banner-studio.md` prévoit une table
   `profils_impression` (laize, longueur, marges, œillets, DPI) par partenaire et par support.
   Les deux notions sont distinctes et doivent le rester :
   - `partenaire_capacites` = **ce que l'atelier peut produire** (affectation, matching, Lot 3) ;
   - `profils_impression` = **comment préparer le fichier** pour cet atelier (Studio, PDF).

   Seules la laize et la longueur maximales se recoupent. Règle proposée : **la capacité validée
   fait foi pour l'affectation**, le profil validé fait foi pour le rendu, et un écart entre les
   deux est signalé dans le back-office. Les deux utilisent des **millimètres entiers** (les
   colonnes héritées `largeur_max_m`/`longueur_max_m` restent en mètres, en lecture seule).

5. **`clients.user_id` est lié à `auth.uid()`** par une politique RLS (`clients` select self).
   Un compte partenaire ne doit jamais être rattaché à une fiche client : la création de compte
   partenaire n'écrit rien dans `clients`, et l'inverse sera vérifié en test.

6. **L'atelier peut aujourd'hui créer et modifier les prestataires** (`partenaires.gerer` =
   admin + atelier). La matrice du CDC le passe en lecture seule (P9).

### 2.3 Ce qui manque

Portail partenaire, comptes rattachés aux entreprises, statut de validation, machines,
capacités, services, tarifs versionnés avec paliers, disponibilités, fichiers partenaires, file
de validation côté Smart Vision. Tout cela est l'objet du Lot 1.

---

## 3. Architecture

### 3.1 Deux espaces, une application

| Espace | Préfixe | Qui | Contrôle |
|---|---|---|---|
| Back-office | `/admin` | Staff (`app_metadata.role`) | `exigerAcces(permission)` (existant) |
| Portail partenaire | `/partenaire` | Utilisateurs de `partenaire_utilisateurs` | `exigerPartenaire(droit)` (nouveau) |

Pas de sous-domaine au Lot 1 : un chemin suffit, partage le déploiement Vercel et les cookies de
session. Un sous-domaine `partenaires.` pourra être ajouté plus tard sans changer le code métier.

Pages publiques du portail : `/partenaire/connexion`, `/partenaire/inscription`,
`/partenaire/mot-de-passe` (demande et nouveau mot de passe), `/partenaire/auth/confirmer`
(Route Handler `verifyOtp` du lien d'e-mail), `/partenaire/invitation/[jeton]`.

### 3.2 Contrôle d'accès : couche d'accès aux données (DAL)

Même principe que le back-office (guide Next.js `01-app/02-guides/authentication.md`, « Data
Access Layer » et « Layouts and auth checks ») : **le layout ne protège rien**, chaque page,
action serveur et route appelle le contrôle au plus près de la donnée.

```ts
// src/server/partenaires/acces.ts (esquisse)
type SessionPartenaire = {
  userId: string;
  email: string;
  partenaireId: string;          // TOUJOURS déduit de la session, jamais du formulaire
  role: 'RESPONSABLE' | 'PRODUCTION' | 'LECTURE';
  statutPartenaire: StatutPartenaire;
};

partenaireCourant(): Promise<SessionPartenaire | null>   // mémoïsé par requête (react `cache`)
exigerPartenaire(droit: DroitPartenaire): Promise<SessionPartenaire>
```

`partenaireCourant` refuse (retourne `null`) si : pas de session (`auth.getUser()`), e-mail non
confirmé, compte porteur d'un rôle staff, association absente ou inactive. Le statut de
l'entreprise est ensuite appliqué par droit :

| Statut entreprise | Accès portail |
|---|---|
| `BROUILLON`, `EN_ATTENTE_VALIDATION`, `REFUSE` | Profil, machines, capacités, services, tarifs, utilisateurs (pour compléter / corriger) |
| `VALIDE` | Tout |
| `SUSPENDU`, `ARCHIVE` | **Aucun** : page « accès suspendu », session conservée mais inutilisable |

Droits du portail (matrice pure dans `src/lib/partenaires/droits.ts`, testée comme
`adminPermissions.test.ts`) :

| Droit | RESPONSABLE | PRODUCTION | LECTURE |
|---|---|---|---|
| `entreprise.voir` | ✓ | ✓ | ✓ |
| `entreprise.modifier` | ✓ | | |
| `utilisateurs.gerer` | ✓ | | |
| `machines.modifier` | ✓ | ✓ (statut et maintenance seulement) | |
| `capacites.modifier`, `services.modifier` | ✓ | | |
| `tarifs.voir`, `tarifs.proposer` | ✓ | | |
| `disponibilites.declarer` | ✓ | ✓ | |
| `validation.soumettre` | ✓ | | |

### 3.3 Lecture et écriture

- **Écritures** : Server Actions → `exigerPartenaire` → `service_role`, avec
  `partenaire_id = session.partenaireId` imposé par le serveur sur chaque requête (`insert` comme
  filtre `eq` des `update`/`delete`). Les transitions d'état (soumettre, valider, refuser,
  suspendre, valider un tarif) passent par des fonctions SQL `security definer` qui verrouillent
  la ligne (`for update`) et écrivent l'historique dans la même transaction.
- **Lectures du portail** : client Supabase **de la session de l'utilisateur** (clé anon + JWT),
  de sorte que **la RLS s'applique réellement** et constitue une seconde barrière effective, et
  pas seulement théorique. La fiche `partenaires` elle-même n'est pas lisible directement (elle
  porte des champs internes) : elle passe par la fonction `mon_partenaire()` qui ne renvoie que
  les colonnes autorisées.
- **Lectures du back-office** : inchangées (`service_role` après `exigerAcces`).

### 3.4 Proxy

`src/proxy.ts` passe au matcher `['/admin/:path*', '/partenaire/:path*']` et se divise en deux
branches. Il rafraîchit la session dans les deux cas et pose les mêmes en-têtes stricts. La
branche partenaire ne redirige que les visiteurs **sans session** vers `/partenaire/connexion` :
la vérification d'appartenance reste dans la DAL (le proxy ne fait pas de requête en base).

### 3.5 Parcours d'inscription (D2, D3)

```
/partenaire/inscription
  e-mail, mot de passe (≥ 10 caractères), nom de l'entreprise, téléphone
  → limitation Redis (IP + e-mail), message neutre si l'e-mail existe déjà
  → supabase.auth.signUp(emailRedirectTo = /partenaire/auth/confirmer)
  → aucune ligne métier créée tant que l'e-mail n'est pas confirmé
lien de confirmation → /partenaire/auth/confirmer (verifyOtp token_hash)
  → première connexion : fonction creer_partenaire_inscription()
       crée partenaires (statut BROUILLON, origine INSCRIPTION)
       + partenaire_utilisateurs (RESPONSABLE)  — une seule transaction, idempotente par user_id
/partenaire  → assistant de complétion (entreprise → coordonnées → machines → capacités)
  → « Soumettre à validation » → EN_ATTENTE_VALIDATION + notification Smart Vision
Smart Vision valide / refuse (motif obligatoire) / demande des compléments
  → notification e-mail au responsable
```

Le nom de l'entreprise saisi à l'inscription est conservé dans les métadonnées utilisateur
**uniquement comme valeur de pré-remplissage** : il n'est jamais lu comme source de droit.

**Rattachement d'un prestataire existant.** Les prestataires déjà créés par le staff n'ont pas
de compte. Le back-office génère une **invitation** (même mécanisme que les invitations
d'opérateurs, §4.3) : la personne invitée crée son compte ou se connecte, et se retrouve
rattachée à la fiche existante. Pas de fusion manuelle de doublons.

---

## 4. Modèle de données du Lot 1

Une seule migration additive `20261116120000_elembo_partners.sql`, avec son retour arrière
`supabase/rollbacks/20261116120000_elembo_partners_down.sql`. Conventions reprises de `0011` :
`text` + `check` pour les codes métier susceptibles d'évoluer, montants en FCFA entiers,
dimensions en millimètres entiers, `cree_le`/`maj_le` + trigger `set_maj_le`, commentaires SQL.

### 4.1 `partenaires` (colonnes ajoutées)

```sql
alter table public.partenaires
  add column statut text not null default 'VALIDE'
    check (statut in ('BROUILLON','EN_ATTENTE_VALIDATION','VALIDE','SUSPENDU','REFUSE','ARCHIVE')),
  add column origine text not null default 'BACK_OFFICE'
    check (origine in ('BACK_OFFICE','INSCRIPTION')),
  add column raison_sociale text, add column description text,
  add column annee_creation smallint, add column rccm text, add column niu text,
  add column site_web text, add column whatsapp text,
  add column contact_fonction text, add column ville text, add column quartier text,
  add column localisation text, add column zone_desservie text,
  add column quantites_minimales text, add column conditions_particulieres text,
  add column soumis_le timestamptz,
  add column valide_par uuid references auth.users (id) on delete set null,
  add column valide_par_email text, add column valide_le timestamptz,
  add column motif_decision text;               -- motif de refus / suspension (visible du partenaire)
```

- **Reprise des données** : la valeur par défaut `VALIDE` s'applique aux lignes existantes
  (créées par le staff, déjà utilisées en production). Les lignes `actif = false` passent en
  `ARCHIVE`. Les nouvelles inscriptions passent explicitement en `BROUILLON`.
- `actif` est conservé (compatibilité). Règle d'affectation : **`statut = 'VALIDE' and actif`**.
  `listerPartenaires({ actifsSeulement })` et les listes d'affectation (production, banderoles)
  appliquent cette règle.
- `notes` reste la note interne historique ; les nouvelles notes passent par `notes_internes`
  (entité `partenaire`). Ni l'une ni l'autre n'est renvoyée par `mon_partenaire()`.
- Contraintes de longueur sur tous les textes (même style que `0011`), index sur `statut`.
- Historique des statuts : `historique_statuts_partenaire (partenaire_id, ancien, nouveau,
  acteur, motif, cree_le)`, alimenté par trigger.

### 4.2 `partenaire_utilisateurs`

```sql
create table public.partenaire_utilisateurs (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_partenaire text not null check (role_partenaire in ('RESPONSABLE','PRODUCTION','LECTURE')),
  actif boolean not null default true,
  invite_par uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  unique (partenaire_id, user_id)
);
-- P5 : un compte = une entreprise active au plus.
create unique index partenaire_utilisateurs_un_actif on public.partenaire_utilisateurs (user_id) where actif;
```

- Trigger `security definer` : refuse l'insertion si `auth.users.raw_app_meta_data ->> 'role'`
  est renseigné (P6, compte staff).
- « Au moins un responsable actif par entreprise » : vérifié dans la fonction de modification
  (verrou sur l'entreprise), pas par une contrainte, car la règle porte sur plusieurs lignes.

### 4.3 `partenaire_invitations`

`id, partenaire_id, email, role_partenaire, jeton_hash (sha-256, unique), invite_par,
expire_le (7 jours), acceptee_le, acceptee_par, revoquee_le, cree_le`. Le jeton clair n'existe
que dans l'e-mail. Usage unique, l'e-mail du compte doit correspondre à celui de l'invitation.
Sert aux opérateurs (invités par le responsable) et au rattachement des prestataires existants
(invités par le staff).

### 4.4 `partenaire_machines`

```sql
create table public.partenaire_machines (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  famille text not null check (famille in ('GRAND_FORMAT','IMPRESSION_NUMERIQUE','TEXTILE','SIGNALETIQUE_FINITION')),
  type_machine text not null,              -- code du catalogue TS (BACHE, VINYLE, ECO_SOLVANT, UV, LATEX, DTF, …)
  nom text not null, marque text, modele text, technologie text,
  annee_acquisition smallint, quantite integer not null default 1 check (quantite between 1 and 99),
  largeur_max_mm integer check (largeur_max_mm > 0), longueur_max_mm integer check (longueur_max_mm > 0),
  resolution_dpi integer, vitesse numeric(10,2), unite_vitesse text,
  supports_compatibles text[] not null default '{}', formats_compatibles text[] not null default '{}',
  etat text not null default 'OPERATIONNELLE' check (etat in ('OPERATIONNELLE','MAINTENANCE','EN_PANNE','HORS_SERVICE')),
  derniere_maintenance_le date, prochaine_maintenance_le date,
  caracteristiques jsonb not null default '{}' check (jsonb_typeof(caracteristiques) = 'object'),
  statut_validation text not null default 'A_VALIDER' check (statut_validation in ('A_VALIDER','VALIDEE','REFUSEE')),
  valide_par uuid references auth.users (id) on delete set null, valide_le timestamptz, motif_refus text,
  archive boolean not null default false,
  cree_le timestamptz not null default now(), maj_le timestamptz not null default now()
);
```

- Trigger : un changement de valeur **technique** (`largeur_max_mm`, `longueur_max_mm`,
  `technologie`, `type_machine`, `supports_compatibles`, `quantite`) remet `statut_validation`
  à `A_VALIDER` (CDC §4.3). Un changement d'`etat` ou de dates de maintenance ne le fait pas :
  l'opérateur doit pouvoir déclarer une panne sans perdre la validation.
- Pas de suppression physique depuis le portail : `archive = true` (une machine peut être
  référencée par l'historique des capacités et, au Lot 2, des affectations).

### 4.5 `partenaire_capacites` et `partenaire_capacite_machines`

```sql
create table public.partenaire_capacites (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  categorie text not null check (categorie in ('GRAND_FORMAT','IMPRESSION_NUMERIQUE','TEXTILE','SIGNALETIQUE_FINITION')),
  prestation text not null,             -- code catalogue : BANDEROLE, BACHE, ROLL_UP, … (= SUPPORTS grand format), FLYER, DTF, OEILLETS, …
  nom text not null, technologie text,
  largeur_min_mm integer, largeur_max_mm integer, longueur_min_mm integer, longueur_max_mm integer,
  supports_compatibles text[] not null default '{}', matieres text[] not null default '{}',
  finitions text[] not null default '{}',
  quantite_min integer check (quantite_min is null or quantite_min > 0),
  capacite_journaliere numeric(12,2), capacite_hebdomadaire numeric(12,2),
  unite_capacite text not null check (unite_capacite in ('M2','METRE_LINEAIRE','PIECE','IMPRESSION','HEURE')),
  delai_jours integer check (delai_jours >= 0), delai_express_jours integer check (delai_express_jours >= 0),
  contraintes text,
  statut_validation text not null default 'A_VALIDER' check (statut_validation in ('A_VALIDER','VALIDEE','REFUSEE')),
  valide_par uuid references auth.users (id) on delete set null, valide_le timestamptz, motif_refus text,
  actif boolean not null default true,
  cree_le timestamptz not null default now(), maj_le timestamptz not null default now(),
  check (largeur_min_mm is null or largeur_max_mm is null or largeur_min_mm <= largeur_max_mm),
  check (longueur_min_mm is null or longueur_max_mm is null or longueur_min_mm <= longueur_max_mm)
);

create table public.partenaire_capacite_machines (
  capacite_id uuid not null references public.partenaire_capacites (id) on delete cascade,
  machine_id uuid not null references public.partenaire_machines (id) on delete restrict,
  primary key (capacite_id, machine_id)
);
```

- Trigger de cohérence : la machine et la capacité appartiennent **au même partenaire**
  (sinon, un identifiant forgé relierait la capacité de A à la machine de B).
- Même trigger de réinitialisation de validation que les machines (dimensions, prestation,
  capacités chiffrées, finitions).
- Index : `(partenaire_id)`, `(prestation) where actif and statut_validation = 'VALIDEE'`,
  GIN sur `finitions` et `supports_compatibles` (préparation du matching du Lot 3).
- Les codes `prestation` du grand format **reprennent les identifiants de `SUPPORTS`**
  (`src/lib/grand-format/catalogue.ts`), pour que la capacité se compare directement à
  `demandes_grand_format.support`. `partenaires.types_impression` devient une valeur dérivée,
  conservée pour compatibilité (§4.8).

### 4.6 `partenaire_services`

`id, partenaire_id, capacite_id (facultatif, même partenaire), nom, categorie, description,
delai_jours, quantite_min, conditions, realise_par_tiers boolean, tiers_precision text (P4),
statut_validation, actif, cree_le, maj_le`. Comme les machines et les capacités, **tout service
est validé par Smart Vision** (règle unique, plus simple à comprendre pour le partenaire) ; la
sous-traitance déclarée exige une précision.

### 4.7 Tarifs : `partenaire_tarifs` et `partenaire_tarif_paliers` (D4, D5)

Un tarif est **versionné par lignée** : toutes les versions d'un même tarif partagent
`lignee_id`. On ne modifie jamais le montant d'une version validée : on propose une nouvelle
version.

```sql
create table public.partenaire_tarifs (
  id uuid primary key default gen_random_uuid(),
  lignee_id uuid not null,                       -- = id de la version 1
  version integer not null check (version > 0),
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  service_id uuid references public.partenaire_services (id) on delete restrict,
  capacite_id uuid references public.partenaire_capacites (id) on delete restrict,
  nom text not null,
  mode_calcul text not null check (mode_calcul in ('AU_M2','AU_METRE_LINEAIRE','A_LA_PIECE','PAR_LOT','FORFAIT','A_L_HEURE')),
  nature text not null default 'PRESTATION' check (nature in ('PRESTATION','SUPPLEMENT_FINITION','LIVRAISON','INSTALLATION')),
  prix_fcfa integer check (prix_fcfa is null or prix_fcfa >= 0),   -- prix de base, null si uniquement par paliers
  conditions text,
  statut text not null default 'PROPOSE'
    check (statut in ('PROPOSE','MODIFICATION_DEMANDEE','VALIDE','REFUSE','REMPLACE','RETIRE')),
  origine text not null check (origine in ('PARTENAIRE','SMART_VISION')),
  propose_par uuid references auth.users (id) on delete set null,
  valide_par uuid references auth.users (id) on delete set null, valide_par_email text, valide_le timestamptz,
  valide_du date, valide_jusquau date,
  motif_decision text,
  cree_le timestamptz not null default now(), maj_le timestamptz not null default now(),
  unique (lignee_id, version),
  check (statut <> 'VALIDE' or (valide_par_email is not null and valide_le is not null and valide_du is not null)),
  check (valide_jusquau is null or valide_du is null or valide_jusquau >= valide_du)
);
-- Une seule version validée en vigueur par lignée.
create unique index partenaire_tarifs_un_valide on public.partenaire_tarifs (lignee_id) where statut = 'VALIDE';

create table public.partenaire_tarif_paliers (
  id uuid primary key default gen_random_uuid(),
  tarif_id uuid not null references public.partenaire_tarifs (id) on delete cascade,
  quantite_min integer not null check (quantite_min >= 1),
  quantite_max integer check (quantite_max is null or quantite_max >= quantite_min),
  prix_unitaire_fcfa integer check (prix_unitaire_fcfa is null or prix_unitaire_fcfa >= 0),  -- null = « sur négociation »
  unique (tarif_id, quantite_min)
);
```

Règles :

- **Un tarif proposé ne devient jamais validé tout seul**, qu'il vienne du partenaire ou de
  Smart Vision (D4). La validation est un acte séparé (`valider_tarif_partenaire()`), réservé à
  `partenaires.tarifs_valider` (admin, finance).
- Valider la version *n* passe la version validée précédente de la lignée à `REMPLACE`, avec
  `valide_jusquau = valide_du(n) - 1`, **dans la même transaction** (l'index unique l'impose).
- Une version `PROPOSE`/`MODIFICATION_DEMANDEE` reste modifiable par son auteur ; une version
  `VALIDE`, `REFUSE` ou `REMPLACE` est **immuable** (trigger qui refuse l'`update` des montants
  et des paliers).
- Paliers : contigus et sans chevauchement, un seul palier ouvert (`quantite_max is null`) et en
  dernier. Vérifiés par une fonction pure TypeScript (testée) **et** par un trigger SQL au
  moment de la soumission. Un tarif est soit à prix de base, soit à paliers, soit les deux (le
  prix de base sert alors au-delà des paliers).
- **Instantanés** (CDC §15.12) : sans objet au Lot 1, puisque aucune affectation n'utilise
  encore ces tarifs. Au Lot 2, l'affectation copiera le tarif retenu (id, version, montant
  calculé), de sorte qu'une version ultérieure ne réécrive pas un coût accepté.
- Confidentialité : le partenaire voit ses propres tarifs et leur statut, **jamais** le prix de
  vente ni la marge (aucune jointure vers `tarifs_grand_format`, `devis` ou `commandes` depuis le
  portail).

### 4.8 Transition depuis les champs hérités

| Hérité | Devenir |
|---|---|
| `partenaires.tarifs.prix_m2_fcfa` | Repris par la migration en `partenaire_tarifs` (`AU_M2`, `origine = SMART_VISION`, statut **`PROPOSE`**, conditions recopiées). Finance le valide une fois. |
| Calcul coût Banderoles (`banderoles/[id]/page.tsx`) | Lit d'abord le tarif `VALIDE` de la capacité correspondant au support ; à défaut, l'ancien `prix_m2_fcfa` avec la mention « tarif non validé (ancienne fiche) ». |
| `types_impression`, `largeur_max_m`, `longueur_max_m` | Repris par la migration en capacités grand format `VALIDEE` (laize et longueur en mm). Restent saisis par le formulaire actuel jusqu'au sous-lot 1.5, qui les remplace par une valeur dérivée des capacités validées. Suppression envisagée après le Lot 3. |
| `partenaires.tarifs` (jsonb) | Lecture seule, plus écrit. Suppression dans une migration ultérieure. |

### 4.9 `partenaire_disponibilites` (gestion simple)

`id, partenaire_id, statut (DISPONIBLE, ACTIVITE_NORMALE, CAPACITE_REDUITE, SATURE,
MAINTENANCE, INDISPONIBLE), debut_periode date, fin_periode date null, delai_moyen_jours,
commentaire, declare_par, cree_le`. Une déclaration par ligne, **jamais modifiée** (historique
naturel). La disponibilité courante est la dernière déclaration dont la période couvre
aujourd'hui. Les champs `capacite_totale`/`capacite_reservee` du CDC §15.7 sont **reportés au
Lot 3** : la capacité réservée doit être calculée à partir des affectations acceptées (Lot 2),
et non saisie (CDC §9.4, §12.3).

### 4.10 Fichiers : bucket `partenaires` et `partenaire_fichiers`

Bucket privé `partenaires` : `image/jpeg`, `image/png`, `image/webp`, `application/pdf`,
10 Mo par fichier. Chemin `{partenaire_id}/{type}/{uuid}.{ext}` généré par le serveur. Table
`partenaire_fichiers (id, partenaire_id, machine_id null, type LOGO|ATELIER|MACHINE|DOCUMENT|PORTFOLIO,
chemin, nom_original, type_mime, taille_octets, envoye_par, cree_le)`. Envoi et lecture par URL
signées courtes, après `exigerPartenaire` ou `exigerAcces`. Le type MIME est revérifié côté
serveur après l'envoi (signature des premiers octets), comme pour les fichiers de devis.

### 4.11 Audit

`EntiteAuditee` gagne `partenaire_utilisateur`, `partenaire_machine`, `partenaire_capacite`,
`partenaire_service`, `partenaire_tarif`, `partenaire_disponibilite`. `journaliser()` accepte un
acteur partenaire (id + e-mail). Les montants de tarif figurent dans l'audit (c'est l'objet de
l'historique des prix) mais l'audit reste lisible uniquement par `audit.voir` (admin).

---

## 5. Sécurité et RLS

### 5.1 Fonctions d'aide

```sql
-- Entreprise de la session, ou null. Ne renvoie rien pour un compte staff ou désactivé.
public.partenaire_session() returns uuid          -- security definer, stable
public.role_partenaire_session() returns text     -- RESPONSABLE | PRODUCTION | LECTURE | null
public.mon_partenaire() returns table (...)       -- colonnes autorisées de SA fiche uniquement
```

`partenaire_session()` exige : `auth.uid()` associé, association active, entreprise ni
`SUSPENDU` ni `ARCHIVE`, aucun rôle staff dans le JWT.

### 5.2 Politiques

RLS activée sur toutes les nouvelles tables. `grant select … to authenticated`, aucune écriture
accordée au navigateur (convention du projet : `service_role` seul écrit).

| Table | Staff | Partenaire |
|---|---|---|
| `partenaires` | `is_staff()` (existant) | **aucune** politique directe : `mon_partenaire()` |
| `partenaire_utilisateurs` | `is_staff()` | `partenaire_id = partenaire_session()` |
| `partenaire_machines`, `_capacites`, `_capacite_machines`, `_services`, `_disponibilites`, `_fichiers` | `is_staff()` | `partenaire_id = partenaire_session()` |
| `partenaire_tarifs`, `_tarif_paliers` | `has_role(['admin','finance'])` (P3) | `partenaire_id = partenaire_session() and role_partenaire_session() = 'RESPONSABLE'` |
| `partenaire_invitations` | `has_role(['admin'])` | aucune (jamais lisible : contient des empreintes de jetons) |
| `historique_statuts_partenaire` | `is_staff()` | sa propre entreprise |

### 5.3 Règles de sécurité serveur (non négociables)

1. `partenaire_id` n'est **jamais lu depuis le formulaire, l'URL ou le corps de la requête**
   côté portail. Il vient de `exigerPartenaire()`. Un identifiant d'objet reçu (machine,
   capacité, tarif) est toujours filtré par `partenaire_id = session.partenaireId`, et une
   absence de résultat renvoie 404 (pas 403, pour ne pas révéler l'existence de l'objet).
2. Liste blanche des champs écrits par chaque action (pas d'`update(...formData)`) : le partenaire
   ne peut écrire ni `statut`, ni `valide_*`, ni `statut_validation`, ni `origine`.
3. Connexion, inscription, mot de passe oublié, invitations : limitation Redis par IP et par
   e-mail, message identique que le compte existe ou non. En cas d'indisponibilité de Redis, on
   laisse passer (Supabase Auth applique ses propres limites), comme pour le back-office.
4. Connexion partenaire d'un compte staff : refusée avec `signOut`, symétrique de la connexion
   admin qui refuse déjà les comptes sans rôle.
5. Mot de passe : 10 caractères minimum, contrôle de fuite de Supabase activé si disponible sur
   le plan.
6. Toutes les routes `service_role` du portail sont couvertes par un test A/B (§8.3).

---

## 6. Interfaces

### 6.1 Portail partenaire (mobile d'abord)

| Page | Contenu |
|---|---|
| `/partenaire` | État du dossier (étapes restantes, statut, motif de refus), disponibilité courante, accès rapides |
| `/partenaire/entreprise` | Informations générales, coordonnées, logo, photos d'atelier, portfolio |
| `/partenaire/machines` (+ `[id]`) | Liste, ajout en formulaire court progressif, photos, état et maintenance |
| `/partenaire/capacites` (+ `[id]`) | Choix de la prestation dans le catalogue, dimensions, unités, machines associées |
| `/partenaire/services` | Services, rattachement à une capacité, sous-traitance déclarée |
| `/partenaire/tarifs` (+ `[id]`) | Proposition, paliers, historique des versions et décisions |
| `/partenaire/disponibilites` | Déclaration rapide (un statut + une période), historique |
| `/partenaire/utilisateurs` | Invitations, rôles, désactivation (responsable seulement) |

Saisie progressive (CDC §24.4) : seuls le nom, le téléphone, une machine et une capacité sont
exigés pour soumettre. Tous les autres champs sont facultatifs et peuvent être complétés par
Smart Vision lors d'une visite d'atelier. Les composants reprennent le design system existant
(`docs/design-system-elembo.md`), pas ceux du back-office.

### 6.2 Back-office

| Page | Contenu | Permission |
|---|---|---|
| `/admin/partenaires` | Liste filtrable (statut, catégorie, prestation, disponibilité), pagination serveur | `partenaires.voir` |
| `/admin/partenaires/validation` | File unique : profils soumis, machines, capacités, services et tarifs `A_VALIDER`/`PROPOSE` | `partenaires.valider` / `partenaires.tarifs_valider` |
| `/admin/partenaires/[id]` | Fiche à onglets (CDC §12.2, points 1 à 7 au Lot 1) : général, utilisateurs, machines, capacités, services, tarifs, disponibilités, notes internes, historique | selon onglet |
| `/admin/partenaires/nouveau` | Création par le staff (statut `VALIDE`) + invitation facultative | `partenaires.gerer` |

`/admin/production/prestataires` redirige vers `/admin/partenaires`. Les listes d'affectation
existantes (tâches de production, imprimeur d'une banderole) n'affichent que les partenaires
`VALIDE` et actifs.

Nouvelles permissions (`src/lib/admin/permissions.ts`) :

| Permission | Rôles |
|---|---|
| `partenaires.voir` | admin, commercial, atelier, finance |
| `partenaires.gerer` | admin (P9 : l'atelier perd l'écriture) |
| `partenaires.valider` | admin |
| `partenaires.suspendre` | admin |
| `partenaires.tarifs_voir` | admin, finance |
| `partenaires.tarifs_saisir` | admin, finance |
| `partenaires.tarifs_valider` | admin, finance |
| `partenaires.comptes` | admin |

### 6.3 Notifications du Lot 1

Via la file `notifications` existante, avec `cle_idempotence` (`partenaire:{id}:{evenement}:{version}`) :

| Événement | Destinataire | Canal |
|---|---|---|
| Dossier soumis, tarif proposé | Smart Vision | TELEGRAM (existant) |
| Dossier validé / refusé / suspendu, compléments demandés | Responsable partenaire | EMAIL |
| Machine/capacité refusée, tarif validé/refusé/à modifier | Responsable partenaire | EMAIL |
| Invitation | Personne invitée | EMAIL |

Une notification en échec ne bloque jamais l'opération métier, comme pour les devis.

---

## 7. Fichiers à créer ou modifier

**Créés**

- `supabase/migrations/20261116120000_elembo_partners.sql` + rollback
- `src/lib/partenaires/` : `catalogue.ts` (familles, types de machines, prestations, unités,
  finitions), `statuts.ts` (transitions autorisées), `droits.ts` (matrice du portail),
  `paliers.ts` (validation et calcul des paliers), `validation.ts` (schémas des formulaires)
- `src/server/partenaires/` : `acces.ts` (DAL), `session.ts` (client RLS de l'utilisateur),
  `inscription.ts`, `invitations.ts`, `entreprise.ts`, `machines.ts`, `capacites.ts`,
  `services.ts`, `tarifs.ts`, `disponibilites.ts`, `fichiers.ts`, `notifications.ts`
- `src/app/partenaire/` : pages publiques, layout et pages protégées, actions
- `src/app/admin/(protected)/partenaires/` : liste, validation, fiche, nouveau, actions
- `src/server/admin/partenaires.ts` (lecture et décisions staff)
- Tests (§8)

**Modifiés**

- `src/proxy.ts` (matcher + branche partenaire)
- `src/lib/admin/permissions.ts`, `src/server/admin/audit.ts`
- `src/server/admin/production.ts` (`listerPartenaires` : règle `VALIDE` + actif ; écriture des
  tarifs jsonb retirée)
- `src/app/admin/(protected)/production/prestataires/page.tsx` (redirection) et `actions.ts`
- `src/app/admin/(protected)/banderoles/[id]/page.tsx` (lecture du tarif validé, §4.8)
- Navigation du back-office (entrée « Partenaires »)
- `docs/supabase-securite.md`, `docs/supabase-architecture.md`, guide d'utilisation

---

## 8. Découpage du Lot 1 et recette

Chaque sous-lot est livré en commit(s) autonome(s), testé, et laisse l'application
fonctionnelle.

### 1.1 — Socle de données et sécurité ✅ (16/11/2026)

Livré : migration `20261116120000_elembo_partners.sql` et son retour arrière ;
`supabase/tests/elembo_partners.sql` (règles métier + RLS A/B, opérateur, compte non rattaché,
jeton staff, suspension) ; `src/lib/partenaires/` (catalogue, statuts, droits, paliers) ;
`tests/partenairesDomaine.test.ts`, `tests/partenairesSchema.test.ts` ; règle d'affectation
`VALIDE` + actif dans les listes Production et Banderoles.

Vérification : migrations `0001` → `0012` et les trois scripts `supabase/tests/*.sql` exécutés
sur PGlite 0.5 (Postgres en WebAssembly, avec une simulation minimale de `auth` et `storage`),
y compris retour arrière puis réapplication, et reprise de données héritées. Quatre mutations
volontaires de la migration (tarifs ouverts, jeton staff accepté, validation non réinitialisée,
fiche lisible) sont toutes détectées par le script SQL.

**Base Supabase locale (16/11/2026)** : migration `0012` appliquée (`supabase_db_elembo`,
Postgres 17), les trois scripts `supabase/tests/*.sql` passent. Cette exécution a révélé un écart
que PGlite ne reproduisait pas : les **droits par défaut de Supabase** donnent tout à
`service_role` sur une nouvelle table, si bien que les historiques étaient réécrivables. Corrigé
dans la migration (`revoke all … from service_role` avant le `grant select, insert`), verrouillé
par `partenairesSchema.test.ts`. Le banc PGlite simule désormais ces droits par défaut.

**Staging et production (16/11/2026)** : `0011` (grand format) et `0012` appliquées par
`supabase db push`, après sauvegarde du schéma et des données de chaque projet.

- elembo-staging : `supabase/tests/elembo_partners.sql`, `grand_format.sql` et `back_office.sql`
  exécutés à distance (`db query --remote`) ; tous passent, rien ne subsiste après le `rollback`.
- elembo-production : script de test **non exécuté** (il crée des comptes fictifs) ; contrôles en
  lecture seule identiques à staging : 11 tables sous RLS, aucun droit `anon`, `authenticated` en
  lecture seule, historiques en lecture + ajout pour `service_role`, aucune fonction de service
  exposée, bucket `partenaires` privé ; API publique : 401 sur les tables et `mon_partenaire`.
- La production ne contenait aucun prestataire : la reprise de données n'avait rien à convertir.

Migration complète (tables, contraintes, triggers, fonctions, RLS, bucket), rollback, reprise des
données héritées, catalogue et règles pures TypeScript, matrice des droits.
**Recette** : tests unitaires (transitions, paliers, droits) ; tests RLS A/B sur un projet de
test (§8.3) ; migration rejouée sur une base locale vierge puis sur une copie des données.

### 1.2 — Comptes et accès au portail ✅ (16/11/2026)
Proxy, DAL `exigerPartenaire`, inscription, confirmation, connexion, déconnexion, mot de passe
oublié, création de l'entreprise en `BROUILLON`, pages « en attente », « refusé », « suspendu ».
**Recette** : un compte sans association, un compte non confirmé, un compte staff et un partenaire
suspendu n'accèdent à rien ; la connexion admin est inchangée.

Livré : `src/app/partenaire/` (connexion, inscription, mot de passe oublié et nouveau, route
`auth/confirmer`, tableau de bord « Mon dossier », « Bienvenue », « Accès suspendu »),
`src/server/partenaires/acces.ts` (DAL) et `dossier.ts` (lecture sous RLS avec la session de
l'utilisateur), `src/lib/partenaires/compte.ts` (état du compte, navigation sans redirection
ouverte, validation des formulaires), `src/components/partenaire/`, proxy étendu,
`robots.txt`, modèles d'e-mail `supabase/templates/` (confirmation et récupération, liens
`token_hash`), `tests/partenairesCompte.test.ts`.

Choix : l'entreprise n'est créée qu'à la première connexion **confirmée**, et seulement pour un
compte venu du formulaire d'inscription ; sinon, page « Bienvenue » (création manuelle) — un compte
invité (sous-lot 1.6) ne crée jamais d'entreprise en double. La route `auth/confirmer` accepte les
liens `token_hash` (modèles Elembo, ouvrables sur un autre appareil) et `code` (modèles par défaut
de Supabase, même navigateur) : le parcours fonctionne avant même que les modèles soient installés.

Recette faite le 16/11/2026 sur Supabase local (confirmation d'e-mail activée, e-mails reçus dans
Mailpit), navigateur à 390 px puis 1 280 px : inscription → e-mail → confirmation → entreprise
`BROUILLON` + `RESPONSABLE` + audit ; mauvais mot de passe refusé ; déconnexion ; mot de passe
oublié → e-mail → nouveau mot de passe (ancien refusé, nouveau accepté) ; lien réutilisé, inventé
ou avec redirection externe → « lien plus valable » ; compte staff refusé sans session résiduelle ;
compte non confirmé arrêté ; suspension → « Accès suspendu » avec motif à la requête suivante.
Données de test supprimées ensuite.

**Configuration locale** (`supabase/config.toml`) : confirmation d'e-mail activée, redirections
`/partenaire/**` autorisées, modèles Elembo. Pour les projets hébergés, voir §10 (au moment de
Resend).

### 1.3 — Profil, machines, capacités, services, disponibilités ✅ (19/11/2026)
Pages du portail, fichiers et photos, soumission à validation.
**Recette** : le responsable ajoute plusieurs machines et capacités distinctes, associe des
machines à une capacité ; un opérateur `PRODUCTION` déclare une panne sans pouvoir modifier les
dimensions.

Livré : rubriques `/partenaire/entreprise`, `machines` (liste, ajout, fiche, état, retrait),
`capacites` (machines associées, finitions, pause), `services` (sous-traitance déclarée),
`disponibilites` (déclaration, en vigueur, historique), soumission depuis « Mon dossier »
(notification Telegram à Smart Vision), navigation du portail ; photos et documents (logo unique,
atelier, machines, réalisations, documents PDF). Modules : `src/lib/partenaires/formulaires.ts`
(lecteurs en liste blanche, mètres → mm) et `fichiers.ts`, `src/server/partenaires/ecriture.ts`
(service_role, chaque objet filtré par l'entreprise de la session) et `fichiers.ts`, lectures sous
RLS dans `dossier.ts`, actions `dossier-actions.ts` et `fichiers-actions.ts`, kit `Formulaire`
(saisie restituée après un refus, cases comprises). Tests : `partenairesFormulaires.test.ts`,
`partenairesFichiers.test.ts`.

Fichiers : envoi direct du navigateur au bucket privé par URL signée (pas de limite de corps des
Server Actions), chemin fabriqué par le serveur, octets revérifiés à la confirmation (un fichier
non conforme est supprimé), quotas par type, URL de lecture signées 10 minutes. Les photos sont
réduites dans le navigateur (2 000 px, JPEG) avant l'envoi ; le logo est conservé tel quel.

Recette faite le 19/11/2026 sur Supabase local, 390 px puis 1 280 px : fiche entreprise ;
machine (laize « 3,20 » → 3 200 mm, doublons de supports retirés) ; capacité liée à la machine,
finitions ; refus serveur avec saisie et cases conservées ; service sous-traité ; disponibilité ;
soumission → `EN_ATTENTE_VALIDATION`, historique, notification, 7 actions en audit. Cloisonnement :
l'atelier B obtient 404 sur la machine de A, et un formulaire falsifié (identifiant de A) est refusé
« Machine introuvable » sans rien modifier. Opérateur `PRODUCTION` : pas de champ technique, panne
déclarée sans perte de validation, page d'ajout refusée, aucun envoi sur la fiche entreprise.
Photos : 3 000 px / 222 Ko réduite à 73 Ko, faux JPEG refusé et supprimé du bucket, retrait
(ligne + objet), remplacement du logo (un seul objet restant). Données de test supprimées.

### 1.4 — Tarifs et paliers ✅ (19/11/2026)
Proposition côté partenaire, saisie côté Smart Vision, paliers, versions, décisions.
**Recette** : un tarif proposé n'est jamais validé automatiquement ; une nouvelle version validée
remplace l'ancienne sans la modifier ; un `LECTURE` ou un `PRODUCTION` ne voit aucun tarif.

Livré — côté atelier (responsable seulement, droits `tarifs.*` et RLS) : `/partenaire/tarifs`
(tarifs regroupés par lignée : en vigueur, proposition en cours, statut), `/nouveau`, fiche
`/[lignee]` (version en vigueur, motif d'une demande de modification, correction ou nouveau prix,
retrait de la proposition, historique des versions avec origine et motifs) ; huit lignes de paliers
« de / jusqu'à / prix » sans JavaScript ; Smart Vision prévenu par Telegram **sans le montant**.
Côté Smart Vision (fonctions prêtes pour le back-office 1.5) : `src/server/admin/tarifsPartenaires.ts`
— saisir (origine SMART_VISION, reste PROPOSE), valider, refuser et demander une modification (motif
obligatoire), retirer un tarif validé (fin de validité posée). Modules : `lireTarif` et `fcfaChamp`
(`formulaires.ts`), `regrouperTarifs`, `resumeVersion` (`paliers.ts`), `src/server/partenaires/tarifs.ts`,
`tarifs-actions.ts`. Tests : `partenairesTarifs.test.ts` ; `supabase/tests/elembo_partners.sql`
complété (cas 13 à 16 : motif obligatoire, correction sur la même version, refus définitif, retrait
avec historique), passé sur Supabase local. `next build` : succès, pages du portail dynamiques.

Recette faite le 19/11/2026 (Supabase local, 390 px) : trou entre paliers refusé avec lignes
conservées ; tarif à paliers proposé (PROPOSE, PARTENAIRE, notification sans montant) ; validé
(simulation du back-office) → affiché « en vigueur » ; nouveau prix → version 2 proposée, version 1
inchangée ; demande de modification → motif affiché, formulaire « Corriger » ; retrait → v2 RETIRE,
v1 toujours en vigueur ; opérateur : ni onglet ni carte « Tarifs », adresse directe refusée.
Correction en route : le ruban de navigation ramène l'onglet actif à l'écran sur téléphone.

Reste pour 1.5 : écrans de décision dans le back-office, e-mail au partenaire après décision, et
lecture du tarif validé par le calcul de coût Banderoles (§4.8).

### 1.5 — Back-office Partenaires ✅ (19/11/2026)
Liste, fiche, file de validation, création staff, invitations de rattachement, suspension,
transition Banderoles/Production.
**Recette** : Smart Vision crée et valide un partenaire ; une suspension coupe l'accès au portail
à la requête suivante ; le calcul de coût Banderoles reste juste avec et sans tarif validé.

Livré : section `/admin/partenaires` (entrée « Partenaires » du menu) — liste (recherche, statut,
pagination), file `/validation` (dossiers soumis, machines, capacités, services, tarifs), fiche
`/[id]` (décision sur le dossier avec motif, décision élément par élément, tarifs : valider avec
période, demander une modification, refuser, retirer, saisir un tarif ou un nouveau prix,
historique des versions ; informations modifiables, comptes, disponibilité, photos et documents,
notes internes, historique des statuts), création `/nouveau` (fiche validée d'emblée).
Permissions `partenaires.*` (§6.2) ; l'atelier passe en lecture seule (P9) ; finance : tarifs
uniquement. `/admin/production/prestataires` redirige ; ses actions héritées (qui écrivaient
l'ancien prix jsonb) sont retirées. E-mails de décision aux responsables actifs de l'atelier mis
en file `notifications` (envoyés une fois Resend configuré), sans aucun montant.

Banderoles (§4.8) : supports et laize des imprimeurs déduits de leurs capacités grand format
validées (`profilGrandFormat`) ; coût d'impression suggéré à partir du tarif au m² VALIDÉ et en
vigueur (capacité du même support d'abord, sinon tarif général ; paliers sur la surface arrondie),
à défaut l'ancien prix signalé « non validé » (`src/lib/partenaires/coutGrandFormat.ts`).

Correction de sécurité : l'affectation d'un imprimeur à une banderole ou à une tâche de production
n'était filtrée que par la liste déroulante. Désormais `verifierAffectation` (serveur) refuse tout
NOUVEAU partenaire non validé ou inactif (garder l'imprimeur déjà affecté reste possible).

Tests : `partenairesBackOffice.test.ts` ; le test de sécurité du back-office couvre
automatiquement les nouvelles pages et actions. `next build` : succès.

Recette faite le 19/11/2026 (Supabase local, 1 366 px) avec des comptes admin, finance, atelier
fictifs : file de validation → machine et capacité validées, service refusé avec motif (e-mail
en file) ; dossier validé (e-mail en file, historique) ; finance : tarifs seulement, tarif à
paliers validé ; banderole de 6 m² : imprimeur listé « laize 3,2 m », coût suggéré 2 200 × 6 =
13 200 FCFA « tarif validé » ; affectation forcée d'un partenaire non validé refusée par le
serveur ; suspension avec motif (e-mail en file) ; atelier : fiche en lecture seule, sans tarif,
création refusée. Données de recette supprimées.

Reste pour 1.6 : invitations (opérateurs, rattachement d'une fiche créée par Smart Vision),
page « Mes utilisateurs ».

### 1.6 — Utilisateurs du partenaire et finitions ✅ (19/11/2026)
Invitations d'opérateurs, rôles, désactivation, dernier responsable protégé ; notifications ;
documentation et guide d'utilisation.

Livré : `/partenaire/utilisateurs` (responsable : équipe, rôles, désactivation et réactivation,
invitations en attente et annulation ; jamais sur son propre accès) ; `/partenaire/invitation/[jeton]`
(page publique : créer son compte avec l'adresse imposée, ou se connecter puis « Rejoindre » ; tous
les cas d'échec expliqués) ; « Bienvenue » propose les invitations en attente adressées à l'adresse
CONFIRMÉE du compte et explique un accès désactivé ; back-office : carte « Comptes » de la fiche
(inviter un responsable — rattachement d'une fiche créée par Smart Vision —, annuler, désactiver,
réactiver ; permission `partenaires.comptes`, admin). Jeton aléatoire de 32 octets, 7 jours, usage
unique, seule l'empreinte SHA-256 en base ; lien affiché UNE fois (copie, partage WhatsApp) en plus
de l'e-mail mis en file. Modules : `src/lib/partenaires/invitations.ts`,
`src/server/partenaires/invitations.ts`, `site.ts`, `utilisateurs-actions.ts`. Tests :
`partenairesInvitations.test.ts`.

Défauts trouvés et corrigés pendant la recette : (1) le lien de confirmation des modèles Elembo ne
ramène pas sur l'invitation → la page « Bienvenue » propose désormais les invitations en attente pour
l'adresse confirmée ; (2) après une action qui change l'état du compte (connexion, acceptation…), la
coque du portail restait celle d'avant (onglets absents) → `revalidatePath('/partenaire', 'layout')`.

Recette faite le 19/11/2026 (Supabase local, 390 px et 1 366 px) : invitation d'un opérateur par le
responsable (lien affiché, empreinte seule en base, e-mail en file) ; création de compte depuis le lien,
confirmation, « Rejoindre » → rôle Production, onglets attendus ; lien réutilisé refusé ; rattachement
d'une fiche créée au back-office par invitation d'un responsable → responsable, tous les onglets ;
invitation ouverte avec un autre compte → refus, déconnexion proposée ; opérateur désactivé → plus
d'accès, message explicatif. Données de recette supprimées.

**Lot 1 terminé.** Les prérequis d'ouverture (Resend dans Supabase Auth, modèles d'e-mail) sont
faits depuis le 24/11/2026 (§10).

**Lot 2** : cadrage validé et sous-lots `2.1` à `2.5` livrés en local (affectations, portail
travaux, notifications, fichiers, purge) — voir [`docs/plan-lot-2.md`](plan-lot-2.md). Migration
`0013` appliquée en staging et en production le 20/11/2026 ; la recette finale reste à faire.

### 8.1 Tests unitaires
Transitions de statut (entreprise, validation, tarif), paliers (contiguïté, chevauchement,
palier ouvert, calcul du prix pour une quantité), matrice des droits du portail, validation des
dimensions et des unités, réinitialisation de validation sur changement technique.

### 8.2 Tests d'intégration (actions et fonctions serveur, dépôts simulés par `vi.mock` comme dans `grandFormatRoutes.test.ts`)
Inscription idempotente, rattachement par invitation, création de machine et de capacité,
association machine/capacité inter-partenaires refusée, proposition et validation de tarif,
filtrage `partenaire_id` imposé par la session sur chaque action.

### 8.3 Tests de sécurité (projet Supabase de test, variables `SUPABASE_TEST_*`)
Deux partenaires fictifs A et B, plus un compte sans association et un compte staff :

- A ne lit ni les machines, ni les capacités, ni les tarifs, ni les fichiers, ni les utilisateurs de B ;
- A ne lit pas la fiche `partenaires` de B, ni la sienne en direct (seulement via `mon_partenaire()`) ;
- un opérateur de A ne lit pas les tarifs de A ;
- un compte sans association et un compte confirmé non rattaché ne lisent rien ;
- un utilisateur désactivé et une entreprise suspendue ne lisent plus rien ;
- aucune table métier existante (`commandes`, `devis`, `clients`, `tarifs_grand_format`, …)
  n'est lisible par un compte partenaire ;
- aucune écriture directe n'est possible depuis la clé anon + JWT partenaire.

Les actions serveur (`service_role`) sont testées séparément : un identifiant d'objet de B
envoyé par A produit un 404 et aucune écriture.

### 8.4 E2E (script Playwright, sur le modèle de `scripts/e2e/studio.mjs`)
Inscription → confirmation → profil → machine → capacité → soumission → validation staff →
proposition de tarif → validation finance. Aucun paiement n'est déclenché.

### 8.5 Régression
`npx tsc --noEmit`, `npx vitest run` complets ; parcours Banderoles, devis, tunnel MoMo,
production atelier et connexion back-office vérifiés après chaque sous-lot.

---

## 9. Risques

| Risque | Conséquence | Prévention |
|---|---|---|
| Inscription ouverte utilisée pour du spam | Comptes et e-mails parasites | Limitation Redis, confirmation d'e-mail obligatoire, aucune ligne métier avant confirmation, nettoyage des `BROUILLON` abandonnés (> 90 jours) au Lot 2 |
| SMTP Supabase non configuré en production | Inscription impossible (e-mail de confirmation non reçu) | Prérequis vérifié avant mise en ligne (§2.2-2) |
| Compte staff rattaché à un partenaire | Mélange des droits | Trigger en base + refus à la connexion (P6) |
| Accès croisés A/B | Fuite de tarifs et de données | `partenaire_id` imposé par la session, RLS effective sur les lectures, tests A/B |
| Ancien tarif jsonb utilisé comme s'il était validé | Coût faux | Repris en `PROPOSE`, mention explicite dans Banderoles |
| Divergence capacité / profil d'impression (Banner Studio) | Banderole affectée à un atelier qui ne peut pas la préparer | Règle de priorité §2.2-4, écart signalé |
| Fusion de branche dans le mauvais ordre | Migration qui échoue | Fusionner `feature/banderoles-grand-format` d'abord |
| Atelier privé d'écriture sur les prestataires (P9) | Gêne opérationnelle | À confirmer ; réversible par la matrice |

---

## 10. Prérequis d'exploitation avant l'ouverture du portail

Points 1 à 4 **faits le 24/11/2026** sur staging et production (détail en §10.1).

1. **SMTP personnalisé dans Supabase Auth** (staging puis production) : Resend, hôte
   `smtp.resend.com`, port 465, utilisateur `resend`, mot de passe = une clé API Resend dédiée,
   expéditeur sur un domaine vérifié dans Resend.
2. **Confirmation d'e-mail activée** (« Confirm email ») sur les deux projets.
3. **URL de redirection autorisées** : `https://<domaine>/partenaire/auth/confirmer` (et
   l'équivalent staging).
4. **Modèles d'e-mail** « Confirm signup » et « Reset password » : coller le contenu de
   `supabase/templates/confirmation.html` et `recovery.html` (sujets dans `supabase/config.toml`).
   Ils pointent vers `{{ .SiteURL }}/partenaire/auth/confirmer?token_hash={{ .TokenHash }}&type=…` ;
   à installer seulement une fois le code du sous-lot 1.2 déployé.
5. ~~Application des migrations `0011` et `0012` en staging puis en production~~ — fait le
   16/11/2026 (§8, sous-lot 1.1).

### 10.1 Configuration Resend (24/11/2026)

- **Domaine** `smartvision.cg` vérifié dans Resend (région eu-west-1). Zone DNS chez PlanetHoster :
  TXT `resend._domainkey` (DKIM), CNAME `rsend` et `send` (SPF et retours d'envoi Resend). Le MX et
  le SPF de `smartvision.cg` (messagerie existante) ne sont pas modifiés. DMARC `_dmarc`
  (`v=DMARC1; p=none;`) recommandé, à ajouter.
- **Expéditeur** : `Elembo <notifications@smartvision.cg>`.
- **Application (Vercel, Production)** : `RESEND_API_KEY` et `DEVIS_EMAIL_FROM`, puis redéploiement.
- **Supabase Auth** (staging et production) : SMTP `smtp.resend.com:465`, utilisateur `resend`,
  expéditeur ci-dessus, sujets et modèles français, URLs de redirection (`localhost:3000` en
  staging, `https://elembo.vercel.app` en production). L'**URL du site** de la production valait
  `http://localhost:3000` : elle est passée à `https://elembo.vercel.app` (sinon les liens de
  confirmation menaient à `localhost`). Le staging garde `http://localhost:3000` (recette locale).
- **Méthode** : `supabase config push --workdir <dossier>` avec un `config.toml` minimal qui ne
  déclare que ces réglages (`config diff` avant et après : rien d'autre modifié). **Ne jamais
  pousser le `supabase/config.toml` du dépôt** vers un projet hébergé : ses URLs sont locales.
  Clés gardées dans `.env.resend.local` (ignoré par Git).
- **Vérifié** : envoi API (HTTP 200) ; inscription d'essai sur le staging → e-mail « Confirmez
  votre adresse — Espace partenaires Elembo » reçu en boîte de réception (pas en spam), expéditeur
  et modèle corrects ; compte d'essai supprimé.
