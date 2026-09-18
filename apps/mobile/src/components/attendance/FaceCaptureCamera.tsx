import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import CameraKit, {Camera, CameraType} from 'react-native-camera-kit';
import {colors} from '../../theme';
import {spacing, border} from '../../designSystem';
import {Icon} from '../Icon';

type FaceCaptureCameraProps = {
  onCapture: (captureUri: string) => void;
  initialUri?: string;
  onConfirm?: () => void;
  confirmLabel?: string;
  validationStatus?: 'idle' | 'detecting' | 'valid' | 'invalid';
  validationMessage?: string;
  compact?: boolean;
};

const GUIDANCE_MESSAGE =
  'Đưa khuôn mặt vào giữa khung hình, nhìn thẳng vào camera rồi bấm chụp.';
const NO_PERMISSION_MESSAGE =
  'Ứng dụng cần quyền truy cập camera để chụp ảnh khuôn mặt.';

export function FaceCaptureCamera({
  onCapture,
  initialUri,
  onConfirm,
  confirmLabel,
  validationStatus,
  validationMessage,
  compact,
}: FaceCaptureCameraProps) {
  const cameraRef = useRef<any>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [capturedUri, setCapturedUri] = useState(initialUri || '');
  const [capturing, setCapturing] = useState(false);
  const [flashVisible, setFlashVisible] = useState(false);
  const [errorText, setErrorText] = useState('');

  function normalizeFileUri(value: string): string {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.startsWith('file://') ? text : `file://${text}`;
  }

  const requestPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Quyền truy cập camera',
            message:
              'Ứng dụng cần quyền camera để chụp ảnh khuôn mặt khi đăng ký nhân viên.',
            buttonPositive: 'Cho phép',
            buttonNegative: 'Từ chối',
          },
        );
        const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
        setPermissionGranted(ok);
        if (ok) {
          setErrorText('');
        }
        return ok;
      } catch {
        setPermissionGranted(false);
        return false;
      }
    }
    try {
      const cameraKitApi = (CameraKit ?? {}) as any;
      const checkStatus = cameraKitApi.checkDeviceCameraAuthorizationStatus;
      const requestAuth = cameraKitApi.requestDeviceCameraAuthorization;

      let authStatus = 0;
      if (typeof checkStatus === 'function') {
        authStatus = await checkStatus();
      }

      if (authStatus === 1) {
        setPermissionGranted(true);
        return true;
      }

      if (typeof requestAuth === 'function') {
        const result = await requestAuth();
        const ok = result === 1 || result === true;
        setPermissionGranted(ok);
        return ok;
      }

      setPermissionGranted(true);
      return true;
    } catch {
      setPermissionGranted(true);
      return true;
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      requestPermission().catch(() => {
        setPermissionGranted(false);
      });
    }, 300); // Thêm delay nhỏ để tránh race condition khi mount
    return () => clearTimeout(timer);
  }, [requestPermission]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;

    setCapturing(true);
    try {
      setFlashVisible(true);
      await new Promise<void>(resolve => setTimeout(() => resolve(), 150));
      const result = await cameraRef.current.capture();
      await new Promise<void>(resolve => setTimeout(() => resolve(), 150));
      setFlashVisible(false);

      const uri = String(result?.uri || '').trim();
      if (uri) {
        const normalizedUri = normalizeFileUri(uri);
        setCapturedUri(normalizedUri);
        onCapture(normalizedUri);
        setErrorText('');
      } else {
        setErrorText('Không lấy được ảnh từ camera.');
      }
    } catch {
      setFlashVisible(false);
      setErrorText('Không thể chụp ảnh. Vui lòng thử lại.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, onCapture]);

  const handleRetake = useCallback(() => {
    setCapturedUri('');
    onCapture('');
  }, [onCapture]);

  if (permissionGranted === false) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholderCircle}>
          <Icon name="camera" size={36} color={colors.textMuted} />
        </View>
        <Text style={styles.errorText}>{NO_PERMISSION_MESSAGE}</Text>
        <Pressable onPress={requestPermission} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Cấp lại quyền</Text>
        </Pressable>
      </View>
    );
  }

  if (capturedUri) {
    const isValid = validationStatus === 'valid';
    const isDetecting = validationStatus === 'detecting';
    const hasError = validationStatus === 'invalid';
    return (
      <View style={[styles.container, compact ? {gap: spacing.sm} : null]}>
        <View style={[styles.previewWrap, onConfirm ? styles.previewWrapCompact : null]}>
          <Image
            source={{uri: capturedUri}}
            style={styles.previewImage}
            resizeMode="cover"
          />
        </View>
        <Text style={[styles.previewLabel, compact ? {fontSize: 12} : null]}>Ảnh đã chụp</Text>
        {validationMessage ? (
          <Text style={[
            styles.validationText,
            isValid && styles.validationValid,
            hasError && styles.validationInvalid,
          ]}>
            {isDetecting ? <Icon name="clock" size={14} color={colors.textSecondary} /> : isValid ? <Icon name="success" size={14} color={colors.success} /> : hasError ? <Icon name="warning" size={14} color={colors.danger} /> : null}{' '}
            {validationMessage}
          </Text>
        ) : null}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleRetake}
            style={[styles.retakeButton, {flex: 1}]}
            hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
            <Text style={styles.retakeButtonText}>Chụp lại</Text>
          </TouchableOpacity>
          {typeof onConfirm === 'function' && !isDetecting && isValid ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onConfirm}
              style={[styles.confirmButton, {flex: 1}]}
              hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
              <Text style={styles.confirmButtonText}>{confirmLabel || 'Lưu'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, compact ? {gap: spacing.sm} : null]}>
      <View style={[styles.cameraWrap, compact ? {maxHeight: 260, aspectRatio: 1} : null]}>
        {permissionGranted === true ? (
          <Camera
            key={`camera-${permissionGranted}`}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            cameraType={CameraType.Front}
            zoomMode="off"
            focusMode="on"
            flashMode="off"
            maxPhotoQualityPrioritization="speed"
            shutterPhotoSound={false}
            {...({shutterAnimationDuration: 0} as any)}
          />
        ) : (
          <View style={styles.cameraLoading}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.cameraLoadingText}>Đang khởi tạo camera...</Text>
          </View>
        )}
        {flashVisible ? <View style={styles.flashOverlay} /> : null}
        <View style={styles.scanOverlay}>
          <View style={[styles.scanCircle, compact ? {width: '60%'} : null]} />
        </View>
      </View>
      <Text style={[styles.hintText, compact ? {fontSize: 12, lineHeight: 16, paddingHorizontal: spacing.sm} : null]}>{GUIDANCE_MESSAGE}</Text>
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      <Pressable
        onPress={handleCapture}
        disabled={capturing || permissionGranted !== true}
        style={({pressed}) => [
          styles.captureButton,
          compact && {minHeight: 40, minWidth: 160},
          pressed && styles.buttonPressed,
          (capturing || permissionGranted !== true) && styles.buttonDisabled,
        ]}>
        {capturing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.captureButtonText, compact ? {fontSize: 13} : null]}>Chụp ảnh</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    alignItems: 'center',
  },
  cameraWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: border.radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cameraLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    backgroundColor: '#020617',
  },
  cameraLoadingText: {
    color: '#fff',
    fontSize: 12,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.85)',
    zIndex: 10,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCircle: {
    width: '70%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  placeholderCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.cardMuted,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 36,
  },
  hintText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: spacing.md,
  },
  previewWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: border.radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewWrapCompact: {
    maxHeight: 280,
    aspectRatio: 1,
  },
  previewImage: {
    flex: 1,
  },
  previewLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    lineHeight: 19,
  },
  captureButton: {
    minHeight: 50,
    minWidth: 200,
    borderRadius: border.radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  retakeButton: {
    minHeight: 44,
    minWidth: 160,
    borderRadius: border.radius.md,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  retakeButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  retryButton: {
    minHeight: 44,
    minWidth: 160,
    borderRadius: border.radius.md,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  confirmButton: {
    minHeight: 44,
    borderRadius: border.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  validationText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: spacing.sm,
    color: colors.textSecondary,
  },
  validationValid: {
    color: colors.success,
    fontWeight: '700',
  },
  validationInvalid: {
    color: colors.danger,
    fontWeight: '700',
  },
});
