import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'

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
  stream_jpeg_quality: 85,
  no_motion_delay: 2.0,
}

const CAMERA_TYPE_OPTIONS = [
  { value: 'rtsp', label: 'RTSP' },
  { value: 'device', label: 'Thiết bị cục bộ' },
  { value: 'browser', label: 'Webcam trình duyệt' },
  { value: 'mobile', label: 'Camera điện thoại / webview' },
]

function isBrowserCameraType(cameraType) {
  return cameraType === 'browser' || cameraType === 'mobile'
}

function getCameraTypeLabel(camera) {
  if (!camera) return 'Chưa xác định'

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
      stream_jpeg_quality: Number(camera.processing_options.stream_jpeg_quality) || 85,
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

  const selectedCamera = useMemo(
    () => cameras.find(item => item.id === selectedCameraId) || null,
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

      const targetId = preferredId || selectedCameraId || list.find(item => item.is_default)?.id || list[0].id
      applyCamera(list.find(item => item.id === targetId) || list[0])
    } catch (error) {
      console.error(error)
    }
    setLoading(false)
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
      camera_options: { ...DEFAULT_CAMERA_OPTIONS, ...(camera.camera_options || {}) },
      processing_options: { ...DEFAULT_PROCESSING_OPTIONS, ...(camera.processing_options || {}) },
    })
  }

  function updateForm(patch) {
    setCameraForm(prev => ({ ...prev, ...patch }))
  }

  function updateCameraOption(name, value) {
    setCameraForm(prev => ({
      ...prev,
      camera_options: {
        ...prev.camera_options,
        [name]: value,
      },
    }))
  }

  function updateProcessingOption(name, value) {
    setCameraForm(prev => ({
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
  }

  function handleCameraTypeChange(nextType) {
    setCameraForm(prev => ({
      ...prev,
      camera_type: nextType,
      device_index: nextType === 'device' ? prev.device_index : 0,
      rtsp_url: nextType === 'rtsp' ? prev.rtsp_url : '',
      camera_options: {
        ...prev.camera_options,
        facing_mode: isBrowserCameraType(nextType) ? (prev.camera_options.facing_mode || 'user') : 'user',
        preview_mirror: isBrowserCameraType(nextType) ? !!prev.camera_options.preview_mirror : false,
      },
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await api.saveCamera(toCameraPayload(cameraForm))
      if (res.success) {
        const savedId = res.camera?.id || cameraForm.id
        await loadCameras(savedId)
      } else {
        window.alert(res.message || 'Không lưu được camera')
      }
    } catch {
      window.alert('Không thể lưu camera')
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selectedCameraId) return
    if (!window.confirm(`Xóa camera ${selectedCamera?.name || selectedCameraId}?`)) return

    setSaving(true)
    try {
      const res = await api.deleteCamera(selectedCameraId)
      if (res.success) {
        await loadCameras('')
      } else {
        window.alert(res.message || 'Không xóa được camera')
      }
    } catch {
      window.alert('Không thể xóa camera')
    }
    setSaving(false)
  }

  const browserCameraSelected = isBrowserCameraType(cameraForm.camera_type)

  return (
    <div className="grid xl:grid-cols-[0.9fr_1.1fr] gap-4 lg:gap-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Quản lý Camera RTSP</h1>
            <p className="text-sm text-slate-500 mt-1">
              Cấu hình và kiểm tra kết nối camera RTSP, camera nội bộ LAN.
            </p>
          </div>
          <button
            onClick={handleCreateNew}
            className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors shadow-sm"
          >
            Tạo mới
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="px-5 py-10 text-center text-slate-400 text-sm">Đang tải camera...</div>
          ) : cameras.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-400 text-sm">Chưa có camera nào</div>
          ) : (
            cameras.map(camera => (
              <button
                key={camera.id}
                onClick={() => applyCamera(camera)}
                className={`w-full text-left px-4 sm:px-5 py-4 transition-colors ${
                  selectedCameraId === camera.id ? 'bg-primary-50/70' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{camera.name}</p>
                    <p className="text-sm text-slate-500 mt-1 truncate">
                      {getCameraTypeLabel(camera)}
                    </p>
                  </div>
                  {camera.is_default && (
                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                      Mặc định
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-4 sm:p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            {selectedCameraId ? 'Chi tiết camera' : 'Tạo camera mới'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Camera lưu ở đây sẽ xuất hiện ở trang điểm danh.
          </p>
        </div>

        <div className="grid sm:grid-cols-[1fr_auto] gap-3">
          <input
            type="text"
            value={cameraForm.name}
            onChange={event => updateForm({ name: event.target.value })}
            placeholder="Tên camera"
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
          />
          <label className="inline-flex items-center justify-center sm:justify-start gap-2 px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!cameraForm.is_default}
              onChange={event => updateForm({ is_default: event.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            Đặt mặc định
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Loại camera</label>
            <select
              value={cameraForm.camera_type}
              onChange={event => handleCameraTypeChange(event.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
            >
              {CAMERA_TYPE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {cameraForm.camera_type === 'device' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Device index</label>
              <input
                type="number"
                min="0"
                value={cameraForm.device_index}
                onChange={event => updateForm({ device_index: Number(event.target.value) || 0 })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
              />
            </div>
          ) : cameraForm.camera_type === 'rtsp' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">RTSP URL</label>
              <input
                type="text"
                value={cameraForm.rtsp_url}
                onChange={event => updateForm({ rtsp_url: event.target.value })}
                placeholder="rtsp://..."
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-700">
              Camera loại này sẽ mở trực tiếp trên trình duyệt của thiết bị đang dùng, không cần RTSP hay device index.
            </div>
          )}
        </div>

        {browserCameraSelected ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-emerald-800">Thiết lập camera trình duyệt</h3>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Hướng camera</label>
                <select
                  value={cameraForm.camera_options.facing_mode}
                  onChange={event => updateCameraOption('facing_mode', event.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
                >
                  <option value="user">Camera trước</option>
                  <option value="environment">Camera sau</option>
                  <option value="any">Tự chọn theo thiết bị</option>
                </select>
              </div>

              <label className="inline-flex items-center gap-2 px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 bg-white self-end">
                <input
                  type="checkbox"
                  checked={!!cameraForm.camera_options.preview_mirror}
                  onChange={event => updateCameraOption('preview_mirror', event.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                Lật gương khi xem preview
              </label>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800">
              {cameraForm.camera_type === 'mobile'
                ? 'Loại camera này phù hợp khi mở hệ thống trên điện thoại hoặc webview di động để chụp khuôn mặt trực tiếp.'
                : 'Loại camera này phù hợp cho webcam sẵn có của laptop hoặc PC khi điểm danh trực tiếp trên trình duyệt.'}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-emerald-800">Tối ưu stream</h3>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">FPS camera</label>
                <input
                  type="number"
                  min="1"
                  value={cameraForm.camera_options.target_fps}
                  onChange={event => updateCameraOption('target_fps', Number(event.target.value) || 25)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">FPS stream</label>
                <input
                  type="number"
                  min="1"
                  value={cameraForm.processing_options.fps_limit}
                  onChange={event => updateProcessingOption('fps_limit', Number(event.target.value) || 25)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">JPEG quality</label>
                <input
                  type="number"
                  min="40"
                  max="100"
                  value={cameraForm.processing_options.stream_jpeg_quality}
                  onChange={event => updateProcessingOption('stream_jpeg_quality', Number(event.target.value) || 85)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Bỏ frame AI</label>
                <input
                  type="number"
                  min="0"
                  value={cameraForm.processing_options.skip_ai_frames}
                  onChange={event => updateProcessingOption('skip_ai_frames', Number(event.target.value) || 1)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Buffer size</label>
                <input
                  type="number"
                  min="1"
                  value={cameraForm.camera_options.buffer_size}
                  onChange={event => updateCameraOption('buffer_size', Number(event.target.value) || 1)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Drop frame</label>
                <input
                  type="number"
                  min="0"
                  value={cameraForm.camera_options.frame_drop_count}
                  onChange={event => updateCameraOption('frame_drop_count', Number(event.target.value) || 1)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>
            </div>

            {cameraForm.camera_type === 'rtsp' && (
              <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-center">
                <select
                  value={cameraForm.camera_options.rtsp_transport}
                  onChange={event => updateCameraOption('rtsp_transport', event.target.value)}
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
                >
                  <option value="tcp">Transport TCP</option>
                  <option value="udp">Transport UDP</option>
                </select>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!cameraForm.camera_options.low_latency}
                    onChange={event => updateCameraOption('low_latency', event.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  Low latency mode
                </label>
              </div>
            )}
          </div>
        )}

        <div className="grid sm:flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? 'Đang lưu...' : 'Lưu camera'}
          </button>

          <button
            onClick={handleDelete}
            disabled={saving || !selectedCameraId || !!selectedCamera?.is_default}
            className="w-full sm:w-auto px-5 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            Xóa camera
          </button>
        </div>
      </div>
    </div>
  )
}
