export const FIXED_BROWSER_CAMERA_ID = 'fixed-browser-camera'
export const BROWSER_DEVICE_STORAGE_PREFIX = 'attendance-browser-device:'
export const PRECHECK_IDLE_INTERVAL_MS = 800
export const PRECHECK_STATIC_PROBE_MS = 4500
export const PRECHECK_AMBIENT_PROBE_MS = 2500
export const PRECHECK_FACE_ACTIVE_MS = 650
export const PRECHECK_LOCKED_DELAY_MS = 1500
export const PRECHECK_READY_STREAK_REQUIRED = 2
export const LIVE_DETECT_MAX_WIDTH = 320
export const LOCATION_COORDINATE_SUFFIX_PATTERN = /\s*\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?(?:\s*(?:±|\+\/-|[+\-])?\s*\d+(?:\.\d+)?m)?\s*\)\s*$/iu

export const FIXED_BROWSER_CAMERA = {
  id: FIXED_BROWSER_CAMERA_ID,
  name: 'Camera trình duyệt cố định',
  camera_type: 'browser',
  device_index: 0,
  is_default: false,
  camera_options: {
    frame_width: 1280,
    frame_height: 720,
    target_fps: 30,
    buffer_size: 2,
    frame_drop_count: 0,
    low_latency: true,
    facing_mode: 'user',
    preview_mirror: true,
    browser_device_id: '',
  },
  processing_options: {
    fps_limit: 30,
    skip_ai_frames: 1,
    stream_jpeg_quality: 70,
    no_motion_delay: 2.0,
  },
}

export function isBrowserCameraType(cameraType) {
  return cameraType === 'browser' || cameraType === 'mobile'
}

export function buildBrowserDeviceStorageKey(cameraId) {
  return `${BROWSER_DEVICE_STORAGE_PREFIX}${cameraId || FIXED_BROWSER_CAMERA_ID}`
}

export function readSavedBrowserDeviceId(cameraId) {
  const key = buildBrowserDeviceStorageKey(cameraId)
  return (localStorage.getItem(key) || '').trim()
}

export function saveBrowserDeviceId(cameraId, deviceId) {
  const key = buildBrowserDeviceStorageKey(cameraId)
  const normalized = (deviceId || '').trim()
  if (normalized) {
    localStorage.setItem(key, normalized)
    return
  }
  localStorage.removeItem(key)
}

export function withFixedBrowserCamera(list) {
  const source = Array.isArray(list) ? list : []
  const hasFixed = source.some((item) => item?.id === FIXED_BROWSER_CAMERA_ID)
  return hasFixed ? source : [FIXED_BROWSER_CAMERA, ...source]
}

export function buildStartPayload(camera) {
  return {
    camera_id: camera.id || undefined,
  }
}

export function buildBrowserConstraints(camera, browserDeviceId = '') {
  const cameraOptions = camera?.camera_options || {}
  const facingMode = cameraOptions.facing_mode || 'user'
  const fixedDeviceId = (browserDeviceId || '').trim()
  const targetFps = Math.max(30, Number(cameraOptions.target_fps) || 30)
  const idealWidth = Number(cameraOptions.frame_width) || 1280
  const idealHeight = Number(cameraOptions.frame_height) || 720

  const baseVideoProps = {
    width: { ideal: idealWidth, max: 1920 },
    height: { ideal: idealHeight, max: 1080 },
    frameRate: { ideal: targetFps, max: 60 },
  }

  const constraints = []

  if (fixedDeviceId) {
    constraints.push(
      {
        audio: false,
        video: {
          ...baseVideoProps,
          deviceId: { exact: fixedDeviceId },
        },
      },
      {
        audio: false,
        video: {
          ...baseVideoProps,
          deviceId: { ideal: fixedDeviceId },
        },
      },
      {
        audio: false,
        video: {
          deviceId: { exact: fixedDeviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: targetFps, max: 60 },
        },
      },
      {
        audio: false,
        video: {
          deviceId: { exact: fixedDeviceId },
          frameRate: { ideal: targetFps, max: 60 },
        },
      },
      {
        audio: false,
        video: {
          deviceId: { exact: fixedDeviceId },
        },
      }
    )
  }

  if (!facingMode || facingMode === 'any') {
    constraints.push(
      { audio: false, video: baseVideoProps },
      { audio: false, video: { ...baseVideoProps, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { audio: false, video: { frameRate: { ideal: 30, max: 60 } } },
      { audio: false, video: true }
    )
    return constraints
  }

  const fallbackMode = facingMode === 'environment' ? 'user' : 'environment'

  constraints.push(
    {
      audio: false,
      video: {
        ...baseVideoProps,
        facingMode: { ideal: facingMode },
      },
    },
    {
      audio: false,
      video: {
        ...baseVideoProps,
        facingMode,
      },
    },
    {
      audio: false,
      video: {
        ...baseVideoProps,
        facingMode: fallbackMode,
      },
    },
    {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        frameRate: { ideal: targetFps, max: 60 },
      },
    },
    { audio: false, video: { frameRate: { ideal: 30, max: 60 } } },
    { audio: false, video: true }
  )

  return constraints
}

export async function tryOpenBrowserCamera(constraintsList) {
  let lastError = null

  for (const constraints of constraintsList) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Không thể mở camera trình duyệt')
}

export function waitForVideoFrame(videoElement, timeoutMs = 7000) {
  if (!videoElement) {
    const error = new Error('Không tìm thấy vùng preview video')
    error.code = 'NO_VIDEO_FRAME'
    return Promise.reject(error)
  }

  if (videoElement.readyState >= 2 && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      if (settled) return
      settled = true
      clearTimeout(timeoutHandle)
      videoElement.removeEventListener('loadedmetadata', checkReady)
      videoElement.removeEventListener('loadeddata', checkReady)
      videoElement.removeEventListener('canplay', checkReady)
      videoElement.removeEventListener('playing', checkReady)
      videoElement.removeEventListener('resize', checkReady)
      videoElement.removeEventListener('error', handleVideoError)
    }

    const handleVideoError = () => {
      cleanup()
      const error = new Error('Không tải được luồng video từ camera')
      error.code = 'NO_VIDEO_FRAME'
      reject(error)
    }

    const checkReady = () => {
      if (videoElement.readyState >= 2 && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
        cleanup()
        resolve()
      }
    }

    const timeoutHandle = setTimeout(() => {
      cleanup()
      const error = new Error('Camera đã mở nhưng chưa nhận được khung hình')
      error.code = 'NO_VIDEO_FRAME'
      reject(error)
    }, timeoutMs)

    videoElement.addEventListener('loadedmetadata', checkReady)
    videoElement.addEventListener('loadeddata', checkReady)
    videoElement.addEventListener('canplay', checkReady)
    videoElement.addEventListener('playing', checkReady)
    videoElement.addEventListener('resize', checkReady)
    videoElement.addEventListener('error', handleVideoError)

    checkReady()
  })
}

export async function attachStreamToVideo(videoElement, stream) {
  if (!videoElement || !stream) {
    const error = new Error('Không thể gắn camera vào khung preview')
    error.code = 'NO_VIDEO_FRAME'
    throw error
  }

  videoElement.autoplay = true
  videoElement.muted = true
  videoElement.playsInline = true
  videoElement.setAttribute('autoplay', 'true')
  videoElement.setAttribute('muted', 'true')
  videoElement.setAttribute('playsinline', 'true')
  videoElement.setAttribute('webkit-playsinline', 'true')
  if ('disablePictureInPicture' in videoElement) {
    videoElement.disablePictureInPicture = true
  }

  if (videoElement.srcObject !== stream) {
    videoElement.srcObject = stream
  }

  try {
    await videoElement.play()
  } catch {
    // Safari can require metadata first before play succeeds.
  }

  await waitForVideoFrame(videoElement)

  if (videoElement.paused) {
    try {
      await videoElement.play()
    } catch {
      // Keep fallback silent; readiness check below will raise explicit error.
    }
  }

  if (!videoElement.videoWidth || !videoElement.videoHeight) {
    const error = new Error('Camera đã mở nhưng không có khung hình hiển thị')
    error.code = 'NO_VIDEO_FRAME'
    throw error
  }
}

export function getCameraErrorMessage(error, requiresSecureContext) {
  const name = error?.name || ''

  if (error?.code === 'NO_VIDEO_FRAME') {
    return 'Đã cấp quyền camera nhưng không nhận được khung hình. Hãy thử đổi camera trong danh sách hoặc bấm Bật camera lại.'
  }

  if (requiresSecureContext || name === 'SecurityError') {
    return 'Trình duyệt iPhone yêu cầu HTTPS (hoặc webview đã cấp quyền) để mở camera trực tiếp.'
  }

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera đang bị từ chối quyền truy cập. Hãy bật quyền Camera cho trình duyệt/webview rồi thử lại.'
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Không tìm thấy camera trên thiết bị.'
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.'
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'Thông số camera chưa phù hợp với thiết bị. Hãy đổi hướng camera hoặc thử lại.'
  }

  return error?.message || 'Không thể mở camera trình duyệt'
}

export function sanitizeDeviceLabel(label, index) {
  const normalized = (label || '').trim()
  if (normalized) return normalized
  return `Camera ${index + 1}`
}

export function describeCamera(camera) {
  if (!camera) return 'Chưa có cấu hình camera'

  switch (camera.camera_type) {
    case 'rtsp':
      return 'Nguồn RTSP'
    case 'device':
      return `Camera thiết bị #${camera.device_index || 0}`
    case 'browser':
      return 'Webcam trình duyệt'
    case 'mobile':
      return 'Camera điện thoại / webview'
    default:
      return camera.camera_type || 'Không rõ loại'
  }
}

export function cleanLocationDisplayText(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const head = (raw.split('|')[0] || '').trim()
  return (head || raw).replace(LOCATION_COORDINATE_SUFFIX_PATTERN, '').trim()
}

export function getPreviewBoundingBoxStyle(preview) {
  const bbox = Array.isArray(preview?.bbox) ? preview.bbox.map((value) => Number(value)) : []
  const frameWidth = Number(preview?.frameWidth)
  const frameHeight = Number(preview?.frameHeight)
  if (bbox.length < 4 || !bbox.every(Number.isFinite) || frameWidth <= 0 || frameHeight <= 0)
    return null

  const [rawX1, rawY1, rawX2, rawY2] = bbox
  const x1 = Math.max(0, Math.min(frameWidth, rawX1))
  const y1 = Math.max(0, Math.min(frameHeight, rawY1))
  const x2 = Math.max(x1, Math.min(frameWidth, rawX2))
  const y2 = Math.max(y1, Math.min(frameHeight, rawY2))
  if (x2 <= x1 || y2 <= y1) return null

  return {
    left: `${(x1 / frameWidth) * 100}%`,
    top: `${(y1 / frameHeight) * 100}%`,
    width: `${((x2 - x1) / frameWidth) * 100}%`,
    height: `${((y2 - y1) / frameHeight) * 100}%`,
  }
}

export function computeContainedVideoRect(containerWidth, containerHeight, frameWidth, frameHeight) {
  if (!containerWidth || !containerHeight || !frameWidth || !frameHeight) return null

  const containerAspect = containerWidth / containerHeight
  const frameAspect = frameWidth / frameHeight

  if (frameAspect > containerAspect) {
    const renderWidth = containerWidth
    const renderHeight = renderWidth / frameAspect
    return {
      renderWidth,
      renderHeight,
      offsetX: 0,
      offsetY: (containerHeight - renderHeight) / 2,
    }
  }

  const renderHeight = containerHeight
  const renderWidth = renderHeight * frameAspect
  return {
    renderWidth,
    renderHeight,
    offsetX: (containerWidth - renderWidth) / 2,
    offsetY: 0,
  }
}

export function projectDetectionBoxToPreview(detection, frameSize, containerSize, mirrored = false) {
  const bbox = Array.isArray(detection?.bbox) ? detection.bbox : null
  if (!bbox || bbox.length < 4) return null

  const frameWidth = Number(frameSize?.width) || 0
  const frameHeight = Number(frameSize?.height) || 0
  const containerWidth = Number(containerSize?.width) || 0
  const containerHeight = Number(containerSize?.height) || 0
  if (!frameWidth || !frameHeight || !containerWidth || !containerHeight) return null

  const fit = computeContainedVideoRect(containerWidth, containerHeight, frameWidth, frameHeight)
  if (!fit) return null

  let [x1, y1, x2, y2] = bbox.map((value) => Number(value) || 0)
  x1 = Math.max(0, Math.min(frameWidth - 1, x1))
  y1 = Math.max(0, Math.min(frameHeight - 1, y1))
  x2 = Math.max(x1 + 1, Math.min(frameWidth, x2))
  y2 = Math.max(y1 + 1, Math.min(frameHeight, y2))

  if (mirrored) {
    const mirroredX1 = frameWidth - x2
    const mirroredX2 = frameWidth - x1
    x1 = Math.max(0, mirroredX1)
    x2 = Math.min(frameWidth, mirroredX2)
  }

  const left = fit.offsetX + (x1 / frameWidth) * fit.renderWidth
  const top = fit.offsetY + (y1 / frameHeight) * fit.renderHeight
  const width = ((x2 - x1) / frameWidth) * fit.renderWidth
  const height = ((y2 - y1) / frameHeight) * fit.renderHeight

  if (width < 2 || height < 2) return null
  return { left, top, width, height }
}
