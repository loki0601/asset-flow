#!/usr/bin/env bash
# Install the launchd jobs that drive the daily server-side cron work.
# Idempotent — unload existing version (if any) before reloading.
#
# Currently registers:
#   - com.assetflow.fetch-prices              (15:35 KST, price snapshot)
#   - com.assetflow.fetch-prices-us           (05:40 KST, post-US-close refresh)
#   - com.assetflow.fetch-reference-events    (06:00 KST, IPO/lockup calendar)
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LAUNCH_DIR="$HOME/Library/LaunchAgents"
mkdir -p "$LAUNCH_DIR"

install_one() {
  local label="$1"
  local src="$PROJECT_DIR/scripts/launchd/${label}.plist"
  local dest="$LAUNCH_DIR/${label}.plist"

  if [ ! -f "$src" ]; then
    echo "skip $label (no source plist)"
    return
  fi

  sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" "$src" > "$dest"

  if launchctl list | grep -q "$label"; then
    launchctl unload "$dest" 2>/dev/null || true
  fi
  launchctl load "$dest"
  echo "installed: $dest"
}

install_one com.assetflow.web
install_one com.assetflow.fetch-prices
install_one com.assetflow.fetch-prices-us
install_one com.assetflow.fetch-reference-events
install_one com.assetflow.push-today-insights

echo
echo "verify : launchctl list | grep com.assetflow"
echo "logs   : $PROJECT_DIR/data/web-server.log"
echo "         $PROJECT_DIR/data/fetch-prices.log"
echo "         $PROJECT_DIR/data/fetch-prices-us.log"
echo "         $PROJECT_DIR/data/fetch-reference-events.log"
echo "         $PROJECT_DIR/data/push-today-insights.log"
