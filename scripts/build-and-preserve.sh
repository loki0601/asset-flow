#!/usr/bin/env bash
# Build wrapper that preserves the previous build's webpack chunks so the
# WebView can still resolve them when serving cached HTML.
#
# Problem: Next.js' build cleans .next/static/chunks each time, so HTML that
# referenced chunk-XYZ.js before the rebuild 404s after. Capacitor WebView
# sometimes serves the old HTML from its memory cache on app resume and
# crashes with "client-side exception".
#
# Fix: copy the previous chunks into .next-preserve/chunks, run the build,
# then restore preserved chunks on top of the new ones (without overwriting
# fresh files). Chunks older than KEEP_DAYS are pruned.
set -euo pipefail

PRESERVE_DIR=".next-preserve/chunks"
KEEP_DAYS=${KEEP_DAYS:-3}

# 1) Save current chunks before rebuild (if any exist).
if [ -d ".next/static/chunks" ]; then
  mkdir -p "$PRESERVE_DIR"
  cp -R .next/static/chunks/. "$PRESERVE_DIR/" 2>/dev/null || true
fi

# 2) Run the actual build.
pnpm exec next build

# 3) Restore preserved chunks on top of the new build — new chunks already
#    exist (won't be overwritten), only the old ones get added back so old
#    HTML pages can still resolve their imports.
if [ -d "$PRESERVE_DIR" ]; then
  mkdir -p .next/static/chunks
  # macOS cp lacks --update-only, so use rsync if available, else cp -n
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --ignore-existing "$PRESERVE_DIR/" .next/static/chunks/
  else
    cp -Rn "$PRESERVE_DIR/." .next/static/chunks/ 2>/dev/null || true
  fi
fi

# 4) Re-stage with the freshly built chunks so the preserve dir always holds
#    the *latest known* set (so two builds from now we still have N-1).
mkdir -p "$PRESERVE_DIR"
cp -R .next/static/chunks/. "$PRESERVE_DIR/" 2>/dev/null || true

# 5) Prune anything older than KEEP_DAYS.
find "$PRESERVE_DIR" -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
# Tidy up empty dirs left behind.
find "$PRESERVE_DIR" -type d -empty -delete 2>/dev/null || true

echo "[build-and-preserve] done — preserved chunks in $PRESERVE_DIR"
