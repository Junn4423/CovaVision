import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import CameraKit, {Camera, CameraType} from 'react-native-camera-kit';
import RNFS from 'react-native-fs';
import {
  restoreSystemScreenBrightness,
  setTemporaryScreenBrightness,
} from '../../nativeModules/screenBrightness';
import {
  isLikelyFaceFrame,
} from '../../utils/faceFrameCheck';
import {normalizeFaceDetectionResponse} from '../../utils/faceDetection';
import {speakAttendanceOutcome} from '../../services/attendanceTts';
import {colors} from '../../theme';
import {spacing, border} from '../../designSystem';
import {Icon} from '../Icon';
import {RtspStreamPlayer, RtspStreamPlayerRef} from './RtspStreamPlayer';

type AttendanceMode = 'auto_record';
type AttendanceType = 'auto';
type FeedbackType = 'success' | 'warning' | 'error';
type FacePrecheckStatus =
  | 'idle'
  | 'scanning'
  | 'no_face'
  | 'adjust'
  | 'hold'
  | 'ready'
  | 'error';

type SettingsSnapshot = {
  mode: AttendanceMode;
  cooldownSeconds: number;
};

type FeedbackState = {
  type: FeedbackType;
  message: string;
  similarityPercent?: number;
  checkInTime?: string;
  checkOutTime?: string;
  locationText?: string;
  attendanceTypeLabel?: string;
  previewUri?: string;
  mismatch?: boolean;
  expectedUser?: any;
  detectedUser?: any;
  user?: any;
};

type FacePrecheckState = {
  status: FacePrecheckStatus;
  message: string;
  progress: number;
  detected: boolean;
  matched: boolean;
  mismatch: boolean;
  bbox: number[] | null;
  frameWidth: number;
  frameHeight: number;
  faceSizeRatio: number;
  brightnessScore: number;
  similarityPercent: number;
  detectedCount: number;
  detectedUser?: any;
};

type FaceAttendancePanelProps = {
  cameraTitle?: string;
  feedbackTitle?: string;
  emptyFeedbackText?: string;
  showHeader?: boolean;
  fullScreenMode?: boolean;
  topLeftSlot?: React.ReactNode;
  topRightSlot?: React.ReactNode;
  selectedCameraSource?: string;
  selectedCamera?: any;
  onSelectCameraSource?: (source: string) => void;
  attendanceMode?: AttendanceMode;
  cooldownSeconds: number;
  selectedAttendanceType?: AttendanceType;
  onSelectAttendanceType?: (type: AttendanceType) => void;
  onAttendanceModeChange?: (mode: AttendanceMode) => void;
  loadLatestSettings: () => Promise<SettingsSnapshot | undefined>;
  detectImage: (payload: Record<string, unknown>) => Promise<any>;
  submitImage: (payload: Record<string, unknown>) => Promise<any>;
  onAutoDetectedAttendance?: (payload: {
    user: any;
    detection: any;
    attendanceMode: AttendanceMode;
    attendanceType: AttendanceType | 'auto';
    similarityPercent: number;
    cooldownSeconds: number;
    imageBase64: string;
  }) => Promise<any> | any;
  onSubmitSuccess?: (response?: any) => Promise<void> | void;
};

const PRECHECK_IDLE_INTERVAL_MS = 450;
const PRECHECK_INTERVAL_MS = 300;
const PRECHECK_LOCKED_INTERVAL_MS = 400;
const PRECHECK_LOCK_MIN_PROBE_DELAY_MS = 300;
const PRECHECK_FIRST_SCAN_DELAY_MS = 150;
const PRECHECK_READY_STREAK_REQUIRED = 2;

const INITIAL_PRECHECK: FacePrecheckState = {
  status: 'idle',
  message: 'Vui lòng đưa khuôn mặt vào khung hình camera...',
  progress: 0,
  detected: false,
  matched: false,
  mismatch: false,
  bbox: null,
  frameWidth: 0,
  frameHeight: 0,
  faceSizeRatio: 0,
  brightnessScore: 0,
  similarityPercent: 0,
  detectedCount: 0,
  detectedUser: null,
};

const GUIDANCE_MESSAGES: Record<string, string> = {
  good: 'Khuôn mặt đã đạt chuẩn. Giữ yên thêm một nhịp.',
  no_face: 'Chưa thấy khuôn mặt. Đưa mặt vào giữa vòng tròn.',
  too_dark: 'Ánh sáng đang yếu. Bật hỗ trợ ánh sáng hoặc đứng gần nguồn sáng hơn.',
  too_far: 'Bạn đang hơi xa camera. Tiến lại gần thêm một chút.',
  too_close: 'Bạn đang quá gần camera. Lùi ra một chút để lấy đủ khuôn mặt.',
  off_center: 'Khuôn mặt đang lệch khung. Căn mắt và mũi vào giữa vòng tròn.',
  multiple_faces: 'Chỉ để một khuôn mặt trong khung hình.',
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function queueAttendanceSpeech(
  payload: Parameters<typeof speakAttendanceOutcome>[0],
): void {
  speakAttendanceOutcome(payload).catch(() => {});
}

function buildProcessedFaceLockMessage(name: string): string {
  return `Đã xử lý xong cho ${name || 'nhân viên'}. Vui lòng rời khỏi khung hình.`;
}

function normalizeAttendanceMode(_value: unknown): AttendanceMode {
  return 'auto_record';
}

function normalizePreviewUri(value: unknown, fallbackUri = ''): string {
  const text = String(value || '').trim();
  if (!text) {
    return fallbackUri;
  }
  if (text.startsWith('data:image/')) {
    return text;
  }
  if (/^[A-Za-z0-9+/=]+$/.test(text)) {
    return `data:image/jpeg;base64,${text}`;
  }
  return text;
}


function buildFallbackAttendanceLabel(
  _mode: AttendanceMode,
  _selectedType?: AttendanceType | 'auto',
) {
  return 'Ghi chấm công';
}

function buildFeedbackState(
  payload: any,
  fallbackUri: string,
  fallbackAttendanceType: string,
): FeedbackState {
  const feedbackType: FeedbackType = payload?.success
    ? 'success'
    : payload?.mismatch
      ? 'warning'
      : 'error';

  return {
    type: feedbackType,
    message:
      String(payload?.message || 'Không thể chấm công.').trim()
      || 'Không thể chấm công.',
    similarityPercent: Number(payload?.similarity_percent || 0),
    checkInTime: String(payload?.check_in_time || '').trim(),
    checkOutTime: String(payload?.check_out_time || '').trim(),
    locationText: String(payload?.location_text || '').trim(),
    attendanceTypeLabel:
      String(payload?.attendance_type_label || fallbackAttendanceType).trim()
      || fallbackAttendanceType,
    previewUri: normalizePreviewUri(payload?.preview_image_base64, fallbackUri),
    mismatch: Boolean(payload?.mismatch),
    expectedUser: payload?.expected_user || null,
    detectedUser: payload?.detected_user || payload?.user || null,
    user: payload?.user || payload?.detected_user || null,
  };
}

function toNumberList(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 4) {
    return null;
  }

  const numbers = value.slice(0, 4).map(item => Number(item));
  if (numbers.some(item => !Number.isFinite(item))) {
    return null;
  }
  return numbers;
}

function getGuidanceMessage(payload: any, detected: boolean, matched: boolean) {
  const code = String(payload?.guidance?.code || '').trim();
  if (code && GUIDANCE_MESSAGES[code]) {
    return GUIDANCE_MESSAGES[code];
  }

  if (!detected) {
    return GUIDANCE_MESSAGES.no_face;
  }

  if (!matched) {
    return 'Đã thấy khuôn mặt, hãy nhìn thẳng và tiến lại gần để tăng độ khớp.';
  }

  return String(payload?.guidance?.message || '').trim()
    || 'Căn mặt vào giữa vòng tròn và giữ máy ổn định.';
}

function isRawPrecheckReady(payload: any, isRtspMode = false) {
  const detected = Boolean(
    payload?.detected
      || Number(payload?.detected_count || 0) > 0
      || payload?.detection_bbox,
  );
  const matched = Boolean(payload?.matched);
  const mismatch = Boolean(payload?.mismatch);
  if (!detected || mismatch || !matched) {
    return false;
  }

  // External RTSP camera: allow distant/smaller faces (ratio down to 0.0006 for ceiling/wall mount, ~22x22px)
  if (isRtspMode) {
    const faceRatio = Number(payload?.face_size_ratio || 0);
    if (faceRatio > 0 && faceRatio < 0.0006) {
      return false;
    }
    return true;
  }

  const guidanceReady = Boolean(payload?.guidance?.ready_for_attendance);
  return guidanceReady;
}

function buildDetectedUserKey(user: any): string {
  return String(user?.employee_id || user?.id || user?.user_id || '').trim();
}

function buildPrecheckState(payload: any, readyStreak: number, isRtspMode = false): FacePrecheckState {
  const bbox = toNumberList(payload?.detection_bbox);
  const detectedCount = Number(payload?.detected_count || 0);
  const rawDetected = Boolean(payload?.detected || detectedCount > 0 || bbox);
  const matched = Boolean(payload?.matched);
  const mismatch = Boolean(payload?.mismatch);
  const similarityPercent = Number(payload?.similarity_percent || 0);
  // In RTSP mode, filter out false positive detections (e.g. ceiling/fan noise with low similarity and unmatched)
  const detected = isRtspMode ? (rawDetected && (matched || similarityPercent >= 35)) : rawDetected;
  const rawReady = isRawPrecheckReady(payload, isRtspMode);
  const guidanceCode = String(payload?.guidance?.code || '').trim();

  let status: FacePrecheckStatus = 'adjust';
  let progress = 55;
  let message = getGuidanceMessage(payload, detected, matched);

  const requiredStreak = PRECHECK_READY_STREAK_REQUIRED;

  if (!detected) {
    status = 'no_face';
    progress = guidanceCode === 'too_dark' ? 25 : 15;
  } else if (mismatch) {
    status = 'error';
    progress = 50;
    message = 'Khuôn mặt không khớp với tài khoản đang đăng nhập.';
  } else if (!matched) {
    status = 'adjust';
    progress = 60;
    message = 'Đã thấy khuôn mặt, hãy nhìn thẳng và tiến lại gần để nhận diện rõ hơn.';
  } else if (rawReady && readyStreak >= requiredStreak) {
    status = 'ready';
    progress = 100;
    message = isRtspMode
      ? `Đã nhận diện ${payload?.detected_user?.name || 'nhân viên'}. Đang ghi nhận điểm danh...`
      : 'Sẵn sàng chấm công. Giữ yên và bấm chụp.';
  } else if (rawReady) {
    status = 'hold';
    progress = 84;
    message = 'Khuôn mặt đạt chuẩn. Giữ yên thêm một nhịp.';
  } else if (!isRtspMode && (guidanceCode === 'too_far' || guidanceCode === 'too_close')) {
    status = 'adjust';
    progress = 45;
  } else if (!isRtspMode && guidanceCode === 'off_center') {
    status = 'adjust';
    progress = 52;
  } else if (guidanceCode === 'too_dark' || guidanceCode === 'multiple_faces') {
    status = 'adjust';
    progress = 35;
  }

  return {
    status,
    message,
    progress,
    detected,
    matched,
    mismatch,
    bbox,
    frameWidth: Number(payload?.frame_width || 0),
    frameHeight: Number(payload?.frame_height || 0),
    faceSizeRatio: Number(payload?.face_size_ratio || 0),
    brightnessScore: Number(payload?.brightness_score || 0),
    similarityPercent: Number(payload?.similarity_percent || 0),
    detectedCount,
    detectedUser: payload?.detected_user || null,
  };
}

function projectDetectionBoxToPreview(
  bbox: number[] | null,
  frameWidth: number,
  frameHeight: number,
  containerWidth: number,
  containerHeight: number,
  mirrored: boolean,
) {
  if (!bbox || bbox.length < 4 || !frameWidth || !frameHeight) {
    return null;
  }
  if (!containerWidth || !containerHeight) {
    return null;
  }

  const frameAspect = frameWidth / frameHeight;
  const containerAspect = containerWidth / containerHeight;
  let renderWidth = containerWidth;
  let renderHeight = containerHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (frameAspect > containerAspect) {
    renderHeight = containerHeight;
    renderWidth = renderHeight * frameAspect;
    offsetX = (containerWidth - renderWidth) / 2;
  } else {
    renderWidth = containerWidth;
    renderHeight = renderWidth / frameAspect;
    offsetY = (containerHeight - renderHeight) / 2;
  }

  let [x1, y1, x2, y2] = bbox;
  x1 = Math.max(0, Math.min(frameWidth - 1, x1));
  y1 = Math.max(0, Math.min(frameHeight - 1, y1));
  x2 = Math.max(x1 + 1, Math.min(frameWidth, x2));
  y2 = Math.max(y1 + 1, Math.min(frameHeight, y2));

  if (mirrored) {
    const mirroredX1 = frameWidth - x2;
    const mirroredX2 = frameWidth - x1;
    x1 = Math.max(0, mirroredX1);
    x2 = Math.min(frameWidth, mirroredX2);
  }

  const left = offsetX + (x1 / frameWidth) * renderWidth;
  const top = offsetY + (y1 / frameHeight) * renderHeight;
  const width = ((x2 - x1) / frameWidth) * renderWidth;
  const height = ((y2 - y1) / frameHeight) * renderHeight;

  if (width < 4 || height < 4) {
    return null;
  }

  return {left, top, width, height};
}

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
        message: 'App cần camera để chấm công khuôn mặt.',
        buttonPositive: 'Cho phép',
        buttonNegative: 'Không',
      },
    );
    return response === PermissionsAndroid.RESULTS.GRANTED;
  }

  const cameraKitApi = (CameraKit ?? {}) as {
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

async function uriToBase64(uri: string): Promise<string> {
  if (!uri) return '';
  try {
    const cleanPath = uri.replace(/^file:\/\//, '');
    if (RNFS && typeof RNFS.readFile === 'function') {
      return await RNFS.readFile(cleanPath, 'base64');
    }
    const response = await fetch(uri);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Failed to convert URI to Base64:', err);
    return '';
  }
}

export function FaceAttendancePanel({
  cameraTitle = 'Camera chấm công',
  feedbackTitle = 'Kết quả chấm công',
  emptyFeedbackText = 'Bấm chụp để gửi ảnh lên hệ thống nhận diện.',
  showHeader = true,
  fullScreenMode = false,
  topLeftSlot,
  topRightSlot,
  selectedCameraSource = '__device__',
  selectedCamera,
  onSelectCameraSource,
  attendanceMode: _attendanceModeProp,
  cooldownSeconds,
  selectedAttendanceType: _selectedAttendanceTypeProp,
  onSelectAttendanceType: _onSelectAttendanceTypeProp,
  onAttendanceModeChange,
  loadLatestSettings,
  detectImage,
  submitImage,
  onAutoDetectedAttendance,
  onSubmitSuccess,
}: FaceAttendancePanelProps) {
  const isRtspMode = useMemo(() => {
    return Boolean(
      selectedCameraSource &&
      selectedCameraSource !== '__device__' &&
      selectedCameraSource !== ''
    );
  }, [selectedCameraSource]);

  const [rtspStatus, setRtspStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [rtspError, setRtspError] = useState('');
  const [currentRtspFrame, setCurrentRtspFrame] = useState('');
  const currentRtspFrameRef = useRef('');
  currentRtspFrameRef.current = currentRtspFrame;

  const attendanceMode: AttendanceMode = 'auto_record';
  const cameraRef = useRef<any>(null);
  const rtspPlayerRef = useRef<RtspStreamPlayerRef>(null);
  const captureInFlightRef = useRef(false);
  const detectInFlightRef = useRef(false);
  // Keep requests independent per employee so a slow recognition response
  // cannot discard the next employee detected by the camera.
  const autoLocalAttendanceInFlightKeysRef = useRef<Set<string>>(new Set());
  const processedFaceLockRef = useRef<{
    userKey: string;
    name: string;
    lockedAt: number;
  } | null>(null);
  const faceAbsentStreakRef = useRef(0);
  const readyUserKeyRef = useRef('');
  const readyStreakRef = useRef(0);
  const [cameraPermission, setCameraPermission] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [assistEnabled, setAssistEnabled] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [precheck, setPrecheck] = useState<FacePrecheckState>(INITIAL_PRECHECK);
  const [cameraPaused, setCameraPaused] = useState(false);
  const [capturedPreviewUri, setCapturedPreviewUri] = useState('');
  const [flashVisible, setFlashVisible] = useState(false);
  const [faceLocked, setFaceLocked] = useState(false);
  const [cameraLayout, setCameraLayout] = useState({width: 0, height: 0});

  // Camera & Stream Lifecycle: cleanly reset state and old popups when switching camera
  useEffect(() => {
    setRtspStatus('connecting');
    setRtspError('');
    setCurrentRtspFrame('');
    setFeedback(null);
    setPrecheck(INITIAL_PRECHECK);
    setFaceLocked(false);
    processedFaceLockRef.current = null;
    readyUserKeyRef.current = '';
    readyStreakRef.current = 0;
    faceAbsentStreakRef.current = 0;
    autoLocalAttendanceInFlightKeysRef.current.clear();
  }, [isRtspMode, selectedCameraSource, selectedCamera]);

  const laserAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.97)).current;

  useEffect(() => {
    const laserLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(laserAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(laserAnim, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.03,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.97,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    laserLoop.start();
    pulseLoop.start();

    return () => {
      laserLoop.stop();
      pulseLoop.stop();
    };
  }, [laserAnim, pulseAnim]);

  const requestPermission = useCallback(async () => {
    const granted = await ensureCameraPermission();
    setCameraPermission(granted);
    setCameraError(granted ? '' : 'Không có quyền camera trên thiết bị.');
    return granted;
  }, []);

  useEffect(() => {
    requestPermission().catch(() => {
      setCameraPermission(false);
      setCameraError('Không có quyền camera trên thiết bị.');
    });
  }, [requestPermission]);

  useEffect(() => {
    if (!assistEnabled) {
      restoreSystemScreenBrightness().catch(() => {});
      return;
    }

    setTemporaryScreenBrightness(1).catch(() => {});
    return () => {
      restoreSystemScreenBrightness().catch(() => {});
    };
  }, [assistEnabled]);

  const runFacePrecheck = useCallback(async () => {
    if (
      submitting
      || cameraPaused
      || captureInFlightRef.current
      || detectInFlightRef.current
      || (!isRtspMode && (!cameraPermission || !cameraRef.current?.capture))
      || (isRtspMode && rtspStatus !== 'live')
    ) {
      return readyStreakRef.current >= PRECHECK_READY_STREAK_REQUIRED;
    }

    const activeFaceLock = processedFaceLockRef.current;
    if (activeFaceLock) {
      if (Date.now() - activeFaceLock.lockedAt > 4000) {
        processedFaceLockRef.current = null;
        setFaceLocked(false);
      } else if (Date.now() - activeFaceLock.lockedAt < PRECHECK_LOCK_MIN_PROBE_DELAY_MS) {
        readyStreakRef.current = 0;
        setPrecheck(current => ({
          ...current,
          status: 'hold',
          progress: 100,
          message: buildProcessedFaceLockMessage(activeFaceLock.name),
        }));
        return false;
      }
    }

    detectInFlightRef.current = true;
    try {
      let imageBase64 = '';

      if (isRtspMode) {
        if (!rtspPlayerRef.current || rtspStatus !== 'live') {
          return false;
        }
        try {
          imageBase64 = await rtspPlayerRef.current.takeSnapshot();
        } catch {
          setPrecheck(current => ({
            ...current,
            detected: false,
            status: 'idle',
          }));
          return false;
        }
        if (!imageBase64) {
          setPrecheck(current => ({
            ...current,
            detected: false,
            status: 'idle',
          }));
          return false;
        }
        currentRtspFrameRef.current = imageBase64;
      } else {
        const captureResult = await cameraRef.current.capture();
        const captureUri = String(captureResult?.uri || '').trim();
        if (!captureUri) {
          throw new Error('Không chụp được ảnh kiểm tra từ camera.');
        }

        imageBase64 = await uriToBase64(captureUri);
        // Clean up temporary capture file from storage to avoid I/O bottlenecks
        const cleanPath = captureUri.replace(/^file:\/\//, '');
        if (RNFS && typeof RNFS.unlink === 'function') {
          RNFS.unlink(cleanPath).catch(() => {});
        }

        if (!imageBase64) {
          throw new Error('Không thể xử lý dữ liệu ảnh.');
        }
      }

      // Fast FE entropy precheck (< 0.1ms): filters out blank wall/ceiling without calling server
      if (!isLikelyFaceFrame(imageBase64)) {
        faceAbsentStreakRef.current += 1;
        readyStreakRef.current = 0;
        readyUserKeyRef.current = '';
        processedFaceLockRef.current = null;
        setFaceLocked(false);
        setDetecting(false);
        setPrecheck({
          ...INITIAL_PRECHECK,
          status: 'idle',
          detected: false,
        });
        return false;
      }

      // Query Server 70 InsightFace SCRFD (runs in ~15ms on server)
      const response = normalizeFaceDetectionResponse(await detectImage({
        image_base64: imageBase64,
        include_preview: false,
      }));

      if (response && response.success === false) {
        throw new Error(response.message || 'Lỗi từ máy chủ nhận diện.');
      }

      const detectedUser = response?.detected_user;
      const detectedUserKey = buildDetectedUserKey(detectedUser);
      let activeLock = processedFaceLockRef.current;

      // If Server confirms NO face in the frame:
      const hasDetections = Boolean(
        response?.detected && (
          (Array.isArray(response?.detections) && response.detections.length > 0) ||
          response?.detection_bbox ||
          Number(response?.detected_count || 0) > 0 ||
          response?.detected_user
        )
      );
      if (!hasDetections) {
        faceAbsentStreakRef.current += 1;
        readyStreakRef.current = 0;
        readyUserKeyRef.current = '';
        // Face has left! Instantly clear lock and turn off HUD circle
        processedFaceLockRef.current = null;
        setFaceLocked(false);
        setDetecting(false);
        setPrecheck({
          ...INITIAL_PRECHECK,
          status: 'idle',
          detected: false,
        });
        return false;
      }

      // Human face physically detected in frame!
      faceAbsentStreakRef.current = 0;

      // Check if a DIFFERENT person has stepped into the frame:
      if (
        activeLock?.userKey
        && detectedUserKey
        && activeLock.userKey !== detectedUserKey
      ) {
        // Different person stepped in! Unlock instantly for the new person
        processedFaceLockRef.current = null;
        activeLock = null;
        setFaceLocked(false);
      }

      // If the SAME person is still lingering in front of the camera after check-in:
      if (activeLock) {
        if (Date.now() - activeLock.lockedAt > 4000) {
          processedFaceLockRef.current = null;
          activeLock = null;
          setFaceLocked(false);
        } else {
          readyStreakRef.current = 0;
          readyUserKeyRef.current = '';
          setDetecting(false);
          setPrecheck({
            status: 'hold',
            progress: 100,
            message: buildProcessedFaceLockMessage(activeLock.name),
            detected: true,
            matched: true,
            mismatch: false,
            bbox: response.bbox || null,
            frameWidth: response.frameWidth || 0,
            frameHeight: response.frameHeight || 0,
            faceSizeRatio: response.faceSizeRatio || 0.3,
            brightnessScore: response.brightnessScore || 50,
            similarityPercent: response.similarityPercent || 0,
            detectedUser: detectedUser || undefined,
            detectedCount: response.detectedCount || 1,
          });
          return false;
        }
      }

      // Face is active for recognition:
      setDetecting(true);
      const rawReady = isRawPrecheckReady(response, isRtspMode);
      const readyUserKey = detectedUserKey;
      const requiredStreak = PRECHECK_READY_STREAK_REQUIRED;
      if (rawReady && readyUserKey) {
        if (readyUserKeyRef.current !== readyUserKey) {
          readyUserKeyRef.current = readyUserKey;
          readyStreakRef.current = 1;
        } else {
          readyStreakRef.current = Math.min(
            readyStreakRef.current + 1,
            requiredStreak,
          );
        }
      } else {
        readyUserKeyRef.current = '';
        readyStreakRef.current = 0;
      }

      const nextPrecheck = buildPrecheckState(response, readyStreakRef.current, isRtspMode);
      setPrecheck(nextPrecheck);

      const readyForAttendance =
        nextPrecheck.status === 'ready'
        && response?.matched
        && detectedUser
        && !response?.mismatch;

      if (
        onAutoDetectedAttendance
        && readyForAttendance
        && !autoLocalAttendanceInFlightKeysRef.current.has(detectedUserKey)
      ) {
        autoLocalAttendanceInFlightKeysRef.current.add(detectedUserKey);

        // 1. Instant UI Feedback (hold state while async request is processed)
        const nowTimeStr = new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setFeedback({
          type: 'warning',
          message: `Đang ghi nhận điểm danh cho ${detectedUser.name || 'nhân viên'}...`,
          similarityPercent: Number(response?.similarity_percent || 0),
          checkInTime: nowTimeStr,
          attendanceTypeLabel: 'Tự động',
          user: detectedUser,
        });

        // 2. Set temporary in-flight hold state (do NOT permanently lock yet)
        readyUserKeyRef.current = '';
        readyStreakRef.current = 0;
        setPrecheck({
          ...nextPrecheck,
          status: 'hold',
          progress: 95,
          message: `Đang xác thực điểm danh cho ${detectedUser?.name || 'nhân viên'}...`,
        });

        // 3. Send the matched frame to the CovaVision attendance API.
        const effectiveAttendanceType = 'auto' as const;

        Promise.resolve().then(async () => {
          try {
            const attendanceResponse = await onAutoDetectedAttendance({
              user: detectedUser,
              detection: response,
              attendanceMode,
              attendanceType: effectiveAttendanceType,
              similarityPercent: Number(response?.similarity_percent || 0),
              cooldownSeconds,
              imageBase64,
            });

            const isCooldown = Boolean(
              attendanceResponse?.cooldown
              || attendanceResponse?.record?.cooldown
              || attendanceResponse?.record?.cooldown_remaining_seconds
              || attendanceResponse?.cooldown_remaining_seconds,
            );

            if (isCooldown) {
              const remain = Number(
                attendanceResponse?.cooldown_remaining_seconds
                || attendanceResponse?.record?.cooldown_remaining_seconds
                || cooldownSeconds
                || 30,
              );

              // Cooldown: lock face for 4 seconds so repetitive alerts don't trigger while walking away
              processedFaceLockRef.current = {
                userKey: detectedUserKey,
                name: String(detectedUser?.name || '').trim(),
                lockedAt: Date.now(),
              };
              setFaceLocked(true);
              readyUserKeyRef.current = '';
              readyStreakRef.current = 0;
              setPrecheck({
                ...nextPrecheck,
                status: 'hold',
                progress: 100,
                message: buildProcessedFaceLockMessage(detectedUser?.name || 'nhân viên'),
              });

              speakAttendanceOutcome({
                cooldown: true,
                cooldown_remaining_seconds: remain,
                message: attendanceResponse?.message,
              }).catch(() => {});

              setFeedback({
                type: 'warning',
                message: attendanceResponse?.message || `Vui lòng chờ ${remain} giây giữa các lần chấm công.`,
                user: detectedUser,
              });
              return;
            }

            if (attendanceResponse?.success !== true) {
              processedFaceLockRef.current = null;
              setFaceLocked(false);
              readyUserKeyRef.current = '';
              readyStreakRef.current = 0;
              const message = attendanceResponse?.message || 'Không thể ghi nhận điểm danh. Đang quét lại...';
              setFeedback({
                type: 'warning',
                message,
                user: detectedUser,
              });
              setPrecheck(current => ({
                ...current,
                status: 'adjust',
                progress: 60,
                message,
              }));
              return;
            }

            // SUCCESS: Lock face for 4 seconds to give user time to step away smoothly
            processedFaceLockRef.current = {
              userKey: detectedUserKey,
              name: String(detectedUser?.name || '').trim(),
              lockedAt: Date.now(),
            };
            setFaceLocked(true);
            readyUserKeyRef.current = '';
            readyStreakRef.current = 0;
            setPrecheck({
              ...nextPrecheck,
              status: 'hold',
              progress: 100,
              message: buildProcessedFaceLockMessage(detectedUser?.name || 'nhân viên'),
            });

            queueAttendanceSpeech({
              success: true,
              user: detectedUser,
            });

            setFeedback({
              type: 'success',
              message: `Đã ghi nhận điểm danh cho ${detectedUser.name || 'nhân viên'}.`,
              similarityPercent: Number(response?.similarity_percent || 0),
              checkInTime: nowTimeStr,
              attendanceTypeLabel: 'Tự động',
              user: detectedUser,
            });
            await onSubmitSuccess?.(attendanceResponse);
          } catch (err) {
            console.warn('Background attendance request error:', err);
            processedFaceLockRef.current = null;
            setFaceLocked(false);
            readyUserKeyRef.current = '';
            readyStreakRef.current = 0;
          } finally {
            autoLocalAttendanceInFlightKeysRef.current.delete(detectedUserKey);
          }
        });
      }
      return nextPrecheck.status === 'ready';
    } catch (error) {
      readyUserKeyRef.current = '';
      readyStreakRef.current = 0;
      setPrecheck({
        ...INITIAL_PRECHECK,
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Không kiểm tra được khuôn mặt. Vui lòng thử lại.',
      });
      return false;
    } finally {
      detectInFlightRef.current = false;
      setDetecting(false);
    }
  }, [
    cameraPaused,
    cameraPermission,
    attendanceMode,
    cooldownSeconds,
    detectImage,
    isRtspMode,
    onAutoDetectedAttendance,
    onSubmitSuccess,
    rtspStatus,
    submitting,
  ]);

  useEffect(() => {
    if ((!cameraPermission && !isRtspMode) || submitting || cameraPaused) {
      return undefined;
    }

    let cancelled = false;
    const scan = () => {
      if (!cancelled) {
        runFacePrecheck().catch(() => {});
      }
    };

    const firstScanTimer = setTimeout(scan, PRECHECK_FIRST_SCAN_DELAY_MS);
    const shouldProbeQuickly = precheck.detected
      || precheck.status === 'ready'
      || (precheck.status === 'hold' && precheck.matched);
    const activeInterval = isRtspMode
      ? (faceLocked ? 1500 : shouldProbeQuickly ? 500 : 1200)
      : (faceLocked ? PRECHECK_LOCKED_INTERVAL_MS : shouldProbeQuickly ? PRECHECK_INTERVAL_MS : PRECHECK_IDLE_INTERVAL_MS);
    const interval = setInterval(scan, activeInterval);
    return () => {
      cancelled = true;
      clearTimeout(firstScanTimer);
      clearInterval(interval);
    };
  }, [
    cameraPaused,
    cameraPermission,
    faceLocked,
    isRtspMode,
    precheck.detected,
    precheck.matched,
    precheck.status,
    rtspStatus,
    runFacePrecheck,
    submitting,
  ]);

  const submitAttendance = useCallback(async () => {
    if (
      submitting
      || captureInFlightRef.current
      || detectInFlightRef.current
      || (!isRtspMode && (!cameraPermission || !cameraRef.current?.capture))
      || (isRtspMode && rtspStatus !== 'live')
      || precheck.status !== 'ready'
    ) {
      return;
    }

    captureInFlightRef.current = true;
    setSubmitting(true);
    setFeedback(null);
    let captureUri = '';
    let capturedImageBase64 = '';

    try {
      const latestSettings = await loadLatestSettings();
      const activeMode = latestSettings?.mode || attendanceMode;
      if (latestSettings?.mode) {
        onAttendanceModeChange?.(latestSettings.mode);
      }

      if (isRtspMode) {
        capturedImageBase64 = currentRtspFrameRef.current;
        if (!capturedImageBase64 && rtspPlayerRef.current) {
          try {
            capturedImageBase64 = await rtspPlayerRef.current.takeSnapshot();
          } catch {}
        }
        if (!capturedImageBase64) {
          setFeedback({
            type: 'error',
            message: 'Không lấy được ảnh từ luồng camera.',
          });
          return;
        }
        setCapturedPreviewUri(capturedImageBase64);
        setCameraPaused(true);
      } else {
        const captureResult = await cameraRef.current.capture();
        setFlashVisible(true);
        captureUri = String(captureResult?.uri || '').trim();
        await delay(80);
        setFlashVisible(false);

        if (!captureUri) {
          setFeedback({
            type: 'error',
            message: 'Không chụp được ảnh từ camera.',
          });
          return;
        }

        setCapturedPreviewUri(captureUri);
        setCameraPaused(true);

        capturedImageBase64 = await uriToBase64(captureUri);
        if (!capturedImageBase64) {
          throw new Error('Không thể xử lý dữ liệu ảnh để gửi chấm công.');
        }
      }

      const effectiveAttendanceType = 'auto' as const;
      const response = await submitImage({
        image_base64: capturedImageBase64,
        include_preview: false,
      });

      const responseMode = normalizeAttendanceMode(response?.attendance_mode || activeMode);
      onAttendanceModeChange?.(responseMode);

      setFeedback(
        buildFeedbackState(
          response,
          captureUri,
          buildFallbackAttendanceLabel(responseMode, effectiveAttendanceType),
        ),
      );

      const responseCooldown = Boolean(
        response?.cooldown || response?.cooldown_remaining_seconds,
      );
      if (responseCooldown) {
        const cooldownUser = response?.user || response?.detected_user || precheck.detectedUser;
        const cooldownUserKey = buildDetectedUserKey(cooldownUser);
        if (cooldownUserKey) {
          processedFaceLockRef.current = {
            userKey: cooldownUserKey,
            name: String(cooldownUser?.name || '').trim(),
            lockedAt: Date.now(),
          };
          setFaceLocked(true);
        }
        queueAttendanceSpeech({
          cooldown: true,
          cooldown_remaining_seconds: Number(
            response?.cooldown_remaining_seconds || cooldownSeconds || 30,
          ),
          message: response?.message,
        });
      } else if (response?.success) {
        const successUser = response?.user || response?.detected_user;
        const successUserKey = buildDetectedUserKey(successUser);
        if (successUserKey) {
          processedFaceLockRef.current = {
            userKey: successUserKey,
            name: String(successUser?.name || '').trim(),
            lockedAt: Date.now(),
          };
          setFaceLocked(true);
        }
        queueAttendanceSpeech({
          success: true,
          user: successUser,
        });
      }

      if (response?.success) {
        await onSubmitSuccess?.(response);
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Không thể gửi dữ liệu chấm công.',
        previewUri: captureUri || undefined,
      });
    } finally {
      captureInFlightRef.current = false;
      readyUserKeyRef.current = '';
      readyStreakRef.current = 0;
      setSubmitting(false);
      setFlashVisible(false);
      setCameraPaused(false);
      setCapturedPreviewUri('');
      setPrecheck({
        ...INITIAL_PRECHECK,
        message: 'Đã hoàn thành phiên nhận diện. Đưa mặt vào khung để quét lượt tiếp theo.',
      });
    }
  }, [
    attendanceMode,
    cameraPermission,
    cooldownSeconds,
    isRtspMode,
    loadLatestSettings,
    onAttendanceModeChange,
    onSubmitSuccess,
    precheck,
    rtspStatus,
    submitImage,
    submitting,
  ]);

  const onCameraLayout = useCallback((event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout;
    setCameraLayout({width, height});
  }, []);

  const projectedBox = useMemo(
    () =>
      projectDetectionBoxToPreview(
        precheck.bbox,
        precheck.frameWidth,
        precheck.frameHeight,
        cameraLayout.width,
        cameraLayout.height,
        true,
      ),
    [
      cameraLayout.height,
      cameraLayout.width,
      precheck.bbox,
      precheck.frameHeight,
      precheck.frameWidth,
    ],
  );

  const isProcessedLocked = Boolean(processedFaceLockRef.current);
  const scanAccentColor = useMemo(() => {
    if (isProcessedLocked) {
      return '#10b981';
    }
    if (precheck.status === 'ready') {
      return '#10b981';
    }
    if (precheck.status === 'adjust' || precheck.status === 'error') {
      return '#f59e0b';
    }
    if (precheck.status === 'scanning' || precheck.detected) {
      return '#38bdf8';
    }
    return '#64748b';
  }, [isProcessedLocked, precheck.detected, precheck.status]);

  const hasFaceInFrame = Boolean(
    (isRtspMode
      ? (precheck.matched || (precheck.detected && precheck.similarityPercent >= 35))
      : precheck.detected)
    || (projectedBox && projectedBox.width > 0 && (isRtspMode ? precheck.matched : true)),
  );

  const distanceInfo = useMemo(() => {
    if (!hasFaceInFrame) {
      return null;
    }
    const minSize = isRtspMode ? 0.0008 : 0.08;
    const maxSize = isRtspMode ? 0.65 : 0.45;
    if (precheck.faceSizeRatio < minSize) {
      return {label: 'Đến gần hơn', color: '#f59e0b'};
    }
    if (precheck.faceSizeRatio > maxSize) {
      return {label: 'Lùi xa hơn', color: '#f59e0b'};
    }
    return {label: 'Khoảng cách chuẩn', color: '#10b981'};
  }, [hasFaceInFrame, isRtspMode, precheck.faceSizeRatio]);

  const brightnessInfo = useMemo(() => {
    if (!hasFaceInFrame) {
      return null;
    }
    const minBright = isRtspMode ? 15 : 30;
    if (precheck.brightnessScore < minBright) {
      return {label: 'Sáng: Yếu', color: '#f59e0b'};
    }
    if (precheck.brightnessScore > 85) {
      return {label: 'Sáng: Chói', color: '#f59e0b'};
    }
    return {label: `Sáng: Tốt (${precheck.brightnessScore.toFixed(0)}%)`, color: '#10b981'};
  }, [hasFaceInFrame, isRtspMode, precheck.brightnessScore]);

  const canSubmit =
    (cameraPermission || isRtspMode)
    && !submitting
    && !detecting
    && !cameraPaused
    && precheck.status === 'ready'
    && (!isRtspMode || rtspStatus === 'live');

  const submitLabel = 'Chụp và ghi chấm công';

  return (
    <View style={[styles.wrapper, fullScreenMode && styles.wrapperFullScreen]}>
      {showHeader && !fullScreenMode ? (
        <>
          <Text style={styles.sectionTitle}>{cameraTitle}</Text>
          <Text style={styles.modeInfo}>
            Chế độ: Ghi chấm công
            {cooldownSeconds > 0 ? ` • Giãn cách ${cooldownSeconds}s` : ''}
          </Text>
        </>
      ) : null}

      {(cameraPermission || isRtspMode) ? (
        <View
          style={[styles.cameraWrap, fullScreenMode && styles.cameraWrapFullScreen]}
          onLayout={onCameraLayout}>
          {capturedPreviewUri ? (
            <Image
              source={{uri: capturedPreviewUri}}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : isRtspMode ? (
            rtspStatus === 'error' ? (
              <View style={styles.rtspErrorWrap}>
                <Icon name="videocam-off" size={48} color="#f87171" />
                <Text style={styles.rtspErrorTitle}>Không thể kết nối camera</Text>
                <Text style={styles.rtspErrorMsg} numberOfLines={2}>
                  {rtspError || 'Kiểm tra lại luồng RTSP hoặc kết nối Wi-Fi/LAN của camera.'}
                </Text>
                <View style={{flexDirection: 'row', gap: 10, marginTop: 16}}>
                  <Pressable
                    onPress={() => {
                      setRtspStatus('connecting');
                      setRtspError('');
                    }}
                    style={styles.rtspRetryBtn}>
                    <Icon name="refresh" size={14} color="#ffffff" />
                    <Text style={styles.rtspRetryBtnText}>Thử lại</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onSelectCameraSource?.('__device__')}
                    style={styles.rtspFallbackBtn}>
                    <Icon name="camera" size={14} color="#94a3b8" />
                    <Text style={styles.rtspFallbackBtnText}>Camera trước</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <RtspStreamPlayer
                ref={rtspPlayerRef}
                cameraId={String(selectedCamera?.id || selectedCamera?.name || selectedCameraSource || '')}
                style={StyleSheet.absoluteFill}
                onPlaying={() => {
                  setRtspStatus('live');
                  setRtspError('');
                }}
                onError={(err: any) => {
                  setRtspStatus('error');
                  setRtspError(err?.error || 'Mất kết nối hoặc sai địa chỉ RTSP camera.');
                }}
              />
            )
          ) : !cameraPaused ? (
            <Camera
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
            <View style={styles.cameraPausedFallback} />
          )}

          {assistEnabled ? (
            <View pointerEvents="none" style={styles.faceLightLayer} />
          ) : null}

          {/* Sci-Fi Target HUD Biometric Layer: ONLY visible when a human face is confirmed in frame */}
          {hasFaceInFrame ? (
            <View pointerEvents="none" style={styles.scanTargetLayer}>
              <Animated.View
                style={[
                  styles.reticleContainer,
                  {transform: [{scale: pulseAnim}]},
                ]}>
                {/* 4 Corner Sci-Fi Target Brackets */}
                <View style={[styles.bracket, styles.bracketTopLeft, {borderColor: scanAccentColor}]} />
                <View style={[styles.bracket, styles.bracketTopRight, {borderColor: scanAccentColor}]} />
                <View style={[styles.bracket, styles.bracketBottomLeft, {borderColor: scanAccentColor}]} />
                <View style={[styles.bracket, styles.bracketBottomRight, {borderColor: scanAccentColor}]} />

                {/* Smooth Solid Biometric Ring with Glow */}
                <View
                  style={[
                    styles.scanCircle,
                    {
                      borderColor: scanAccentColor,
                      shadowColor: scanAccentColor,
                    },
                  ]}>
                  {/* Subtle Grid / Crosshair Accent */}
                  <View style={styles.crosshairWrap}>
                    <View style={[styles.crosshairH, {backgroundColor: `${scanAccentColor}44`}]} />
                    <View style={[styles.crosshairV, {backgroundColor: `${scanAccentColor}44`}]} />
                  </View>

                  {/* Sweeping Laser Beam */}
                  <Animated.View
                    style={[
                      styles.laserBeam,
                      {
                        backgroundColor: scanAccentColor,
                        shadowColor: scanAccentColor,
                        transform: [
                          {
                            translateY: laserAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [-90, 90],
                            }),
                          },
                        ],
                      },
                    ]}>
                    <View
                      style={[
                        styles.laserGlow,
                        {backgroundColor: `${scanAccentColor}55`},
                      ]}
                    />
                  </Animated.View>
                </View>

                {/* Floating Real-Time Biometric Telemetry Bar */}
                <View style={styles.telemetryRow}>
                  {brightnessInfo ? (
                    <View style={styles.telemetryPill}>
                      <Icon name="eye" size={12} color={brightnessInfo.color} />
                      <Text style={styles.telemetryText}>{brightnessInfo.label}</Text>
                    </View>
                  ) : null}
                  {distanceInfo ? (
                    <View style={styles.telemetryPill}>
                      <Icon name="face-recognition" size={12} color={distanceInfo.color} />
                      <Text style={styles.telemetryText}>{distanceInfo.label}</Text>
                    </View>
                  ) : null}
                  {precheck.similarityPercent >= 35 ? (
                    <View style={styles.telemetryPill}>
                      <Icon name="fingerprint" size={12} color="#10b981" />
                      <Text style={[styles.telemetryText, {color: '#10b981'}]}>
                        Khớp: {precheck.similarityPercent.toFixed(1)}%
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Animated.View>
            </View>
          ) : null}

          {projectedBox && !fullScreenMode && (isRtspMode ? precheck.matched : true) ? (
            <View
              pointerEvents="none"
              style={[
                styles.detectedBox,
                precheck.status === 'ready' && styles.detectedBoxReady,
                precheck.status === 'error' && styles.detectedBoxError,
                projectedBox,
              ]}>
              <View style={[styles.detectedBoxBadge, {borderColor: scanAccentColor}]}>
                <Icon name="face-recognition" size={11} color={scanAccentColor} />
                <Text style={styles.detectedBoxLabel}>
                  {precheck.detectedUser?.name || 'Khuôn mặt đạt chuẩn'}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Integrated Top Bar Header Row */}
          {fullScreenMode ? (
            <View pointerEvents="box-none" style={styles.cameraTopRowFullScreen}>
              {topLeftSlot ? (
                <View pointerEvents="auto" style={styles.cameraTopSideWrap}>
                  {topLeftSlot}
                </View>
              ) : isRtspMode ? (
                <View pointerEvents="auto" style={styles.rtspLiveHudBadge}>
                  <View style={styles.rtspLiveDot} />
                  <Text style={styles.rtspLiveText} numberOfLines={1}>
                    LIVE • {selectedCamera?.name || selectedCameraSource}
                  </Text>
                  <Pressable
                    onPress={() => onSelectCameraSource?.('__device__')}
                    style={styles.rtspSwitchPill}
                    accessibilityLabel="Đổi sang Camera trước">
                    <Icon name="camera" size={11} color="#ffffff" />
                    <Text style={styles.rtspSwitchPillText}>Cam trước</Text>
                  </Pressable>
                </View>
              ) : null}

              <View
                pointerEvents="none"
                style={[
                  styles.cameraTopPill,
                  hasFaceInFrame && processedFaceLockRef.current && styles.cameraTopPillSuccess,
                ]}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: hasFaceInFrame
                        ? (processedFaceLockRef.current ? '#10b981' : scanAccentColor)
                        : '#64748b',
                      shadowColor: hasFaceInFrame
                        ? (processedFaceLockRef.current ? '#10b981' : scanAccentColor)
                        : '#64748b',
                    },
                  ]}
                />
                <Text style={styles.cameraTopText} numberOfLines={1}>
                  {isRtspMode && rtspStatus === 'connecting'
                    ? 'Đang kết nối luồng camera...'
                    : isRtspMode && rtspStatus === 'error'
                    ? 'Lỗi kết nối camera RTSP'
                    : hasFaceInFrame
                    ? (processedFaceLockRef.current
                      ? `Đã xong • ${processedFaceLockRef.current.name}`
                      : detecting
                      ? 'Đang phân tích sinh trắc...'
                      : precheck.status === 'ready'
                        ? 'Khuôn mặt hợp lệ'
                        : 'Đang nhận diện khuôn mặt...')
                    : 'Đang chờ khuôn mặt...'}
                </Text>
              </View>

              {topRightSlot ? (
                <View pointerEvents="auto" style={styles.cameraTopSideWrap}>
                  {topRightSlot}
                </View>
              ) : null}
            </View>
          ) : (
            <View pointerEvents="none" style={styles.cameraTopBar}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: hasFaceInFrame ? scanAccentColor : '#64748b',
                    shadowColor: hasFaceInFrame ? scanAccentColor : '#64748b',
                  },
                ]}
              />
              <Text style={styles.cameraTopText}>
                {isRtspMode && rtspStatus === 'connecting'
                  ? 'Đang kết nối luồng camera...'
                  : isRtspMode && rtspStatus === 'error'
                  ? 'Lỗi kết nối camera RTSP'
                  : hasFaceInFrame
                  ? (processedFaceLockRef.current
                    ? buildProcessedFaceLockMessage(processedFaceLockRef.current.name)
                    : detecting
                    ? 'Đang phân tích sinh trắc khuôn mặt...'
                    : precheck.message)
                  : 'Đang chờ khuôn mặt...'}
              </Text>
            </View>
          )}

          {/* Bottom Area: Unified Container in fullScreenMode (Zero Overlap) */}
          {fullScreenMode ? (
            <View pointerEvents="box-none" style={styles.fullscreenBottomContainer}>
              {/* Single source of truth for Status / Completion / Feedback */}
              {processedFaceLockRef.current && hasFaceInFrame ? (
                <View style={styles.completionBanner}>
                  <View style={styles.completionIconWrap}>
                    <Icon name="check_circle" size={22} color="#10b981" />
                  </View>
                  <View style={{flex: 1, gap: 2}}>
                    <Text style={styles.completionTitle} numberOfLines={1}>
                      Đã điểm danh: {processedFaceLockRef.current.name}
                    </Text>
                    <Text style={styles.completionSubtitle}>
                      Vui lòng rời khỏi khung hình để tiếp tục lượt tiếp theo
                    </Text>
                  </View>
                </View>
              ) : feedback ? (
                <View pointerEvents="auto" style={styles.floatingFeedbackWrap}>
                  <View
                    style={[
                      styles.feedbackBox,
                      feedback.type === 'success'
                        ? styles.feedbackSuccess
                        : feedback.type === 'warning'
                          ? styles.feedbackWarning
                          : styles.feedbackError,
                      {marginVertical: 0, paddingVertical: 10, paddingHorizontal: 12},
                    ]}>
                    <View style={styles.feedbackUserHeader}>
                      <View
                        style={[
                          styles.feedbackAvatarRing,
                          {
                            borderColor:
                              feedback.type === 'success'
                                ? '#10b981'
                                : feedback.type === 'warning'
                                  ? '#f59e0b'
                                  : '#ef4444',
                          },
                        ]}>
                        <Icon
                          name={
                            feedback.type === 'success'
                              ? 'check_circle'
                              : feedback.type === 'warning'
                                ? 'warning'
                                : 'error'
                          }
                          size={18}
                          color={
                            feedback.type === 'success'
                              ? '#10b981'
                              : feedback.type === 'warning'
                                ? '#f59e0b'
                                : '#ef4444'
                          }
                        />
                      </View>
                      <View style={{flex: 1, gap: 1}}>
                        <Text style={[styles.feedbackMessage, {fontSize: 14}]} numberOfLines={1}>
                          {feedback.user?.name || feedback.expectedUser?.name || 'Nhân viên'}
                        </Text>
                        <Text style={styles.feedbackMetaText} numberOfLines={1}>
                          {feedback.user?.employee_id || feedback.expectedUser?.employee_id
                            ? `#${feedback.user?.employee_id || feedback.expectedUser?.employee_id} • `
                            : ''}
                          {feedback.user?.department || feedback.expectedUser?.department || 'Nhân sự'}
                        </Text>
                      </View>
                      {feedback.checkInTime ? (
                        <View style={styles.feedbackMetaItem}>
                          <Icon name="clock" size={11} color="#94a3b8" />
                          <Text style={[styles.feedbackMetaText, {fontSize: 11}]}>{feedback.checkInTime}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.feedbackMetaText, {color: colors.textPrimary, marginTop: 4}]} numberOfLines={2}>
                      {feedback.message}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.compactHintBar}>
                  <Text
                    style={[
                      styles.compactHintText,
                      {color: hasFaceInFrame ? scanAccentColor : '#94a3b8'},
                    ]}>
                    {processedFaceLockRef.current
                      ? 'Đã xong — Vui lòng rời khỏi camera'
                      : hasFaceInFrame
                      ? (precheck.status === 'ready'
                        ? 'Khuôn mặt hợp lệ — Giữ yên...'
                        : 'Đang nhận diện khuôn mặt...')
                      : 'Sẵn sàng — Vui lòng đứng trước camera'}
                  </Text>
                  {hasFaceInFrame ? (
                    <View style={styles.progressTrackSlim}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            backgroundColor: scanAccentColor,
                            width: `${Math.max(0, Math.min(100, precheck.progress))}%`,
                          },
                        ]}
                      />
                    </View>
                  ) : null}
                </View>
              )}

              {/* Bottom control buttons (neatly stacked below without overlapping) */}
              <View pointerEvents="box-none" style={styles.fullscreenBottomControls}>
                <Pressable
                  onPress={() => setAssistEnabled(current => !current)}
                  style={[
                    styles.floatingControlBtn,
                    assistEnabled && styles.floatingControlBtnActive,
                  ]}>
                  <Icon
                    name="bolt"
                    size={14}
                    color={assistEnabled ? '#38bdf8' : '#94a3b8'}
                  />
                  <Text
                    style={[
                      styles.floatingControlBtnText,
                      assistEnabled && {color: '#38bdf8', fontWeight: '700'},
                    ]}>
                    {assistEnabled ? 'Sáng: Bật' : 'Sáng: Tắt'}
                  </Text>
                </Pressable>

                <View style={styles.floatingModePill}>
                  <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981'}} />
                  <Text style={styles.floatingModePillText}>
                    {attendanceMode === 'auto_record' ? 'Tự động điểm danh' : 'Điểm danh ca'}
                  </Text>
                </View>

                <Pressable
                  disabled={!cameraPermission || submitting || cameraPaused || detecting}
                  onPress={() => {
                    readyUserKeyRef.current = '';
                    readyStreakRef.current = 0;
                    setPrecheck(INITIAL_PRECHECK);
                    runFacePrecheck().catch(() => {});
                  }}
                  style={styles.floatingControlBtn}>
                  <Icon name="refresh" size={14} color="#94a3b8" />
                  <Text style={styles.floatingControlBtnText}>Quét lại</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View pointerEvents="none" style={styles.cameraHintBox}>
              <View style={styles.hintHeaderRow}>
                <Icon
                  name={processedFaceLockRef.current ? 'check_circle' : precheck.status === 'ready' ? 'check_circle' : 'face-recognition'}
                  size={16}
                  color={scanAccentColor}
                />
                <Text style={[styles.cameraHintTitle, {color: scanAccentColor}]}>
                  {processedFaceLockRef.current
                    ? 'Đã ghi nhận điểm danh'
                    : precheck.status === 'ready'
                      ? 'Khuôn mặt đã sẵn sàng'
                      : 'Căn khuôn mặt vào vòng quét AI'}
                </Text>
              </View>
              <Text style={styles.cameraHintText}>
                {processedFaceLockRef.current
                  ? 'Vui lòng rời khỏi khung hình để tiếp tục lượt tiếp theo.'
                  : 'Giữ mặt cách camera khoảng 30-50 cm, nhìn thẳng, tránh ngược sáng.'}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: scanAccentColor,
                      width: `${processedFaceLockRef.current ? 100 : Math.max(0, Math.min(100, precheck.progress))}%`,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          {submitting || cameraPaused ? (
            <View pointerEvents="none" style={styles.processingOverlay}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.processingText}>
                Đã chụp ảnh, đang nhận diện khuôn mặt...
              </Text>
            </View>
          ) : null}

          {flashVisible ? (
            <View pointerEvents="none" style={styles.captureFlash} />
          ) : null}
        </View>
      ) : (
        <View style={styles.permissionWarnBox}>
          <Text style={styles.permissionWarnText}>
            {cameraError || 'Không có quyền camera trên thiết bị.'}
          </Text>
          <Pressable onPress={() => requestPermission()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Xin quyền lại</Text>
          </Pressable>
        </View>
      )}

      {!fullScreenMode ? (
        <>
          <View style={styles.assistRow}>
        <Pressable
          onPress={() => setAssistEnabled(current => !current)}
          style={[
            styles.assistButton,
            assistEnabled && styles.assistButtonActive,
          ]}>
          <Text
            style={[
              styles.assistButtonText,
              assistEnabled && styles.assistButtonTextActive,
            ]}>
            {assistEnabled ? 'Hỗ trợ ánh sáng đang bật' : 'Bật hỗ trợ ánh sáng'}
          </Text>
        </Pressable>
        <Pressable
          disabled={!cameraPermission || submitting || cameraPaused || detecting}
          onPress={() => {
            readyUserKeyRef.current = '';
            readyStreakRef.current = 0;
            setPrecheck(INITIAL_PRECHECK);
            runFacePrecheck().catch(() => {});
          }}
          style={[
            styles.rescanButton,
            (!cameraPermission || submitting || cameraPaused || detecting)
              && styles.rescanButtonDisabled,
          ]}>
          <Text style={styles.rescanButtonText}>Quét lại khuôn mặt</Text>
        </Pressable>
      </View>

      <Text style={styles.assistHint}>
        Màn hình được tăng sáng và phủ lớp sáng nhẹ để hỗ trợ camera trước khi nhận diện.
      </Text>

      <View style={styles.autoModeBox}>
        <Text style={styles.autoModeText}>
          Ghi chấm công tự động — mỗi lần quét = 1 lượt ghi nhận.
        </Text>
      </View>

      <Pressable
        onPress={() => {
          submitAttendance().catch(() => {});
        }}
        disabled={!canSubmit}
        style={[
          styles.submitButton,
          !canSubmit && styles.submitButtonDisabled,
        ]}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>
            {precheck.status === 'ready'
              ? submitLabel
              : 'Chờ khuôn mặt đạt chuẩn'}
          </Text>
        )}
      </Pressable>

      <View style={styles.feedbackCard}>
        <View style={styles.feedbackHeaderRow}>
          <Icon name="face-recognition" size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>{feedbackTitle}</Text>
        </View>
        {!feedback ? (
          <View style={styles.emptyFeedbackWrap}>
            <Icon name="camera_front" size={24} color="#94a3b8" />
            <Text style={styles.mutedText}>{emptyFeedbackText}</Text>
          </View>
        ) : (
          <View
            style={[
              styles.feedbackBox,
              feedback.type === 'success'
                ? styles.feedbackSuccess
                : feedback.type === 'warning'
                  ? styles.feedbackWarning
                  : styles.feedbackError,
            ]}>
            <View style={styles.feedbackUserHeader}>
              <View
                style={[
                  styles.feedbackAvatarRing,
                  {
                    borderColor:
                      feedback.type === 'success'
                        ? '#10b981'
                        : feedback.type === 'warning'
                          ? '#f59e0b'
                          : '#ef4444',
                  },
                ]}>
                <Icon
                  name={
                    feedback.type === 'success'
                      ? 'check_circle'
                      : feedback.type === 'warning'
                        ? 'warning'
                        : 'error'
                  }
                  size={24}
                  color={
                    feedback.type === 'success'
                      ? '#10b981'
                      : feedback.type === 'warning'
                        ? '#f59e0b'
                        : '#ef4444'
                  }
                />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.feedbackMessage}>{feedback.message}</Text>
                {feedback.user?.name ? (
                  <Text style={styles.feedbackUserName}>
                    {feedback.user.name}
                    {feedback.user.employee_id ? ` • #${feedback.user.employee_id}` : ''}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.feedbackDivider} />

            <View style={styles.feedbackGrid}>
              {Number.isFinite(feedback.similarityPercent) ? (
                <View style={styles.feedbackMetaItem}>
                  <Icon name="fingerprint" size={14} color={colors.primary} />
                  <Text style={styles.feedbackMetaText}>
                    Độ khớp:{' '}
                    <Text style={styles.feedbackMetaBold}>
                      {Number(feedback.similarityPercent || 0).toFixed(1)}%
                    </Text>
                  </Text>
                </View>
              ) : null}
              {feedback.attendanceTypeLabel ? (
                <View style={styles.feedbackMetaItem}>
                  <Icon name="badge" size={14} color={colors.primary} />
                  <Text style={styles.feedbackMetaText}>
                    Loại: <Text style={styles.feedbackMetaBold}>{feedback.attendanceTypeLabel}</Text>
                  </Text>
                </View>
              ) : null}
              {feedback.checkInTime ? (
                <View style={styles.feedbackMetaItem}>
                  <Icon name="clock" size={14} color="#10b981" />
                  <Text style={styles.feedbackMetaText}>
                    Vào: <Text style={styles.feedbackMetaBold}>{feedback.checkInTime}</Text>
                  </Text>
                </View>
              ) : null}
              {feedback.checkOutTime ? (
                <View style={styles.feedbackMetaItem}>
                  <Icon name="clock" size={14} color="#f59e0b" />
                  <Text style={styles.feedbackMetaText}>
                    Ra: <Text style={styles.feedbackMetaBold}>{feedback.checkOutTime}</Text>
                  </Text>
                </View>
              ) : null}
            </View>

            {feedback.locationText ? (
              <Text style={styles.feedbackLine}>Vị trí: {feedback.locationText}</Text>
            ) : null}
            {feedback.mismatch ? (
              <View style={styles.mismatchBox}>
                <Text style={styles.feedbackLine}>
                  Tài khoản đăng nhập: {feedback.expectedUser?.name || '-'}
                  {feedback.expectedUser?.employee_id
                    ? ` (${feedback.expectedUser.employee_id})`
                    : ''}
                </Text>
                <Text style={styles.feedbackLine}>
                  Hệ thống nhận diện: {feedback.detectedUser?.name || '-'}
                  {feedback.detectedUser?.employee_id
                    ? ` (${feedback.detectedUser.employee_id})`
                    : ''}
                </Text>
              </View>
            ) : null}
            {feedback.previewUri ? (
              <Image
                source={{uri: feedback.previewUri}}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        )}
      </View>
    </>
  ) : null}
</View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm + 2,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  modeInfo: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  cameraWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: border.radius.xl,
    overflow: 'hidden',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#0f172a',
  },
  cameraPausedFallback: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#020617',
  },
  faceLightLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  scanTargetLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 72,
  },
  reticleContainer: {
    width: '68%',
    maxWidth: 320,
    maxHeight: 320,
    minWidth: 230,
    minHeight: 230,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bracket: {
    position: 'absolute',
    width: 28,
    height: 28,
    zIndex: 10,
  },
  bracketTopLeft: {
    top: -8,
    left: -8,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderTopLeftRadius: 10,
  },
  bracketTopRight: {
    top: -8,
    right: -8,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopRightRadius: 10,
  },
  bracketBottomLeft: {
    bottom: -8,
    left: -8,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderBottomLeftRadius: 10,
  },
  bracketBottomRight: {
    bottom: -8,
    right: -8,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomRightRadius: 10,
  },
  scanCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.16)',
    overflow: 'hidden',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 6,
  },
  scanInnerCircle: {
    width: '84%',
    height: '84%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairH: {
    position: 'absolute',
    width: 24,
    height: 1.5,
    borderRadius: 1,
  },
  crosshairV: {
    position: 'absolute',
    height: 24,
    width: 1.5,
    borderRadius: 1,
  },
  laserBeam: {
    position: 'absolute',
    left: 4,
    right: 4,
    height: 2.5,
    borderRadius: 2,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 8,
  },
  laserGlow: {
    position: 'absolute',
    top: -12,
    bottom: -12,
    left: 0,
    right: 0,
    borderRadius: 8,
  },
  telemetryRow: {
    position: 'absolute',
    bottom: -46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '130%',
  },
  telemetryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(2, 6, 23, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
  },
  telemetryText: {
    color: '#f1f5f9',
    fontSize: 10.5,
    fontWeight: '700',
  },
  scanBorderDefault: {
    borderColor: '#fbbf24',
    backgroundColor: 'rgba(251, 191, 36, 0.10)',
  },
  scanBorderHold: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.10)',
  },
  scanBorderReady: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  scanBorderError: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  scanFillDefault: {
    backgroundColor: '#fbbf24',
  },
  scanFillHold: {
    backgroundColor: '#38bdf8',
  },
  scanFillReady: {
    backgroundColor: '#22c55e',
  },
  scanFillError: {
    backgroundColor: '#ef4444',
  },
  detectedBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#38bdf8',
    borderRadius: border.radius.md,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  detectedBoxReady: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  detectedBoxError: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  detectedBoxBadge: {
    position: 'absolute',
    left: 6,
    top: -26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(2, 6, 23, 0.88)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  detectedBoxLabel: {
    color: '#fff',
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '800',
  },
  cameraTopBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 14,
    borderRadius: border.radius.md,
    backgroundColor: 'rgba(2, 6, 23, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  cameraTopText: {
    flex: 1,
    color: '#fff',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  cameraHintBox: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    borderRadius: border.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(2, 6, 23, 0.82)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: 6,
  },
  hintHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cameraHintTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  cameraHintText: {
    color: '#cbd5e1',
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '500',
  },
  cameraHintMeta: {
    color: '#cbd5e1',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.xxl,
    backgroundColor: 'rgba(2, 6, 23, 0.58)',
  },
  processingText: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  captureFlash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#fff',
  },
  permissionWarnBox: {
    borderRadius: border.radius.md,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    padding: spacing.md,
    gap: spacing.sm,
  },
  permissionWarnText: {
    color: '#b91c1c',
    fontSize: 12,
    lineHeight: 18,
  },
  retryButton: {
    minHeight: 38,
    borderRadius: border.radius.sm,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  assistRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  assistButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  assistButtonActive: {
    borderColor: '#fcd34d',
    backgroundColor: '#fefce8',
  },
  assistButtonText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  assistButtonTextActive: {
    color: '#854d0e',
  },
  rescanButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  rescanButtonDisabled: {
    opacity: 0.5,
  },
  rescanButtonText: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '800',
  },
  assistHint: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    borderColor: '#34d399',
    backgroundColor: '#ecfdf5',
  },
  modeButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  autoModeBox: {
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#f0fdfa',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  autoModeText: {
    color: '#0f766e',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  submitButton: {
    minHeight: 48,
    borderRadius: border.radius.md,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  feedbackCard: {
    borderRadius: border.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
    padding: spacing.md + 2,
    gap: spacing.sm + 2,
    shadowColor: '#0f172a',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  feedbackHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyFeedbackWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  feedbackBox: {
    borderRadius: border.radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  feedbackSuccess: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  feedbackWarning: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  feedbackError: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  feedbackUserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  feedbackAvatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackMessage: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  feedbackUserName: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  feedbackDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginVertical: 4,
  },
  feedbackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  feedbackMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  feedbackMetaText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  feedbackMetaBold: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  feedbackLine: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  mismatchBox: {
    marginTop: spacing.xs,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#fda4af',
  },
  previewImage: {
    width: '100%',
    height: 190,
    borderRadius: border.radius.sm,
    marginTop: spacing.sm,
    backgroundColor: '#0f172a0d',
  },
  wrapperFullScreen: {
    flex: 1,
    backgroundColor: '#020617',
    padding: 0,
    margin: 0,
    gap: 0,
  },
  cameraWrapFullScreen: {
    flex: 1,
    width: '100%',
    aspectRatio: undefined,
    borderRadius: 0,
    borderWidth: 0,
  },
  cameraTopRowFullScreen: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    maxWidth: 680,
    alignSelf: 'center',
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cameraTopPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.7)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  cameraTopPillSuccess: {
    backgroundColor: 'rgba(6, 78, 59, 0.92)',
    borderColor: 'rgba(16, 185, 129, 0.6)',
  },
  cameraTopSideWrap: {
    flexShrink: 0,
  },
  fullscreenBottomContainer: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    maxWidth: 560,
    alignSelf: 'center',
    zIndex: 40,
    gap: 10,
  },
  completionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(6, 78, 59, 0.94)',
    borderWidth: 1.5,
    borderColor: '#10b981',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#10b981',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  completionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionTitle: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
  },
  completionSubtitle: {
    color: '#a7f3d0',
    fontSize: 11.5,
    fontWeight: '600',
  },
  floatingFeedbackWrap: {
    width: '100%',
  },
  compactHintBar: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.7)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 5,
    alignItems: 'center',
  },
  compactHintText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressTrackSlim: {
    width: '100%',
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  fullscreenBottomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  floatingControlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.7)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  floatingControlBtnActive: {
    borderColor: 'rgba(56, 189, 248, 0.6)',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  floatingControlBtnText: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  floatingModePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  floatingModePillText: {
    color: '#34d399',
    fontSize: 11.5,
    fontWeight: '700',
  },
  crosshairWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rtspConnectingWrap: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#090d16',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 10,
  },
  rtspPulseRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  rtspConnectingTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  rtspConnectingName: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  rtspConnectingSource: {
    color: '#64748b',
    fontSize: 11.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'center',
    maxWidth: 280,
  },
  rtspFallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.6)',
  },
  rtspFallbackBtnText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  rtspErrorWrap: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#090d16',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 10,
  },
  rtspErrorTitle: {
    color: '#f87171',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
    textAlign: 'center',
  },
  rtspErrorMsg: {
    color: '#94a3b8',
    fontSize: 12.5,
    textAlign: 'center',
    maxWidth: 280,
  },
  rtspRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#0284c7',
  },
  rtspRetryBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  rtspLiveHudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.5)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rtspLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#22c55e',
  },
  rtspLiveText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 160,
  },
  rtspSwitchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.8)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 4,
  },
  rtspSwitchPillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
});
