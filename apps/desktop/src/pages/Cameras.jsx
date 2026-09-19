import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  Cpu,
  Eye,
  Globe,
  HardDrive,
  Info,
  Laptop,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sliders,
  Smartphone,
  Trash2,
  Video,
  Wifi,
  X,
} from 'lucide-react'
import { api } from '../services/api'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input } from '../components/ui'

const DEFAULT_CAMERA_OPTIONS = {
  frame_width: 1280,
  frame_height: 720,
  target_fps: 30,
  buffer_size: 1,
  frame_drop_count: 1,
  low_latency: true,
  rtsp_transport: 'tcp',
  open_timeout_ms: 5000,
  read_timeout_ms: 5000,
  facing_mode: 'user',
  preview_mirror: true,
}

const DEFAULT_PROCESSING_OPTIONS = {
  fps_limit: 30,
  skip_ai_frames: 1,
  stream_jpeg_quality: 70,
  no_motion_delay: 2.0,
}

const CAMERA_TYPES = [
  {
    value: 'rtsp',
    label: 'Nguồn RTSP (IP Camera)',
    desc: 'Kết nối camera an ninh IP qua giao thức RTSP chuẩn',
    icon: Video,
  },
  {
    value: 'device',
    label: 'Thiết bị USB / Cục bộ',
    desc: 'Camera cắm trực tiếp vào máy tính qua cổng USB',
    icon: Laptop,
  },
  {
    value: 'browser',
    label: 'Webcam trình duyệt',
    desc: 'Sử dụng webcam tích hợp trên trình duyệt đang mở',
    icon: Globe,
  },
  {
    value: 'mobile',
    label: 'Camera điện thoại / Webview',
    desc: 'Dành cho thiết bị di động truy cập hệ thống điểm danh',
    icon: Smartphone,
  },
]

function isBrowserCameraType(cameraType) {
  return cameraType === 'browser' || cameraType === 'mobile'
}

function createEmptyCamera() {
  return {
    id: '',
    name: '',
    camera_type: 'rtsp',
    device_index: 0,
    rtsp_url: '',
    is_default: false,
    camera_options: { ...DEFAULT_CAMERA_OPTIONS },
    processing_options: { ...DEFAULT_PROCESSING_OPTIONS },
  }
}

function toCameraPayload(camera) {
  return {
    id: camera.id || undefined,
    name: (camera.name || 'Camera mới').trim(),
    camera_type: camera.camera_type || 'rtsp',
    device_index: Number(camera.device_index) || 0,
    rtsp_url: (camera.rtsp_url || '').trim(),
    enabled: true,
    is_default: !!camera.is_default,
    camera_options: {
      frame_width: Number(camera.camera_options.frame_width) || 1280,
      frame_height: Number(camera.camera_options.frame_height) || 720,
      target_fps: Number(camera.camera_options.target_fps) || 30,
      buffer_size: Number(camera.camera_options.buffer_size) || 1,
      frame_drop_count: Number(camera.camera_options.frame_drop_count) || 1,
      low_latency: !!camera.camera_options.low_latency,
      rtsp_transport: camera.camera_options.rtsp_transport || 'tcp',
      open_timeout_ms: Number(camera.camera_options.open_timeout_ms) || 5000,
      read_timeout_ms: Number(camera.camera_options.read_timeout_ms) || 5000,
      facing_mode: camera.camera_options.facing_mode || 'user',
      preview_mirror: !!camera.camera_options.preview_mirror,
    },
    processing_options: {
      fps_limit: Number(camera.processing_options.fps_limit) || 30,
      skip_ai_frames: Number(camera.processing_options.skip_ai_frames) || 1,
      stream_jpeg_quality: Number(camera.processing_options.stream_jpeg_quality) || 70,
      no_motion_delay: Number(camera.processing_options.no_motion_delay) || 2.0,
    },
  }
}

export default function Cameras() {
  const [cameras, setCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [cameraForm, setCameraForm] = useState(createEmptyCamera())
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [discoveryOpen, setDiscoveryOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [message, setMessage] = useState(null)
  const [search, setSearch] = useState('')
  const [activeSettingsTab, setActiveSettingsTab] = useState('general') // 'general' | 'stream' | 'advanced'

  const selectedCamera = useMemo(
    () => cameras.find((item) => item.id === selectedCameraId) || null,
    [cameras, selectedCameraId]
  )

  useEffect(() => {
    loadCameras()
  }, [])

  async function loadCameras(preferredId = '') {
    setLoading(true)
    try {
      const res = await api.getCameras()
      if (!res.success) return

      const list = res.cameras || []
      setCameras(list)

      if (list.length === 0) {
        setSelectedCameraId('')
        setCameraForm(createEmptyCamera())
        return
      }

      const targetId =
        preferredId ||
        selectedCameraId ||
        list.find((item) => item.is_default)?.id ||
        list[0].id
      applyCamera(list.find((item) => item.id === targetId) || list[0])
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: 'Không thể kết nối đến dịch vụ camera.' })
    } finally {
      setLoading(false)
    }
  }

  function applyCamera(camera) {
    if (!camera) {
      setSelectedCameraId('')
      setCameraForm(createEmptyCamera())
      return
    }

    setSelectedCameraId(camera.id)
    setCameraForm({
      id: camera.id || '',
      name: camera.name || '',
      camera_type: camera.camera_type || 'rtsp',
      device_index: Number(camera.device_index) || 0,
      rtsp_url: camera.rtsp_url || '',
      is_default: !!camera.is_default,
      camera_options: {
        ...DEFAULT_CAMERA_OPTIONS,
        ...(camera.camera_options || {}),
      },
      processing_options: {
        ...DEFAULT_PROCESSING_OPTIONS,
        ...(camera.processing_options || {}),
      },
    })
    setMessage(null)
  }

  function updateForm(patch) {
    setCameraForm((prev) => ({ ...prev, ...patch }))
  }

  function updateCameraOption(name, value) {
    setCameraForm((prev) => ({
      ...prev,
      camera_options: {
        ...prev.camera_options,
        [name]: value,
      },
    }))
  }

  function updateProcessingOption(name, value) {
    setCameraForm((prev) => ({
      ...prev,
      processing_options: {
        ...prev.processing_options,
        [name]: value,
      },
    }))
  }

  function handleCreateNew() {
    setSelectedCameraId('')
    setCameraForm(createEmptyCamera())
    setMessage(null)
  }

  function handleCameraTypeChange(nextType) {
    setCameraForm((prev) => ({
      ...prev,
      camera_type: nextType,
      device_index: nextType === 'device' ? prev.device_index : 0,
      rtsp_url: nextType === 'rtsp' ? prev.rtsp_url : '',
      camera_options: {
        ...prev.camera_options,
        facing_mode: isBrowserCameraType(nextType)
          ? prev.camera_options.facing_mode || 'user'
          : 'user',
        preview_mirror: isBrowserCameraType(nextType)
          ? !!prev.camera_options.preview_mirror
          : false,
      },
    }))
  }

  async function handleSave() {
    // VAL-02 Fix: Validate RTSP URL if camera_type is 'rtsp'
    if (!cameraForm.name.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng nhập tên cho camera.' })
      return
    }

    if (cameraForm.camera_type === 'rtsp' && !cameraForm.rtsp_url.trim()) {
      setMessage({
        type: 'error',
        text: 'Nguồn RTSP URL là bắt buộc khi chọn loại camera RTSP (ví dụ: rtsp://192.168.1.100:554/stream1).',
      })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      const res = await api.saveCamera(toCameraPayload(cameraForm))
      if (res.success) {
        const savedId = res.camera?.id || cameraForm.id
        setMessage({ type: 'success', text: `Đã lưu cấu hình camera "${cameraForm.name}".` })
        await loadCameras(savedId)
      } else {
        setMessage({ type: 'error', text: res.message || 'Không lưu được camera' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Lỗi máy chủ: Không thể lưu camera' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedCameraId) return
    setSaving(true)
    try {
      const res = await api.deleteCamera(selectedCameraId)
      if (res.success) {
        setDeleteDialogOpen(false)
        setMessage({ type: 'success', text: 'Đã xóa camera thành công.' })
        await loadCameras('')
      } else {
        setMessage({ type: 'error', text: res.message || 'Không xóa được camera' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Không thể xóa camera' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDiscoveredSave(discoveryForm) {
    setSaving(true)
    try {
      const freshCamera = createEmptyCamera()
      freshCamera.name = discoveryForm.name
      const res = await api.saveCamera({
        ...toCameraPayload(freshCamera),
        discovery_id: discoveryForm.id,
        username: discoveryForm.username,
        password: discoveryForm.password,
        stream_preset: discoveryForm.preset,
      })
      if (!res.success)
        throw new Error(res.message || 'Không lưu được camera đã phát hiện')
      setDiscoveryOpen(false)
      setMessage({ type: 'success', text: `Đã cấu hình camera ${discoveryForm.name} từ LAN!` })
      await loadCameras(res.camera?.id || '')
    } catch (error) {
      setMessage({
        type: 'error',
        text: error?.message || 'Không thể lưu camera đã phát hiện',
      })
    } finally {
      setSaving(false)
    }
  }

  const browserCameraSelected = isBrowserCameraType(cameraForm.camera_type)

  const filteredCameras = useMemo(() => {
    if (!search.trim()) return cameras
    return cameras.filter(
      (c) =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.camera_type?.toLowerCase().includes(search.toLowerCase())
    )
  }, [cameras, search])

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--cv-text-primary)] tracking-tight flex items-center gap-2.5">
            <Camera className="w-7 h-7 text-[var(--cv-brand-500)]" />
            Quản lý Camera
          </h1>
          <p className="text-sm text-[var(--cv-text-secondary)] mt-1">
            Cấu hình luồng RTSP, webcam cục bộ, và tối ưu hóa FPS nhận diện khuôn mặt.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="md"
            icon={Wifi}
            onClick={() => setDiscoveryOpen(true)}
          >
            Quét LAN
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={handleCreateNew}
          >
            Thêm camera
          </Button>
        </div>
      </div>

      {/* Alert banner */}
      {message && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-sm animate-in slide-in-from-top-2 duration-200 ${
            message.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
              : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {message.type === 'error' ? (
              <AlertCircle className="w-5 h-5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            )}
            <span className="font-medium">{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-xs font-bold underline cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Main Grid: Camera List & Configuration Editor */}
      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        {/* Left Column: Camera List */}
        <Card className="flex flex-col h-full max-h-[800px]">
          <div className="p-4 border-b border-[var(--cv-border-default)]">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cv-text-tertiary)]" />
              <input
                type="text"
                placeholder="Tìm camera..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="cv-input pl-9 text-xs"
              />
            </div>
          </div>

          <div className="divide-y divide-[var(--cv-border-default)] overflow-y-auto flex-1">
            {loading ? (
              <div className="p-8 text-center text-xs text-[var(--cv-text-tertiary)] flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-[var(--cv-brand-500)]" />
                <span>Đang tải danh sách camera...</span>
              </div>
            ) : filteredCameras.length === 0 ? (
              <EmptyState
                icon={Camera}
                title="Chưa có camera"
                description="Bấm 'Thêm camera' hoặc 'Quét LAN' để thêm nguồn thu."
                className="m-4 border-none bg-transparent"
              />
            ) : (
              filteredCameras.map((cam) => {
                const isSelected = selectedCameraId === cam.id
                const isRtsp = cam.camera_type === 'rtsp'
                const isBrowser = isBrowserCameraType(cam.camera_type)

                return (
                  <button
                    key={cam.id}
                    onClick={() => applyCamera(cam)}
                    className={`w-full text-left p-4 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[var(--cv-brand-50)] dark:bg-[var(--cv-brand-900)]/30 border-l-4 border-l-[var(--cv-brand-500)]'
                        : 'hover:bg-[var(--cv-bg-surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-[var(--cv-brand-500)] text-white shadow-xs'
                            : 'bg-[var(--cv-bg-surface-elevated)] border border-[var(--cv-border-default)] text-[var(--cv-text-secondary)]'
                        }`}
                      >
                        {isRtsp ? (
                          <Video className="w-5 h-5" />
                        ) : isBrowser ? (
                          <Globe className="w-5 h-5" />
                        ) : (
                          <Laptop className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-[var(--cv-text-primary)] truncate">
                          {cam.name}
                        </p>
                        <p className="text-xs text-[var(--cv-text-tertiary)] truncate mt-0.5">
                          {cam.camera_type?.toUpperCase() || 'RTSP'}{' '}
                          {cam.rtsp_url ? `· ${cam.rtsp_url}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {cam.is_default && (
                        <Badge variant="success" size="sm">
                          Mặc định
                        </Badge>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </Card>

        {/* Right Column: Camera Details & Settings Form */}
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[var(--cv-border-default)]">
            <div>
              <h2 className="text-lg font-black text-[var(--cv-text-primary)] flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[var(--cv-brand-500)]" />
                {selectedCameraId ? `Cấu hình: ${cameraForm.name}` : 'Thêm Camera mới'}
              </h2>
              <p className="text-xs text-[var(--cv-text-tertiary)] mt-1">
                Thiết lập thông số stream và độ phân giải phục vụ xử lý AI điểm danh.
              </p>
            </div>

            {selectedCameraId && (
              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                onClick={() => setDeleteDialogOpen(true)}
                disabled={saving || !!selectedCamera?.is_default}
              >
                Xóa camera
              </Button>
            )}
          </div>

          <div className="mt-6 space-y-6">
            {/* General Info */}
            <div className="space-y-4">
              <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-end">
                <Input
                  label="Tên nhận diện camera *"
                  value={cameraForm.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="Ví dụ: Camera Cổng Chính, Webcam Quầy Tiếp Tân"
                  required
                />
                <label className="inline-flex items-center gap-2.5 px-4 py-2.5 border border-[var(--cv-border-default)] bg-[var(--cv-bg-surface-elevated)] rounded-xl text-sm font-semibold text-[var(--cv-text-primary)] cursor-pointer hover:bg-[var(--cv-bg-surface-hover)]">
                  <input
                    type="checkbox"
                    checked={!!cameraForm.is_default}
                    onChange={(e) => updateForm({ is_default: e.target.checked })}
                    className="w-4 h-4 rounded text-[var(--cv-brand-500)] focus:ring-[var(--cv-brand-500)]"
                  />
                  <span>Đặt làm camera mặc định</span>
                </label>
              </div>

              {/* Camera Type Selector Cards */}
              <div>
                <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-2">
                  Loại nguồn camera *
                </label>
                <div className="grid sm:grid-cols-2 gap-3">
                  {CAMERA_TYPES.map((type) => {
                    const isTypeSelected = cameraForm.camera_type === type.value
                    const Icon = type.icon

                    return (
                      <div
                        key={type.value}
                        onClick={() => handleCameraTypeChange(type.value)}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                          isTypeSelected
                            ? 'border-[var(--cv-brand-500)] bg-[var(--cv-brand-50)]/40 dark:bg-[var(--cv-brand-950)]/30 ring-2 ring-[var(--cv-brand-500)]/20 shadow-xs'
                            : 'border-[var(--cv-border-default)] bg-[var(--cv-bg-surface)] hover:border-[var(--cv-brand-200)] hover:bg-[var(--cv-bg-surface-hover)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 mb-1">
                          <Icon
                            className={`w-4 h-4 ${
                              isTypeSelected
                                ? 'text-[var(--cv-brand-600)] dark:text-[var(--cv-brand-400)]'
                                : 'text-[var(--cv-text-tertiary)]'
                            }`}
                          />
                          <span
                            className={`text-sm font-bold ${
                              isTypeSelected
                                ? 'text-[var(--cv-brand-700)] dark:text-[var(--cv-brand-300)]'
                                : 'text-[var(--cv-text-primary)]'
                            }`}
                          >
                            {type.label}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--cv-text-tertiary)] leading-relaxed">
                          {type.desc}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Specific Camera Type Inputs */}
              {cameraForm.camera_type === 'rtsp' && (
                <div className="p-4 rounded-2xl border border-blue-200/80 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900/50 space-y-3 animate-in fade-in duration-200">
                  <Input
                    label="RTSP Stream URL (Bắt buộc) *"
                    value={cameraForm.rtsp_url}
                    onChange={(e) => updateForm({ rtsp_url: e.target.value })}
                    placeholder="rtsp://admin:password@192.168.1.50:554/Streaming/Channels/101"
                    icon={Radio}
                    required
                  />
                  <div className="grid sm:grid-cols-2 gap-3 items-center text-xs text-[var(--cv-text-secondary)]">
                    <div>
                      <label className="block font-semibold mb-1">Giao thức truyền (Transport)</label>
                      <select
                        value={cameraForm.camera_options.rtsp_transport}
                        onChange={(e) => updateCameraOption('rtsp_transport', e.target.value)}
                        className="cv-input text-xs"
                      >
                        <option value="tcp">TCP (Khuyên dùng - Ổn định)</option>
                        <option value="udp">UDP (Độ trễ thấp - Dễ mất frame)</option>
                      </select>
                    </div>
                    <label className="inline-flex items-center gap-2 pt-4 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!cameraForm.camera_options.low_latency}
                        onChange={(e) => updateCameraOption('low_latency', e.target.checked)}
                        className="w-4 h-4 rounded text-[var(--cv-brand-500)]"
                      />
                      <span className="font-semibold text-[var(--cv-text-primary)]">
                        Chế độ độ trễ cực thấp (Low-latency mode)
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {cameraForm.camera_type === 'device' && (
                <div className="p-4 rounded-2xl border border-[var(--cv-border-default)] bg-[var(--cv-bg-surface-elevated)] space-y-2 animate-in fade-in duration-200">
                  <Input
                    label="Chỉ số thiết bị (Device Index)"
                    type="number"
                    min="0"
                    value={cameraForm.device_index}
                    onChange={(e) => updateForm({ device_index: Number(e.target.value) || 0 })}
                    placeholder="0 cho webcam mặc định, 1 cho camera USB ngoài"
                    icon={HardDrive}
                  />
                  <p className="text-xs text-[var(--cv-text-tertiary)]">
                    Chỉ số 0 thường là camera tích hợp sẵn của máy tính (laptop).
                  </p>
                </div>
              )}

              {browserCameraSelected && (
                <div className="p-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/50 space-y-3 animate-in fade-in duration-200">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1">
                        Hướng camera
                      </label>
                      <select
                        value={cameraForm.camera_options.facing_mode}
                        onChange={(e) => updateCameraOption('facing_mode', e.target.value)}
                        className="cv-input text-xs"
                      >
                        <option value="user">Camera trước (Selfie)</option>
                        <option value="environment">Camera sau</option>
                        <option value="any">Tự động chọn</option>
                      </select>
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--cv-text-primary)]">
                        <input
                          type="checkbox"
                          checked={!!cameraForm.camera_options.preview_mirror}
                          onChange={(e) => updateCameraOption('preview_mirror', e.target.checked)}
                          className="w-4 h-4 rounded text-[var(--cv-brand-500)]"
                        />
                        Lật gương hiển thị (Mirror Preview)
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Performance & AI Streaming Settings */}
            <div className="p-5 rounded-2xl border border-[var(--cv-border-default)] bg-[var(--cv-bg-surface-elevated)] space-y-4">
              <div className="flex items-center gap-2 font-bold text-sm text-[var(--cv-text-primary)]">
                <Cpu className="w-4 h-4 text-[var(--cv-brand-500)]" />
                Tối ưu hóa luồng & Hiệu năng AI
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1">
                    FPS Camera
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={cameraForm.camera_options.target_fps}
                    onChange={(e) => updateCameraOption('target_fps', Number(e.target.value) || 30)}
                    className="cv-input text-xs"
                  />
                  <p className="text-[11px] text-[var(--cv-text-tertiary)] mt-1">Đề xuất: 25 - 30</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1">
                    Chất lượng JPEG Stream
                  </label>
                  <input
                    type="number"
                    min="40"
                    max="100"
                    value={cameraForm.processing_options.stream_jpeg_quality}
                    onChange={(e) => updateProcessingOption('stream_jpeg_quality', Number(e.target.value) || 70)}
                    className="cv-input text-xs"
                  />
                  <p className="text-[11px] text-[var(--cv-text-tertiary)] mt-1">40 - 100% (mặc định 70)</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1">
                    Bỏ qua frame AI
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={cameraForm.processing_options.skip_ai_frames}
                    onChange={(e) => updateProcessingOption('skip_ai_frames', Number(e.target.value) || 1)}
                    className="cv-input text-xs"
                  />
                  <p className="text-[11px] text-[var(--cv-text-tertiary)] mt-1">1 = chạy AI mỗi 2 frame</p>
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--cv-border-default)]">
              <Button
                variant="ghost"
                onClick={() => applyCamera(selectedCamera)}
                disabled={saving}
              >
                Đặt lại
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                loading={saving}
                icon={Check}
              >
                {selectedCameraId ? 'Lưu thay đổi' : 'Tạo camera'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* LAN Discovery Modal */}
      <LanDiscoveryModal
        open={discoveryOpen}
        saving={saving}
        onClose={() => setDiscoveryOpen(false)}
        onSave={handleDiscoveredSave}
      />

      {/* UX-05: Delete Camera Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        loading={saving}
        title="Xác nhận xóa Camera"
        message={`Bạn có chắc chắn muốn xóa camera "${selectedCamera?.name || selectedCameraId}"? Hành động này sẽ gỡ bỏ camera khỏi danh sách điểm danh.`}
        confirmText="Xóa camera"
        variant="danger"
      />
    </div>
  )
}

function LanDiscoveryModal({ open, saving, onClose, onSave }) {
  const [cameras, setCameras] = useState([])
  const [selected, setSelected] = useState(null)
  const [subnetBase, setSubnetBase] = useState('')
  const [deepScan, setDeepScan] = useState(false)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [preset, setPreset] = useState('main')
  const [name, setName] = useState('')
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (open) {
      setCameras([])
      setSelected(null)
      setMessage('')
      setName('')
      setPassword('')
      setPreset('main')
    }
  }, [open])

  async function scan() {
    setScanning(true)
    setMessage('Đang gửi ONVIF WS-Discovery vào mạng LAN...')
    try {
      const response = await api.discoverCameras({
        timeout_ms: 3500,
        subnet_base: subnetBase.trim() || undefined,
        enable_subnet_fallback: deepScan,
      })
      if (!response.success)
        throw new Error(response.message || 'Không quét được camera')
      const rows = Array.isArray(response.cameras) ? response.cameras : []
      setCameras(rows)
      setSelected(rows[0] || null)
      setName(rows[0]?.name || '')
      setMessage(response.message || `Đã tìm thấy ${rows.length} camera.`)
    } catch (error) {
      setMessage(error?.message || 'Không thể quét camera trong LAN.')
    } finally {
      setScanning(false)
    }
  }

  function choose(camera) {
    setSelected(camera)
    setName(camera.name || '')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-[var(--cv-bg-overlay)] backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--cv-bg-surface)] border border-[var(--cv-border-default)] rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[var(--cv-border-default)]">
          <div>
            <h2 className="text-lg font-bold text-[var(--cv-text-primary)] flex items-center gap-2">
              <Wifi className="w-5 h-5 text-[var(--cv-brand-500)]" />
              Quét Camera trong mạng LAN (ONVIF)
            </h2>
            <p className="text-xs text-[var(--cv-text-secondary)] mt-1">
              Tự động tìm kiếm IP Camera hỗ trợ giao thức ONVIF hoặc quét qua dải subnet.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--cv-text-tertiary)] hover:text-[var(--cv-text-primary)] p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <Input
              label="Dải Subnet (Tùy chọn)"
              value={subnetBase}
              onChange={(e) => setSubnetBase(e.target.value)}
              placeholder="Ví dụ: 192.168.1 hoặc 192.168.1.0/24"
            />
            <Button
              onClick={scan}
              loading={scanning}
              disabled={saving}
              variant="primary"
            >
              Quét nhanh
            </Button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--cv-text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={deepScan}
              onChange={(e) => setDeepScan(e.target.checked)}
              className="w-4 h-4 rounded text-[var(--cv-brand-500)]"
            />
            Quét bổ sung toàn bộ subnet /24 (mất nhiều thời gian hơn)
          </label>

          {message && (
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-3 py-2 text-xs font-medium border border-blue-200/50">
              {message}
            </div>
          )}

          {/* Scanned Results */}
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {cameras.map((camera) => (
              <button
                key={camera.id}
                onClick={() => choose(camera)}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  selected?.id === camera.id
                    ? 'border-[var(--cv-brand-500)] bg-[var(--cv-brand-50)]/40 dark:bg-[var(--cv-brand-950)]/40'
                    : 'border-[var(--cv-border-default)] hover:bg-[var(--cv-bg-surface-hover)]'
                }`}
              >
                <div className="flex justify-between items-center gap-2">
                  <span className="font-bold text-sm text-[var(--cv-text-primary)]">
                    {camera.name}
                  </span>
                  <Badge variant="primary" size="sm">
                    {camera.discovery_method === 'onvif' ? 'ONVIF' : 'Subnet'}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--cv-text-tertiary)] mt-1">
                  {camera.brand || 'Camera'} · {camera.model || 'IP Device'}
                </p>
              </button>
            ))}
            {!scanning && !cameras.length && (
              <p className="text-xs text-[var(--cv-text-tertiary)] text-center py-6">
                Chưa có kết quả. Bấm “Quét nhanh” để dò tìm camera trong mạng.
              </p>
            )}
          </div>

          {selected && (
            <div className="border-t border-[var(--cv-border-default)] pt-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--cv-text-tertiary)]">
                Xác thực & Kết nối camera
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <Input
                  label="Tên hiển thị"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tên camera"
                />
                <Input
                  label="Tài khoản camera"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username (admin)"
                />
                <Input
                  label="Mật khẩu camera"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password camera"
                />
                <div>
                  <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1.5">
                    Luồng stream
                  </label>
                  <select
                    value={preset}
                    onChange={(e) => setPreset(e.target.value)}
                    className="cv-input text-xs"
                  >
                    <option value="main">Luồng chính (Main Stream - Chất lượng cao)</option>
                    <option value="sub">Luồng phụ (Sub Stream - Nhẹ & mượt hơn)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <Button variant="ghost" onClick={onClose}>
                  Hủy
                </Button>
                <Button
                  onClick={() =>
                    onSave({
                      id: selected.id,
                      name: name.trim() || selected.name,
                      username,
                      password,
                      preset,
                    })
                  }
                  loading={saving}
                  disabled={!name.trim()}
                  variant="primary"
                >
                  Lưu camera
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
