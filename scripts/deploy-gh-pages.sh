#!/bin/bash
# Déploiement GitHub Pages — Elembo (MVP Print-on-Demand, 100 % client-side)
# Usage : bash scripts/deploy-gh-pages.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== 1. Build export statique (basePath /elembo) ==="
DEPLOY_TARGET=gh-pages npm run build

echo "=== 1bis. Adresse du service de paiement dans l'export ==="
# `public/api-config.js` est copié tel quel dans l'export : il contient l'adresse du tunnel au
# moment du build. Or le tunnel change à chaque redémarrage — on réinjecte donc l'adresse
# COURANTE dans l'export juste avant de publier, sinon le site pointerait vers un tunnel mort.
URL="$(cat /tmp/tunnel-url.txt 2>/dev/null || true)"
if [ -n "$URL" ]; then
  python3 - "$PWD/out/api-config.js" "$URL" <<'PY'
import re, sys
chemin, url = sys.argv[1], sys.argv[2]
src = open(chemin, encoding='utf-8').read()
nouveau, n = re.subn(r'(window\.__ELEMBO_MOMO_API_URL__\s*=\s*")[^"]*(")', r'\g<1>' + url + r'\g<2>', src)
open(chemin, 'w', encoding='utf-8').write(nouveau)
print(f"api-config.js de l'export → {url}" if n else "ATTENTION : ligne __ELEMBO_MOMO_API_URL__ introuvable")
PY
else
  echo "pas d'adresse de tunnel connue (/tmp/tunnel-url.txt absent) : adresse du build conservée"
fi

echo "=== 2. Copy out/ → ../elembo-pages (branche gh-pages) ==="
mkdir -p ../elembo-pages
rsync -a --delete out/ ../elembo-pages/
touch ../elembo-pages/.nojekyll

echo "=== 3. Push branche gh-pages ==="
cd ../elembo-pages
if [ ! -d .git ]; then
  git init -b gh-pages
  git remote add origin https://github.com/bossygit/elembo.git
else
  git add -A
fi
git add -A
git commit -m "deploy: gh-pages export $(date +%Y-%m-%d_%H:%M)" --allow-empty
git push -f origin gh-pages

echo "=== 4. Pages configurée ? ==="
gh api repos/bossygit/elembo/pages --jq '.html_url + " | source: " + .source.branch + "/" + .source.path' 2>/dev/null \
  || echo "Pages non encore activée — activation :"
