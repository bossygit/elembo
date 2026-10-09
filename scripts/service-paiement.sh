#!/bin/bash
# Superviseur du service de paiement Elembo — exécuté par launchd (voir
# scripts/installer-service-paiement.sh), ou à la main pour réparer tout de suite.
#
#   bash ~/.elembo/service-paiement.sh
#
# Ce qu'il fait, dans l'ordre, et RIEN de plus s'il n'y a rien à faire :
#   1. service de paiement : le relance s'il n'écoute plus sur le port 8787 ;
#   2. tunnel public : le recrée s'il ne répond plus, et retient la nouvelle adresse ;
#   3. boutique publiée : réécrit api-config.js sur la branche gh-pages SI l'adresse a changé,
#      puis pousse. C'est le point clé : un tunnel relancé change d'adresse, et sans cette
#      republication le site enverrait les paiements dans le vide.
#
# POURQUOI TOUT VIT DANS ~/.elembo : macOS (TCC) interdit à un agent launchd de lire dans
# ~/Documents (« Operation not permitted », mesuré). Le service tourne donc sur une COPIE du
# projet hors de Documents, et la publication se fait depuis un clone git hors de Documents.
# C'est scripts/installer-service-paiement.sh qui entretient ces deux copies.
#
# Le script est idempotent : un état sain ne produit aucun changement, aucun commit.
# État et journaux : ~/.elembo/ (et non /tmp, que macOS nettoie).

set -uo pipefail

BASE="${ELEMBO_BASE:-$HOME/.elembo}"
SERVICE="${ELEMBO_SERVICE:-$BASE/elembo-service}"
PAGES="${ELEMBO_PAGES:-$BASE/elembo-pages}"
PORT="${ELEMBO_PORT:-8787}"
CF="${ELEMBO_CLOUDFLARED:-$HOME/bin/cloudflared}"
NODE="${ELEMBO_NODE:-/usr/local/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node || echo "$NODE")"

LOG="$BASE/service-paiement.log"
URL_FILE="$BASE/tunnel-url.txt"
LOG_TUNNEL="$BASE/tunnel.log"

mkdir -p "$BASE"

# Rotation simple du journal (on garde les 1500 dernières lignes au-delà de 1 Mo).
if [ -f "$LOG" ] && [ "$(wc -c <"$LOG" | tr -d ' ')" -gt 1000000 ]; then
  tail -1500 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

# Chaque ligne part sur la sortie standard (récupérée par launchd) ET dans le journal
# ~/.elembo/service-paiement.log, pour pouvoir relire une panne sans chercher le bon fichier.
log() {
  local ligne
  ligne="$(date '+%Y-%m-%d %H:%M:%S')  $*"
  printf '%s\n' "$ligne"
  printf '%s\n' "$ligne" >>"$LOG"
}

# Un seul exemplaire à la fois (un lancement manuel peut croiser celui de launchd).
# Le verrou porte le PID : s'il a été abandonné (arrêt brutal, redémarrage de la machine), on le
# reprend au lieu de bloquer TOUS les passages suivants — un verrou orphelin condamnait le
# service à rester éteint (constaté).
VERROU="$BASE/.verrou"
if ! mkdir "$VERROU" 2>/dev/null; then
  pid="$(cat "$VERROU/pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    log "déjà en cours d'exécution (pid $pid) — rien à faire"
    exit 0
  fi
  log "verrou abandonné${pid:+ (pid $pid disparu)} — reprise"
  rm -rf "$VERROU"
  mkdir "$VERROU" 2>/dev/null || { log "verrou impossible à reprendre — rien à faire"; exit 0; }
fi
printf '%s' "$$" >"$VERROU/pid"
trap 'rm -rf "$VERROU" 2>/dev/null' EXIT

log "--- passage du superviseur ---"

sante() { curl -s --max-time 5 "http://127.0.0.1:$PORT/sante" >/dev/null 2>&1; }
sante_publique() { [ -n "${1:-}" ] && curl -s --max-time 12 "$1/sante" >/dev/null 2>&1; }

# ---------------------------------------------------------------- 1. service -----
if [ ! -f "$SERVICE/src/server.ts" ]; then
  log "service : $SERVICE absent — lancez scripts/installer-service-paiement.sh"
  exit 0
fi

if sante; then
  log "service : en écoute sur $PORT"
else
  log "service : absent → démarrage"
  pkill -f "node src/server.ts" 2>/dev/null
  sleep 1
  ( cd "$SERVICE" && MOMO_ENV_FILE=.env.production nohup "$NODE" src/server.ts >>"$BASE/momo.log" 2>&1 & )
  for _ in $(seq 1 20); do
    sleep 1
    sante && break
  done
  if sante; then
    log "service : démarré — $(curl -s --max-time 3 "http://127.0.0.1:$PORT/sante")"
  else
    log "service : ÉCHEC du démarrage (voir $BASE/momo.log)"
    exit 0
  fi
fi

# ---------------------------------------------------------------- 2. tunnel ------
# Un tunnel ne compte comme vivant que si son PROCESSUS tourne ET si l'adresse répond :
# juste après l'arrêt du processus, le bord de Cloudflare répond encore quelques secondes
# (constaté : l'adresse conservée semblait saine alors que plus rien ne l'alimentait).
tunnel_local() { pgrep -f "cloudflared tunnel" >/dev/null 2>&1; }

URL="$(cat "$URL_FILE" 2>/dev/null || true)"
if tunnel_local && sante_publique "$URL"; then
  log "tunnel : processus actif, $URL répond (inchangé)"
else
  if [ -n "$URL" ] && ! tunnel_local; then
    log "tunnel : aucun processus cloudflared — l'adresse $URL est périmée"
  fi
  log "tunnel : ${URL:-aucune adresse connue} → création d'un nouveau tunnel"
  pkill -f "cloudflared tunnel" 2>/dev/null
  sleep 2
  : >"$LOG_TUNNEL"
  nohup "$CF" tunnel --url "http://localhost:$PORT" --no-autoupdate >>"$LOG_TUNNEL" 2>&1 &
  URL=""
  for _ in $(seq 1 40); do
    sleep 1
    URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_TUNNEL" | head -1)"
    [ -n "$URL" ] && break
  done
  if [ -z "$URL" ]; then
    log "tunnel : aucune adresse obtenue (voir $LOG_TUNNEL)"
    exit 0
  fi
  # Le bord de Cloudflare met quelques secondes à router une adresse neuve.
  for _ in $(seq 1 12); do
    sante_publique "$URL" && break
    sleep 5
  done
  if sante_publique "$URL"; then
    log "tunnel : $URL opérationnel"
  else
    log "tunnel : $URL pas encore joignable (on republiera au prochain passage)"
  fi
  printf '%s' "$URL" >"$URL_FILE"
  printf '%s' "$URL" >/tmp/tunnel-url.txt 2>/dev/null || true  # compatibilité : demarrer-paiement.sh
fi

# -------------------------------------------------- 3. adresse publiée du site ---
if [ -z "$URL" ] || [ ! -d "$PAGES/.git" ]; then
  log "publication : rien à publier (adresse ou clone $PAGES absent)"
  exit 0
fi

# On se recale sur la branche publiée : un déploiement (export statique) a pu la réécrire.
if ! ( cd "$PAGES" && git fetch -q origin gh-pages && git reset -q --hard origin/gh-pages ); then
  log "publication : synchronisation du clone impossible (réseau ?) — réessai au prochain passage"
  exit 0
fi

ACTUELLE="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$PAGES/api-config.js" 2>/dev/null | head -1)"
if [ "$ACTUELLE" = "$URL" ]; then
  log "publication : le site pointe déjà sur $URL"
else
  log "publication : $ACTUELLE → $URL"
  python3 - "$PAGES/api-config.js" "$URL" <<'PY'
import re, sys
chemin, url = sys.argv[1], sys.argv[2]
src = open(chemin, encoding='utf-8').read()
nouveau, n = re.subn(r'(window\.__ELEMBO_MOMO_API_URL__\s*=\s*")[^"]*(")', r'\g<1>' + url + r'\g<2>', src)
open(chemin, 'w', encoding='utf-8').write(nouveau)
print(f"  api-config.js réécrit ({n} remplacement)" if n else "  ATTENTION : ligne __ELEMBO_MOMO_API_URL__ introuvable")
PY
  if ( cd "$PAGES" && git add api-config.js && git commit -q -m "config: service de paiement → $URL" && git push -q origin gh-pages ); then
    log "publication : poussée sur gh-pages (le CDN suit en une minute)"
  else
    log "publication : ÉCHEC du commit ou du push — réessai au prochain passage"
  fi
fi

# ------------------------------------------------------- 4. veille de la machine -
# Sans cette veille, la machine s'endort et le tunnel tombe. Activée seulement sur secteur :
# sur batterie, mieux vaut un service qui tombe qu'une batterie vidée.
if pmset -g ps 2>/dev/null | head -1 | grep -q "AC Power"; then
  if ! pgrep -f "caffeinate -i" >/dev/null 2>&1; then
    nohup caffeinate -i >/dev/null 2>&1 &
    log "veille : empêchée (secteur détecté)"
  fi
fi

log "--- fin du passage : service OK, tunnel $URL ---"
exit 0
