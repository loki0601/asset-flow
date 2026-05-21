#!/usr/bin/env bash
# Build the production (debug-signed) Android APK with current android/
# config — no patching.  Use this when icons or AndroidManifest change and
# the deployed Capacitor shell needs to be reinstalled.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if [ -d "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" ]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

echo "==> Building prod APK (debug-signed) ..."
(
  cd "$PROJECT_ROOT/android"
  ./gradlew assembleDebug
)

APK="$PROJECT_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
  echo "ERROR: expected APK not found at $APK" >&2
  exit 1
fi
echo
echo "==> Prod APK built: $APK"
echo "==> Install: adb install -r $APK"
