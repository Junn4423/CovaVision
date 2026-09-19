import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Volume2, Sparkles, Send, Radio, Settings2 } from 'lucide-react'
import { api } from '../services/api'
import { openBackendMjpegStream } from '../services/backendMjpegStream'
import { ROUTES } from '../config/routes'
import { speakAttendanceOutcome } from '../services/ttsService'
import { isLikelyFaceFrame } from '../utils/faceFrameCheck'
import { normalizeFaceDetectionResponse } from '../utils/faceDetection'
import CameraSpeakerSettingsModal from '../components/CameraSpeakerSettingsModal'
import {
  loadCameraSpeakerConfig,
  speakAttendanceViaCamera,
  isCameraSpeakerAvailable,
  CAMERA_SPEAKER_CONFIG_EVENT,
} from '../services/cameraSpeakerService'
import { analyzeVisualMotion, resetVisualMotionDetector } from '../utils/visualMotionDetector'

import {
  FIXED_BROWSER_CAMERA,
  FIXED_BROWSER_CAMERA_ID,
  LIVE_DETECT_MAX_WIDTH,
  PRECHECK_AMBIENT_PROBE_MS,
  PRECHECK_FACE_ACTIVE_MS,
  PRECHECK_IDLE_INTERVAL_MS,
  PRECHECK_LOCKED_DELAY_MS,
  PRECHECK_READY_STREAK_REQUIRED,
  PRECHECK_STATIC_PROBE_MS,
  attachStreamToVideo,
  buildBrowserConstraints,
  buildStartPayload,
  cleanLocationDisplayText,
  computeContainedVideoRect,
  describeCamera,
  getCameraErrorMessage,
  getPreviewBoundingBoxStyle,
  isBrowserCameraType,
  projectDetectionBoxToPreview,
  readSavedBrowserDeviceId,
  saveBrowserDeviceId,
  sanitizeDeviceLabel,
  tryOpenBrowserCamera,
  waitForVideoFrame,
  withFixedBrowserCamera,
} from '../utils/cameraUtils'

export default function Attendance() {
  const [cameraRunning, setCameraRunning] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(false)
  const [cameraRuntimeMode, setCameraRuntimeMode] = useState(null)
  const [activeCameraId, setActiveCameraId] = useState('')
  const [cameras, setCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [todayRecords, setTodayRecords] = useState([])
  const [attendanceBusy, setAttendanceBusy] = useState(false)
  const [attendanceFeedback, setAttendanceFeedback] = useState(null)
  const [lastCapturePreview, setLastCapturePreview] = useState(null)
  const [liveDetections, setLiveDetections] = useState([])
  const [liveDetectionFrame, setLiveDetectionFrame] = useState({ width: 0, height: 0 })
  const [liveDetectionError, setLiveDetectionError] = useState('')
  const [previewViewport, setPreviewViewport] = useState({ width: 0, height: 0 })
  const [browserDevices, setBrowserDevices] = useState([])
  const [browserDevicesLoading, setBrowserDevicesLoading] = useState(false)
  const [selectedBrowserDeviceId, setSelectedBrowserDeviceId] = useState('')
  const [backendStreamReady, setBackendStreamReady] = useState(false)
  const [backendSnapshotError, setBackendSnapshotError] = useState('')
  const [activeFaceLock, setActiveFaceLock] = useState(null)
  const [isSpeakerModalOpen, setIsSpeakerModalOpen] = useState(false)
  const [speakerConfig, setSpeakerConfig] = useState(() => loadCameraSpeakerConfig())

  useEffect(() => {
    const handleSpeakerConfigChange = () => {
      setSpeakerConfig(loadCameraSpeakerConfig())
    }
    window.addEventListener(CAMERA_SPEAKER_CONFIG_EVENT, handleSpeakerConfigChange)
    return () => window.removeEventListener(CAMERA_SPEAKER_CONFIG_EVENT, handleSpeakerConfigChange)
  }, [])

  // Direct-DOM refs for high-fps RTSP rendering (bypasses React reconciliation)
  const rtspImgDomRef = useRef(null)
  const rtspRafIdRef = useRef(0)
  const rtspLatestFrameRef = useRef('')

  // Persistent canvas context cache to avoid repeated getContext calls
  const detectCtxRef = useRef(null)

  // FPS counter: direct-DOM to avoid React re-render overhead
  const fpsCounterRef = useRef(null)
  const fpsFrameTimesRef = useRef([])
  const fpsDisplayTimerRef = useRef(null)

  const imgRef = useRef(null)
  const previewContainerRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  const snapshotTimerRef = useRef(null)
  const snapshotInFlightRef = useRef(false)
  const detectInFlightRef = useRef(false)
  const attendanceBusyRef = useRef(false)
  const autoAttendanceInFlightRef = useRef(false)
  const autoLocalAttendanceInFlightKeysRef = useRef(new Set())
  const autoAttendanceStreakRef = useRef({ userId: null, count: 0 })
  const faceAbsentStreakRef = useRef(0)
  const readyStreakRef = useRef(0)
  const readyUserKeyRef = useRef('')
  const processedFaceLockRef = useRef(null)
  const browserStreamRef = useRef(null)
  const detectCanvasRef = useRef(null)
  const detectTimerRef = useRef(null)
  // Smart Anti-Spam Throttling Refs (Cloned from Mobile)
  const lastServerDetectTimeRef = useRef(0)
  const consecutiveStaticFramesRef = useRef(0)
  const consecutiveNoFaceStreakRef = useRef(0)

  const selectedCamera = useMemo(
    () => cameras.find(item => item.id === selectedCameraId) || null,
    [cameras, selectedCameraId]
  )

  const activeCamera = useMemo(
    () => cameras.find(item => item.id === activeCameraId) || null,
    [activeCameraId, cameras]
  )

  const browserCameraSelected = Boolean(selectedCamera && isBrowserCameraType(selectedCamera.camera_type))
  const backendCameraActive = cameraRuntimeMode === 'backend'
  const clientAttendanceCameraActive = browserCameraSelected || backendCameraActive
  const browserCameraSupported = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function'
    && typeof navigator.mediaDevices.enumerateDevices === 'function'
  const requiresSecureContext = typeof window !== 'undefined' && !window.isSecureContext
  useEffect(() => {
    initializePage()
    const attendanceTimer = setInterval(loadTodayRecords, 15000)
    return () => {
      clearInterval(attendanceTimer)
      if (detectTimerRef.current) clearInterval(detectTimerRef.current)
      stopBrowserCameraStream()
      void api.stopCamera().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!browserCameraSelected || !selectedCamera) {
      setBrowserDevices([])
      setSelectedBrowserDeviceId('')
      return
    }

    const preferredId = (
      readSavedBrowserDeviceId(selectedCamera.id)
      || selectedCamera.camera_options?.browser_device_id
      || ''
    ).trim()
    setSelectedBrowserDeviceId(preferredId)
    loadBrowserDevices({ withPermission: false, preferredDeviceId: preferredId })
  }, [browserCameraSelected, selectedCamera?.id])

  useEffect(() => {
    if (!browserCameraSupported || typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return undefined
    }

    const mediaDevices = navigator.mediaDevices
    const handleDeviceChange = () => {
      loadBrowserDevices({ withPermission: false })
    }

    if (typeof mediaDevices.addEventListener === 'function') {
      mediaDevices.addEventListener('devicechange', handleDeviceChange)
      return () => {
        mediaDevices.removeEventListener('devicechange', handleDeviceChange)
      }
    }

    const previousHandler = mediaDevices.ondevicechange
    mediaDevices.ondevicechange = handleDeviceChange
    return () => {
      if (mediaDevices.ondevicechange === handleDeviceChange) {
        mediaDevices.ondevicechange = previousHandler || null
      }
    }
  }, [browserCameraSupported, selectedCamera?.id])

  useEffect(() => {
    if (snapshotTimerRef.current) {
      clearInterval(snapshotTimerRef.current)
      snapshotTimerRef.current = null
    }
    snapshotInFlightRef.current = false

    // Cancel any pending rAF render
    if (rtspRafIdRef.current) {
      cancelAnimationFrame(rtspRafIdRef.current)
      rtspRafIdRef.current = 0
    }

    // The backend owns RTSP. The desktop consumes only the authenticated JPEG
    // proxy, so no browser/Electron surface receives a camera URL.
    if (!(cameraRunning && cameraRuntimeMode === 'backend')) {
      setBackendStreamReady(false)
      setBackendSnapshotError('')
      return undefined
    }

    let cancelled = false
    let hasFirstFrame = false
    let lastRenderedFrame = ''
    const abortController = new AbortController()

    // High-performance rAF render loop: reads latest frame from ref
    // and writes directly to <img> DOM node, bypassing React state.
    const renderFrame = () => {
      if (cancelled) return
      const img = rtspImgDomRef.current
      const frame = rtspLatestFrameRef.current
      if (img && frame && frame !== lastRenderedFrame) {
        img.src = frame
        lastRenderedFrame = frame
        // Track frame time for FPS counter
        const now = performance.now()
        const times = fpsFrameTimesRef.current
        times.push(now)
        // Keep only last 2 seconds of timestamps
        while (times.length > 0 && now - times[0] > 2000) times.shift()
      }
      rtspRafIdRef.current = requestAnimationFrame(renderFrame)
    }
    rtspRafIdRef.current = requestAnimationFrame(renderFrame)

    // Consume one authenticated MJPEG proxy stream. Only JPEG bytes reach the
    // renderer; the backend remains the only component that knows the RTSP URL.
    openBackendMjpegStream(activeCameraId, {
      signal: abortController.signal,
      onFrame: async jpegBytes => {
        if (cancelled) return
        const nextObjectUrl = URL.createObjectURL(new Blob([jpegBytes], { type: 'image/jpeg' }))
        const previousObjectUrl = rtspLatestFrameRef.current
        rtspLatestFrameRef.current = nextObjectUrl
        if (previousObjectUrl?.startsWith('blob:')) {
          // Keep the previous image alive long enough for the browser's decode
          // pipeline and direct-DOM swap to finish.
          setTimeout(() => URL.revokeObjectURL(previousObjectUrl), 1000)
        }
        if (!hasFirstFrame) {
          hasFirstFrame = true
          setBackendStreamReady(true)
          setBackendSnapshotError('')
        }
      },
    }).catch(error => {
      if (!cancelled && error?.name !== 'AbortError') {
        setBackendSnapshotError(error?.message || 'Không lấy được luồng camera proxy')
      }
    })

    return () => {
      cancelled = true
      abortController.abort()
      if (rtspRafIdRef.current) {
        cancelAnimationFrame(rtspRafIdRef.current)
        rtspRafIdRef.current = 0
      }
      snapshotInFlightRef.current = false
      const currentObjectUrl = rtspLatestFrameRef.current
      if (currentObjectUrl?.startsWith('blob:')) URL.revokeObjectURL(currentObjectUrl)
      rtspLatestFrameRef.current = ''
    }
  }, [activeCameraId, cameraRunning, cameraRuntimeMode])



  useEffect(() => {
    const container = previewContainerRef.current
    if (!container) return undefined

    const updateViewport = () => {
      setPreviewViewport({
        width: container.clientWidth || 0,
        height: container.clientHeight || 0,
      })
    }

    updateViewport()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewport)
      return () => {
        window.removeEventListener('resize', updateViewport)
      }
    }

    const observer = new ResizeObserver(updateViewport)
    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [browserCameraSelected])

  useEffect(() => {
    autoAttendanceStreakRef.current = { userId: null, count: 0 }
    processedFaceLockRef.current = null
    readyStreakRef.current = 0
    readyUserKeyRef.current = ''
    faceAbsentStreakRef.current = 0
  }, [cameraRunning, activeCameraId])

  useEffect(() => {
    if (detectTimerRef.current) {
      clearTimeout(detectTimerRef.current)
      detectTimerRef.current = null
    }

    detectInFlightRef.current = false

    if (!(cameraRunning && clientAttendanceCameraActive)) {
      setLiveDetections([])
      setLiveDetectionFrame({ width: 0, height: 0 })
      setLiveDetectionError('')
      autoAttendanceStreakRef.current = { userId: null, count: 0 }
      autoAttendanceInFlightRef.current = false
      processedFaceLockRef.current = null
      readyStreakRef.current = 0
      readyUserKeyRef.current = ''
      faceAbsentStreakRef.current = 0
      return undefined
    }

    let cancelled = false

    const scheduleNextScan = (delayMs) => {
      if (cancelled) return
      if (detectTimerRef.current) clearTimeout(detectTimerRef.current)
      detectTimerRef.current = setTimeout(detectRealtimeFaces, delayMs)
    }

    const detectRealtimeFaces = async () => {
      if (cancelled || detectInFlightRef.current || attendanceBusyRef.current) {
        scheduleNextScan(PRECHECK_IDLE_INTERVAL_MS)
        return
      }

      // Backend snapshots are rendered in an image element and sampled locally
      // only for the lightweight precheck; the camera socket remains backend-only.
      const video = cameraRuntimeMode === 'browser'
        ? videoRef.current
        : (rtspImgDomRef.current || imgRef.current)
      const detectCanvas = detectCanvasRef.current
      if (!video || !detectCanvas) {
        scheduleNextScan(PRECHECK_IDLE_INTERVAL_MS)
        return
      }

      const sourceWidth = cameraRuntimeMode === 'browser' ? video.videoWidth : video.naturalWidth
      const sourceHeight = cameraRuntimeMode === 'browser' ? video.videoHeight : video.naturalHeight
      if (!sourceWidth || !sourceHeight) {
        scheduleNextScan(PRECHECK_IDLE_INTERVAL_MS)
        return
      }
      if (cameraRuntimeMode === 'browser' && video.readyState < 2) {
        scheduleNextScan(PRECHECK_IDLE_INTERVAL_MS)
        return
      }
      if (cameraRuntimeMode === 'backend' && !video.complete) {
        scheduleNextScan(PRECHECK_IDLE_INTERVAL_MS)
        return
      }

      const now = Date.now()

      // ── TẦNG 1: LOCAL FACE LOCK (Chống spam khi người vừa chấm công còn đứng trước camera) ──
      const activeLock = processedFaceLockRef.current
      if (activeLock) {
        const lockAge = now - (activeLock.lockedAt || 0)
        // Trong 5 giây đầu sau khi ghi nhận thành công:
        // TUYỆT ĐỐI KHÔNG GỌI SERVER LẶP LẠI! Người này đang nghe loa và bước đi!
        if (lockAge < 5000) {
          scheduleNextScan(PRECHECK_LOCKED_DELAY_MS)
          return
        }
        // Quá 8 giây: Giải phóng lock
        if (lockAge > 8000) {
          processedFaceLockRef.current = null
          setActiveFaceLock(null)
        }
      }

      // ── TẦNG 2: VISUAL MOTION & SKIN TONE PHÂN TÍCH TRỰC TIẾP TẠI FE (< 0.1ms) ──
      // Clone cơ chế từ Android AttendanceBackgroundService.kt
      const motionAnalysis = analyzeVisualMotion(video)
      const isHumanLikely = motionAnalysis.isLikelyHumanPresent
      const timeSinceLastServerCall = now - lastServerDetectTimeRef.current

      // Nếu KHÔNG CÓ CHUYỂN ĐỘNG VÀ KHÔNG CÓ MÀU DA NGƯỜI (Phòng tĩnh hoàn toàn, không có người):
      if (!isHumanLikely) {
        consecutiveStaticFramesRef.current++
        faceAbsentStreakRef.current++
        readyStreakRef.current = 0
        readyUserKeyRef.current = ''

        // Nếu vắng mặt 2 nhịp: xóa overlay bounding boxes
        if (faceAbsentStreakRef.current >= 2) {
          setLiveDetections([])
          setLiveDetectionError('')
          if (activeLock) {
            processedFaceLockRef.current = null
            setActiveFaceLock(null)
          }
        }

        // BẢO VỆ MÁY CHỦ: Khi phòng tĩnh không có người, chỉ gửi 1 request thăm dò nhẹ mỗi 4.5 giây!
        // Giảm hơn 90% số lượng request vô ích so với trước đây!
        if (timeSinceLastServerCall < PRECHECK_STATIC_PROBE_MS) {
          scheduleNextScan(1000)
          return
        }
      } else {
        consecutiveStaticFramesRef.current = 0

        // Nếu CÓ CHUYỂN ĐỘNG MÔI TRƯỜNG nhưng nhiều nhịp liên tiếp KHÔNG THẤY MẶT NGƯỜI:
        // (ví dụ quạt trần quay, rèm cửa lay, bóng cây ngoài cửa sổ, người đi xa ngoài hành lang):
        // Giãn nhịp ra 2.5 giây/lần để máy chủ hoàn toàn êm ru, không bị băm dồn dập!
        if (consecutiveNoFaceStreakRef.current >= 2 && timeSinceLastServerCall < PRECHECK_AMBIENT_PROBE_MS) {
          scheduleNextScan(800)
          return
        }
      }

      // ── TẦNG 3: NÉN NHẸ ẢNH GỬI DETECT PRECHECK (320px, JPEG 60%) ──
      let nextInterval = PRECHECK_IDLE_INTERVAL_MS
      detectInFlightRef.current = true

      try {
        const targetWidth = Math.max(160, Math.min(sourceWidth, LIVE_DETECT_MAX_WIDTH))
        const scale = targetWidth / Math.max(1, sourceWidth)
        const targetHeight = Math.max(120, Math.round(sourceHeight * scale))

        if (detectCanvas.width !== targetWidth || detectCanvas.height !== targetHeight) {
          detectCanvas.width = targetWidth
          detectCanvas.height = targetHeight
          detectCtxRef.current = null // invalidate cached context on resize
        }

        if (!detectCtxRef.current) {
          detectCtxRef.current = detectCanvas.getContext('2d', { willReadFrequently: true })
        }
        const context = detectCtxRef.current
        if (!context) {
          detectInFlightRef.current = false
          scheduleNextScan(PRECHECK_IDLE_INTERVAL_MS)
          return
        }

        context.drawImage(video, 0, 0, targetWidth, targetHeight)

        const imageBase64 = await new Promise((resolve) => {
          detectCanvas.toBlob((blob) => {
            if (!blob) {
              resolve(detectCanvas.toDataURL('image/jpeg', 0.60))
              return
            }
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.onerror = () => resolve(detectCanvas.toDataURL('image/jpeg', 0.60))
            reader.readAsDataURL(blob)
          }, 'image/jpeg', 0.60)
        })

        // Fast FE entropy precheck (< 0.1ms): filters out blank wall/ceiling without calling server
        // Cloned directly from mobile FaceAttendancePanel.tsx line 829
        if (!isLikelyFaceFrame(imageBase64)) {
          faceAbsentStreakRef.current += 1
          readyStreakRef.current = 0
          readyUserKeyRef.current = ''
          detectInFlightRef.current = false
          if (faceAbsentStreakRef.current >= 2) {
            setLiveDetections([])
            setLiveDetectionError('')
          }
          scheduleNextScan(PRECHECK_STATIC_PROBE_MS)
          return
        }

        // Ghi nhận thời điểm gọi server
        lastServerDetectTimeRef.current = Date.now()

        // ── TẦNG 4: GỌI SERVER INSIGHTFACE SCRFD (Dò tìm siêu tốc ~15ms trên server) ──
        const rawRes = await api.attendanceDetectFrame({
          image_base64: imageBase64,
          max_faces: 3,
        })

        if (cancelled) return

        const res = normalizeFaceDetectionResponse(rawRes)

        const hasDetections = Boolean(
          res?.detected && (
            (Array.isArray(res?.detections) && res.detections.length > 0) ||
            res?.detection_bbox ||
            Number(res?.detected_count || 0) > 0 ||
            res?.detected_user
          )
        )

        // Không có khuôn mặt trong frame:
        if (!hasDetections) {
          consecutiveNoFaceStreakRef.current += 1
          faceAbsentStreakRef.current += 1
          readyStreakRef.current = 0
          readyUserKeyRef.current = ''

          if (faceAbsentStreakRef.current >= 2) {
            processedFaceLockRef.current = null
            setActiveFaceLock(null)
            autoLocalAttendanceInFlightKeysRef.current.clear()
            setLiveDetections([])
            setLiveDetectionError('')
          }
          detectInFlightRef.current = false
          scheduleNextScan(PRECHECK_AMBIENT_PROBE_MS)
          return
        }

        // CÓ KHUÔN MẶT HỢP LỆ! Reset streak không có mặt
        consecutiveNoFaceStreakRef.current = 0
        faceAbsentStreakRef.current = 0

        const detections = Array.isArray(res.detections) ? res.detections : []
        const fallbackBoxes = res.detection_bbox
          ? [{ bbox: res.detection_bbox, matched: res.matched, name: res.detected_user?.name }]
          : []
        setLiveDetections(detections.length > 0 ? detections : fallbackBoxes)
        setLiveDetectionFrame({
          width: Number(res.frame_width) || targetWidth,
          height: Number(res.frame_height) || targetHeight,
        })

        const detectedUser = res?.detected_user
        const detectedUserKey = String(detectedUser?.employee_id || detectedUser?.id || detectedUser?.user_id || '').trim()

        // Nếu là NGƯỜI THỨ 2 BƯỚC VÀO (khác với người vừa lock):
        if (activeLock?.userKey && detectedUserKey && activeLock.userKey !== detectedUserKey) {
          processedFaceLockRef.current = null
          setActiveFaceLock(null)
          autoLocalAttendanceInFlightKeysRef.current.clear()
        } else if (activeLock) {
          // Người cũ vẫn đứng trước camera: giữ lock, giãn nhịp 1.5s
          activeLock.lockedAt = Date.now()
          readyStreakRef.current = 0
          readyUserKeyRef.current = ''
          detectInFlightRef.current = false
          scheduleNextScan(PRECHECK_LOCKED_DELAY_MS)
          return
        }

        setLiveDetectionError('')

        // Nhịp quét khi có mặt người: quét nhanh 650ms để nhận diện mượt mà
        nextInterval = PRECHECK_FACE_ACTIVE_MS

        // Ready streak verification: require 2 consecutive ticks before auto-submitting
        if (res?.matched && detectedUser && detectedUserKey && !autoAttendanceInFlightRef.current) {
          if (readyUserKeyRef.current === detectedUserKey) {
            readyStreakRef.current += 1
          } else {
            readyUserKeyRef.current = detectedUserKey
            readyStreakRef.current = 1
          }

          if (readyStreakRef.current >= PRECHECK_READY_STREAK_REQUIRED) {
            if (!autoLocalAttendanceInFlightKeysRef.current.has(detectedUserKey)) {
              autoLocalAttendanceInFlightKeysRef.current.add(detectedUserKey)

              // Khóa mặt ngay lập tức trước khi gọi network để tránh gửi trùng lặp
              const empName = String(detectedUser?.name || 'nhân viên').trim()
              const lockObj = {
                userKey: detectedUserKey,
                name: empName,
                lockedAt: Date.now(),
              }
              processedFaceLockRef.current = lockObj
              setActiveFaceLock(lockObj)
              readyStreakRef.current = 0
              readyUserKeyRef.current = ''
              nextInterval = PRECHECK_LOCKED_DELAY_MS

              autoAttendanceInFlightRef.current = true

              captureBrowserAttendance('auto', {
                autoTriggered: true,
                detectedUserId: detectedUserKey,
              }).finally(() => {
                autoAttendanceInFlightRef.current = false
                autoLocalAttendanceInFlightKeysRef.current.delete(detectedUserKey)
              })
            }
          }
        } else {
          readyUserKeyRef.current = ''
          readyStreakRef.current = 0
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error)
          setLiveDetectionError('Không thể nhận diện realtime từ camera')
        }
      } finally {
        detectInFlightRef.current = false
        scheduleNextScan(nextInterval)
      }
    }

    scheduleNextScan(150)

    return () => {
      cancelled = true
      if (detectTimerRef.current) {
        clearTimeout(detectTimerRef.current)
        detectTimerRef.current = null
      }
      detectInFlightRef.current = false
    }
  }, [
    cameraRunning,
    cameraRuntimeMode,
    clientAttendanceCameraActive,
  ])

  useEffect(() => {
    if (!cameraRunning || cameraRuntimeMode !== 'browser') return

    const videoElement = videoRef.current
    const browserStream = browserStreamRef.current
    if (!videoElement || !browserStream) return

    let cancelled = false

    const bindPreview = async () => {
      try {
        await attachStreamToVideo(videoElement, browserStream)
      } catch (error) {
        if (cancelled) return
        console.error(error)
        window.alert(getCameraErrorMessage(error, requiresSecureContext))
        stopBrowserCameraStream()
        setCameraRunning(false)
        setCameraRuntimeMode(null)
        setActiveCameraId('')
      }
    }

    bindPreview()

    // Track browser camera FPS via requestVideoFrameCallback (high precision)
    let vfcId = null
    if (typeof videoElement.requestVideoFrameCallback === 'function') {
      const onVideoFrame = () => {
        if (cancelled) return
        const now = performance.now()
        const times = fpsFrameTimesRef.current
        times.push(now)
        while (times.length > 0 && now - times[0] > 2000) times.shift()
        vfcId = videoElement.requestVideoFrameCallback(onVideoFrame)
      }
      vfcId = videoElement.requestVideoFrameCallback(onVideoFrame)
    }

    return () => {
      cancelled = true
      if (vfcId != null && typeof videoElement.cancelVideoFrameCallback === 'function') {
        videoElement.cancelVideoFrameCallback(vfcId)
      }
    }
  }, [cameraRunning, cameraRuntimeMode, requiresSecureContext])

  // FPS counter display update (direct DOM, every 500ms)
  useEffect(() => {
    if (fpsDisplayTimerRef.current) {
      clearInterval(fpsDisplayTimerRef.current)
      fpsDisplayTimerRef.current = null
    }

    if (!cameraRunning) {
      fpsFrameTimesRef.current = []
      if (fpsCounterRef.current) fpsCounterRef.current.textContent = ''
      return undefined
    }

    fpsDisplayTimerRef.current = setInterval(() => {
      const el = fpsCounterRef.current
      if (!el) return
      const now = performance.now()
      const times = fpsFrameTimesRef.current
      // Purge old timestamps
      while (times.length > 0 && now - times[0] > 2000) times.shift()
      const fps = times.length > 1
        ? Math.round((times.length - 1) / ((now - times[0]) / 1000))
        : 0
      el.textContent = `${fps} FPS`
      // Color coding
      if (fps >= 24) {
        el.style.color = '#34d399'  // emerald-400
      } else if (fps >= 15) {
        el.style.color = '#fbbf24'  // amber-400
      } else {
        el.style.color = '#f87171'  // red-400
      }
    }, 500)

    return () => {
      if (fpsDisplayTimerRef.current) {
        clearInterval(fpsDisplayTimerRef.current)
        fpsDisplayTimerRef.current = null
      }
    }
  }, [cameraRunning])

  async function initializePage() {
    await Promise.all([
      checkCameraStatus(),
      loadCameras(),
      loadTodayRecords(),
    ])
  }

  function stopBrowserCameraStream() {
    if (browserStreamRef.current) {
      browserStreamRef.current.getTracks().forEach(track => track.stop())
      browserStreamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
  }

  async function checkCameraStatus() {
    try {
      const res = await api.cameraStatus()
      if (!res.success) return
      setCameraRunning(!!res.running)
      setCameraRuntimeMode(res.running ? 'backend' : null)
      setActiveCameraId(res.camera_id || '')
      if (res.camera_id) setSelectedCameraId(res.camera_id)
    } catch (error) {
      console.error(error)
    }
  }

  async function loadCameras() {
    try {
      const res = await api.getCameras()
      if (!res.success) return
      const list = withFixedBrowserCamera(res.cameras || [])
      setCameras(list)

      if (list.length === 0) {
        setSelectedCameraId('')
        return
      }

      setSelectedCameraId(currentId => {
        if (currentId && list.some(item => item.id === currentId)) return currentId
        return list.find(item => item.is_default)?.id || list[0].id
      })
    } catch (error) {
      console.error(error)
    }
  }

  async function loadTodayRecords() {
    try {
      const res = await api.getTodayAttendance()
      if (res.success) {
        const records = res.records || res.attendance || res.data?.records || res.data || []
        setTodayRecords(Array.isArray(records) ? records : [])
      }
    } catch (error) {
      console.error(error)
    }
  }



  async function loadBrowserDevices({ withPermission = false, preferredDeviceId = '' } = {}) {
    if (!browserCameraSupported || !navigator.mediaDevices?.enumerateDevices) {
      setBrowserDevices([])
      return []
    }

    setBrowserDevicesLoading(true)
    try {
      if (withPermission) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          stream.getTracks().forEach(track => track.stop())
        } catch {
          // Ignore permission errors here; actual start flow handles it with user-facing message.
        }
      }

      let allDevices = await navigator.mediaDevices.enumerateDevices()
      let videoInputs = allDevices.filter(item => item.kind === 'videoinput')

      if (withPermission && videoInputs.some(item => !(item.label || '').trim())) {
        allDevices = await navigator.mediaDevices.enumerateDevices()
        videoInputs = allDevices.filter(item => item.kind === 'videoinput')
      }

      const normalized = videoInputs.map((device, index) => ({
        id: device.deviceId,
        label: sanitizeDeviceLabel(device.label, index),
      }))

      setBrowserDevices(normalized)

      const preferred = (preferredDeviceId || selectedBrowserDeviceId || '').trim()
      if (preferred && normalized.some(item => item.id === preferred)) {
        setSelectedBrowserDeviceId(preferred)
      } else if (selectedBrowserDeviceId && !normalized.some(item => item.id === selectedBrowserDeviceId)) {
        setSelectedBrowserDeviceId('')
      }

      return normalized
    } catch (error) {
      console.error(error)
      return []
    } finally {
      setBrowserDevicesLoading(false)
    }
  }

  function handleBrowserDeviceChange(deviceId) {
    const normalized = (deviceId || '').trim()
    setSelectedBrowserDeviceId(normalized)
    if (selectedCamera?.id) {
      saveBrowserDeviceId(selectedCamera.id, normalized)
    }
  }

  async function handleStartBrowserCamera() {
    if (!selectedCamera) return
    if (!browserCameraSupported) {
      window.alert('Thiết bị hoặc trình duyệt hiện tại chưa hỗ trợ mở camera trực tiếp bằng getUserMedia.')
      return
    }

    setCameraLoading(true)
    setAttendanceFeedback(null)
    setLastCapturePreview(null)
    setLiveDetections([])
    setLiveDetectionFrame({ width: 0, height: 0 })
    setLiveDetectionError('')

    try {
      if (cameraRuntimeMode === 'backend') await api.stopCamera()

      stopBrowserCameraStream()

      await loadBrowserDevices({ withPermission: true })
      const preferredDeviceId = (selectedBrowserDeviceId || '').trim()

      const stream = await tryOpenBrowserCamera(buildBrowserConstraints(selectedCamera, preferredDeviceId))

      const track = stream.getVideoTracks()?.[0]
      if (!track || track.readyState !== 'live') {
        stream.getTracks().forEach(item => item.stop())
        const error = new Error('Không thể lấy luồng video trực tiếp từ camera')
        error.code = 'NO_VIDEO_FRAME'
        throw error
      }

      browserStreamRef.current = stream

      if (track && typeof track.applyConstraints === 'function') {
        try {
          await track.applyConstraints({ frameRate: { ideal: 30, max: 60 } })
        } catch {
          // ignore if hardware driver does not support dynamic constraint update
        }
      }

      const openedDeviceId = (track?.getSettings?.().deviceId || preferredDeviceId || '').trim()
      if (openedDeviceId && selectedCamera?.id) {
        setSelectedBrowserDeviceId(openedDeviceId)
        saveBrowserDeviceId(selectedCamera.id, openedDeviceId)
      }

      setCameraRunning(true)
      setCameraRuntimeMode('browser')
      setActiveCameraId(selectedCamera.id || '')
    } catch (error) {
      const message = getCameraErrorMessage(error, requiresSecureContext)
      window.alert(message)
    }

    setCameraLoading(false)
  }

  async function handleStartCamera() {
    if (!selectedCamera) {
      window.alert('Vui lòng chọn camera đã lưu trước khi bật.')
      return
    }

    if (browserCameraSelected) {
      await handleStartBrowserCamera()
      return
    }

    setCameraLoading(true)
    setAttendanceFeedback(null)
    setLastCapturePreview(null)
    setLiveDetections([])
    setLiveDetectionFrame({ width: 0, height: 0 })
    setLiveDetectionError('')
    try {
      stopBrowserCameraStream()
      const res = await api.startCamera(buildStartPayload(selectedCamera))
      if (res.success) {
        setCameraRunning(true)
        setCameraRuntimeMode('backend')
        setActiveCameraId(selectedCamera.id || res.camera_id || '')
      } else {
        window.alert(res.message || 'Không thể bật camera qua CovaVision API')
      }
    } catch (error) {
      window.alert(error?.message || 'Không thể kết nối backend')
    } finally {
      setCameraLoading(false)
    }
  }

  async function handleStopCamera() {
    setCameraLoading(true)
    try {
      if (cameraRuntimeMode === 'browser') {
        stopBrowserCameraStream()
      } else {
        await api.stopCamera()
      }
      resetVisualMotionDetector()
      lastServerDetectTimeRef.current = 0
      consecutiveStaticFramesRef.current = 0
      consecutiveNoFaceStreakRef.current = 0
      processedFaceLockRef.current = null
      setActiveFaceLock(null)
      setCameraRunning(false)
      setCameraRuntimeMode(null)
      setActiveCameraId('')
      setLastCapturePreview(null)
      setLiveDetections([])
      setLiveDetectionFrame({ width: 0, height: 0 })
      setLiveDetectionError('')
    } catch (error) {
      console.error(error)
    }
    setCameraLoading(false)
  }

  async function captureBrowserAttendance(_attendanceType = 'auto', options = {}) {
    const detectedUserId = String(options?.detectedUserId || '').trim()

    if (!cameraRunning || !clientAttendanceCameraActive) {
      window.alert('Hãy bật camera trước khi quét mặt.')
      return { success: false }
    }

    // Use direct DOM ref for RTSP mode for faster source access
    const source = cameraRuntimeMode === 'browser'
      ? videoRef.current
      : (rtspImgDomRef.current || imgRef.current)
    if (!source || !canvasRef.current) {
      window.alert('Camera chưa sẵn sàng để chụp.')
      return { success: false }
    }

    const sourceWidth = cameraRuntimeMode === 'browser' ? source.videoWidth : source.naturalWidth
    const sourceHeight = cameraRuntimeMode === 'browser' ? source.videoHeight : source.naturalHeight
    if (!sourceWidth || !sourceHeight || (cameraRuntimeMode === 'browser' && source.readyState < 2)) {
      window.alert('Luồng camera chưa sẵn sàng, vui lòng thử lại.')
      return { success: false }
    }

    const captureTargetWidth = Math.min(640, Math.max(320, sourceWidth))
    const captureScale = captureTargetWidth / Math.max(1, sourceWidth)
    const captureTargetHeight = Math.round(sourceHeight * captureScale)

    const canvas = canvasRef.current
    if (canvas.width !== captureTargetWidth || canvas.height !== captureTargetHeight) {
      canvas.width = captureTargetWidth
      canvas.height = captureTargetHeight
    }

    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(source, 0, 0, captureTargetWidth, captureTargetHeight)
    attendanceBusyRef.current = true
    setAttendanceBusy(true)

    if (!options?.autoTriggered) {
      setAttendanceFeedback(null)
      setLastCapturePreview(null)
    }

    try {
      // Use async toBlob for attendance capture too (non-blocking)
      const captureImageBase64 = await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(canvas.toDataURL('image/jpeg', 0.75))
            return
          }
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result)
          reader.onerror = () => resolve(canvas.toDataURL('image/jpeg', 0.75))
          reader.readAsDataURL(blob)
        }, 'image/jpeg', 0.75)
      })
      const payload = {
        image_base64: captureImageBase64,
        include_preview: true,
        camera_id: activeCameraId || selectedCameraId || undefined,
      }

      const res = await api.attendanceImageBase64(payload)
      const capturePreview = res?.preview_image_base64
        ? {
          imageBase64: res.preview_image_base64,
          bbox: Array.isArray(res.detection_bbox) ? res.detection_bbox : null,
          faceCount: Number.isFinite(Number(res.face_count)) ? Number(res.face_count) : null,
          frameWidth: Number(res.frame_width) || 0,
          frameHeight: Number(res.frame_height) || 0,
          matched: Boolean(res.matched),
          name: String(res?.user?.name || res?.detected_user?.name || '').trim(),
        }
        : null
      if (capturePreview) {
        setLastCapturePreview(capturePreview)
      }

      if (res.success) {
        const employeeName = String(res?.user?.name || '').trim()
        if (detectedUserId) {
          const lockObj = {
            userKey: detectedUserId,
            name: employeeName,
            lockedAt: Date.now(),
          }
          processedFaceLockRef.current = lockObj
          setActiveFaceLock(lockObj)
        }

        setAttendanceFeedback({
          type: 'success',
          message: employeeName
            ? `Đã ghi nhận quét mặt cho ${employeeName}`
            : 'Đã ghi nhận quét mặt',
          detail: cleanLocationDisplayText(res.location_text),
          user: res?.user || null,
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        })

        // Phát giọng nói tiếng Việt chào mừng nhân viên
        // Cơ chế loại trừ (Mutual Exclusivity):
        // - Nếu bật Loa Camera: phát qua củ loa của Camera RTSP ngoài, KHÔNG phát qua loa máy tính (PC)
        // - Nếu tắt Loa Camera: phát qua loa máy tính (PC) nếu tts_enabled !== 'false'
        const currentSpeakerConfig = loadCameraSpeakerConfig()
        if (currentSpeakerConfig.enabled) {
          let targetCam = cameras.find(c => c.id === currentSpeakerConfig.cameraId) || selectedCamera
          let speakerInfo = isCameraSpeakerAvailable(targetCam)
          if (!speakerInfo.available) {
            const rtspCam = cameras.find(c => isCameraSpeakerAvailable(c).available)
            if (rtspCam) {
              targetCam = rtspCam
              speakerInfo = isCameraSpeakerAvailable(rtspCam)
            }
          }

          const targetCameraId = currentSpeakerConfig.cameraId || speakerInfo.cameraId || targetCam?.id

          console.log(`[Attendance] 📢 Phát loa camera ngoài cho "${employeeName}" qua API`)
          speakAttendanceViaCamera(employeeName, 'auto', res?.is_late, {
            cameraId: targetCameraId,
            volume: currentSpeakerConfig.volume,
            profileId: currentSpeakerConfig.profileId,
          }).then((speakRes) => {
            console.log('[Attendance] Kết quả phát loa camera:', speakRes)
          }).catch((err) => {
            console.error('[Attendance] Lỗi phát loa camera:', err)
          })
        } else if (localStorage.getItem('covavision.tts_enabled') !== 'false') {
          console.log(`[Attendance] 💻 Phát loa máy tính (PC) cho "${employeeName}"`)
          speakAttendanceOutcome(employeeName, 'auto', res?.is_late)
        }

        await loadTodayRecords()
        return { success: true, response: res }
      } else {
        const failureMessage = res.message || 'Không thể ghi nhận quét mặt từ camera.'
        processedFaceLockRef.current = null
        setActiveFaceLock(null)
        readyUserKeyRef.current = ''
        readyStreakRef.current = 0

        setAttendanceFeedback({
          type: 'error',
          message: failureMessage,
          detail: cleanLocationDisplayText(res?.location_text),
        })
        return { success: false, response: res }
      }
    } catch (error) {
      processedFaceLockRef.current = null
      setActiveFaceLock(null)
      readyUserKeyRef.current = ''
      readyStreakRef.current = 0
      setAttendanceFeedback({
        type: 'error',
        message: error?.message || 'Không thể gửi ảnh quét mặt',
        detail: '',
      })
      return { success: false, error }
    } finally {
      attendanceBusyRef.current = false
      setAttendanceBusy(false)
    }
  }

  function handleVideoError() {
    if (!cameraRunning || !imgRef.current || cameraRuntimeMode !== 'backend') return
    setBackendSnapshot('')
    setBackendSnapshotError('Khung hình camera không hợp lệ, đang thử lại...')
  }



  const showActiveCameraWarning = cameraRunning && activeCameraId && selectedCameraId && activeCameraId !== selectedCameraId
  const previewMirror = !!selectedCamera?.camera_options?.preview_mirror
  const activeBrowserDeviceLabel = browserDevices.find(item => item.id === selectedBrowserDeviceId)?.label || ''
  const liveOverlayBoxes = useMemo(() => {
    if (!liveDetections.length) return []

    return liveDetections
      .map((detection, index) => {
        const rect = projectDetectionBoxToPreview(
          detection,
          liveDetectionFrame,
          previewViewport,
          previewMirror,
        )
        if (!rect) return null

        const name = detection?.matched && detection?.name && detection.name !== 'Unknown'
          ? detection.name
          : ''
        const label = name || 'Đang nhận diện'
        const stableId = name ? `user-${name}` : `face-${index}`

        return {
          id: stableId,
          rect,
          label,
          matched: Boolean(detection?.matched),
        }
      })
      .filter(Boolean)
  }, [liveDetections, liveDetectionFrame, previewViewport, previewMirror])

  const liveRecognizedNames = useMemo(() => {
    const names = []
    for (const detection of liveDetections) {
      if (!detection?.matched) continue
      const name = String(detection?.name || '').trim()
      if (!name || name === 'Unknown') continue
      if (!names.includes(name)) names.push(name)
    }
    return names
  }, [liveDetections])

  return (
    <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-4 lg:gap-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Bắt đầu quét khuôn mặt</h1>
            <p className="text-sm text-slate-500 mt-1">
              Nhận diện khuôn mặt tự động qua camera
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Nút Cài đặt Loa Camera / Loa PC */}
            <button
              type="button"
              onClick={() => setIsSpeakerModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-xs ${
                speakerConfig.enabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="Cài đặt phát loa câu chào: Loa Máy tính (PC) hoặc Loa ngoài Camera (RTSP)"
            >
              {speakerConfig.enabled ? (
                <Radio size={13} className="text-emerald-600 animate-pulse" />
              ) : (
                <Volume2 size={13} className="text-slate-500" />
              )}
              <span>
                {speakerConfig.enabled ? `Loa Camera (${speakerConfig.volume}%)` : 'Loa Máy tính'}
              </span>
            </button>

            <div className="flex items-center gap-2 text-sm font-medium">
              <span className={`w-2.5 h-2.5 rounded-full ${cameraRunning ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className={cameraRunning ? 'text-emerald-700' : 'text-slate-500'}>
                {cameraRunning
                  ? (cameraRuntimeMode === 'browser'
                    ? 'Camera trình duyệt đang chạy'
                    : 'Camera backend đang chạy')
                  : 'Camera đang tắt'}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <div
            ref={previewContainerRef}
            className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 ${
              browserCameraSelected
                ? 'aspect-[3/4] min-h-[420px] max-h-[78vh] sm:aspect-[4/5] sm:min-h-[520px] lg:aspect-video lg:min-h-0 lg:max-h-none'
                : 'aspect-video'
            }`}
          >
            {cameraRunning && cameraRuntimeMode === 'backend' ? (
              backendStreamReady ? (
                <img
                  ref={(node) => {
                    imgRef.current = node
                    rtspImgDomRef.current = node
                  }}
                  alt="Video feed"
                  className="w-full h-full object-cover"
                  style={{ willChange: 'contents' }}
                  onError={handleVideoError}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm bg-slate-900 text-center px-6">
                  {backendSnapshotError || 'Đang chờ khung hình từ camera...'}
                </div>
              )
            ) : cameraRunning && cameraRuntimeMode === 'browser' ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full ${browserCameraSelected ? 'object-contain' : 'object-cover'}`}
                style={{
                  transform: previewMirror ? 'scaleX(-1) translateZ(0)' : 'translateZ(0)',
                  willChange: 'transform',
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm bg-slate-900 text-center px-6">
                {browserCameraSelected
                  ? 'Bật camera để xem luồng từ webcam hoặc điện thoại ngay trên thiết bị hiện tại'
                  : 'Bật camera để xem luồng hình trực tiếp'}
              </div>
            )}

            {/* FPS Counter Badge — top-right corner */}
            {cameraRunning && (
              <div className="pointer-events-none absolute top-3 right-3 z-30">
                <div
                  className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10 shadow-md text-[11px] font-mono font-bold tabular-nums"
                  style={{ minWidth: '52px', textAlign: 'center' }}
                >
                  <span ref={fpsCounterRef} style={{ color: '#34d399' }}>-- FPS</span>
                </div>
              </div>
            )}

            {/* Floating Top Status Pill */}
            {cameraRunning && (
              <div className="pointer-events-none absolute top-3.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/85 backdrop-blur-md border border-white/10 shadow-lg text-xs text-white max-w-[90%]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  activeFaceLock
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    : liveDetections.length > 0
                    ? 'bg-cyan-400 animate-pulse'
                    : 'bg-slate-500'
                }`} />
                <span className="font-medium tracking-wide truncate">
                  {activeFaceLock
                    ? `Đã ghi nhận quét mặt cho ${activeFaceLock.name}`
                    : autoAttendanceInFlightRef.current
                    ? 'Đang ghi nhận lượt quét...'
                    : liveRecognizedNames.length > 0
                    ? `Đang nhận diện: ${liveRecognizedNames.join(', ')}`
                    : liveDetections.length > 0
                    ? 'Đang quét khuôn mặt...'
                    : 'Vui lòng đưa khuôn mặt vào khung hình'}
                </span>
              </div>
            )}

            {browserCameraSelected && cameraRunning && cameraRuntimeMode === 'browser' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className={`w-[70%] h-[72%] max-w-[360px] rounded-[36%] border-2 transition-colors duration-300 shadow-[0_0_0_9999px_rgba(2,6,23,0.25)] ${
                  activeFaceLock
                    ? 'border-emerald-400'
                    : liveDetections.length > 0
                    ? 'border-cyan-400/80'
                    : 'border-white/60'
                }`} />
              </div>
            )}

            {browserCameraSelected && cameraRunning && cameraRuntimeMode === 'browser' && liveOverlayBoxes.length > 0 && (
              <div className="pointer-events-none absolute inset-0">
                {liveOverlayBoxes.map(box => (
                  <div
                    key={box.id}
                    className={`absolute border-2 rounded-xl transition-all duration-150 ease-out ${
                      box.matched
                        ? 'border-emerald-400 bg-emerald-400/10 shadow-[0_0_15px_rgba(52,211,153,0.35)]'
                        : 'border-cyan-400/90 bg-cyan-400/10'
                    }`}
                    style={{
                      left: `${box.rect.left}px`,
                      top: `${box.rect.top}px`,
                      width: `${box.rect.width}px`,
                      height: `${box.rect.height}px`,
                      transitionProperty: 'left, top, width, height',
                      willChange: 'left, top, width, height',
                    }}
                  >
                    <span className={`absolute -top-6 left-0 px-2 py-0.5 rounded-md text-[11px] font-semibold text-white whitespace-nowrap shadow-sm transition-colors duration-150 ${
                      box.matched ? 'bg-emerald-500' : 'bg-cyan-600'
                    }`}>
                      {box.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Floating Completion Banner (Cloned from Mobile) */}
            {activeFaceLock && (
              <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-20 flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-900/92 backdrop-blur-lg border border-emerald-500/40 shadow-2xl transition-all duration-300">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 size={24} className="text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    Đã ghi nhận: <span className="text-emerald-300">{activeFaceLock.name}</span>
                  </p>
                  <p className="text-xs text-slate-300 truncate mt-0.5">
                    Vui lòng rời khỏi khung hình để tiếp tục lượt tiếp theo
                  </p>
                </div>
                <div className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-wider shrink-0 border border-emerald-500/30">
                  Hoàn tất
                </div>
              </div>
            )}
          </div>

          {clientAttendanceCameraActive && cameraRunning && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs sm:text-sm text-slate-700 space-y-2">
              <p className="text-slate-600">
                Mỗi lần nhận diện khuôn mặt hợp lệ sẽ tạo một bản ghi quét mặt độc lập trong cơ sở dữ liệu.
              </p>
              <p className="text-slate-500">
                Trạng thái: <span className="font-semibold text-slate-700">Đang quét và ghi nhận tự động.</span>
              </p>
            </div>
          )}

          {browserCameraSelected && (
            <p className="text-xs sm:text-sm text-slate-500">
              Khung preview trên điện thoại đã chuyển sang tỉ lệ dọc. Hãy giữ toàn bộ khuôn mặt nằm trong vùng bo tròn để tăng độ chính xác khi hệ thống tự nhận diện điểm danh.
            </p>
          )}

          {clientAttendanceCameraActive && cameraRunning && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-xs sm:text-sm text-slate-700 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 bg-emerald-100/90 px-2.5 py-0.5 rounded-lg text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    30 FPS Realtime
                  </span>
                  <span className="text-slate-600 font-medium">
                    Phát hiện: <strong className="text-slate-900">{liveDetections.length}</strong> khuôn mặt
                  </span>
                </div>
                {liveDetectionError && (
                  <span className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold shadow-xs ${
                    liveDetectionError.includes('Đã xử lý') || liveDetectionError.includes('Vui lòng')
                      ? 'bg-sky-100 text-sky-800 border border-sky-200'
                      : 'bg-red-100 text-red-700 border border-red-200'
                  }`}>
                    {liveDetectionError}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60 text-xs text-slate-500">
                <p>
                  {liveRecognizedNames.length > 0
                    ? `Đang nhận dạng: ${liveRecognizedNames.join(', ')}`
                    : 'Đang quét tự động (lọc khung rỗng <0.1ms, tự khóa 4s chống spam)'}
                </p>
                <span className="text-slate-400">
                  Xác nhận liên tiếp {PRECHECK_READY_STREAK_REQUIRED} nhịp
                </span>
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
          <canvas ref={detectCanvasRef} className="hidden" />

          <div className="grid sm:grid-cols-2 xl:grid-cols-[1fr_auto_auto] gap-3 items-center">
            <select
              value={selectedCameraId}
              onChange={event => setSelectedCameraId(event.target.value)}
              className="sm:col-span-2 xl:col-span-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
            >
              <option value="">-- Chọn camera --</option>
              {cameras.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name} {item.is_default ? '(Mặc định)' : ''}
                </option>
              ))}
            </select>

            {!cameraRunning ? (
              <button
                onClick={handleStartCamera}
                disabled={cameraLoading || !selectedCamera}
                className="w-full sm:w-auto px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {cameraLoading ? 'Đang bật...' : 'Bật camera'}
              </button>
            ) : (
              <button
                onClick={handleStopCamera}
                disabled={cameraLoading}
                className="w-full sm:w-auto px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors shadow-sm"
              >
                {cameraLoading ? 'Đang tắt...' : 'Tắt camera'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsSpeakerModalOpen(true)}
              className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-2 shadow-xs ${
                speakerConfig.enabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
              title="Cài đặt phát âm thanh câu chào qua Loa Camera ngoài hoặc Loa Máy tính"
            >
              {speakerConfig.enabled ? <Radio size={16} className="text-emerald-600" /> : <Volume2 size={16} />}
              <span>{speakerConfig.enabled ? `Loa Camera (${speakerConfig.volume}%)` : 'Cài đặt Loa'}</span>
            </button>

            <Link
              to={ROUTES.cameras}
              className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors text-center"
            >
              Quản lý camera
            </Link>
          </div>

          {browserCameraSelected && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-700 space-y-3">
              <p>
                Camera này hoạt động trực tiếp trên thiết bị đang mở trang điểm danh. Phù hợp cho webcam laptop hoặc camera điện thoại khi dùng webview.
              </p>
              {browserCameraSupported && (
                <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                  <select
                    value={selectedBrowserDeviceId}
                    onChange={event => handleBrowserDeviceChange(event.target.value)}
                    className="w-full px-3 py-2 border border-blue-200 rounded-xl text-sm bg-white text-slate-700"
                  >
                    <option value="">Tự chọn camera theo thiết bị</option>
                    {browserDevices.map(device => (
                      <option key={device.id} value={device.id}>{device.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => loadBrowserDevices({ withPermission: true })}
                    disabled={browserDevicesLoading}
                    className="px-3 py-2 rounded-xl bg-white border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-100 disabled:opacity-50"
                  >
                    {browserDevicesLoading ? 'Đang quét...' : 'Quét camera'}
                  </button>
                </div>
              )}
              {selectedBrowserDeviceId && (
                <p className="text-xs text-blue-800">
                  Đang ưu tiên camera cố định: {activeBrowserDeviceLabel || selectedBrowserDeviceId}
                </p>
              )}
              {!browserCameraSupported && !requiresSecureContext && (
                <p className="text-red-600">
                  Trình duyệt hoặc webview hiện tại chưa hỗ trợ mở camera trực tiếp bằng getUserMedia.
                </p>
              )}
              {requiresSecureContext && (
                <p className="text-amber-700">
                  Thiết bị đang mở bằng HTTP theo IP LAN. iPhone/WebView có thể chặn camera live; hãy bật HTTPS để mở camera trình duyệt.
                </p>
              )}
            </div>
          )}

          {selectedCamera ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="font-medium text-slate-700">{selectedCamera.name}</p>
                <button
                  type="button"
                  onClick={() => setIsSpeakerModalOpen(true)}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                    speakerConfig.enabled
                      ? 'bg-emerald-100/80 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                      : 'bg-slate-200/80 text-slate-700 border-slate-300 hover:bg-slate-300'
                  }`}
                >
                  {speakerConfig.enabled ? <Radio size={12} className="text-emerald-600" /> : <Volume2 size={12} />}
                  <span>{speakerConfig.enabled ? `Loa Camera (${speakerConfig.volume}%)` : 'Loa Máy tính'}</span>
                </button>
              </div>
              <p>{describeCamera(selectedCamera)}</p>
              {speakerConfig.enabled ? (
                <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                  <span>📢 Phát câu chào: <strong>Loa Camera</strong> ({speakerConfig.cameraName || 'Camera mạng'}) • Âm lượng {speakerConfig.volume}% [Loa PC đã câm]</span>
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  💻 Phát câu chào: <strong>Loa Máy tính (PC)</strong> [Loa Camera đã tắt]
                </p>
              )}
              {browserCameraSelected && (
                <p>
                  Hướng camera: {selectedCamera.camera_options?.facing_mode === 'environment'
                    ? 'Camera sau'
                    : selectedCamera.camera_options?.facing_mode === 'any'
                      ? 'Tự chọn theo thiết bị'
                      : 'Camera trước'}
                </p>
              )}
              {browserCameraSelected && selectedBrowserDeviceId && (
                <p>
                  Thiết bị cố định: {activeBrowserDeviceLabel || selectedBrowserDeviceId}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-400">
              Chưa có camera nào. Hãy thêm camera ở mục Quản lý Camera RTSP trước.
            </div>
          )}

          {showActiveCameraWarning && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Camera đang chạy là <strong>{activeCamera?.name || activeCameraId}</strong>. Nếu muốn đổi sang camera khác, hãy tắt camera hiện tại rồi bật lại.
            </div>
          )}

          {attendanceFeedback && (
            <div className={`rounded-xl px-4 py-3 text-sm border ${
              attendanceFeedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-600'
            }`}>
              <p className="font-medium">{attendanceFeedback.message}</p>
              {attendanceFeedback.detail && (
                <p className="mt-1 opacity-80">{cleanLocationDisplayText(attendanceFeedback.detail)}</p>
              )}
            </div>
          )}

          {lastCapturePreview?.imageBase64 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-sm font-medium text-slate-700">Ảnh nhận diện lần quét gần nhất (có bounding box)</p>
              <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg border border-slate-200 bg-black">
                <img
                  src={lastCapturePreview.imageBase64}
                  alt="Detection preview"
                  className="block max-h-56 max-w-full object-contain"
                />
                {getPreviewBoundingBoxStyle(lastCapturePreview) && (
                  <div className="pointer-events-none absolute inset-0">
                    <div
                      className={`absolute rounded-md border-2 ${lastCapturePreview.matched ? 'border-emerald-400 bg-emerald-400/10' : 'border-cyan-400 bg-cyan-400/10'}`}
                      style={getPreviewBoundingBoxStyle(lastCapturePreview)}
                    >
                      <span className={`absolute -top-6 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${lastCapturePreview.matched ? 'bg-emerald-500' : 'bg-cyan-600'}`}>
                        {lastCapturePreview.name || 'Khuôn mặt'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="text-xs text-slate-500 flex items-center justify-between gap-2">
                <span>Bounding box hiển thị trên ảnh vừa gửi nhận diện gần nhất.</span>
                {Number.isFinite(lastCapturePreview.faceCount) && (
                  <span>Faces: {lastCapturePreview.faceCount}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">


        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">Lượt quét hôm nay</h2>
          </div>

          <div className="divide-y divide-slate-100">
            {todayRecords.length === 0 ? (
              <div className="px-5 py-10 text-center text-slate-400 text-sm">
                Chưa có bản ghi quét mặt hôm nay
              </div>
            ) : (
              todayRecords.map((record, index) => (
                <div key={`${record.id || record.employee_id}-${record.captured_at || record.time || index}`} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-800">{record.employee_name || record.name || record.employee_id || 'Không xác định'}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {record.employee_id} · {record.department || 'Chưa có phòng ban'}
                    </p>
                    {record.location_text && (
                      <p className="text-xs text-slate-400 mt-1">Vị trí: {cleanLocationDisplayText(record.location_text)}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                      {record.status || 'Đã ghi nhận'}
                    </span>
                    <p className="text-sm text-slate-500 mt-2">{record.captured_at ? new Date(record.captured_at).toLocaleTimeString('vi-VN') : (record.time || '--:--:--')}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal Cài đặt Loa Camera / Loa PC */}
      <CameraSpeakerSettingsModal
        isOpen={isSpeakerModalOpen}
        onClose={() => setIsSpeakerModalOpen(false)}
        selectedCamera={selectedCamera}
        cameras={cameras}
      />
    </div>
  )
}
