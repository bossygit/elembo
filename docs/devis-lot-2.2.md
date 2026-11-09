# Lot 2.2 — Demandes de devis, sessions et back-office minimal

État au 2026-11-09. Migration `0007_devis_suivi.sql` écrite et appliquée **uniquement**
sur la stack Supabase locale. Elle n’est **pas** appliquée sur `elembo-staging` ni en
production : une autorisation explicite reste nécessaire pour `db push --remote`.

## Parcours client

1. `GET /devis` : formulaire public (famille, besoin, coordonnées, 5 fichiers max).
2. `POST /api/devis` : validation serveur, limitation de débit, création atomique du
   client + devis + notifications, génération d’URLs d’envoi signées.
3. Le navigateur envoie chaque fichier directement dans le bucket privé `devis`, puis
   `POST /api/devis/[reference]/fichiers` vérifie les octets, la taille et le type MIME
   avant de marquer le fichier `verifie = true`.
4. Une session de suivi est créée : cookie `HttpOnly` + jeton HMAC, cookie CSRF lisible,
   `SameSite=Lax`, `Secure` en production, durée 30 jours.
5. `GET /devis/[reference]` : suivi par cookie uniquement ; aucun jeton dans l’URL.
6. `GET/POST /devis/suivi` : récupération par code OTP à 6 chiffres, à usage unique,
   valable 10 minutes, 5 tentatives, envoyé par email (Resend) ou SMS (adaptateur
   facultatif). La réponse est toujours générique.
7. Sur une proposition : le client accepte ou refuse avec le cookie CSRF. La décision
   est contrôlée par `decider_devis_public` et journalisée.

## Routes

### Publiques

| Méthode | Route | Contrôles |
|---|---|---|
| POST | `/api/devis` | Origin, JSON ≤ 64 Ko, `Idempotency-Key`, rate-limit IP + email/téléphone, validation |
| POST | `/api/devis/session` | Origin, rate-limit IP + référence, jeton de suivi hashé, cookie de session |
| POST | `/api/devis/session/logout` | Origin, révocation en base, suppression des cookies |
| POST | `/api/devis/suivi/otp` | Origin, rate-limit IP + référence, réponse 202 générique |
| POST | `/api/devis/suivi/otp/verifier` | Origin, rate-limit, code 6 chiffres, création de session |
| GET | `/api/devis/[reference]` | Cookie de session valide, réponse 404 anti-énumération |
| POST | `/api/devis/[reference]/fichiers` | Cookie + CSRF, propriété du devis, vérification binaire |
| GET | `/api/devis/[reference]/fichiers/[id]/url` | Cookie, propriété, fichier `PROPRE` uniquement, URL 300 s |
| POST | `/api/devis/[reference]/decision` | Cookie + CSRF, transition `PROPOSE → ACCEPTÉ/REFUSÉ` |

### Staff (JWT Supabase, `app_metadata.role`)

| Méthode | Route | Rôles |
|---|---|---|
| GET | `/api/admin/devis` | admin, commercial, finance |
| GET | `/api/admin/devis/[id]` | admin, commercial, finance |
| PATCH | `/api/admin/devis/[id]` | admin, commercial |
| POST | `/api/admin/devis/[id]/proposition` | admin, commercial |
| POST | `/api/admin/devis/[id]/decision` | admin, commercial |
| POST | `/api/admin/devis/[id]/sessions/revoquer` | admin |
| GET | `/api/admin/devis/[id]/fichiers/[id]/url` | admin, commercial ; fichier `PROPRE` |
| POST | `/api/admin/devis/[id]/fichiers/[id]/derogation` | admin ; `NON_ANALYSE`, motif ≥ 20 car., 3/jour, audit |

### Tâches

- `GET /api/cron/notifications` : `Authorization: Bearer CRON_SECRET`, traite l’outbox
  avec reprise et clé d’idempotence.
- `vercel.json` : cron quotidien (plan Hobby) ; la route peut aussi être appelée manuellement.

## Sessions

Table `devis_sessions` : `sid_hash` SHA-256, `expire_le`, `revoque_le`, `revoque_motif`.
`creer_session_devis` prend un verrou consultatif `pg_advisory_xact_lock` par devis,
compte les sessions actives, révoque les plus anciennes au-delà de 4, puis insère la
nouvelle. La limite de **5 sessions actives** est donc garantie même sous concurrence.
Le test `tests/supabaseDevis.integration.test.ts` lance 12 créations simultanées et
vérifie qu’il en reste exactement 5.

## Fichiers

- Bucket privé `devis`, 25 MiB par fichier, 5 fichiers et 50 Mo cumulés par devis.
- Types : PDF, PNG, JPEG, WEBP, ZIP. Signature binaire et extension confrontées.
- Les ZIP ne sont ni extraits ni exécutés.
- Aucun antivirus n’est configuré : tous les fichiers restent `NON_ANALYSE` et ne sont
  pas téléchargeables. `INFECTE`, `EN_ATTENTE` et `ERREUR` sont toujours bloqués.
- La dérogation admin est limitée à `NON_ANALYSE`, jamais un ZIP, URL 60 s, motif
  journalisé dans `journal_audit`, quota de 3 par acteur et par jour.

## Variables ajoutées

`DEVIS_SESSION_SECRET`, `DEVIS_OTP_SECRET`, `DEVIS_OTP_TTL_SECONDS`,
`DEVIS_OTP_MAX_ATTEMPTS`, `DEVIS_NOTIFY_EMAIL`, `DEVIS_EMAIL_FROM`,
`RESEND_API_KEY`, `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER`, `NEXT_PUBLIC_SITE_URL`.
Voir `.env.example`.

## Limites connues

- Migration 0007 non appliquée à distance.
- Aucun antivirus : les fichiers restent non analysés et non téléchargeables.
- L’adaptateur SMS est générique ; aucun fournisseur congolais n’est branché.
- La conversion d’un devis accepté en commande est hors lot 2.2 (lot 3.2).
- Aucun paiement n’est déclenché par ces routes.
