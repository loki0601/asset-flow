#!/usr/bin/env bash
# Build a side-by-side test variant of the Android app.
#
# Differences vs the prod APK:
#   - applicationId : com.elkavio.assetflow.test
#   - display name  : AssetFlow Test
#   - FCM disabled  : google-services plugin not applied (no push)
#   - server URL    : SAME as prod (https://assetflow.elkavio.com) — data
#                     isolation is via per-account login on the same backend
#
# Approach: temporarily patch android/app config in-place, run gradle, then
# restore the originals. A clone of the android/ directory would be cleaner
# but is wasteful (Gradle caches, build outputs).
#
# Output APK: android/app/build/outputs/apk/debug/app-debug.apk
# Install:   adb install -r <apk_path>
#
# Both apps coexist because applicationId differs.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Capacitor 8 / Capacitor Kotlin plugins compile against Java 21 source.
# Use Homebrew's openjdk@21 explicitly so the user's shell default (17 or
# whatever else) doesn't trip the build with "invalid source release: 21".
if [ -d "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" ]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

# Absolute paths so the trap can find originals even after `cd android`
# (gradle is invoked from android/, but restore needs to run from anywhere).
BUILD_GRADLE="$PROJECT_ROOT/android/app/build.gradle"
STRINGS_XML="$PROJECT_ROOT/android/app/src/main/res/values/strings.xml"
RES_DIR="$PROJECT_ROOT/android/app/src/main/res"
PLUGINS_JSON="$PROJECT_ROOT/android/app/src/main/assets/capacitor.plugins.json"
# Backups go in /tmp, not next to the originals — Gradle's resource merger
# scans res/values/* and rejects any non-.xml filename, so leaving a
# strings.xml.bak in that directory aborts the build.
BAK_DIR="$(mktemp -d -t assetflow-android-testbuild.XXXXXX)"
BUILD_GRADLE_BAK="${BAK_DIR}/build.gradle"
STRINGS_XML_BAK="${BAK_DIR}/strings.xml"
PLUGINS_JSON_BAK="${BAK_DIR}/capacitor.plugins.json"
ICONS_BAK_DIR="${BAK_DIR}/icons"
mkdir -p "$ICONS_BAK_DIR"

# Launcher icons that need a "T" badge in the test build (absolute paths).
ICON_PATHS=()
while IFS= read -r f; do ICON_PATHS+=("$f"); done < <(
  find "$RES_DIR" \
    -type f \( -name 'ic_launcher.png' -o -name 'ic_launcher_round.png' \
             -o -name 'ic_launcher_foreground.png' \)
)

restore() {
  if [ -f "$BUILD_GRADLE_BAK" ]; then
    cp "$BUILD_GRADLE_BAK" "$BUILD_GRADLE"
  fi
  if [ -f "$STRINGS_XML_BAK" ]; then
    cp "$STRINGS_XML_BAK" "$STRINGS_XML"
  fi
  if [ -f "$PLUGINS_JSON_BAK" ]; then
    cp "$PLUGINS_JSON_BAK" "$PLUGINS_JSON"
  fi
  # Restore every icon we badged, mirroring the relative path.
  for src in "${ICON_PATHS[@]}"; do
    rel="${src#${RES_DIR}/}"
    bak="${ICONS_BAK_DIR}/${rel//\//__}"
    if [ -f "$bak" ]; then
      cp "$bak" "$src"
    fi
  done
  rm -f "${BUILD_GRADLE}.tmp" "${STRINGS_XML}.tmp"
  rm -rf "$BAK_DIR" 2>/dev/null || true
}
trap restore EXIT INT TERM

# 1) Snapshot originals
cp "$BUILD_GRADLE" "$BUILD_GRADLE_BAK"
cp "$STRINGS_XML" "$STRINGS_XML_BAK"
cp "$PLUGINS_JSON" "$PLUGINS_JSON_BAK"
for src in "${ICON_PATHS[@]}"; do
  rel="${src#${RES_DIR}/}"
  cp "$src" "${ICONS_BAK_DIR}/${rel//\//__}"
done

# 2) Patch applicationId → .test suffix
sed -i.tmp \
  's|applicationId "com.elkavio.assetflow"|applicationId "com.elkavio.assetflow.test"|' \
  "$BUILD_GRADLE"

# 3) Disable google-services plugin (FCM requires matching package in
#    google-services.json, which we deliberately skip for the test build).
sed -i.tmp \
  "s|apply plugin: 'com.google.gms.google-services'|// disabled for test build|" \
  "$BUILD_GRADLE"

# 4) Patch app display name
sed -i.tmp 's|<string name="app_name">AssetFlow</string>|<string name="app_name">AssetFlow Test</string>|' \
  "$STRINGS_XML"
sed -i.tmp 's|<string name="title_activity_main">AssetFlow</string>|<string name="title_activity_main">AssetFlow Test</string>|' \
  "$STRINGS_XML"

# Clean up the .tmp sidecars sed -i created — leaving any in res/values/
# fails Gradle's resource merger ("file name must end with .xml").
rm -f "${BUILD_GRADLE}.tmp" "${STRINGS_XML}.tmp"

# Strip PushNotifications from capacitor.plugins.json — its register()
# invokes FirebaseApp.getInstance() and crashes if google-services isn't
# applied. With the plugin missing entirely, the JS call simply rejects
# instead of taking down the WebView.
"$PROJECT_ROOT/.venv/bin/python" - "$PLUGINS_JSON" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    data = json.load(f)
data = [p for p in data if not p.get("classpath", "").endswith("PushNotificationsPlugin")]
with open(path, "w") as f:
    json.dump(data, f, indent=2)
PY

# 5) Badge every launcher icon with a red "T" via Pillow
if [ ${#ICON_PATHS[@]} -gt 0 ]; then
  echo "==> Badging ${#ICON_PATHS[@]} launcher icon(s) ..."
  "$PROJECT_ROOT/.venv/bin/python" "$PROJECT_ROOT/scripts/_test-icon-tint.py" "${ICON_PATHS[@]}"
fi

echo "==> Patched. Building debug APK ..."
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
echo "==> Test APK built: $APK"
echo "==> Install:"
echo "    adb install -r $APK"
echo "    (works even with the prod app already installed — different package)"
