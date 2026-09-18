#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_NAME="com.covavision.mobile"
SERIAL="${ANDROID_SERIAL:-}"
VARIANT="${ANDROID_INSTALL_VARIANT:-release}"
SKIP_BUILD=0
NO_LAUNCH=0
CLEAN_INSTALL=0

usage() {
  cat <<'EOF'
Usage: ./install_android.sh [options]

Options:
  --serial SERIAL   Install to a specific ADB device.
  --variant NAME    Build/install release (default) or debug.
  --skip-build      Install the existing APK without rebuilding.
  --clean-install   Uninstall the existing app if signatures differ (deletes app data).
  --no-launch       Do not open the app after installation.
  -h, --help        Show this help.

Environment:
  ANDROID_SERIAL    Same as --serial when only one device is connected.
  ANDROID_INSTALL_VARIANT  Same as --variant.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --serial)
      [[ $# -ge 2 ]] || { echo "Missing value for --serial." >&2; exit 2; }
      SERIAL="$2"
      shift 2
      ;;
    --variant)
      [[ $# -ge 2 ]] || { echo "Missing value for --variant." >&2; exit 2; }
      VARIANT="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --clean-install)
      CLEAN_INSTALL=1
      shift
      ;;
    --no-launch)
      NO_LAUNCH=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$VARIANT" in
  release)
    APK_PATH="$PROJECT_DIR/android/app/build/outputs/apk/release/app-release.apk"
    GRADLE_TASK="assembleRelease"
    ;;
  debug)
    APK_PATH="$PROJECT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
    GRADLE_TASK="assembleDebug"
    ;;
  *)
    echo "Unsupported variant '$VARIANT'. Use release or debug." >&2
    exit 2
    ;;
esac

command -v adb >/dev/null 2>&1 || {
  echo "ADB was not found. Install Android platform-tools and add adb to PATH." >&2
  exit 1
}

cd "$PROJECT_DIR"

authorized_devices=()
unauthorized_devices=()
authorized_count=0
unauthorized_count=0
while read -r device status _; do
  [[ -n "${device:-}" ]] || continue
  case "${status:-}" in
    device)
      authorized_devices+=("$device")
      authorized_count=$((authorized_count + 1))
      ;;
    unauthorized)
      unauthorized_devices+=("$device")
      unauthorized_count=$((unauthorized_count + 1))
      ;;
  esac
done < <(adb devices | tail -n +2)

if [[ -n "$SERIAL" ]]; then
  device_is_authorized=0
  if [[ "$authorized_count" -gt 0 ]]; then
    for device in "${authorized_devices[@]}"; do
      [[ "$device" == "$SERIAL" ]] && device_is_authorized=1
    done
  fi
  if [[ "$device_is_authorized" -ne 1 ]]; then
    echo "ADB device '$SERIAL' is not authorized or is not connected." >&2
    adb devices -l >&2
    exit 2
  fi
elif [[ "$authorized_count" -eq 1 ]]; then
  SERIAL="${authorized_devices[0]}"
elif [[ "$authorized_count" -gt 1 ]]; then
  echo "More than one authorized Android device is connected. Use --serial SERIAL." >&2
  adb devices -l >&2
  exit 2
elif [[ "$unauthorized_count" -gt 0 ]]; then
  echo "The device is unauthorized. Unlock it and accept the USB debugging prompt, then run this script again." >&2
  adb devices -l >&2
  exit 2
else
  echo "No authorized Android device is connected." >&2
  adb devices -l >&2
  exit 2
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "Building the latest Android $VARIANT bundle..."
  mkdir -p android/app/src/main/assets
  rm -f android/app/src/main/assets/index.android.bundle
  npx react-native bundle \
    --platform android \
    --dev false \
    --entry-file index.js \
    --bundle-output android/app/src/main/assets/index.android.bundle \
    --assets-dest android/app/src/main/res
  (cd android && ./gradlew "$GRADLE_TASK")
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "APK for variant '$VARIANT' was not found at: $APK_PATH" >&2
  exit 1
fi

echo "Installing on $SERIAL..."
set +e
INSTALL_OUTPUT="$(adb -s "$SERIAL" install -r -d -g "$APK_PATH" 2>&1)"
INSTALL_STATUS=$?
set -e

if [[ "$INSTALL_STATUS" -ne 0 && "$INSTALL_OUTPUT" == *"INSTALL_FAILED_UPDATE_INCOMPATIBLE"* ]]; then
  if [[ "$CLEAN_INSTALL" -ne 1 ]]; then
    echo "$INSTALL_OUTPUT" >&2
    echo "The installed app uses a different signing key. Re-run with --clean-install to replace it (all app data will be deleted)." >&2
    exit 1
  fi

  echo "Signature mismatch detected; removing $PACKAGE_NAME for a clean install..."
  adb -s "$SERIAL" uninstall "$PACKAGE_NAME"
  adb -s "$SERIAL" install -r -d -g "$APK_PATH"
elif [[ "$INSTALL_STATUS" -ne 0 ]]; then
  echo "$INSTALL_OUTPUT" >&2
  exit "$INSTALL_STATUS"
else
  printf '%s\n' "$INSTALL_OUTPUT"
fi

if [[ "$NO_LAUNCH" -eq 0 ]]; then
  adb -s "$SERIAL" shell am force-stop "$PACKAGE_NAME"
  adb -s "$SERIAL" shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1 >/dev/null
fi

echo "Installed successfully: $PACKAGE_NAME"
echo "APK: $APK_PATH"
