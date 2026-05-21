#!/usr/bin/env bash
# Entry point used by the launchd job `com.assetflow.web`.  Keep this
# small — launchd manages restart-on-crash + restart-on-login.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Homebrew tooling (node, pnpm) lives outside the default launchd PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export PORT="${PORT:-3500}"
exec pnpm start
