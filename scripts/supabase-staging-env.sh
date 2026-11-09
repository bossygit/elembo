#!/usr/bin/env bash
# Exécute une commande avec les variables de test Supabase, sans afficher les secrets.
#
# Usage :
#   scripts/supabase-staging-env.sh npm test -- supabase
#   scripts/supabase-staging-env.sh npx vitest run tests/supabaseLifecycle.integration.test.ts
#
# Prérequis dans .env.local :
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   SUPABASE_STAGING_PROJECT_REF
#
# Garde-fou : l'URL doit être exactement https://<project-ref>.supabase.co.
# Le script ne journalise jamais les clés.

set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$racine"

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <commande> [arguments...]" >&2
  exit 2
fi

if [[ ! -f .env.local ]]; then
  echo "Refus : .env.local absent. Crée-le à partir de .env.example." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source ./.env.local
set +a

: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL manquant dans .env.local}"
: "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?NEXT_PUBLIC_SUPABASE_ANON_KEY manquant dans .env.local}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local}"
: "${SUPABASE_STAGING_PROJECT_REF:?SUPABASE_STAGING_PROJECT_REF manquant dans .env.local}"

ref="$SUPABASE_STAGING_PROJECT_REF"
url="${NEXT_PUBLIC_SUPABASE_URL%/}"
attendu="https://${ref}.supabase.co"

if [[ ! "$ref" =~ ^[a-z0-9]{10,40}$ ]]; then
  echo "Refus : SUPABASE_STAGING_PROJECT_REF n'a pas le format d'un project-ref Supabase." >&2
  exit 1
fi

if [[ "$url" != "$attendu" ]]; then
  echo "Refus : NEXT_PUBLIC_SUPABASE_URL ne correspond pas au project-ref de staging." >&2
  echo "  Attendu : https://<project-ref>.supabase.co" >&2
  echo "  Reçu    : ${url%%/rest/v1}" >&2
  exit 1
fi

case "$url" in
  *".supabase.co") ;;
  *)
    echo "Refus : l'URL Supabase de staging doit être un domaine .supabase.co." >&2
    exit 1
    ;;
esac

echo "Supabase staging : $url (ref $ref)"
export SUPABASE_TEST_URL="$url"
export SUPABASE_TEST_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY"
export SUPABASE_TEST_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"

# Les suites Supabase ne doivent jamais parler à MTN. On retire les variables de paiement
# et de cron héritées de .env.local, même si l'environnement local les contient.
for variable in \
  MOMO_ENV MOMO_SUBSCRIPTION_KEY MOMO_API_USER MOMO_API_KEY MOMO_CALLBACK_URL \
  MOMO_ALLOW_TEST_PRICES NEXT_PUBLIC_PAIEMENT_TEST CRON_SECRET ATELIER_TOKEN \
  SUPABASE_ACCESS_TOKEN; do
  unset "$variable" || true
done

exec "$@"
