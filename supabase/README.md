# Supabase — mise en service d'Elembo

Ce dossier contient les migrations versionnées et la configuration locale. **Aucune migration
n'a encore été appliquée à un projet distant.** La production actuelle n'est pas touchée.

## 1. Créer le projet

1. Créer un projet Supabase (région la plus proche : `eu-west-3` / Paris, ou `af-south-1` selon
   la latence et l'offre disponible).
2. Récupérer dans *Project Settings → API* :
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY` (secret serveur uniquement)

## 2. Variables d'environnement

Créer `.env.local` (non versionné) :

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<projet>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service_role>
SUPABASE_STORAGE_BUCKET_DEVIS=devis
SUPABASE_STORAGE_BUCKET_PRODUCTION=production
```

Ne jamais préfixer la clé service_role par `NEXT_PUBLIC_`, ni l'écrire dans un composant client,
un log ou une réponse HTTP.

## 3. Appliquer les migrations

Avec la CLI Supabase :

```bash
npm install -g supabase
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

Sans CLI : exécuter les fichiers de `supabase/migrations/` dans l'ordre, dans l'éditeur SQL.

Vérification minimale :

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
-- rowsecurity doit être true pour toutes les tables métier
```

## 4. Tester la RLS

Contre un projet de **test** uniquement :

```bash
SUPABASE_TEST_URL=https://<projet-test>.supabase.co \
SUPABASE_TEST_ANON_KEY=<anon-test> \
npm test -- supabaseRls
```

Sans ces variables, la suite est ignorée : elle ne prétend pas avoir vérifié la RLS.

## 5. Comptes staff

Créer les comptes dans *Authentication → Users*, puis renseigner le rôle dans
`raw_app_meta_data` :

```json
{ "role": "admin" }
```

Rôles : `admin`, `commercial`, `atelier`, `finance`. Ne jamais utiliser `user_metadata` pour le
rôle : l'utilisateur peut le modifier.

## 6. Points de contrôle avant production

- [ ] migrations appliquées sur un projet de test puis sur le projet de production ;
- [ ] RLS activée sur toutes les tables ;
- [ ] `anon` ne lit aucune table commerciale ;
- [ ] `authenticated` ne peut pas écrire directement ;
- [ ] buckets `devis` et `production` privés ;
- [ ] clé service_role absente du bundle client (`grep` dans `.next/static`) ;
- [ ] prix commerciaux `VALIDE` pour ouvrir le paiement en ligne ;
- [ ] sauvegarde/export Supabase planifié.
