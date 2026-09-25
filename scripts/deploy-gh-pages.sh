#!/bin/bash
# Déploiement GitHub Pages — Elembo (MVP Print-on-Demand, 100 % client-side)
# Usage : bash scripts/deploy-gh-pages.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== 1. Build export statique (basePath /elembo) ==="
DEPLOY_TARGET=gh-pages npm run build

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
