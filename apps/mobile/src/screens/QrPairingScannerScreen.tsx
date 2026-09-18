import React, {Suspense, useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import CameraKit, {Camera, CameraType} from 'react-native-camera-kit';
import {SafeAreaView} from 'react-native-safe-area-context';
import {spacing, border} from '../designSystem';

type QrPairingScannerScreenProps = {
  onCancel: () => void;
  onScanned: (payloadText: string) => void;
};

type PermissionState = 'checking' | 'granted' | 'denied';

async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.CAMERA,
    );
    if (granted) {
      return true;
    }

    const response = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Quyền camera',
        message: 'App cần camera để quét QR pairing.',
        buttonPositive: 'Cho phép',
        buttonNegative: 'Không',
      },
    );
    return response === PermissionsAndroid.RESULTS.GRANTED;
  }

  const cameraKitApi = CameraKit as {
    checkDeviceCameraAuthorizationStatus?: () => Promise<boolean>;
    requestDeviceCameraAuthorization?: () => Promise<boolean>;
  };

  if (typeof cameraKitApi.checkDeviceCameraAuthorizationStatus === 'function') {
    const granted = await cameraKitApi.checkDeviceCameraAuthorizationStatus();
    if (granted) {
      return true;
    }
  }

  if (typeof cameraKitApi.requestDeviceCameraAuthorization === 'function') {
    return cameraKitApi.requestDeviceCameraAuthorization();
  }

  return true;
}

export function QrPairingScannerScreen({
  onCancel,
  onScanned,
}: QrPairingScannerScreenProps) {
  const [permissionState, setPermissionState] =
    useState<PermissionState>('checking');
  const [scannerError, setScannerError] = useState('');
  const [scanLocked, setScanLocked] = useState(false);

  const requestPermission = useCallback(async () => {
    setPermissionState('checking');
    setScannerError('');

    try {
      const granted = await ensureCameraPermission();
      setPermissionState(granted ? 'granted' : 'denied');
      if (!granted) {
        setScannerError('Bạn cần cấp quyền camera để quét QR pairing.');
      }
    } catch (error) {
      setPermissionState('denied');
      setScannerError(
        error instanceof Error
          ? error.message
          : 'Không thể kiểm tra quyền camera.',
      );
    }
  }, []);

  useEffect(() => {
    requestPermission().catch(() => {
      setPermissionState('denied');
      setScannerError('Không thể kiểm tra quyền camera.');
    });
  }, [requestPermission]);

  const handleReadCode = useCallback(
    (event: {nativeEvent: {codeStringValue: string}}) => {
      if (scanLocked) {
        return;
      }

      const qrText = String(event.nativeEvent.codeStringValue || '').trim();
      if (!qrText) {
        return;
      }

      setScanLocked(true);
      onScanned(qrText);
    },
    [onScanned, scanLocked],
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <View style={styles.header}>
        <Text style={styles.title}>Quét QR pairing</Text>
        <Pressable onPress={onCancel} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>Đóng</Text>
        </Pressable>
      </View>

      {permissionState === 'checking' ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#22d3ee" />
          <Text style={styles.centerText}>Đang khởi động camera...</Text>
        </View>
      ) : null}

      {permissionState === 'denied' ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>
            {scannerError || 'Không có quyền camera để quét QR pairing.'}
          </Text>
          <Pressable onPress={requestPermission} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </Pressable>
          <Pressable onPress={onCancel} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Quay lại cấu hình</Text>
          </Pressable>
        </View>
      ) : null}

      {permissionState === 'granted' ? (
        <View style={styles.cameraContainer}>
          <Suspense
            fallback={
              <View style={styles.cameraLoadingFallback}>
                <ActivityIndicator color="#22d3ee" />
                <Text style={styles.cameraLoadingText}>
                  Đang mở camera scanner...
                </Text>
              </View>
            }>
            <Camera
              style={StyleSheet.absoluteFill}
              cameraType={CameraType.Back}
              scanBarcode
              showFrame
              frameColor="#22d3ee"
              laserColor="#06b6d4"
              allowedBarcodeTypes={['qr']}
              scanThrottleDelay={1200}
              onError={event => {
                setScannerError(
                  event.nativeEvent.errorMessage || 'Không thể khởi tạo camera.',
                );
                setPermissionState('denied');
              }}
              onReadCode={handleReadCode}
            />
          </Suspense>

          <View style={styles.overlayTop}>
            <Text style={styles.overlayText}>
              Đưa QR vào khung. App sẽ tự động điền payload pairing.
            </Text>
            {scannerError ? (
              <Text style={styles.overlayErrorText}>{scannerError}</Text>
            ) : null}
          </View>

          <View style={styles.overlayBottom}>
            <Pressable onPress={onCancel} style={styles.overlayButton}>
              <Text style={styles.overlayButtonText}>Huỷ quét QR</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.25)',
    backgroundColor: '#0f172a',
  },
  title: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  closeButton: {
    minHeight: 34,
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  closeButtonText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  centerText: {
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
  },
  errorText: {
    color: '#fecaca',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    borderRadius: border.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
    paddingHorizontal: spacing.lg,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelButton: {
    minHeight: 42,
    borderRadius: border.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#475569',
    paddingHorizontal: spacing.lg,
  },
  cancelButtonText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraLoadingFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    backgroundColor: '#020617',
  },
  cameraLoadingText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  overlayTop: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderRadius: border.radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: 4,
  },
  overlayText: {
    color: '#e2e8f0',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  overlayErrorText: {
    color: '#fca5a5',
    fontSize: 11,
    textAlign: 'center',
  },
  overlayBottom: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 18,
    alignItems: 'center',
  },
  overlayButton: {
    minHeight: 46,
    borderRadius: border.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: '#334155',
  },
  overlayButtonText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
  },
});
