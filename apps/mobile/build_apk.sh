#!/usr/bin/env bash

# Script build production release APK cho ứng dụng React Native Mobile
# Tự động đóng gói JS/TS Bundle mới nhất từ src/ trước khi thực thi gradlew clean & assembleRelease

set -e

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$PROJECT_DIR"

echo "=================================================="
echo "🚀 BẮT ĐẦU QUÁ TRÌNH BUILD PRODUCTION RELEASE APK "
echo "=================================================="

if [ ! -d "android" ]; then
  echo "❌ Error: Không tìm thấy thư mục 'android'."
  exit 1
fi

chmod +x android/gradlew

echo ""
echo "📦 1/3. Đang đóng gói JS/TS Bundle mới nhất từ mã nguồn src/..."
rm -f android/app/src/main/assets/index.android.bundle
mkdir -p android/app/src/main/assets

npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res

cd android

echo ""
echo "🧹 2/3. Đang dọn dẹp (clean) cache Android build..."
./gradlew clean

echo ""
echo "⚙️ 3/3. Đang đóng gói bản Production Release APK..."
./gradlew assembleRelease

APK_PATH="app/build/outputs/apk/release/app-release.apk"
TARGET_PATH="../app-release.apk"

if [ -f "$APK_PATH" ]; then
  cp "$APK_PATH" "$TARGET_PATH"

  VERSION=$(node -p "try { require('../package.json').version } catch(e) { '' }" 2>/dev/null || echo "")
  if [ -n "$VERSION" ]; then
    VERSION_APK="../app-release-v${VERSION}.apk"
    cp "$APK_PATH" "$VERSION_APK"
    VERSION_MSG=" (Đã tạo thêm bản sao: app-release-v${VERSION}.apk)"
  else
    VERSION_MSG=""
  fi

  if command -v du >/dev/null 2>&1; then
    FILE_SIZE=$(du -h "$TARGET_PATH" | cut -f1)
  else
    FILE_SIZE="N/A"
  fi

  echo ""
  echo "============ SUCCESS ============"
  echo "✅ BUILD APK THÀNH CÔNG VỚI BUNDLE MỚI NHẤT!"
  echo "📦 Kích thước APK: $FILE_SIZE"
  echo "📂 Vị trí file trong android: android/$APK_PATH"
  echo "👉 Vị trí file ở thư mục gốc: app-release.apk$VERSION_MSG"
  echo "================================="
else
  echo ""
  echo "❌ BUILD THẤT BẠI: Không tìm thấy file APK sau khi build."
  exit 1
fi
