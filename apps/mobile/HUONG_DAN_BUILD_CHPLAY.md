# HƯỚNG DẪN BUILD ỨNG DỤNG LÊN GOOGLE PLAY STORE (CH PLAY)

Tài liệu này hướng dẫn chi tiết quy trình đóng gói Frontend React Native thành file **Android App Bundle (.aab)** hoặc **Release APK (.apk)** để tải lên Google Play Console (CH Play).

---

## 1. Yêu Cầu Môi Trường Máy Build
- **Node.js**: >= 18.x (khuyên dùng Node 20 LTS)
- **JDK (Java Development Kit)**: Java 17 (khuyên dùng Azul Zulu JDK 17 hoặc OpenJDK 17)
- **Android SDK**: API Level 34 (Android 14) / Build-tools 34.0.0+
- **Biến môi trường**: Cần thiết lập `ANDROID_HOME` và `JAVA_HOME`.

---

## 2. Các Bước Cài Đặt Ban Đầu

Mở Terminal tại thư mục gốc của dự án (`chamcong_mobile`):

```bash
# 1. Cài đặt các thư viện phụ thuộc (Dependencies)
npm install

# Lưu ý: npm install sẽ tự động chạy các script postinstall:
# - fix-react-native-sqlite-storage.js
# - fix-react-native-tts.js
# - fix-react-native-vlc.js
```

---

## 3. Build File Lên CH Play (Google Play Store)

Google Play Store bắt buộc nộp định dạng **Android App Bundle (.aab)** cho các ứng dụng mới.

### Bước 3.1: Đóng gói Bundle JavaScript/TypeScript
```bash
mkdir -p android/app/src/main/assets

npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res
```

### Bước 3.2: Đóng gói Android App Bundle (.aab)
```bash
cd android
./gradlew clean
./gradlew bundleRelease
```

> 🎯 **File xuất ra để tải lên CH Play Console**:
> `android/app/build/outputs/bundle/release/app-release.aab`

---

## 4. (Tùy chọn) Build File Release APK để Test Trực Tiếp Trên Máy Thật

Nếu cần test file APK độc lập trước khi đẩy lên CH Play:

### Cách 1: Chạy script tự động có sẵn
```bash
./build_apk.sh
# File APK hoàn chỉnh sẽ nằm ở: app-release.apk
```

### Cách 2: Chạy thủ công qua Gradle
```bash
cd android
./gradlew clean
./gradlew assembleRelease
# File APK xuất ra tại: android/app/build/outputs/apk/release/app-release.apk
```

---

## 5. Cấu Hình Ký Ứng Dụng (Signing Keystore)

Trong thư mục `android/app/` đã có:
- `debug.keystore`: Khóa ký bản dev/debug
- `faceai.keystore`: Khóa ký bản release mẫu

Nếu đơn vị sử dụng Keystore riêng cho tài khoản Google Play Console, mở file `android/app/build.gradle` và cập nhật block `signingConfigs.release`:

```groovy
signingConfigs {
    release {
        storeFile file('your-upload-keystore.keystore')
        storePassword 'YOUR_STORE_PASSWORD'
        keyAlias 'YOUR_KEY_ALIAS'
        keyPassword 'YOUR_KEY_PASSWORD'
    }
}
```

---

## 6. Lưu Ý Khi Nộp Lên CH Play
1. **Version Code & Version Name**:
   Cập nhật `versionCode` và `versionName` trong file `android/app/build.gradle` mỗi khi tạo phiên bản mới:
   ```groovy
   defaultConfig {
       applicationId "com.chamcongmobile"
       minSdkVersion rootProject.ext.minSdkVersion
       targetSdkVersion rootProject.ext.targetSdkVersion
       versionCode 31       // Tăng mỗi lần nộp bản mới (ví dụ: 31, 32, 33...)
       versionName "3.1.0"  // Tên hiển thị người dùng
   }
   ```
2. **Quyền hạn (Permissions)**:
   Ứng dụng sử dụng quyền `CAMERA`, `ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE` để thực hiện chấm công và dịch vụ nhận diện nền. Các quyền đã được khai báo chuẩn trong `android/app/src/main/AndroidManifest.xml`.
