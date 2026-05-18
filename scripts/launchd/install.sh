#!/usr/bin/env bash
# Install the launchd job that runs scripts/fetch-prices.py daily at 15:35 KST.
# Idempotent — unload existing version (if any) before reloading.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$PROJECT_DIR/scripts/launchd/com.assetflow.fetch-prices.plist"
DEST="$HOME/Library/LaunchAgents/com.assetflow.fetch-prices.plist"

mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" "$SRC" > "$DEST"

if launchctl list | grep -q "com.assetflow.fetch-prices"; then
  launchctl unload "$DEST" 2>/dev/null || true
fi
launchctl load "$DEST"

echo "installed: $DEST"
echo "next run: 15:35 KST daily"
echo "verify : launchctl list | grep com.assetflow"
echo "log    : tail -f $PROJECT_DIR/data/fetch-prices.log"
