#!/bin/bash
# Réinjecte les identifiants MTN connus-bons (momo-service/.env.production) dans l'environnement
# de production Vercel, puis vérifie leur présence. Les valeurs restent hors du dépôt.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
. momo-service/.env.production
set +a

reposer() {
  local nom="$1" valeur="$2"
  npx --yes vercel@latest env rm "$nom" production --yes >/dev/null 2>&1 || true
  printf '%s' "$valeur" | npx --yes vercel@latest env add "$nom" production >/dev/null 2>&1
  echo "$nom : réinjectée (${#valeur} caractères)"
}

reposer MOMO_SUBSCRIPTION_KEY "$MOMO_SUBSCRIPTION_KEY"
reposer MOMO_API_USER "$MOMO_API_USER"
reposer MOMO_API_KEY "$MOMO_API_KEY"
reposer MOMO_ENV "$MOMO_ENV"
npx --yes vercel@latest env ls production 2>&1 | grep MOMO_ || true
