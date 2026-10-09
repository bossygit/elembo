#!/bin/bash
# Installe (ou réinstalle) le superviseur du service de paiement Elembo dans launchd.
#
#   bash scripts/installer-service-paiement.sh
#
# Ce que l'installation met en place :
#   1. une COPIE du superviseur dans ~/.elembo/service-paiement.sh ;
#   2. une COPIE du service de paiement dans ~/.elembo/elembo-service (macOS interdit à un
#      agent launchd de lire dans ~/Documents : « Operation not permitted », mesuré) ;
#   3. un CLONE de la branche gh-pages dans ~/.elembo/elembo-pages, utilisé pour republier
#      l'adresse du service quand le tunnel en change ;
#   4. un agent utilisateur « cg.smartvision.elembo.paiement » : démarrage à l'ouverture de
#      session, contrôle toutes les 5 minutes.
#
# Relancer ce script après une modification du service ou du superviseur : il recopie les
# sources (mais JAMAIS l'historique des transactions déjà enregistré).
#
# Désinstaller :
#   launchctl bootout gui/$(id -u)/cg.smartvision.elembo.paiement
#   rm ~/Library/LaunchAgents/cg.smartvision.elembo.paiement.plist

set -uo pipefail

LABEL="cg.smartvision.elembo.paiement"
UID_NUM="$(id -u)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_SUPERVISEUR="$RACINE/scripts/service-paiement.sh"
SOURCE_SERVICE="$RACINE/momo-service"
BASE="$HOME/.elembo"
SERVICE="$BASE/elembo-service"
PAGES="$BASE/elembo-pages"

erreurs=0
etape() { echo; echo "=== $* ==="; }

etape "1. superviseur → $BASE/service-paiement.sh"
mkdir -p "$BASE" "$HOME/Library/LaunchAgents"
[ -f "$SOURCE_SUPERVISEUR" ] || { echo "superviseur introuvable : $SOURCE_SUPERVISEUR"; exit 1; }
cp "$SOURCE_SUPERVISEUR" "$BASE/service-paiement.sh"
chmod +x "$BASE/service-paiement.sh"
echo "copié."

etape "2. service de paiement → $SERVICE (copie hors de ~/Documents)"
[ -f "$SOURCE_SERVICE/src/server.ts" ] || { echo "service introuvable : $SOURCE_SERVICE/src/server.ts"; exit 1; }
mkdir -p "$SERVICE"
rsync -a --delete "$SOURCE_SERVICE/src/" "$SERVICE/src/"
cp "$SOURCE_SERVICE/package.json" "$SERVICE/package.json"
# La grille tarifaire est LA source unique des prix : le service la lit à son démarrage et
# refusera de tourner sans elle.
mkdir -p "$SERVICE/tarifs"
cp "$RACINE/tarifs/grille.json" "$SERVICE/tarifs/grille.json"
echo "grille tarifaire recopiée (tarifs/grille.json)."
if [ -f "$SOURCE_SERVICE/.env.production" ]; then
  cp "$SOURCE_SERVICE/.env.production" "$SERVICE/.env.production"
  chmod 600 "$SERVICE/.env.production"
  echo "identifiants recopiés (mode 600)."
else
  echo "ATTENTION : $SOURCE_SERVICE/.env.production absent — le service ne pourra pas démarrer."
  erreurs=1
fi
mkdir -p "$SERVICE/data"
# L'historique des transactions appartient à l'exploitation : on ne l'écrase jamais.
if [ -f "$SOURCE_SERVICE/data/transactions.json" ] && [ ! -f "$SERVICE/data/transactions.json" ]; then
  cp "$SOURCE_SERVICE/data/transactions.json" "$SERVICE/data/transactions.json"
  echo "historique des transactions repris (première installation)."
else
  echo "historique des transactions conservé tel quel."
fi

etape "3. clone de publication → $PAGES"
if [ -d "$PAGES/.git" ]; then
  if ( cd "$PAGES" && git fetch -q origin gh-pages && git reset -q --hard origin/gh-pages ); then
    echo "clone existant mis à jour."
  else
    echo "ATTENTION : mise à jour du clone impossible (réseau ou identifiants git)."
    erreurs=1
  fi
else
  if git clone -q --branch gh-pages --single-branch https://github.com/bossygit/elembo.git "$PAGES"; then
    echo "clone créé."
  else
    echo "ATTENTION : clone impossible (identifiants git GitHub ?)."
    erreurs=1
  fi
fi

etape "4. agent launchd"
[ -x "$HOME/bin/cloudflared" ] || { echo "ATTENTION : $HOME/bin/cloudflared absent — le tunnel ne pourra pas démarrer."; erreurs=1; }
cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$BASE/service-paiement.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>300</integer>
  <!-- Sans ceci, launchd tue le service et le tunnel à la fin de chaque passage : ils
       seraient relancés (avec une nouvelle adresse de tunnel) toutes les 5 minutes. -->
  <key>AbandonProcessGroup</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/kitutu/bin</string>
  </dict>
  <key>StandardOutPath</key><string>$BASE/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$BASE/launchd.err.log</string>
</dict>
</plist>
EOF
echo "écrit : $PLIST"

# Les processus lancés à la main doivent céder la place : le port 8787 ne peut avoir qu'un
# propriétaire, et deux tunnels brouilleraient l'adresse publiée.
pkill -f "node src/server.ts" 2>/dev/null && echo "service lancé à la main : arrêté (l'agent prend la suite)"
pkill -f "cloudflared tunnel" 2>/dev/null && echo "tunnel lancé à la main : arrêté (l'agent en ouvrira un neuf)"

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"
launchctl enable "gui/$UID_NUM/$LABEL" 2>/dev/null || true

etape "5. premier passage (service + tunnel + republication)"
: >"$BASE/service-paiement.log"
launchctl kickstart -k "gui/$UID_NUM/$LABEL" 2>/dev/null || true
# Un nouveau tunnel peut demander jusqu'à une minute avant de répondre.
for _ in $(seq 1 90); do
  sleep 2
  grep -q "fin du passage" "$BASE/service-paiement.log" 2>/dev/null && break
done

etape "6. état"
launchctl list | grep "$LABEL" || echo "agent non listé — vérifier : launchctl print gui/$UID_NUM/$LABEL"
echo
tail -12 "$BASE/service-paiement.log" 2>/dev/null || echo "(pas de journal)"
echo
echo "service local : $(curl -s --max-time 5 http://127.0.0.1:8787/sante || echo 'pas de réponse')"
echo "adresse retenue: $(cat "$BASE/tunnel-url.txt" 2>/dev/null || echo '(aucune)')"
echo "site          : https://bossygit.github.io/elembo/"
echo "journal       : $BASE/service-paiement.log"
[ "$erreurs" = "0" ] || echo; [ "$erreurs" = "0" ] || echo "⚠ des points sont signalés ci-dessus — lire les messages ATTENTION."
exit 0
