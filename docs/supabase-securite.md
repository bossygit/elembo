# Sécurité Supabase — rôles, service_role et accès croisés

Statut : revue du 9 novembre 2026. Les tests ci-dessous ont été exécutés sur une instance
Supabase **locale vierge** (`supabase start`, PostgreSQL 15.19), jamais sur la production.

## 1. Source du rôle : `app_metadata`, jamais `user_metadata`

Le rôle staff est stocké dans `auth.users.raw_app_meta_data.role`, exposé dans le JWT sous
`app_metadata.role`.

- Un utilisateur peut modifier `user_metadata` via `PUT /auth/v1/user`.
- Il ne peut pas modifier `app_metadata` : GoTrue réserve ce champ à l'API admin
  (`service_role`). Le test réel tente une élévation `commercial → admin` via
  `PUT /auth/v1/user` avec `app_metadata: { role: 'admin' }`, puis relit le compte : le rôle
  reste `commercial`.
- Les policies et le garde serveur lisent uniquement `app_metadata` ; `user_metadata.role`
  est ignoré. Un test unitaire le vérifie explicitement.

Conséquence : la création d'un compte staff et l'attribution d'un rôle passent par une route
admin serveur ou le dashboard Supabase, jamais par une inscription publique.

## 2. Opérations qui contournent la RLS via `service_role`

`service_role` contourne la RLS. Il est réservé au serveur Next.js et ne doit jamais être
exposé au navigateur. Les opérations prévues :

| Opération | Pourquoi service_role | Contrôle applicatif obligatoire |
|---|---|---|
| Créer/rattacher un client lors d'un devis ou d'une commande | `anon` n'a aucun droit d'écriture | validation des coordonnées, limitation de débit, déduplication |
| Créer un devis et ses fichiers | le public ne doit pas écrire librement | validation famille/besoin/quantité, propriété du devis |
| Créer une commande et ses lignes | le prix est recalculé serveur | recalcul depuis la grille, jamais le prix navigateur |
| Enregistrer un paiement et son statut | journal financier sensible | vérification MTN, montant exact, idempotence |
| Créer les tâches de production | la base le fait dans le trigger de paiement | aucune route cliente ne peut créer une tâche |
| Écrire les mouvements de stock | opération atelier autorisée | rôle `atelier`/`admin`, quantité et motif |
| Écrire les dépenses et le budget | données financières | rôle `finance`/`admin`, justificatif |
| Lire les commandes, paiements, dépenses pour l'admin | la RLS filtre par rôle | `exigerRole()` avant le client service role |
| Générer les URL signées de stockage | les buckets sont privés | vérifier rôle et propriété de la ressource |
| Écrire l'outbox de notifications | aucun accès direct | clé d'idempotence, statut A_ENVOYER |

Règles :

1. Aucune route ne crée de client service role au niveau module sans `import 'server-only'`.
2. Chaque route protégée appelle `exigerRole(claims, [...])` **avant** la requête service role.
3. Les routes publiques (devis, commande) n'acceptent que des données validées et ne renvoient
   jamais une ligne brute d'une autre table.
4. Aucun composant `'use client'` n'importe `src/server/db` ni `SUPABASE_SERVICE_ROLE_KEY`.
5. Un test statique échoue si une route API mentionne `service_role` sans importer
   `exigerRole`/`roleDepuisClaims`, ou si `NEXT_PUBLIC_*SERVICE_ROLE` apparaît dans `src/`.

À ce stade, **aucune route n'utilise encore `service_role`** : le schéma et le garde
`src/server/auth/roles.ts` sont livrés, l'intégration applicative commence au lot 3.1b.

## 3. Garde serveur

`src/server/auth/roles.ts` :

```ts
exigerRole(claims, ['admin', 'finance']) // retourne le rôle ou lève ErreurAcces (403)
```

- lit `app_metadata.role` ;
- refuse un rôle absent, inconnu ou mal typé ;
- ne consulte jamais `user_metadata` ;
- est couvert par `tests/authRoles.test.ts`.

La RLS reste la seconde barrière : même si une route oubliait un contrôle, la clé `anon` ne
permet aucune écriture et ne lit que les lignes autorisées par les policies.

## 4. Tests d'accès croisés exécutés

Sur base locale vierge, `tests/supabaseLifecycle.integration.test.ts` (13 tests) :

- client A ne lit que ses commandes, pas celles de client B ;
- commercial lit les commandes, mais pas les paiements ni les dépenses ;
- atelier lit les commandes et la production, mais pas les paiements ni les dépenses ;
- finance lit les paiements et les dépenses, mais pas les notifications ;
- admin lit paiements, dépenses et journal d'audit ;
- un utilisateur authentifié ne peut pas écrire directement (`401/403`) ;
- `app_metadata` ne peut pas être élevé par l'utilisateur ;
- paiement d'un montant différent du total refusé ; prix VALIDE sans acteur/date refusé ;
- `PAYEE` sans paiement refusé ;
- un paiement `PAYE` met à jour la commande et crée `INITIALISATION` ;
- second paiement `PAYE` refusé ;
- transition `PAYEE → EN_PRODUCTION` refusée.

`tests/supabaseRls.integration.test.ts` (5 tests) vérifie `anon` et les lectures de base.
Total Supabase : **32 tests verts** lors de la revue (18 intégration + 14 garde-fous de schéma).

### Routes API serveur

`tests/routesSecurite.test.ts` (7 tests) couvre les routes existantes et le modèle des futures
routes `service_role` :

- `GET /api/commandes/[commande]/fichiers` : 401 sans jeton, 401 avec jeton en query string,
  401 avec mauvais jeton, 400 avec référence invalide après authentification ;
- `GET /api/momo/reconcilier` : 401 sans `CRON_SECRET`, 401 avec un mauvais secret ;
- `avecGardeRole` : 401 sans claims ou si la lecture échoue, 403 pour un rôle insuffisant ou
  un rôle placé dans `user_metadata`, 200 pour le rôle attendu.

`tests/authRoles.test.ts` vérifie en plus que toute route contenant `service_role` ou
`SUPABASE_SERVICE_ROLE_KEY` importe un garde, n'est pas un composant client, et que toute future
route `/api/admin/` est protégée.

### Nettoyage

`scripts/verifier-nettoyage-supabase.mjs` vérifie après les tests qu'il ne reste aucun client,
commande, produit, dépense ou utilisateur Auth de test. Exécution locale de la revue :
**0 résidu** sur les cinq contrôles.

## 5. Risques encore ouverts

- **Pas de projet Supabase hébergé** : les tests sont locaux. Le comportement hébergé (réseau,
  latence, quotas, version Postgres) doit être rejoué sur le projet de test.
- **Pas encore d'authentification staff dans Next.js** : le garde existe, mais aucune route
  `/admin` ne l'appelle encore. À livrer au lot 3.3.
- **Pas de limitation de débit** sur les routes publiques de devis/commande : à ajouter avant
  ouverture publique (Redis + IP/email).
- **Journal d'audit non automatique** : les triggers écrivent l'historique des statuts, mais
  les autres actions admin devront écrire `journal_audit` explicitement.
- **Compromission de la clé service_role** : rotation immédiate, vérification des logs Supabase,
  invalidation des sessions. La clé ne doit exister que dans Vercel (Production/Preview) et
  `.env.local`, jamais dans un ticket ou un message.
- **RLS sur `storage.objects`** : gérée par Supabase ; nos migrations ne la réactivent pas (le
  rôle de migration n'est pas propriétaire). Les buckets restent privés, aucune policy directe.
