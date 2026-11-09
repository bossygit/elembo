# Lot 2.2 — Demandes de devis : plan d'implémentation

Statut : **plan à valider**, aucune implémentation, aucune migration 0007 appliquée.
Les six migrations du lot 3.1 sont déjà appliquées sur `elembo-staging`.

## 1. Constats sur le staging hébergé

### Buckets Supabase Storage

| Bucket | Public | Taille max | Types autorisés |
|---|---:|---:|---|
| `devis` | non | 25 MiB (26 214 400 octets) | PDF, PNG, JPEG, WEBP, ZIP |
| `production` | non | 50 MiB (52 428 800 octets) | PDF, PNG, JPEG, JSON, TXT |

Vérification effectuée via l'API Storage avec le service role :

- `devis` et `production` existent ;
- `public = false` pour les deux ;
- les limites de taille et les types MIME correspondent au schéma prévu.

### Politiques Storage

- `storage.objects` a la RLS **activée**.
- **Aucune politique** `anon` ou `authenticated` n'existe sur `storage.objects`.
- Conséquence voulue : aucun accès direct aux objets ; le serveur utilise le service role et
  délivre des URL signées à durée limitée.
- Un appel `anon` à `POST /storage/v1/object/list/devis` retourne `200 []` sur les buckets
  vides : la RLS filtre toutes les lignes. Aucun nom, aucune métadonnée d'objet n'est exposé.
- Aucun bucket public, aucune politique permissive à ajouter.

### Tables existantes

`clients` :
- `id`, `user_id` optionnel, `type_client`, `nom`, `societe`, `email`, `telephone`,
  `telephone_normalise`, `adresse`, `ville`, `notes`, `metadata`, timestamps ;
- index unique sur `lower(email)` lorsque l'email est présent ;
- index sur téléphone et téléphone normalisé.

`devis` :
- `reference` unique `DEV-…`, `client_id`, `famille` (`TEXTILE`, `TABLEAUX`, `IMPRESSION`,
  `SERVICES`), `besoin`, `format`, `quantite`, `specifications` JSONB, `statut`,
  `montant_propose_fcfa`, `prix_valide`, `prix_verrouille`, `date_relance`, `expire_le`,
  `assigne_a`, `source`, `notes_internes`, `idempotency_key`, timestamps ;
- statuts actuels : `NOUVEAU`, `EN_ANALYSE`, `PROPOSE`, `ACCEPTE`, `REFUSE`, `EXPIRE` ;
- transitions autorisées en base :
  `NOUVEAU → EN_ANALYSE|REFUSE|EXPIRE`,
  `EN_ANALYSE → PROPOSE|REFUSE|EXPIRE`,
  `PROPOSE → ACCEPTE|REFUSE|EXPIRE` ;
- un devis `ACCEPTE` exige un montant, force `prix_valide` et `prix_verrouille`, et interdit
  ensuite la modification du montant.

`fichiers_devis` :
- `devis_id`, `nom`, `chemin`, `type_mime`, `taille_octets`, `type_fichier`, `fournisseur`,
  `checksum`, `verifie`, `verifie_le`, `expire_le`, timestamps ;
- contrainte unique `(devis_id, nom)` ;
- RLS : lecture par `devis_accessible(devis_id)` (client propriétaire ou staff autorisé).

## 2. Parcours complet d'une demande

```
1. Le client ouvre /devis
   → choisit une famille : textile, impression, services
   → le formulaire affiche les champs spécifiques
   → il peut joindre des fichiers (facultatif)
   → il accepte le traitement de ses données

2. POST /api/devis
   → validation serveur (champs, types, tailles, origine, limitation de débit)
   → upsert client par email ou téléphone
   → INSERT devis (statut NOUVEAU, montant NULL, source SITE)
   → génération d'un jeton de suivi (hash stocké, jamais le clair en base)
   → INSERT notifications : confirmation client + alerte Smart Vision
   → réponse { reference, suiviToken, uploads[] }

3. Le navigateur envoie chaque fichier directement à Supabase Storage
   → URL signée d'envoi, bucket devis, chemin devis/<devis_id>/<uuid>-<nom>
   → aucune image ne traverse une fonction Vercel

4. POST /api/devis/[reference]/fichiers
   → jeton de suivi vérifié
   → le serveur liste les objets, vérifie taille, signature binaire, extension et SHA-256
   → marque fichiers_devis.verifie = true
   → notification « pièces reçues » à Smart Vision, idempotente

5. Smart Vision ouvre /admin/devis
   → consulte la demande, les fichiers et l'historique
   → passe EN_ANALYSE, saisit une proposition et un montant
   → le devis passe PROPOSE et une notification client est créée

6. Le client consulte /devis/[reference] avec son jeton
   → voit le statut, le montant proposé et les messages publics
   → accepte ou refuse
   → transition ACCEPTE ou REFUSE, historique et notification

7. Un devis ACCEPTE conserve son prix verrouillé
   → la transformation en commande est réservée au lot 3.2
   → aucun paiement n'est déclenché dans le lot 2.2
```

## 3. Architecture proposée

### Séparation

```
src/app/devis/*                    pages publiques
src/app/admin/devis/*              pages de traitement (rôle staff)
src/app/api/devis/*                API publique
src/app/api/admin/devis/*          API protégée
src/server/devis/*                 validation, repository, jetons, fichiers
src/server/storage/supabase.ts     URL signées et vérification d'objets
src/server/notifications/*         outbox + envoi email/Telegram
src/server/auth/*                  claims Supabase et garde de rôle
src/server/supabase/client.ts      clients serveur service_role / anon
```

Règles :

- aucun composant client n'importe un module `server` ni la clé `service_role` ;
- toutes les écritures passent par une route serveur ;
- les lectures publiques passent par le jeton de suivi, jamais par une simple référence ;
- le service role est utilisé uniquement dans les repositories serveur, après contrôle du rôle
  ou du jeton ;
- les fichiers ne sont jamais exposés par un bucket public.

### Dépendance supplémentaire

Ajouter `@supabase/supabase-js` (client officiel, serveur uniquement) pour :

- PostgREST et Storage ;
- vérification du JWT staff via `auth.getUser()` ;
- création d'URL signées d'envoi et de téléchargement.

Pas d'autre dépendance : validation avec les helpers TypeScript existants, envoi email par
`fetch` vers Resend si configuré, Telegram via le module existant.

## 4. Routes API

### Publiques

| Méthode | Route | Protection | Rôle |
|---|---|---|---|
| `POST` | `/api/devis` | origine, rate-limit IP/email, `Idempotency-Key`, honeypot | créer client + devis + URLs d'envoi |
| `GET` | `/api/devis/[reference]` | en-tête `x-devis-token` | statut public, aucune note interne |
| `POST` | `/api/devis/[reference]/fichiers` | `x-devis-token` | vérifier et marquer les fichiers |
| `POST` | `/api/devis/[reference]/decision` | `x-devis-token` | accepter ou refuser une proposition |

Le jeton de suivi est un secret de 32 octets, transmis une seule fois au client, stocké
uniquement sous forme de SHA-256, avec expiration (30 jours par défaut). Il voyage dans un
en-tête, jamais dans l'URL.

### Admin

| Méthode | Route | Rôles | Usage |
|---|---|---|---|
| `GET` | `/api/admin/devis` | admin, commercial, finance | liste, filtres statut/date/famille, pagination |
| `GET` | `/api/admin/devis/[id]` | admin, commercial, finance | détail, historique, fichiers |
| `PATCH` | `/api/admin/devis/[id]` | admin, commercial | notes internes, assignation, statut contrôlé |
| `POST` | `/api/admin/devis/[id]/proposition` | admin, commercial | montant + message, passage PROPOSE |
| `GET` | `/api/admin/devis/[id]/fichiers/[fichierId]/url` | admin, commercial | URL signée de téléchargement 5 min |

Routes volontairement différées :

- `POST /api/admin/devis/[id]/convertir` → lot 3.2 (commande avant paiement) ;
- relances automatiques → lot 5 ;
- export CSV → lot 4.

## 5. Modifications de schéma proposées

Une migration `20261109130007_devis_suivi.sql` est nécessaire pour le suivi public :

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

Justification :

- `suivi_token_hash` : suivi et décision client sans compte, sans exposer la référence seule ;
- `suivi_token_expire_le` : expiration et nettoyage ;
- `contact_snapshot` : fige les coordonnées au moment de la demande, même si le client est
  modifié plus tard.

Aucune modification de `fichiers_devis` n'est nécessaire : les colonnes `verifie`, `verifie_le`,
`expire_le`, `checksum` et `fournisseur` existent déjà.

Aucune modification de `clients` n'est nécessaire. L'upsert utilisera l'email ou le téléphone
normalisé ; l'index unique email existant protège les doublons.

`tests/supabaseSchema.test.ts` devra inclure la migration 0007 et vérifier les nouveaux champs.
Les tests RLS existants restent valables.

## 6. Upload sécurisé et conservation

### Envoi

- bucket privé `devis` ;
- chemin imposé `devis/<devis_id>/<uuid>-<nom-assaini>` ;
- URL signée d'envoi valable 10 minutes, `upsert: false`, taille et types bornés par le bucket ;
- maximum 5 fichiers par demande, 50 Mo cumulés ;
- types : PDF, PNG, JPEG, WEBP, ZIP ; SVG, HTML et exécutables refusés.

### Vérification après envoi

Le serveur :

1. liste l'objet et vérifie son existence ;
2. compare la taille annoncée et la limite ;
3. lit les premiers octets et vérifie la signature PNG/JPEG/PDF/ZIP/WEBP ;
4. vérifie que l'extension correspond au contenu ;
5. calcule le SHA-256 et le compare au checksum fourni ;
6. passe `verifie = true` et `verifie_le = now()`.

Un fichier non vérifié ne compte pas dans la complétude et n'est jamais téléchargé par
l'atelier.

### Conservation

- `expire_le = now() + 90 jours` à la création ;
- un devis converti en commande conserve ses pièces selon la politique de la commande ;
- les fichiers orphelins (aucune ligne `fichiers_devis`) sont supprimés par un job ;
- toute suppression est auditée.

## 7. Confirmation client et notification Smart Vision

Table `notifications` existante :

- `canal` : EMAIL, TELEGRAM, WHATSAPP ;
- `statut` : A_ENVOYER, ENVOYEE, ECHEC, ANNULEE ;
- `cle_idempotence` unique.

Événements :

| Événement | Destinataire | Clé d'idempotence |
|---|---|---|
| Demande reçue | client, si email | `devis:<id>:client-recu` |
| Demande reçue | Smart Vision | `devis:<id>:staff-recu` |
| Pièces reçues | Smart Vision | `devis:<id>:staff-fichiers` |
| Proposition envoyée | client | `devis:<id>:client-proposition` |
| Décision client | Smart Vision | `devis:<id>:staff-decision` |

Stratégie :

1. insérer l'outbox en base, dans la même transaction que le devis ;
2. tenter un envoi immédiat (Resend pour l'email, Telegram existant) ;
3. en cas d'échec, laisser `A_ENVOYER` avec `tentatives` et `derniere_erreur` ;
4. un cron de notification rejoue les lignes échues.

Sans `RESEND_API_KEY`, aucun email n'est annoncé comme envoyé : la ligne reste dans l'outbox et
est visible dans l'admin. Sans `TELEGRAM_BOT_TOKEN`, la notification staff reste également dans
l'outbox.

## 8. Statuts et règles

| Transition | Acteur | Condition |
|---|---|---|
| `NOUVEAU → EN_ANALYSE` | admin/commercial | — |
| `NOUVEAU → REFUSE` | admin/commercial | motif obligatoire |
| `EN_ANALYSE → PROPOSE` | admin/commercial | montant > 0, message public |
| `EN_ANALYSE → REFUSE` | admin/commercial | motif obligatoire |
| `PROPOSE → ACCEPTE` | client avec jeton ou admin avec note | montant présent |
| `PROPOSE → REFUSE` | client avec jeton ou admin | — |
| `NOUVEAU/EN_ANALYSE/PROPOSE → EXPIRE` | job ou admin | date d'expiration atteinte |

Règles :

- aucun prix n'est calculé automatiquement pour un devis ;
- le montant est saisi par Smart Vision et validé avant `PROPOSE` ;
- `ACCEPTE` verrouille le prix (trigger existant) ;
- aucune transition ne peut sauter une étape ;
- chaque transition écrit `historique_statuts_devis` ;
- un devis accepté n'est pas encore une commande : la conversion appartient au lot 3.2.

## 9. Fichiers du projet

### Nouveaux

```
supabase/migrations/20261109130007_devis_suivi.sql
src/app/devis/page.tsx
src/app/devis/[reference]/page.tsx
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
src/server/devis/fichiers.ts
src/server/devis/notifications.ts
src/server/storage/supabase.ts
src/app/api/devis/route.ts
src/app/api/devis/[reference]/route.ts
src/app/api/devis/[reference]/fichiers/route.ts
src/app/api/devis/[reference]/decision/route.ts
src/app/api/admin/devis/route.ts
src/app/api/admin/devis/[id]/route.ts
src/app/api/admin/devis/[id]/proposition/route.ts
src/app/api/admin/devis/[id]/fichiers/[fichierId]/url/route.ts
tests/devisValidation.test.ts
tests/devisJetons.test.ts
tests/devisApi.integration.test.ts
tests/devisStorage.integration.test.ts
```

### Modifiés

```
package.json / package-lock.json        + @supabase/supabase-js
.env.example                            variables devis et notifications
README.md                               lien vers le formulaire
src/components/site/Header.tsx          entrée « Devis »
src/app/entreprises/page.tsx             CTA vers /devis
src/app/contact/page.tsx                 CTA vers /devis
tests/supabaseSchema.test.ts             sept migrations, nouveaux champs
tests/authRoles.test.ts                  routes /api/devis et /api/admin/devis
docs/supabase-architecture.md            flux devis mis à jour
docs/supabase-securite.md                accès aux fichiers devis
docs/supabase-staging.md                 tests staging lot 2.2
```

## 10. Scénarios de tests

### Unitaires

- validation des champs par famille (textile, impression, services) ;
- email, téléphone congolais, quantité, besoin, format ;
- noms de fichiers, extensions, signatures, tailles, checksum ;
- génération/vérification du jeton de suivi (hash, expiration, timing-safe) ;
- machine à états côté application, en complément du trigger.

### Intégration staging

- `POST /api/devis` crée client + devis + notifications, sans montant ;
- double envoi avec la même `Idempotency-Key` → même devis, pas de doublon ;
- client existant par email/téléphone → réutilisé, pas dupliqué ;
- `GET /api/devis/[reference]` sans jeton → 401 ; mauvais jeton → 404 ; bon jeton → statut ;
- client A ne lit pas le devis de client B ;
- anon ne lit ni `devis` ni `fichiers_devis` ;
- commercial/finance lisent les devis, atelier non ;
- `PATCH` admin refuse une transition invalide ;
- `PROPOSE` sans montant refusé ;
- `ACCEPTE` verrouille le prix ;
- upload signé : mauvais type MIME, fichier trop gros, chemin `../`, contenu mensonger,
  checksum incorrect → refusés ;
- fichier d'un autre devis → URL refusée ;
- URL de téléchargement expirée → refusée ;
- notifications créées une seule fois (clé d'idempotence) ;
- nettoyage des devis, fichiers et utilisateurs de test → vérificateur à zéro.

### Stockage

- bucket `devis` privé ;
- `anon` ne peut ni lister ni télécharger un objet réel ;
- `authenticated` non staff ne peut pas télécharger le fichier d'un autre client ;
- service role seul crée les URL signées ;
- suppression d'un fichier de test après la suite.

### Non-régression

- `npm test`, `npm run lint`, `npm run build` ;
- les 32 tests Supabase existants restent verts ;
- aucun paiement MTN, aucune migration destructive, aucun `db reset --remote`.

## 11. Variables d'environnement supplémentaires

À ajouter à `.env.example` et à Vercel Preview/Production selon validation :

| Variable | Obligatoire | Usage |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | oui | liens de suivi dans les emails |
| `DEVIS_NOTIFY_EMAIL` | oui pour l'alerte staff | destinataire Smart Vision |
| `RESEND_API_KEY` | non | envoi email réel ; sans lui, outbox seulement |
| `DEVIS_EMAIL_FROM` | si Resend | expéditeur vérifié |
| `TELEGRAM_BOT_TOKEN` | non | alerte staff existante |
| `TELEGRAM_CHAT_ID` | non | destinataire Telegram |
| `DEVIS_TOKEN_TTL_DAYS` | non (30) | expiration du jeton de suivi |
| `DEVIS_MAX_FILES` | non (5) | nombre de pièces |
| `DEVIS_MAX_TOTAL_MB` | non (50) | volume cumulé |
| `DEVIS_RATE_LIMIT_PER_HOUR` | non (5) | limitation par IP/email |

Les variables Supabase existantes restent inchangées. Aucune clé ne doit être préfixée
`NEXT_PUBLIC_` sauf l'URL et la clé anon.

## 12. Points à valider avant implémentation

1. **Suivi client par jeton** plutôt que par simple référence : accepté ?
2. **Email** : Resend est-il disponible ? Sinon, l'outbox et l'écran de confirmation
   suffisent-ils au lancement ?
3. **Admin minimal** : une liste et une fiche de traitement suffisent pour 2.2, le back-office
   complet restant au lot 3.3 ?
4. **Upload** : 5 fichiers / 50 Mo cumulés sont-ils les bonnes limites ?
5. **Conversion en commande** : bien différée au lot 3.2, sans paiement en 2.2 ?
6. **Migration 0007** : acceptée pour `suivi_token_hash`, `suivi_token_expire_le` et
   `contact_snapshot` ?

Après validation, l'implémentation suivra l'ordre : migration 0007 → repositories et
validation → routes publiques → upload et vérification → notifications → admin minimal →
tests staging → rapport de résultats.
