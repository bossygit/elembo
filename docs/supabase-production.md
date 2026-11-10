# Supabase production — projet, variables et vérifications

État au 10 novembre 2026. Le formulaire de devis public est actif sur
`https://elembo.vercel.app/devis` et écrit dans le projet Supabase de production.

## 1. Projet

| Champ | Valeur |
|---|---|
| Nom | `elembo-production` |
| Project-ref | `ogshtnmbeequefisqwcz` |
| URL | `https://ogshtnmbeequefisqwcz.supabase.co` |
| Organisation | `odqpstsqyczyfayxydjs` (Smart) |
| Région | `eu-west-3` (Paris) — même proximité que les fonctions Vercel en `cdg1` |
| Créé le | 10 novembre 2026 |

Le projet `elembo-staging` (`wbbvpslpagptvlnvhiqo`, `eu-central-1`) reste dédié aux tests.
Les deux projets sont distincts : aucune donnée de production n'est écrite dans le staging.

## 2. Schéma

Les neuf migrations de `supabase/migrations/` ont été appliquées sur le projet neuf :

```text
20261109130001_extensions_types.sql
20261109130002_tables.sql
20261109130003_fonctions_index.sql
20261109130004_rls_permissions.sql
20261109130005_storage.sql          → buckets privés `devis` et `production`
20261109130006_seed_reference.sql
20261109130007_devis_suivi.sql
20261109130008_commandes_cycle.sql
20261109130009_commandes_momo.sql
```

Commandes exécutées :

```bash
npx supabase link --project-ref ogshtnmbeequefisqwcz
npx supabase db push --remote --dry-run   # contrôle : exactement les 9 migrations
npx supabase db push --remote             # nécessite --yes en exécution non interactive
npx supabase migration list --remote      # local et distant alignés
```

## 3. Variables Vercel (Production)

Ajoutées le 10 novembre 2026 sur le projet Vercel `elembo` (équipe
`kitutupros-projects`). Les valeurs ne sont jamais dans le dépôt.

| Variable | Type | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | config | `https://ogshtnmbeequefisqwcz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | config | clé publique, limitée par la RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | écritures et stockage, serveur uniquement |
| `SUPABASE_STORAGE_BUCKET_DEVIS` | secret | `devis` |
| `SUPABASE_STORAGE_BUCKET_PRODUCTION` | secret | `production` |
| `DEVIS_SESSION_SECRET` | secret | signature HMAC des sessions de suivi |
| `DEVIS_OTP_SECRET` | secret | signature HMAC des codes OTP |
| `DEVIS_NOTIFY_EMAIL` | secret | `store@smartvision.cg` |
| `NEXT_PUBLIC_SITE_URL` | config | `https://elembo.vercel.app` (vérification d'origine des POST) |

Déjà présents avant ce lot et réutilisés : `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
(notification staff), `CRON_SECRET` (tâche planifiée), `REDIS_URL`, `BLOB_*`, `MOMO_*`,
`APP_ORIGINS`, `ATELIER_TOKEN`.

`NEXT_PUBLIC_*` est figé au build : toute modification exige un redéploiement
(`npx vercel deploy --prod`).

## 4. Secrets locaux

`.env.prod.local` (mode `600`, ignoré par Git via `.env*`) contient : mot de passe de la base,
clés `anon` et `service_role`, secrets HMAC, et le compte staff créé. Il n'est jamais commité ni
affiché. Le mot de passe de la base se réinitialise dans le dashboard Supabase.

## 5. Comptes staff

Un compte administrateur existe : `admin@smartvision.cg`, `app_metadata.role = "admin"`,
email confirmé. Le mot de passe est dans `.env.prod.local` et doit être changé après la première
connexion.

Créer un autre collaborateur (le rôle est lu **uniquement** dans `app_metadata`) :

```bash
set -a; source ./.env.prod.local; set +a
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data '{"email":"commercial@smartvision.cg","password":"<mot-de-passe>","email_confirm":true,"app_metadata":{"role":"commercial"}}'
```

Rôles acceptés : `admin`, `commercial`, `atelier`, `finance`.

## 6. Vérifications réelles du 10 novembre 2026

| Contrôle | Résultat |
|---|---|
| `GET /devis` | 200, formulaire rendu (famille, quantités, fichiers, consentement) |
| `POST /api/devis` avec `Origin: https://elembo.vercel.app` | `201`, référence `DEV-20261110-…` |
| Envoi d'un PNG vers l'URL signée | 200 |
| `POST /api/devis/<ref>/fichiers` | 200, `verifies: 1` |
| `GET /api/devis/<ref>` avec cookie de session | 200, statut `NOUVEAU`, fichier `verifie: true` |
| Lignes créées | `devis`, `fichiers_devis`, `devis_sessions`, `notifications` (EMAIL + TELEGRAM) |
| `GET /api/admin/devis` sans jeton | 401 |
| `GET /api/admin/devis` avec le jeton du compte admin | 200, devis listé |
| `GET /admin/devis` sans session | 307 vers `/admin/connexion` |

La demande de vérification a ensuite été supprimée : base de production et bucket `devis`
laissés vides.

## 7. Limites connues

- **Aucun email n'est envoyé** : `RESEND_API_KEY` et `DEVIS_EMAIL_FROM` ne sont pas configurés.
  Les messages restent dans `notifications` (`A_ENVOYER`) et l'email de confirmation client
  comme l'OTP par email sont indisponibles. Le client voit sa référence à l'écran et garde la
  session 30 jours ; pour retrouver un devis depuis un autre appareil, il faut brancher un
  fournisseur d'email.
- La notification staff fonctionne par **Telegram** (variables déjà présentes) et part
  immédiatement après l'envoi du formulaire : l'outbox est traité par `after()` dans
  `POST /api/devis` et `POST /api/devis/<ref>/fichiers`, la tâche planifiée quotidienne
  reste un filet de sécurité.
- La page `/devis/suivi` affiche un message explicite tant qu'aucun canal d'envoi de code
  n'est configuré (`recuperationDisponible`), au lieu de faire attendre un code qui n'arrive pas.
- Aucun antivirus : les fichiers restent `NON_ANALYSE` et non téléchargeables, la dérogation
  admin reste obligatoire.
- Plan Supabase gratuit : pas de restauration point-in-time. Un export de schéma se fait avec
  `scripts/exporter-schema-supabase.sh` ; les sauvegardes de données doivent être exportées hors
  du dépôt.
- La couche `/admin` couvre les devis et les commandes ; les lots 3.2 à 3.5 (cycle commande
  serveur, production, stock, finances) restent à faire.

## 8. Retour arrière

`db push` est forward-only. Pour repartir d'un schéma propre en production, préférer une
restauration de sauvegarde ou la recréation du projet, puis remettre à jour
`NEXT_PUBLIC_SUPABASE_URL`, les clés et `SUPABASE_SERVICE_ROLE_KEY` dans Vercel. Ne jamais
exécuter `db reset --remote` sur ce projet sans décision explicite.

## 9. Attention au lien CLI

`supabase link` pointe sur un seul projet. Après toute opération de production, relier de
nouveau le staging :

```bash
npx supabase link --project-ref wbbvpslpagptvlnvhiqo
cat supabase/.temp/project-ref   # doit afficher le ref staging
```

Sans cela, un `supabase db push` ultérieur viserait la production.
