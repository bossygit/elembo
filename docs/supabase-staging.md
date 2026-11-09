# Supabase staging — connexion, validation et retour arrière

Statut : procédure préparée le 9 novembre 2026. **Aucune commande distante n'a été exécutée.**
Aucune migration n'a été appliquée à un projet hébergé. La production et `hub-crm` ne sont pas
concernés.

## 1. Périmètre et règles

- Projet Supabase **staging dédié à Elembo**, distinct de la production et de `hub-crm`.
- Aucune migration distante avant confirmation explicite du propriétaire.
- La clé `service_role` reste dans `.env.local` ; elle n'est jamais collée dans la conversation,
  un ticket, un log ou un composant navigateur.
- Les commandes de la section 5 sont **en lecture seule**. La section 7 n'est exécutée qu'après
  validation.
- Les tests utilisent uniquement des données synthétiques et ne parlent pas à MTN.

## 2. Variables d'environnement

À renseigner dans `.env.local` (fichier ignoré par Git) :

| Variable | Portée | Usage |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | navigateur + serveur | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navigateur + serveur | clé publique, limitée par RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **serveur uniquement** | écritures et stockage ; jamais exposée |
| `SUPABASE_STAGING_PROJECT_REF` | local | identifiant du projet staging, garde-fou des scripts |
| `SUPABASE_STORAGE_BUCKET_DEVIS` | serveur | `devis` |
| `SUPABASE_STORAGE_BUCKET_PRODUCTION` | serveur | `production` |
| `SUPABASE_ACCESS_TOKEN` | local, optionnel | jeton CLI ; alternative à `supabase login` |

Modèle :

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-staging>
SUPABASE_SERVICE_ROLE_KEY=<service-role-staging>
SUPABASE_STAGING_PROJECT_REF=<ref>
SUPABASE_STORAGE_BUCKET_DEVIS=devis
SUPABASE_STORAGE_BUCKET_PRODUCTION=production
```

Interdit : `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, une clé de production, un fichier
`.env.local` commité, ou une clé affichée dans un terminal partagé.

## 3. Préparation locale

```bash
cd /Users/smartvision/Documents/work/elembo
npx --yes supabase@latest --version    # attendu : 3.0.0
test -f .env.local || cp .env.example .env.local
# renseigner les variables ci-dessus dans .env.local, sans les afficher
bash -n scripts/supabase-staging-env.sh
```

Le script `scripts/supabase-staging-env.sh` :

- source `.env.local` sans imprimer les secrets ;
- exige `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` et `SUPABASE_STAGING_PROJECT_REF` ;
- vérifie que l'URL est exactement `https://<project-ref>.supabase.co` ;
- retire les variables `MOMO_*`, `CRON_SECRET` et `ATELIER_TOKEN` avant d'exécuter les tests ;
- expose `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`,
  `SUPABASE_TEST_SERVICE_ROLE_KEY` à la commande enfant.

## 4. Authentification CLI

Deux options, sans jamais écrire le jeton dans la conversation :

```bash
# Option A — interactif
npx --yes supabase@latest login
```

```bash
# Option B — jeton dans .env.local, chargé localement
set -a; source ./.env.local; set +a
npx --yes supabase@latest projects list --output-format json
```

`SUPABASE_ACCESS_TOKEN` est un jeton de compte, pas une clé de projet. Il ne doit pas être
confondu avec `SUPABASE_SERVICE_ROLE_KEY`.

## 5. Vérifications lecture seule avant toute modification

### 5.1 Identité du projet

```bash
cd /Users/smartvision/Documents/work/elembo
set -a; source ./.env.local; set +a
ref="$SUPABASE_STAGING_PROJECT_REF"
npx --yes supabase@latest projects list --output-format json \
  | jq -e --arg ref "$ref" '.[] | select(.id == $ref) | {id,name,region,status}'
```

Contrôles manuels :

- le `id` correspond exactement au project-ref fourni ;
- le `name` est bien le projet staging Elembo (pas la production, pas `hub-crm`) ;
- la région est celle annoncée.

Si le nom contient `hub-crm` ou `prod`, ou si le projet n'apparaît pas : arrêt immédiat, aucune
liaison. Le ref staging doit être fourni explicitement, jamais déduit d'un projet existant.

### 5.2 Liaison

```bash
npx --yes supabase@latest link --project-ref "$ref"
```

La CLI peut demander le mot de passe de la base. Il se saisit dans le terminal, jamais dans le
chat. La liaison écrit `supabase/.temp/project-ref` (ignoré par Git) et ne modifie pas le schéma.

```bash
cat supabase/.temp/project-ref         # doit être exactement $ref
```

### 5.3 État des migrations

```bash
npx --yes supabase@latest migration list --remote
npx --yes supabase@latest db push --remote --dry-run
```

Attendu sur un projet neuf :

- `migration list --remote` ne montre aucune migration distante ;
- `db push --remote --dry-run` liste **exactement** les six migrations
  `20261109130001` → `20261109130006`, sans aucune autre.

Si une migration distante inconnue apparaît, ou si le nombre diffère : arrêt et analyse. Ne pas
utiliser `--include-all` ni `migration repair` sans diagnostic.

> CLI 3.0 : `db push` sans `--remote` cible la base **locale**. Toute commande distante doit
> porter `--remote` explicitement.

## 6. Porte de validation

Je présente avant toute écriture :

1. le résultat de `projects list` pour le ref ;
2. le contenu de `supabase/.temp/project-ref` ;
3. la sortie de `migration list --remote` ;
4. la sortie de `db push --remote --dry-run`.

Puis j'attends une confirmation explicite, par exemple : « applique les migrations sur le
staging ». Sans ce message, aucun `db push --remote` n'est exécuté.

## 7. Application des migrations (après confirmation uniquement)

```bash
npx --yes supabase@latest db push --remote
```

- Pas de `--include-all` : les six migrations locales sont celles attendues.
- Pas de `--include-seed` : le seed de référence est déjà dans la migration 0006 ;
  `supabase/seed.sql` est un no-op documentaire.
- Ne pas utiliser `--db-url` : cela contournerait l'historique des migrations.
- Ne pas utiliser `--yes` sans autorisation explicite ; la CLI doit pouvoir demander confirmation.

Puis :

```bash
npx --yes supabase@latest migration list --remote
```

Les six versions doivent être alignées `local`/`remote`. Si une migration a échoué, voir la
section 10 ; ne pas relancer aveuglément.

## 8. Tests RLS et cycle de vie sur staging

Les tests sont déjà écrits :

- `tests/supabaseRls.integration.test.ts` : 5 tests de lecture `anon` et refus d'écriture ;
- `tests/supabaseLifecycle.integration.test.ts` : 13 tests clients/employés, paiement,
  production, transitions, prix ;
- `tests/supabaseSchema.test.ts` : 14 garde-fous statiques, sans réseau.

Commande recommandée, avec le garde-fou d'environnement :

```bash
scripts/supabase-staging-env.sh npm test -- supabase
scripts/supabase-staging-env.sh node scripts/verifier-nettoyage-supabase.mjs
```

Attendu : **32 tests Supabase verts** (18 intégration + 14 schéma), puis cinq compteurs à zéro
pour les clients, commandes, produits, dépenses et utilisateurs de test.

```bash
scripts/supabase-staging-env.sh npx vitest run \
  tests/supabaseRls.integration.test.ts \
  tests/supabaseLifecycle.integration.test.ts \
  --reporter=verbose
```

Attendu : **32 tests Supabase verts** (18 intégration + 14 schéma).

### Données utilisées

- emails en `@example.test` ;
- identifiants `randomUUID()` ;
- clients, commandes, paiements et dépense de test créés par le service role ;
- nettoyage dans `afterAll` : paiements → production → commandes → clients → dépense → produit
  → utilisateurs Auth.

### Aucun paiement MTN

Les suites Supabase n'importent pas le service MoMo et n'appellent que :

- `https://<ref>.supabase.co/rest/v1/...`
- `https://<ref>.supabase.co/auth/v1/...`

Le script `supabase-staging-env.sh` retire en plus `MOMO_ENV`, `MOMO_SUBSCRIPTION_KEY`,
`MOMO_API_USER`, `MOMO_API_KEY`, `MOMO_CALLBACK_URL`, `MOMO_ALLOW_TEST_PRICES`,
`NEXT_PUBLIC_PAIEMENT_TEST`, `CRON_SECRET` et `ATELIER_TOKEN` avant l'exécution. Aucun appel
`requesttopay`, aucun débit, aucun webhook MTN.

## 9. Vérifications après tests

```bash
scripts/supabase-staging-env.sh npx vitest run tests/supabaseRls.integration.test.ts \
  tests/supabaseLifecycle.integration.test.ts --reporter=verbose
scripts/supabase-staging-env.sh node scripts/verifier-nettoyage-supabase.mjs
```

Contrôles :

- 18 tests d'intégration verts ;
- aucune erreur d'autorisation inattendue ;
- les données `@example.test` ont été supprimées ;
- `migration list --remote` reste aligné ;
- aucun log ne contient de clé.

## 10. Retour arrière et recréation

Les migrations sont **forward-only** : il n'existe pas de migration `down`. Trois options, par
ordre de préférence pour un staging.

### A. Réinitialiser le schéma staging (destructif)

Uniquement après confirmation explicite et après avoir vérifié le project-ref lié :

```bash
cat supabase/.temp/project-ref          # doit être le ref staging
npx --yes supabase@latest db reset --remote
```

Cette commande supprime les données du staging, recrée le schéma et réapplique les six
migrations + le seed. **Ne jamais l'exécuter sur la production ou `hub-crm`.**

### B. Supprimer et recréer le projet staging

La voie la plus propre si le projet est jetable :

1. supprimer le projet staging dans le dashboard Supabase (action irréversible) ;
2. créer un nouveau projet ;
3. mettre à jour `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` et `SUPABASE_STAGING_PROJECT_REF` dans `.env.local` ;
4. relancer `link`, `migration list --remote`, `db push --remote --dry-run`, puis la porte de
   validation.

### C. Réparer l'historique de migrations

En cas de désaccord local/distant, après inspection seulement :

```bash
npx --yes supabase@latest migration list --remote
# exemple, après avoir identifié la version exacte :
npx --yes supabase@latest migration repair --remote --status reverted <version>
```

`migration repair` ne modifie pas le schéma ; il réécrit l'historique. Une mauvaise réparation
peut désynchroniser la base. Ne pas l'utiliser pour masquer une migration échouée.

### En cas d'échec en cours de push

1. ne pas relancer `db push` en boucle ;
2. lire `migration list --remote` ;
3. inspecter l'erreur SQL exacte dans la sortie ;
4. corriger la migration en local et repartir d'un reset staging, ou recréer le projet ;
5. ne jamais appliquer un correctif directement en production pour « rattraper » le staging.

### Sauvegarde

Les données de staging sont synthétiques et jetables. Si une sauvegarde est nécessaire, exporter
hors du dépôt avec `pg_dump` et ne jamais committer le fichier. Les backups Supabase du plan
gratuit ne garantissent pas une restauration point-in-time.

## 11. Commandes exactes qui seront exécutées à réception du project-ref

Phase lecture seule :

```bash
cd /Users/smartvision/Documents/work/elembo
set -a; source ./.env.local; set +a
npx --yes supabase@latest --version
ref="$SUPABASE_STAGING_PROJECT_REF"
npx --yes supabase@latest projects list --output-format json \
  | jq -e --arg ref "$ref" '.[] | select(.id == $ref) | {id,name,region,status}'
npx --yes supabase@latest link --project-ref "$ref"
cat supabase/.temp/project-ref
npx --yes supabase@latest migration list --remote
npx --yes supabase@latest db push --remote --dry-run
```

Puis arrêt et présentation. Après confirmation seulement :

```bash
npx --yes supabase@latest db push --remote
npx --yes supabase@latest migration list --remote
scripts/supabase-staging-env.sh npm test -- supabase
scripts/supabase-staging-env.sh node scripts/verifier-nettoyage-supabase.mjs
```

## 12. Checklist de validation

- [ ] project-ref, nom et région confirmés ;
- [ ] URL staging exactement `https://<ref>.supabase.co` ;
- [ ] aucun ref de production ou `hub-crm` ;
- [ ] `.env.local` renseigné, non commité, clé service_role jamais affichée ;
- [ ] `link` effectué, `.temp/project-ref` identique ;
- [ ] `migration list --remote` vide ou cohérent ;
- [ ] `db push --remote --dry-run` liste exactement six migrations ;
- [ ] confirmation explicite reçue ;
- [ ] `db push --remote` réussi ;
- [ ] `migration list --remote` aligné ;
- [ ] 32 tests Supabase verts ;
- [ ] aucun appel MTN, aucun paiement réel ;
- [ ] données `@example.test` nettoyées ;
- [ ] rapport final avec risques restants.
