import React, { useState, useEffect } from 'react'
import Modal from './Modal'
import {
  Volume2,
  VolumeX,
  Radio,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  Info,
  Laptop,
  Check,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import {
  CAMERA_SPEAKER_PROFILES,
  DEFAULT_CAMERA_SPEAKER_CONFIG,
  loadCameraSpeakerConfig,
  saveCameraSpeakerConfig,
  testCameraSpeaker,
  isCameraSpeakerAvailable,
} from '../services/cameraSpeakerService'
import { speakAttendanceOutcome } from '../services/ttsService'

export default function CameraSpeakerSettingsModal({
  isOpen,
  onClose,
  selectedCamera = null,
  cameras = [],
}) {
  const [config, setConfig] = useState(loadCameraSpeakerConfig())
  const [activeTabSource, setActiveTabSource] = useState('pc') // 'pc' | 'camera'
  const [selectedRtspCameraId, setSelectedRtspCameraId] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Danh sách camera RTSP có thể phát loa trong hệ thống
  const detectedRtspCameras = (cameras || []).filter(cam => {
    const check = isCameraSpeakerAvailable(cam)
    return check.available
  })

  const availableRtspCameras = detectedRtspCameras

  // Khởi tạo state khi mở modal
  useEffect(() => {
    if (!isOpen) {
      setTestResult(null)
      setSaveSuccess(false)
      return
    }

    const currentConfig = loadCameraSpeakerConfig()
    setConfig(currentConfig)
    setActiveTabSource(currentConfig.enabled ? 'camera' : 'pc')

    // Xác định camera RTSP mục tiêu
    const currentCameraSpeaker = isCameraSpeakerAvailable(selectedCamera)
    if (currentCameraSpeaker.available) {
      setSelectedRtspCameraId(selectedCamera.id)
    } else if (currentConfig.cameraId && availableRtspCameras.some(c => c.id === currentConfig.cameraId)) {
      setSelectedRtspCameraId(currentConfig.cameraId)
    } else if (availableRtspCameras[0]) {
      setSelectedRtspCameraId(availableRtspCameras[0].id)
    }
  }, [isOpen, selectedCamera, cameras])

  if (!isOpen) return null

  // Camera RTSP đang được chọn để phát loa
  const targetRtspCamera = availableRtspCameras.find(c => c.id === selectedRtspCameraId) || availableRtspCameras[0]
  const targetSpeakerInfo = isCameraSpeakerAvailable(targetRtspCamera)

  // Xử lý chuyển đổi nguồn phát âm thanh (Mutual Exclusivity)
  const handleSelectSource = (source) => {
    setActiveTabSource(source)
    setTestResult(null)
  }

  // Khi người dùng chọn camera khác trong dropdown
  const handleCameraChange = (cameraId) => {
    setSelectedRtspCameraId(cameraId)
    const matched = availableRtspCameras.find(c => c.id === cameraId)
    if (matched) {
      setConfig(prev => ({
        ...prev,
        cameraId: matched.id,
        cameraName: matched.name,
      }))
    }
  }

  // Thay đổi Profile loa
  const handleProfileChange = (profileId) => {
    const profile = CAMERA_SPEAKER_PROFILES[profileId]
    if (!profile) return
    setConfig(prev => ({
      ...prev,
      profileId,
      rtspPort: profile.rtspPort || 554,
      trackId: profile.rtspTrackId === 'auto' ? 'auto' : profile.rtspTrackId,
    }))
  }

  // Phát thử âm thanh
  const handleTestAudio = async () => {
    setTestLoading(true)
    setTestResult(null)

    try {
      if (activeTabSource === 'pc') {
        // Phát loa PC
        speakAttendanceOutcome('Nguyễn Văn A', 'IN', false)
        setTestResult({
          success: true,
          message: 'Đã phát lời chào thử nghiệm qua loa máy tính (PC).',
        })
      } else {
        // Phát loa Camera
        const testPayload = {
          cameraId: targetRtspCamera?.id || config.cameraId,
          volume: config.volume,
          profileId: config.profileId,
          text: 'Xin chào bạn, kiểm tra phát loa camera thành công!',
        }

        const res = await testCameraSpeaker(testPayload)
        setTestResult(res)
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err?.message || 'Có lỗi xảy ra khi phát thử âm thanh',
      })
    } finally {
      setTestLoading(false)
    }
  }

  // Lưu cấu hình
  const handleSave = () => {
    const isCameraEnabled = activeTabSource === 'camera'

    const finalConfig = {
      ...config,
      enabled: isCameraEnabled,
      cameraId: targetRtspCamera?.id || config.cameraId || '',
      cameraName: targetRtspCamera?.name || config.cameraName || '',
    }

    saveCameraSpeakerConfig(finalConfig)
    setSaveSuccess(true)
    setTimeout(() => {
      onClose()
    }, 600)
  }

  return (
    <Modal
      title="Cài đặt Loa & Âm thanh Chấm công"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            {saveSuccess ? (
              <span className="text-emerald-600 font-semibold inline-flex items-center gap-1">
                <CheckCircle2 size={15} /> Đã lưu cài đặt thành công
              </span>
            ) : (
              <span>Áp dụng ngay cho các lượt chấm công tiếp theo</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors shadow-sm inline-flex items-center gap-1.5"
            >
              <Check size={16} />
              Lưu thiết lập
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 max-h-[72vh] overflow-y-auto pr-1">
        {/* Lựa chọn Nguồn phát (Loa PC vs Loa Camera) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Chọn Nguồn phát âm thanh chào mừng
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Card Loa PC */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectSource('pc')}
              className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                activeTabSource === 'pc'
                  ? 'border-primary-500 bg-primary-50/40 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                  <Laptop size={20} />
                </div>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  activeTabSource === 'pc'
                    ? 'bg-primary-600 text-white'
                    : 'border border-slate-300 text-transparent'
                }`}>
                  ✓
                </span>
              </div>
              <h4 className="mt-2.5 font-bold text-slate-800 text-sm">Loa Máy tính / Laptop</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Phát câu chào qua loa PC bằng giọng đọc AI tiếng Việt. Loa camera sẽ câm.
              </p>
            </div>

            {/* Card Loa Camera */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectSource('camera')}
              className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                activeTabSource === 'camera'
                  ? 'border-emerald-500 bg-emerald-50/40 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <Radio size={20} />
                </div>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  activeTabSource === 'camera'
                    ? 'bg-emerald-600 text-white'
                    : 'border border-slate-300 text-transparent'
                }`}>
                  ✓
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2.5">
                <h4 className="font-bold text-slate-800 text-sm">Loa ngoài của Camera</h4>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  RTSP
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Phát trực tiếp ra củ loa của camera ngoài (EZVIZ, Hikvision). Loa PC sẽ câm.
              </p>
            </div>
          </div>
        </div>

        {/* Cấu hình chi tiết khi chọn Loa ngoài của Camera */}
        {activeTabSource === 'camera' && (
          <div className="space-y-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/20 p-4">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
              <div className="flex items-center gap-2">
                <Radio className="text-emerald-600" size={18} />
                <span className="text-sm font-bold text-slate-800">Cấu hình kết nối Loa Camera</span>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Two-Way Audio 16kHz
              </span>
            </div>

            <div className="space-y-3">
              {/* Chọn camera RTSP phát loa */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Chọn Camera RTSP phát loa:
                </label>
                <select
                  value={selectedRtspCameraId}
                  onChange={e => handleCameraChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  {availableRtspCameras.map(cam => (
                    <option key={cam.id} value={cam.id}>
                      {cam.name || 'Camera mạng'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-600">
                Thông tin RTSP, tài khoản và mật khẩu được lưu ở API CovaVision. Desktop chỉ gửi mã camera,
                nên không hiển thị hoặc phát tán địa chỉ mạng nội bộ.
              </div>

              {/* Chọn Profile Camera */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Dòng Profile Loa Camera (Codec & RTSP Track):
                </label>
                <select
                  value={config.profileId || 'EZVIZ_H6C'}
                  onChange={e => handleProfileChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  {Object.values(CAMERA_SPEAKER_PROFILES).map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {CAMERA_SPEAKER_PROFILES[config.profileId]?.description || 'Cấu hình tiêu chuẩn cho camera có đàm thoại 2 chiều.'}
                </p>
              </div>

              {/* Chỉnh âm lượng loa ngoài */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                    <Sliders size={14} className="text-slate-500" />
                    Âm lượng loa ngoài của Camera:
                  </span>
                  <span className="text-xs font-bold text-emerald-700 px-2 py-0.5 rounded bg-emerald-100">
                    {config.volume}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={config.volume}
                  onChange={e => setConfig(prev => ({ ...prev, volume: Number(e.target.value) }))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <button type="button" onClick={() => setConfig(prev => ({ ...prev, volume: 25 }))} className="hover:text-emerald-700">25%</button>
                  <button type="button" onClick={() => setConfig(prev => ({ ...prev, volume: 50 }))} className="hover:text-emerald-700">50% (Khuyên dùng)</button>
                  <button type="button" onClick={() => setConfig(prev => ({ ...prev, volume: 75 }))} className="hover:text-emerald-700">75%</button>
                  <button type="button" onClick={() => setConfig(prev => ({ ...prev, volume: 100 }))} className="hover:text-emerald-700">100% (Tối đa)</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nút phát thử âm thanh */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Volume2 size={16} className="text-slate-600" />
              Kiểm tra âm thanh {activeTabSource === 'camera' ? 'Loa Camera' : 'Loa Máy tính'}
            </span>
            <button
              type="button"
              onClick={handleTestAudio}
              disabled={testLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50 transition-colors shadow-sm"
            >
              {testLoading ? (
                <>
                  <RotateCw size={13} className="animate-spin" />
                  <span>Đang phát thử...</span>
                </>
              ) : (
                <>
                  <Play size={13} fill="currentColor" />
                  <span>Phát thử câu chào</span>
                </>
              )}
            </button>
          </div>

          {testResult && (
            <div className={`p-2.5 rounded-lg text-xs border ${
              testResult.success
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              <div className="flex items-start gap-1.5">
                {testResult.success ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> : <AlertTriangle size={15} className="shrink-0 mt-0.5" />}
                <span>{testResult.message || (testResult.success ? 'Phát âm thanh thành công!' : 'Phát âm thanh thất bại.')}</span>
              </div>
            </div>
          )}
        </div>

        {/* Thông tin tính loại trừ */}
        <div className="flex items-start gap-2 text-xs text-slate-500 bg-blue-50/60 border border-blue-100 p-3 rounded-xl">
          <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Cơ chế đồng bộ âm thanh:</strong> Khi bật phát loa qua Camera, hệ thống sẽ chỉ phát lời chào tại củ loa ngoài của camera để nhân viên nghe rõ tại cửa vào, đồng thời tắt loa trên máy tính để tránh vọng âm.
          </p>
        </div>
      </div>
    </Modal>
  )
}
