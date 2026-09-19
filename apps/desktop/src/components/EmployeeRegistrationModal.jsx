import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, RefreshCw, Upload, User, X } from 'lucide-react'
import { api } from '../services/api'
import { openBackendMjpegStream } from '../services/backendMjpegStream'
import { useToast } from './Toast'

function isBrowserCameraType(cameraType) {
  return cameraType === 'browser' || cameraType === 'mobile'
}

function buildBrowserConstraints(camera) {
  const options = camera?.camera_options || {}
  const facingMode = options.facing_mode || 'user'
  const deviceId = String(options.browser_device_id || '').trim()
  const baseVideo = {
    width: { ideal: Number(options.frame_width) || 1280, max: 1920 },
    height: { ideal: Number(options.frame_height) || 720, max: 1080 },
    frameRate: { ideal: Number(options.target_fps) || 30, max: 60 },
  }

  if (deviceId) {
    return {
      audio: false,
      video: { ...baseVideo, deviceId: { ideal: deviceId } },
    }
  }
  if (!facingMode || facingMode === 'any') {
    return { audio: false, video: baseVideo }
  }
  return { audio: false, video: { ...baseVideo, facingMode: { ideal: facingMode } } }
}

export default function EmployeeRegistrationModal({
  open,
  initialEmployee = null,
  onClose,
  onSuccess,
}) {
  const { toast } = useToast()
  const videoRef = useRef(null)
  const imageRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const backendAbortRef = useRef(null)
  const backendFrameUrlRef = useRef('')
  const runtimeModeRef = useRef(null)
  const activeCameraIdRef = useRef('')
  const fileInputRef = useRef(null)

  const [employeeId, setEmployeeId] = useState('')
  const [name, setName] = useState('')
  const [department, setDepartment] = useState('')
  const [position, setPosition] = useState('')
  const [capturedBase64, setCapturedBase64] = useState('')
  const [cameras, setCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [runtimeMode, setRuntimeMode] = useState(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cameraError, setCameraError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!open) {
      void stopCamera()
      setCapturedBase64('')
      setCameraError('')
      return undefined
    }

    setEmployeeId(initialEmployee?.employee_id || initialEmployee?.id || '')
    setName(initialEmployee?.name || initialEmployee?.employee_name || '')
    setDepartment(initialEmployee?.department || '')
    setPosition(initialEmployee?.position || '')
    setCapturedBase64(initialEmployee?.image_base64 || '')

    async function initializeCamera() {
      try {
        const response = await api.getCameras()
        const available = Array.isArray(response?.cameras) ? response.cameras : []
        if (cancelled) return
        setCameras(available)
        const preferred = initialEmployee?.camera_id || available.find(item => item.is_default)?.id || available[0]?.id || ''
        setSelectedCameraId(preferred)
        if (!preferred) {
          setCameraError('Chưa có camera trong bảng cấu hình. Hãy thêm camera trước khi đăng ký khuôn mặt.')
          return
        }
        await startCamera(available.find(item => item.id === preferred))
      } catch (error) {
        if (!cancelled) setCameraError(error?.message || 'Không tải được danh sách camera từ backend.')
      }
    }

    void initializeCamera()
    return () => {
      cancelled = true
      void stopCamera()
    }
  }, [open, initialEmployee])

  async function stopCamera() {
    const mode = runtimeModeRef.current
    const cameraId = activeCameraIdRef.current
    backendAbortRef.current?.abort()
    backendAbortRef.current = null
    if (backendFrameUrlRef.current) {
      URL.revokeObjectURL(backendFrameUrlRef.current)
      backendFrameUrlRef.current = ''
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    runtimeModeRef.current = null
    activeCameraIdRef.current = ''
    setRuntimeMode(null)
    setCameraActive(false)
    if (mode === 'backend' && cameraId) {
      try {
        await api.stopCamera(cameraId)
      } catch {
        // The camera may already have been stopped by another page.
      }
    }
  }

  async function startCamera(camera) {
    setCameraError('')
    try {
      await stopCamera()
      if (!camera?.id) throw new Error('Camera chưa có mã cấu hình.')
      activeCameraIdRef.current = camera.id

      if (isBrowserCameraType(camera.camera_type)) {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Thiết bị hiện tại không hỗ trợ camera trình duyệt.')
        const stream = await navigator.mediaDevices.getUserMedia(buildBrowserConstraints(camera))
        streamRef.current = stream
        runtimeModeRef.current = 'browser'
        setRuntimeMode('browser')
        setCameraActive(true)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        return
      }

      const startResponse = await api.startCamera({ camera_id: camera.id })
      if (!startResponse?.success) throw new Error(startResponse?.message || 'Không thể bật camera qua backend.')
      const controller = new AbortController()
      backendAbortRef.current = controller
      runtimeModeRef.current = 'backend'
      setRuntimeMode('backend')
      setCameraActive(true)

      void openBackendMjpegStream(camera.id, {
        signal: controller.signal,
        onFrame: async jpegBytes => {
          if (controller.signal.aborted) return
          const nextUrl = URL.createObjectURL(new Blob([jpegBytes], { type: 'image/jpeg' }))
          const previousUrl = backendFrameUrlRef.current
          backendFrameUrlRef.current = nextUrl
          if (imageRef.current) imageRef.current.src = nextUrl
          if (previousUrl) setTimeout(() => URL.revokeObjectURL(previousUrl), 1000)
        },
      }).catch(error => {
        if (!controller.signal.aborted) {
          setCameraError(error?.message || 'Không lấy được luồng camera từ backend.')
          setCameraActive(false)
        }
      })
    } catch (err) {
      activeCameraIdRef.current = ''
      runtimeModeRef.current = null
      setRuntimeMode(null)
      setCameraError(err?.message || 'Không thể mở camera. Vui lòng kiểm tra camera đã cấu hình.')
      setCameraActive(false)
    }
  }

  function handleCameraChange(event) {
    const nextId = event.target.value
    const nextCamera = cameras.find(item => item.id === nextId)
    setSelectedCameraId(nextId)
    if (nextCamera) void startCamera(nextCamera)
  }

  function handleCaptureFromWebcam() {
    const source = runtimeMode === 'browser' ? videoRef.current : imageRef.current
    if (!source || !canvasRef.current) return
    if (runtimeMode === 'browser' && (!source.videoWidth || !source.videoHeight || source.readyState < 2)) {
      toast.error('Luồng camera chưa có khung hình. Vui lòng đợi camera lên hình rồi thử lại.')
      return
    }
    if (runtimeMode === 'backend' && (!source.complete || !source.naturalWidth || !source.naturalHeight)) {
      toast.error('Proxy camera chưa có khung hình. Vui lòng đợi camera lên hình rồi thử lại.')
      return
    }
    const canvas = canvasRef.current
    canvas.width = runtimeMode === 'browser' ? source.videoWidth : source.naturalWidth
    canvas.height = runtimeMode === 'browser' ? source.videoHeight : source.naturalHeight
    if (!canvas.width || !canvas.height) return
    const ctx = canvas.getContext('2d')

    // Draw video frame
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    const base64 = canvas.toDataURL('image/jpeg', 0.92)
    setCapturedBase64(base64)
  }

  function handleFileUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn định dạng file ảnh hợp lệ (JPG, PNG).')
      return
    }

    const reader = new FileReader()
    reader.onload = e => {
      setCapturedBase64(e.target?.result || '')
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const normId = employeeId.trim()
    const normName = name.trim()

    if (!normId || !normName) {
      toast.error('Vui lòng nhập đầy đủ mã nhân viên và họ tên.')
      return
    }

    if (!capturedBase64) {
      toast.error('Vui lòng chụp ảnh khuôn mặt hoặc tải file ảnh lên.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        employee_id: normId,
        name: normName,
        department: department.trim(),
        position: position.trim(),
        image_base64: capturedBase64,
        camera_id: selectedCameraId || undefined,
      }

      const isExisting = Boolean(initialEmployee?.registered)
      let res = isExisting
        ? await api.updateFaceBase64({ ...payload, replace_all: true })
        : await api.registerBase64(payload)

      if (!res?.success && isExisting) {
        // Fallback to register if not found
        res = await api.registerBase64(payload)
      }

      if (res?.success) {
        toast.success(res?.message || `Đã đăng ký khuôn mặt thành công cho ${normName}!`)
        if (onSuccess) onSuccess(res)
        onClose()
      } else {
        toast.error(res?.message || 'Đăng ký khuôn mặt thất bại. Vui lòng thử lại với góc chụp rõ hơn.')
      }
    } catch (err) {
      toast.error(err?.message || 'Có lỗi khi kết nối máy chủ AI.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl overflow-y-auto max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">COVAVISION BIOMETRIC AI</span>
            <h2 className="text-xl font-black text-slate-900">Đăng ký khuôn mặt nhân viên</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Employee Info inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Mã nhân viên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
                placeholder="VD: NV001"
                required
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-semibold focus:border-blue-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="VD: Nguyễn Văn A"
                required
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-semibold focus:border-blue-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Phòng ban</label>
              <input
                type="text"
                value={department}
                onChange={e => setDepartment(e.target.value)}
                placeholder="VD: Kỹ thuật"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm focus:border-blue-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Chức vụ</label>
              <input
                type="text"
                value={position}
                onChange={e => setPosition(e.target.value)}
                placeholder="VD: Nhân viên"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm focus:border-blue-600 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3.5 space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Camera đăng ký
            </label>
            <select
              value={selectedCameraId}
              onChange={handleCameraChange}
              disabled={!cameras.length}
              className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 disabled:opacity-60"
            >
              {!cameras.length && <option value="">Chưa có camera đã cấu hình</option>}
              {cameras.map(camera => (
                <option key={camera.id} value={camera.id}>
                  {camera.name} · {camera.camera_type === 'rtsp' ? 'RTSP backend' : 'Thiết bị'}
                </option>
              ))}
            </select>
            <p className="text-xs text-blue-700">
              {cameraActive
                ? `Đang dùng ${cameras.find(item => item.id === selectedCameraId)?.name || 'camera đã chọn'} (${runtimeMode === 'backend' ? 'proxy backend' : 'camera thiết bị'}).`
                : 'Chọn camera trong bảng cấu hình rồi bấm bật lại nếu cần.'}
            </p>
            {cameraActive && (
              <button
                type="button"
                onClick={() => void startCamera(cameras.find(item => item.id === selectedCameraId))}
                className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
              >
                Bật lại camera
              </button>
            )}
          </div>

          {/* Camera Capture or Upload */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Ảnh khuôn mặt nhận diện
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  <Upload size={13} />
                  <span>Chọn ảnh từ máy</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              {/* Webcam stream */}
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center border border-slate-200">
                {runtimeMode === 'backend' ? (
                  <img
                    ref={imageRef}
                    alt="Camera đăng ký khuôn mặt"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover scale-x-[-1]"
                    playsInline
                    muted
                    autoPlay
                  />
                )}
                <canvas ref={canvasRef} className="hidden" />

                {/* Face Oval Guide */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-[75%] w-[65%] rounded-[45%] border-2 border-dashed border-cyan-400/80 shadow-[0_0_15px_rgba(34,211,238,0.4)]" />
                </div>

                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex justify-center">
                  <button
                    type="button"
                    onClick={handleCaptureFromWebcam}
                    disabled={!cameraActive}
                    className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500 hover:bg-cyan-600 px-4 py-1.5 text-xs font-black text-slate-900 shadow-md transition-all active:scale-95"
                  >
                    <Camera size={14} />
                    <span>Chụp ảnh ngay</span>
                  </button>
                </div>
              </div>

              {/* Preview captured photo */}
              <div className="aspect-[4/3] rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-3 overflow-hidden text-center relative">
                {capturedBase64 ? (
                  <>
                    <img
                      src={capturedBase64}
                      alt="Captured Face"
                      className="h-full w-full object-contain rounded-xl"
                    />
                    <span className="absolute top-2 right-2 rounded-full bg-emerald-500 p-1 text-white shadow">
                      <CheckCircle2 size={15} />
                    </span>
                  </>
                ) : (
                  <div className="text-slate-400 space-y-1">
                    <User size={32} className="mx-auto text-slate-300" />
                    <p className="text-xs font-semibold text-slate-500">Chưa có ảnh chụp</p>
                    <p className="text-[11px] text-slate-400">Bấm "Chụp ảnh ngay" hoặc tải ảnh chân dung</p>
                  </div>
                )}
              </div>
            </div>

            {cameraError && (
              <p className="text-xs font-medium text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">
                {cameraError}
              </p>
            )}
          </div>

          {/* Footer submit */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>

            <button
              type="submit"
              disabled={submitting || !capturedBase64}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-800 transition-all disabled:opacity-50"
            >
              {submitting ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={15} />}
              <span>{submitting ? 'Đang trích xuất & lưu...' : 'Lưu khuôn mặt'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
