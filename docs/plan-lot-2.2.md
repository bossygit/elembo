# Lot 2.2 — Demandes de devis : plan final (version 2)

Statut : **à valider**, aucune implémentation, aucune migration 0007 appliquée.
Les six migrations du lot 3.1 sont appliquées sur `elembo-staging`.

Décisions retenues : jeton + session cookie, Resend optionnel, admin minimal, 5 fichiers / 50 Mo,
conversion différée au lot 3.2, migration 0007 sous réserve des points A–J.

## 1. Constats vérifiés sur le staging

### Buckets

| Bucket | Public | Limite | Types |
|---|---:|---:|---|
| `devis` | non | 25 MiB (26 214 400 o) | PDF, PNG, JPEG, WEBP, ZIP |
| `production` | non | 50 MiB (52 428 800 o) | PDF, PNG, JPEG, JSON, TXT |

### Politiques Storage

- `storage.objects` : RLS activée.
- Aucune politique `anon` ou `authenticated` : accès direct refusé.
- Un `POST anon /storage/v1/object/list/devis` retourne `200 []` sur bucket vide : la RLS
  filtre toutes les lignes, aucun nom d'objet n'est exposé.
- Les URL signées sont le seul chemin d'envoi et de téléchargement.

### Tables

`clients` : nom, societe, email, telephone, telephone_normalise, type_client, metadata ;
index unique sur `lower(email)` si email.

`devis` : reference `DEV-…`, client_id, famille, besoin, format, quantite, specifications,
statut, montant_propose_fcfa, prix_valide, prix_verrouille, expire_le, assigne_a, source,
notes_internes, idempotency_key.

`fichiers_devis` : devis_id, nom, chemin, type_mime, taille_octets, type_fichier, fournisseur,
checksum, verifie, verifie_le, expire_le ; unique `(devis_id, nom)`.

`historique_statuts_devis` : **existe déjà** (vérifié sur le staging), avec `devis_id`,
`ancien_statut`, `nouveau_statut`, `acteur`, `note`, `cree_le`, trigger
`devis_transition`, RLS et policy staff. Aucune création nécessaire ; la migration 0007
l'étend pour tracer aussi les prix et la source.

## 2. Parcours et session de suivi

```
1. Le client ouvre /devis, choisit la famille et remplit le formulaire.
2. POST /api/devis
   → transaction PostgreSQL atomique : client + devis + notifications
   → idempotence par devis.idempotency_key
   → jeton de suivi généré, seul son SHA-256 est stocké
   → Set-Cookie de session signée (HttpOnly, Secure, SameSite=Lax)
   → réponse { reference, suiviToken } (jamais dans l'URL)
3. Le client envoie les fichiers directement dans le bucket devis via URL signée.
4. POST /api/devis/[reference]/fichiers, avec le cookie de session
   → vérification réelle des objets, marquage verifie=true
5. Smart Vision traite dans /admin/devis (auth Supabase, rôle app_metadata).
6. Le client consulte /devis/[reference] avec le cookie, ou échange son jeton via
   POST /api/devis/session sur un autre appareil.
7. Le client accepte/refuse ; la base trace la décision.
8. ACCEPTE verrouille le prix ; conversion en commande différée au lot 3.2.
   Aucun paiement dans ce lot.
```

### Cookie de session

- Valeur : session signée HMAC (`devis_id`, `exp`), jamais le jeton brut.
- `HttpOnly`, `Secure` en production, `SameSite=Lax`, `Path=/`, expiration 30 jours.
- Secret serveur `DEVIS_SESSION_SECRET` (32 octets minimum), jamais `NEXT_PUBLIC_`.
- `POST /api/devis/session` reçoit `{ reference, token }` dans le **corps JSON**, vérifie le
  hash à temps constant, puis pose le cookie. Aucun jeton en query string.
- `POST /api/devis` peut poser directement le cookie pour le navigateur qui a soumis ;
  `suiviToken` est renvoyé une fois pour permettre le suivi sur un autre appareil.
- Les routes publiques ne lisent jamais le jeton dans l'URL. Les logs ne doivent jamais
  journaliser le corps de `/api/devis` ni `/api/devis/session`.

## 3. Architecture

```
src/app/devis/*                       pages publiques
src/app/admin/devis/*                 back-office minimal
src/app/api/devis/*                   API publique
src/app/api/admin/devis/*             API protégée
src/server/devis/*                    validation, repository, jetons, fichiers
src/server/supabase/client.ts         clients service_role et anon
src/server/auth/supabase.ts           vérification du JWT staff
src/server/auth/route.ts              avecGardeRole
src/server/storage/supabase.ts        URL signées et métadonnées Storage
src/server/notifications/*            outbox, Resend, Telegram
```

Dépendances ajoutées :

- `@supabase/supabase-js` : PostgREST, Storage, Auth ;
- `@supabase/ssr` : session cookie du back-office Next.js App Router.

Aucun autre package. Validation en TypeScript, emails via `fetch` Resend, Telegram existant.

## 4. Routes API définitives

### Publiques

| Méthode | Route | Protection | Usage |
|---|---|---|---|
| `POST` | `/api/devis` | origine, rate-limit IP/email, `Idempotency-Key`, honeypot | crée client + devis + notifications, pose le cookie |
| `POST` | `/api/devis/session` | rate-limit, corps `{reference,token}` | échange le jeton contre le cookie |
| `GET` | `/api/devis/[reference]` | cookie de session | statut public, aucune note interne |
| `POST` | `/api/devis/[reference]/fichiers` | cookie de session | vérifie et marque les fichiers |
| `POST` | `/api/devis/[reference]/decision` | cookie de session + origine | accepte ou refuse une proposition |
| `GET` | `/api/devis/[reference]/fichiers/[fichierId]/url` | cookie propriétaire | URL signée de téléchargement 5 min |

### Back-office

| Méthode | Route | Rôles | Usage |
|---|---|---|---|
| `POST` | `/api/admin/session` | public, rate-limit | login Supabase Auth, pose les cookies staff |
| `POST` | `/api/admin/session/logout` | staff | déconnexion |
| `GET` | `/api/admin/devis` | admin, commercial, finance | liste, filtres, pagination |
| `GET` | `/api/admin/devis/[id]` | admin, commercial, finance | détail, historique, fichiers |
| `PATCH` | `/api/admin/devis/[id]` | admin, commercial | notes, assignation, statut contrôlé |
| `POST` | `/api/admin/devis/[id]/proposition` | admin, commercial | montant + message, passage PROPOSE |
| `POST` | `/api/admin/devis/[id]/decision` | admin, commercial | décision pour un accord téléphonique, avec note |
| `GET` | `/api/admin/devis/[id]/fichiers/[fichierId]/url` | admin, commercial | URL signée 5 min, fichier vérifié |

`finance` lit les devis et métadonnées, jamais les fichiers. `atelier` n'accède pas aux devis.

Différées : conversion en commande (3.2), relances (5), export (4).

### Contrôle d'accès aux fichiers

- propriétaire : cookie de session valide et `fichier.devis_id` correspondant ;
- staff : `admin` ou `commercial` uniquement ;
- fichier `verifie=false` : jamais listé ni signé ;
- chemin vérifié sous `devis/<devis_id>/` ;
- URL signée `download: true`, expiration 5 min ;
- aucun bucket public.

## 5. Migration 0007 — schéma et fonctions

Fichier : `supabase/migrations/20261109130007_devis_suivi.sql`.

### 5.1 Devis : suivi

```sql
alter table public.devis
  add column suivi_token_hash text,
  add column suivi_token_expire_le timestamptz,
  add column contact_snapshot jsonb not null default '{}'::jsonb,
  add constraint devis_contact_snapshot_object
    check (jsonb_typeof(contact_snapshot) = 'object');

create unique index devis_suivi_token_hash_unique
  on public.devis (suivi_token_hash)
  where suivi_token_hash is not null;

create index devis_suivi_token_expire_idx
  on public.devis (suivi_token_expire_le)
  where suivi_token_expire_le is not null;
```

### 5.2 Historique des statuts et des prix

`historique_statuts_devis` existe ; la migration l'étend :

```sql
alter table public.historique_statuts_devis
  add column type_evenement text not null default 'STATUT'
    check (type_evenement in ('STATUT', 'PRIX', 'DECISION', 'NOTE')),
  add column ancien_montant_fcfa integer,
  add column nouveau_montant_fcfa integer,
  add column source text not null default 'STAFF'
    check (source in ('STAFF', 'CLIENT', 'SYSTEME'));

create index historique_devis_evenements_idx
  on public.historique_statuts_devis (devis_id, cree_le desc);
```

Le trigger `verifier_transition_devis` est remplacé pour :

- valider la transition ;
- exiger un montant pour `PROPOSE` et `ACCEPTE` ;
- verrouiller le prix après `ACCEPTE` ;
- écrire une ligne `STATUT` (ou `DECISION` pour une décision client) ;
- écrire une ligne `PRIX` si `montant_propose_fcfa` change ;
- lire l'acteur dans `auth.uid()` ou `current_setting('app.acteur_id', true)` ;
- lire la source dans `current_setting('app.source', true)`, défaut `STAFF`.

### 5.3 Notifications : reprise

```sql
alter table public.notifications
  add column prochaine_tentative timestamptz not null default now(),
  add column derniere_tentative timestamptz;

create index notifications_a_envoyer_idx
  on public.notifications (statut, prochaine_tentative)
  where statut in ('A_ENVOYER', 'ECHEC');
```

`notifications.cle_idempotence` existe déjà et reste la garantie anti-doublon.

### 5.4 Fonctions atomiques et contrôlées

Fonctions `security definer`, `search_path = public, auth`, exécution réservée à
`service_role` :

- `creer_devis_atomique(...)` :
  - `pg_advisory_xact_lock(hashtextextended(idempotency_key, 0))` ;
  - retourne le devis existant si la clé existe déjà ;
  - upsert client par email (ou téléphone) ;
  - insert devis ;
  - insert notifications client + staff avec `on conflict (cle_idempotence) do nothing` ;
  - toute erreur annule l'ensemble.

- `transitionner_devis(devis_id, nouveau_statut, montant, note, acteur, source)` :
  - `select ... for update` sur le devis ;
  - vérifie la transition avec `transition_devis_autorisee` ;
  - exige le montant pour `PROPOSE`/`ACCEPTE` ;
  - met à jour le statut et le prix dans la même transaction ;
  - le trigger écrit l'historique et le prix ;
  - écrit `journal_audit` avec l'acteur.

- `decider_devis_public(devis_id, decision, source='CLIENT')` :
  - réservé au serveur après validation du cookie ;
  - seulement `PROPOSE → ACCEPTE|REFUSE` ;
  - aucune modification de prix ;
  - trace `source = CLIENT`.

- `lister_devis_a_nettoyer(dry_run boolean)` :
  - retourne uniquement les devis/fichiers éligibles (voir section 9) ;
  - ne supprime rien en mode dry-run ;
  - ne touche jamais un devis `ACCEPTE`, lié à une commande, ou un fichier encore référencé.

Les routes n'écrivent pas directement `devis` ou `notifications` : elles appellent ces RPC.
`service_role` garde l'exécution ; `anon`/`authenticated` n'ont aucun `EXECUTE`.

## 6. Contrôles et traces au niveau base

- transitions : trigger + fonction `transition_devis_autorisee` ;
- montant : `PROPOSE` et `ACCEPTE` l'exigent ; `ACCEPTE` verrouille ;
- acceptation/refus : RPC avec `for update`, donc deux décisions concurrentes ne peuvent pas
  gagner toutes les deux ;
- prix : toute variation écrit une ligne `PRIX` avec ancien/nouveau montant, acteur et source ;
- notes/assignation : `journal_audit` via la route admin ;
- idempotence : `devis.idempotency_key` unique + verrou consultatif + notifications
  `cle_idempotence` unique ;
- aucun accès navigateur en écriture.

## 7. Upload, formats et URL signées

### Configuration vérifiée

- `devis` privé, 25 MiB, PDF/PNG/JPEG/WEBP/ZIP ;
- `production` privé, 50 MiB, PDF/PNG/JPEG/JSON/TXT ;
- `storage.objects` RLS activée, 0 politique directe ;
- URL d'envoi : 10 min ; URL de téléchargement : 5 min.

### Règles

- 5 fichiers maximum, 50 Mo cumulés, 25 MiB par fichier ;
- chemin `devis/<devis_id>/<uuid>-<nom-assaini>` ;
- refus des noms avec `..`, slash, caractères de contrôle, double extension dangereuse ;
- vérification par signature binaire, extension, taille, checksum SHA-256 ;
- `verifie=true` seulement après contrôle ; sinon invisible et non signable ;
- téléchargement en `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` ;
- aucun SVG.

### ZIP

- accepté uniquement comme `SOURCE` de devis, jamais dans `production` ;
- **jamais extrait ni exécuté** côté serveur ;
- un seul ZIP par demande ;
- stocké et servi en pièce jointe opaque ;
- si une inspection d'archive devient nécessaire, elle sera faite plus tard avec un parseur
  borné (nombre d'entrées, taille décompressée, chemins) ; pas en 2.2.

### Fichiers non vérifiés

- jamais listés dans l'admin ;
- jamais signés ;
- job de nettoyage après 24 h si l'objet existe encore.

## 8. Notifications fiables

- outbox `notifications` dans la même transaction que le devis ;
- clés :
  `devis:<id>:client-recu`, `devis:<id>:staff-recu`,
  `devis:<id>:staff-fichiers`, `devis:<id>:client-proposition`,
  `devis:<id>:staff-decision` ;
- worker `GET /api/cron/notifications` protégé par `CRON_SECRET` ;
- réclamation `for update skip locked`, lots de 50 ;
- backoff 1, 5, 15, 60, 360, 1440 minutes ;
- `ENVOYEE` seulement après succès du fournisseur ;
- Resend : en-tête `Idempotency-Key` = `cle_idempotence` ;
- Telegram : `message_id` conservé dans `metadata`, pas de renvoi si déjà `ENVOYEE` ;
- sans fournisseur, la ligne reste `A_ENVOYER` et est visible dans l'admin ;
- aucun email annoncé comme envoyé sans provider.

## 9. Nettoyage limité aux ressources éligibles

Un devis est éligible seulement si :

- `statut in ('NOUVEAU','EN_ANALYSE','PROPOSE','REFUSE','EXPIRE')` ;
- `expire_le < now()` ;
- aucune commande liée (`commandes.devis_id is null`) ;
- aucun fichier `verifie=true` encore nécessaire à un devis actif.

Un fichier est éligible seulement si :

- `fichiers_devis.expire_le < now()` ;
- son devis est terminal (`REFUSE`, `EXPIRE`) ou supprimé ;
- aucune commande ne le référence ;
- l'objet existe encore dans le bucket.

Un objet orphelin est éligible si :

- aucun `fichiers_devis.chemin` ne le référence ;
- il est plus vieux que 24 h ;
- son chemin est sous `devis/` (jamais `production/`).

Le job :

1. calcule la liste en dry-run ;
2. vérifie chaque chemin ;
3. supprime l'objet Storage ;
4. supprime la ligne ;
5. écrit `journal_audit`.

Aucun `DELETE` global, aucun `LIKE` large, aucun objet `production` dans le lot 2.2.

## 10. Back-office minimal et authentification

- Supabase Auth pour le staff ; pas d'inscription publique.
- Création des comptes dans le dashboard Supabase, rôle dans `app_metadata` :
  `admin`, `commercial`, `finance`, `atelier`.
- `@supabase/ssr` gère les cookies de session côté serveur.
- `/admin/connexion` : email + mot de passe, rate-limit.
- `POST /api/admin/session` : `signInWithPassword`, cookies HttpOnly, pas de mot de passe loggé.
- Layout `/admin` : vérifie la session et le rôle côté serveur.
- Chaque route API refait `avecGardeRole` ; le middleware seul ne suffit pas.
- `admin`/`commercial` : traitement des devis ; `finance` : lecture ; `atelier` : aucun accès.
- Un compte sans rôle `app_metadata` est refusé, même authentifié.
- Test d'élévation `commercial → admin` via `PUT /auth/v1/user` : rôle inchangé.

## 11. Fichiers du projet

### Nouveaux

```
supabase/migrations/20261109130007_devis_suivi.sql
src/app/devis/page.tsx
src/app/devis/[reference]/page.tsx
src/app/devis/suivi/page.tsx
src/app/admin/connexion/page.tsx
src/app/admin/devis/page.tsx
src/app/admin/devis/[id]/page.tsx
src/components/devis/DevisForm.tsx
src/components/devis/DevisUploader.tsx
src/components/devis/DevisStatus.tsx
src/lib/devis/types.ts
src/lib/devis/validation.ts
src/lib/devis/format.ts
src/server/supabase/client.ts
src/server/auth/supabase.ts
src/server/devis/repository.ts
src/server/devis/jetons.ts
src/server/devis/session.ts
src/server/devis/fichiers.ts
src/server/devis/notifications.ts
src/server/storage/supabase.ts
src/app/api/devis/route.ts
src/app/api/devis/session/route.ts
src/app/api/devis/[reference]/route.ts
src/app/api/devis/[reference]/fichiers/route.ts
src/app/api/devis/[reference]/fichiers/[fichierId]/url/route.ts
src/app/api/devis/[reference]/decision/route.ts
src/app/api/admin/session/route.ts
src/app/api/admin/session/logout/route.ts
src/app/api/admin/devis/route.ts
src/app/api/admin/devis/[id]/route.ts
src/app/api/admin/devis/[id]/proposition/route.ts
src/app/api/admin/devis/[id]/decision/route.ts
src/app/api/admin/devis/[id]/fichiers/[fichierId]/url/route.ts
src/app/api/cron/notifications/route.ts
tests/devisValidation.test.ts
tests/devisJetons.test.ts
tests/devisSession.test.ts
tests/devisApi.integration.test.ts
tests/devisStorage.integration.test.ts
tests/devisNettoyage.test.ts
```

### Modifiés

```
package.json / package-lock.json   @supabase/supabase-js, @supabase/ssr
.env.example                       variables devis, session, notifications
README.md                          lien vers /devis
src/components/site/Header.tsx     entrée Devis
src/app/entreprises/page.tsx       CTA /devis
src/app/contact/page.tsx           CTA /devis
tests/supabaseSchema.test.ts       sept migrations, nouvelles colonnes
tests/authRoles.test.ts            routes devis et admin
docs/supabase-architecture.md      flux devis, sessions, RPC
docs/supabase-securite.md          cookies, fichiers, service_role
docs/supabase-staging.md           tests lot 2.2
```

## 12. Tests complémentaires

### Atomicité et idempotence

- deux `POST /api/devis` simultanés avec la même `Idempotency-Key` → un seul client, un seul
  devis, notifications uniques ;
- une erreur d'insertion notification annule client + devis ;
- même clé après succès → même référence, aucun doublon ;
- client existant par email réutilisé.

### Session et jeton

- jeton jamais accepté en query string ;
- `POST /api/devis/session` avec bon jeton pose un cookie `HttpOnly; Secure; SameSite=Lax` ;
- cookie absent/expiré/falsifié → 401 ;
- cookie d'un autre devis → 404 ;
- jeton en clair absent de la base (seul le hash) ;
- aucun jeton dans les logs ou les URL générées.

### Autorisations

- propriétaire peut lire son devis et télécharger ses fichiers vérifiés ;
- client B ne peut pas lire/télécharger le devis A ;
- anon ne lit ni `devis` ni `fichiers_devis` ;
- commercial/admin lisent ; finance lit métadonnées ; atelier refusé ;
- route admin avec rôle incorrect → 403 ;
- `service_role` utilisé seulement après garde ;
- fichier `verifie=false` non signable ;
- chemin d'un autre devis refusé.

### Statuts, prix, décisions

- transitions valides et invalides ;
- `PROPOSE` sans montant refusé ;
- `ACCEPTE` sans montant refusé ;
- `ACCEPTE` verrouille le prix ;
- décision concurrente : une seule gagne ;
- historique `STATUT`, `PRIX`, `DECISION` avec acteur/source ;
- changement de prix tracé même sans changement de statut ;
- acceptation/refus client avec source `CLIENT`.

### Fichiers malveillants

- extension `.jpg` avec contenu PNG → refus ;
- fichier HTML/SVG → refus ;
- nom `../`, `logo.png.exe`, `logo.exe.png` → refus ;
- taille > 25 MiB → refus ;
- checksum incorrect → refus ;
- ZIP avec entrées `../` → stocké opaque, jamais extrait ; test de non-extraction ;
- fichier non vérifié → non listé, non signé ;
- URL signée expirée → refus.

### Buckets et URL signées

- `devis` et `production` privés, limites/types conformes ;
- `anon` ne liste/télécharge aucun objet réel ;
- URL upload 10 min, download 5 min (décoder `exp` du jeton signé ou tester la constante) ;
- service role seul crée les URL.

### Notifications

- outbox créée dans la transaction ;
- clé d'idempotence unique ;
- échec provider → `A_ENVOYER` + backoff ;
- rejeu ne crée pas de doublon ;
- sans Resend, aucun statut `ENVOYEE` mensonger.

### Nettoyage

- devis expiré non converti supprimé ;
- devis ACCEPTE ou lié à une commande conservé ;
- fichier actif conservé ;
- objet orphelin de plus de 24 h supprimé ;
- objet `production/` jamais touché ;
- dry-run sans suppression ;
- audit écrit.

### Non-régression

- 32 tests Supabase existants ;
- `npm test`, `npm run lint`, `npm run build` ;
- aucun paiement MTN, aucun `db reset --remote`.

## 13. Variables d'environnement

Existantes : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET_DEVIS`,
`SUPABASE_STORAGE_BUCKET_PRODUCTION`, `APP_ORIGINS`.

Nouvelles :

| Variable | Obligatoire | Usage |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | oui | liens de suivi |
| `DEVIS_SESSION_SECRET` | oui | signature HMAC du cookie, 32+ octets |
| `DEVIS_NOTIFY_EMAIL` | oui pour l'alerte staff | destinataire |
| `RESEND_API_KEY` | non | email réel ; sinon outbox |
| `DEVIS_EMAIL_FROM` | si Resend | expéditeur vérifié |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | non | alerte staff |
| `DEVIS_TOKEN_TTL_DAYS` | non (30) | jeton de suivi |
| `DEVIS_SESSION_TTL_DAYS` | non (30) | cookie |
| `DEVIS_UPLOAD_URL_TTL_SECONDS` | non (600) | URL d'envoi |
| `DEVIS_DOWNLOAD_URL_TTL_SECONDS` | non (300) | URL de téléchargement |
| `DEVIS_MAX_FILES` | non (5) | pièces |
| `DEVIS_MAX_TOTAL_MB` | non (50) | volume cumulé |
| `DEVIS_RATE_LIMIT_PER_HOUR` | non (5) | rate-limit |

`DEVIS_SESSION_SECRET` ne doit jamais être préfixé `NEXT_PUBLIC_`, loggé ou commité.

## 14. Points à valider

1. Migration 0007 avec token, contact snapshot, historique prix, notifications retry,
   fonctions RPC et index.
2. Session cookie HMAC + `POST /api/devis/session` (jeton dans le corps, jamais en URL).
3. Back-office minimal avec Supabase Auth et `app_metadata`.
4. ZIP accepté uniquement comme source opaque, jamais extrait.
5. Nettoyage dry-run et prédicats stricts.
6. Resend optionnel ; outbox visible sans provider.

Après validation : migration 0007 → RPC/repositories → session et routes publiques →
upload/vérification → notifications → admin minimal → tests staging → rapport.
