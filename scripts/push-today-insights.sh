#!/usr/bin/env bash
# Trigger the daily 08:00 KST "today's insights" push notification.
# Reads FCM_SEND_SECRET from .env.local and curls the local API.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi

SECRET=$(grep -E '^FCM_SEND_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)
if [ -z "$SECRET" ]; then
  echo "FCM_SEND_SECRET not found in $ENV_FILE" >&2
  exit 1
fi

URL="${PUSH_INSIGHTS_URL:-http://127.0.0.1:3500/api/insights/push-today}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] POST $URL"
curl -sS -X POST \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -w '\nHTTP %{http_code}\n' \
  "$URL"
