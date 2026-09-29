#!/usr/bin/env bash
# This wrapper intentionally lives under ~/Library/Application Support after
# installation. macOS launchd can execute it from the internal volume, then it
# safely changes into the external-volume checkout.
set -euo pipefail

PROJECT_DIR="${ASSETFLOW_PROJECT_DIR:?ASSETFLOW_PROJECT_DIR is required}"
TASK="${1:?task is required}"

cd "$PROJECT_DIR"

case "$TASK" in
  web)
    export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
    export PORT="${PORT:-3500}"
    exec /opt/homebrew/bin/pnpm start
    ;;
  fetch-prices)
    exec "$PROJECT_DIR/.venv/bin/python" "$PROJECT_DIR/scripts/fetch-prices.py"
    ;;
  fetch-prices-us)
    exec "$PROJECT_DIR/.venv/bin/python" "$PROJECT_DIR/scripts/fetch-prices.py" --us-only
    ;;
  fetch-reference-events)
    exec "$PROJECT_DIR/.venv/bin/python" "$PROJECT_DIR/scripts/fetch-reference-events.py"
    ;;
  push-today-insights)
    exec /bin/bash "$PROJECT_DIR/scripts/push-today-insights.sh"
    ;;
  *)
    echo "unknown Asset Flow launch task: $TASK" >&2
    exit 64
    ;;
esac
