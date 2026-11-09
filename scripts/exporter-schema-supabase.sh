#!/usr/bin/env bash
# Exporte le schéma du projet Supabase lié AVANT toute migration.
#
# Lecture seule côté distant. Le fichier reste local, dans backups/ (ignoré par Git).
# Usage : scripts/exporter-schema-supabase.sh
#
# Prérequis : .env.local avec SUPABASE_STAGING_PROJECT_REF, projet lié.

set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$racine"

if [[ ! -f .env.local ]]; then
  echo "Refus : .env.local absent." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source ./.env.local
set +a

: "${SUPABASE_STAGING_PROJECT_REF:?SUPABASE_STAGING_PROJECT_REF manquant dans .env.local}"
ref="$SUPABASE_STAGING_PROJECT_REF"
lie="$(cat supabase/.temp/project-ref 2>/dev/null || true)"

if [[ -z "$lie" ]]; then
  echo "Refus : aucun projet lié. Lance d'abord supabase link --project-ref $ref." >&2
  exit 1
fi
if [[ "$lie" != "$ref" ]]; then
  echo "Refus : le projet lié ($lie) n'est pas le staging ($ref)." >&2
  exit 1
fi

mkdir -p backups
horodatage="$(date -u +%Y%m%dT%H%M%SZ)"
fichier="backups/schema-${ref}-${horodatage}.sql"

echo "Export du schéma distant (lecture seule) vers $fichier"
npx --yes supabase@latest db dump --remote \
  --schema public,supabase_migrations \
  --file "$fichier"

if [[ ! -s "$fichier" ]]; then
  echo "Refus : l'export est vide, aucune sauvegarde fiable." >&2
  exit 1
fi

empreinte="$(shasum -a 256 "$fichier" | awk '{print $1}')"
printf '%s  %s\n' "$empreinte" "$(basename "$fichier")" > "${fichier}.sha256"
echo "Export terminé : $fichier"
echo "SHA-256 : $empreinte"
