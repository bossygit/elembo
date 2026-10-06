#!/bin/bash
# Démarre le service de paiement Elembo en PRODUCTION et l'expose publiquement,
# puis rebranche la boutique dessus — sans reconstruire le site.
#
#   bash scripts/demarrer-paiement.sh
#
# Ce que fait le script :
#   1. démarre momo-service avec .env.production s'il ne tourne pas déjà (port 8787) ;
#   2. ouvre un tunnel public cloudflared vers ce port (l'ordinateur doit rester allumé) ;
#   3. écrit l'adresse obtenue dans api-config.js de la branche gh-pages et la pousse :
#      la boutique en ligne appelle alors ce service, sans rebuild ni redéploiement.
#
# L'adresse du tunnel change à chaque redémarrage : relance simplement ce script.

set -euo pipefail
cd "$(dirname "$0")/.."
RACINE="$(pwd)"
PAGES="../elembo-pages"
PORT=8787
LOG_TUNNEL="/tmp/elembo-tunnel.log"
CF="$HOME/bin/cloudflared"

echo "=== 1. Service de paiement (production) ==="
# On redémarre TOUJOURS : le catalogue (prix, frais de livraison) est lu au démarrage du
# processus. Un service laissé en vie facturerait l'ancien barème — c'est exactement ce qui
# est arrivé le 06/10 (site à 200 FCFA, téléphone débité de 1 100).
if pgrep -f "node src/server.ts" >/dev/null 2>&1; then
  echo "service en cours : redémarrage pour recharger le catalogue"
  pkill -f "node src/server.ts" 2>/dev/null || true
  sleep 1
fi
if curl -s --max-time 3 "http://127.0.0.1:$PORT/sante" >/dev/null; then
  echo "déjà en écoute (autre processus) : $(curl -s --max-time 3 http://127.0.0.1:$PORT/sante)"
else
  [ -f momo-service/.env.production ] || { echo "momo-service/.env.production manquant : impossible de démarrer en production."; exit 1; }
  ( cd momo-service && MOMO_ENV_FILE=.env.production nohup node src/server.ts >/tmp/elembo-momo.log 2>&1 & )
  for _ in $(seq 1 20); do
    sleep 0.5
    curl -s --max-time 3 "http://127.0.0.1:$PORT/sante" >/dev/null && break
  done
  curl -s --max-time 3 "http://127.0.0.1:$PORT/sante" >/dev/null || { echo "le service n'a pas démarré (voir /tmp/elembo-momo.log)"; exit 1; }
  echo "démarré : $(curl -s --max-time 3 http://127.0.0.1:$PORT/sante)"
fi

echo
echo "=== 2. Tunnel public ==="
[ -x "$CF" ] || { echo "cloudflared introuvable ($CF). Installe-le : brew install cloudflared"; exit 1; }
URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_TUNNEL" 2>/dev/null | head -1 || true)"
if [ -n "$URL" ] && curl -s --max-time 8 "$URL/sante" >/dev/null; then
  echo "tunnel déjà en place, réutilisé : $URL"
else
  URL=""
  : >"$LOG_TUNNEL"
  nohup "$CF" tunnel --url "http://localhost:$PORT" --no-autoupdate >"$LOG_TUNNEL" 2>&1 &
  for _ in $(seq 1 40); do
    sleep 1
    URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_TUNNEL" | head -1 || true)"
    [ -n "$URL" ] && break
  done
  [ -n "$URL" ] || { echo "pas d'adresse obtenue (voir $LOG_TUNNEL)"; exit 1; }
  # Le bord de Cloudflare met quelques secondes à router une adresse toute neuve :
  # on réessaie plutôt que de conclure trop vite que le tunnel est mort.
  ok=""
  for _ in $(seq 1 12); do
    if curl -s --max-time 10 "$URL/sante" >/dev/null; then ok=1; break; fi
    sleep 5
  done
  [ -n "$ok" ] || { echo "le tunnel ne répond pas après 60 s (voir $LOG_TUNNEL)"; exit 1; }
  echo "tunnel : $URL"
fi

echo
echo "=== 3. Rebranchement de la boutique (branche gh-pages, sans rebuild) ==="
[ -d "$PAGES/.git" ] || { echo "$PAGES introuvable : lance d'abord scripts/deploy-gh-pages.sh"; exit 1; }
python3 - "$PAGES/api-config.js" "$URL" <<'PY'
import re, sys
chemin, url = sys.argv[1], sys.argv[2]
src = open(chemin, encoding='utf-8').read()
nouveau, n = re.subn(r'(window\.__ELEMBO_MOMO_API_URL__\s*=\s*")[^"]*(")', r'\g<1>' + url + r'\g<2>', src)
open(chemin, 'w', encoding='utf-8').write(nouveau)
print(f"api-config.js mis à jour ({n} remplacement)" if n else "ATTENTION : ligne __ELEMBO_MOMO_API_URL__ introuvable")
PY
if ( cd "$PAGES" && ! git diff --quiet -- api-config.js ); then
  ( cd "$PAGES" && git add api-config.js && git commit -q -m "config: service de paiement → $URL" && git push -q origin gh-pages )
  echo "poussé sur gh-pages (le CDN met ~1 minute à servir la nouvelle adresse)"
else
  echo "l'adresse en ligne est déjà la bonne : rien à pousser"
fi

echo
echo "=== En veille prolongée : la machine ne doit pas s'endormir ==="
pkill -f "caffeinate -i" 2>/dev/null || true
nohup caffeinate -i >/dev/null 2>&1 &
echo "veille empêchée (caffeinate) — pour l'annuler : pkill caffeinate"

echo
echo "Boutique : https://bossygit.github.io/elembo/"
echo "Service  : $URL/sante"
