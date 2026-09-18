import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Globe2,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Volume2,
  VolumeX,
  Sparkles,
  Radio,
  Settings2,
} from 'lucide-react'
import { api } from '../services/api'
import {
  DEFAULT_MODULE_VISIBILITY,
  MODULE_TOGGLE_DEFINITIONS,
  getModuleVisibility,
} from '../services/moduleSettings'
import {
  ATTENDANCE_MODE_OPTIONS,
  DEFAULT_ATTENDANCE_SETTINGS,
  getAttendanceSettings,
  toCooldownTotalSeconds,
} from '../services/attendanceSettings'
import {
  saveSystemSettingsToServer,
  syncSystemSettingsFromServer,
} from '../services/systemSettingsStore'
import MultiChannelSettings from '../components/MultiChannelSettings'
import { speakAttendanceOutcome, isTtsSupported } from '../services/ttsService'
import CameraSpeakerSettingsModal from '../components/CameraSpeakerSettingsModal'
import {
  loadCameraSpeakerConfig,
  saveCameraSpeakerConfig,
  testCameraSpeaker,
  CAMERA_SPEAKER_CONFIG_EVENT,
} from '../services/cameraSpeakerService'

function formatCooldownDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.trunc(Number(totalSeconds) || 0))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  const parts = []

  if (hours > 0) {
    parts.push(`${hours} giờ`)
  }
  if (minutes > 0) {
    parts.push(`${minutes} phút`)
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} giây`)
  }

  return parts.join(' ')
}

export default function SystemSettings() {
  const [moduleVisibility, setModuleVisibility] = useState(() => getModuleVisibility())
  const [attendanceSettings, setAttendanceSettings] = useState(() => getAttendanceSettings())
  const [settingsSavedSnapshot, setSettingsSavedSnapshot] = useState(() => ({
    module_visibility: getModuleVisibility(),
    attendance_settings: getAttendanceSettings(),
  }))
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsStatusText, setSettingsStatusText] = useState('')
  const [settingsStatusType, setSettingsStatusType] = useState('info')
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    return localStorage.getItem('facecheck.tts_enabled') !== 'false'
  })
  const [isSpeakerModalOpen, setIsSpeakerModalOpen] = useState(false)
  const [speakerConfig, setSpeakerConfig] = useState(() => loadCameraSpeakerConfig())
  const [cameras, setCameras] = useState([])
  const [testSpeakerLoading, setTestSpeakerLoading] = useState(false)
  const [testSpeakerFeedback, setTestSpeakerFeedback] = useState('')

  useEffect(() => {
    const handleSpeakerConfigChange = () => {
      setSpeakerConfig(loadCameraSpeakerConfig())
    }
    window.addEventListener(CAMERA_SPEAKER_CONFIG_EVENT, handleSpeakerConfigChange)
    return () => window.removeEventListener(CAMERA_SPEAKER_CONFIG_EVENT, handleSpeakerConfigChange)
  }, [])
  const enabledCount = useMemo(
    () => MODULE_TOGGLE_DEFINITIONS.filter(moduleDef => moduleVisibility[moduleDef.key] !== false).length,
    [moduleVisibility],
  )

  const attendanceCooldownSeconds = useMemo(
    () => toCooldownTotalSeconds(attendanceSettings),
    [attendanceSettings],
  )

  const settingsDirty = useMemo(() => {
    const savedModuleVisibility = settingsSavedSnapshot.module_visibility || {}
    const savedAttendanceSettings = settingsSavedSnapshot.attendance_settings || {}

    const moduleChanged = MODULE_TOGGLE_DEFINITIONS.some(
      moduleDef => moduleVisibility[moduleDef.key] !== savedModuleVisibility[moduleDef.key],
    )
    if (moduleChanged) {
      return true
    }

    return (
      attendanceSettings.mode !== savedAttendanceSettings.mode
      || attendanceSettings.cooldown_hours !== savedAttendanceSettings.cooldown_hours
      || attendanceSettings.cooldown_minutes !== savedAttendanceSettings.cooldown_minutes
      || attendanceSettings.cooldown_seconds !== savedAttendanceSettings.cooldown_seconds
    )
  }, [attendanceSettings, moduleVisibility, settingsSavedSnapshot])

  const settingsControlsDisabled = settingsLoading || settingsSaving

  async function loadSystemSettings() {
    setSettingsLoading(true)

    const result = await syncSystemSettingsFromServer()
    const nextSettings = result.settings || {
      module_visibility: getModuleVisibility(),
      attendance_settings: getAttendanceSettings(),
    }

    setModuleVisibility(nextSettings.module_visibility || getModuleVisibility())
    setAttendanceSettings(nextSettings.attendance_settings || getAttendanceSettings())
    setSettingsSavedSnapshot({
      module_visibility: nextSettings.module_visibility || getModuleVisibility(),
      attendance_settings: nextSettings.attendance_settings || getAttendanceSettings(),
    })

    if (!result.success) {
      setSettingsStatusType('error')
      setSettingsStatusText(result.message || 'Không thể tải cấu hình hệ thống từ máy chủ')
    } else {
      setSettingsStatusText('')
    }

    try {
      const cams = await api.getCameras()
      setCameras(Array.isArray(cams) ? cams : [])
    } catch {}

    setSettingsLoading(false)
  }

  useEffect(() => {
    loadSystemSettings()
  }, [])

  function handleToggleModule(moduleKey, enabled) {
    setModuleVisibility(prev => ({
      ...prev,
      [moduleKey]: Boolean(enabled),
    }))
  }

  function handleResetModules() {
    setModuleVisibility({ ...DEFAULT_MODULE_VISIBILITY })
  }

  function handleAttendanceCooldownChange(field, rawValue) {
    const parsedValue = rawValue === '' ? 0 : Number(rawValue)
    setAttendanceSettings(prev => ({
      ...prev,
      [field]: parsedValue,
    }))
  }

  function handleResetAttendanceSettings() {
    setAttendanceSettings({ ...DEFAULT_ATTENDANCE_SETTINGS })
  }

  async function handleSaveSystemSettings() {
    setSettingsSaving(true)
    setSettingsStatusText('')

    const result = await saveSystemSettingsToServer({
      module_visibility: moduleVisibility,
      attendance_settings: attendanceSettings,
    })

    if (!result.success) {
      setSettingsStatusType('error')
      setSettingsStatusText(result.message || 'Không thể lưu cài đặt hệ thống')
      setSettingsSaving(false)
      return
    }

    const savedSettings = result.settings || {
      module_visibility: moduleVisibility,
      attendance_settings: attendanceSettings,
    }
    setModuleVisibility(savedSettings.module_visibility || moduleVisibility)
    setAttendanceSettings(savedSettings.attendance_settings || attendanceSettings)
    setSettingsSavedSnapshot({
      module_visibility: savedSettings.module_visibility || moduleVisibility,
      attendance_settings: savedSettings.attendance_settings || attendanceSettings,
    })
    setSettingsStatusType('success')
    setSettingsStatusText(result.message || 'Đã lưu cài đặt hệ thống')
    setSettingsSaving(false)
  }

  function handleToggleTts() {
    setTtsEnabled(prev => {
      const next = !prev
      localStorage.setItem('facecheck.tts_enabled', String(next))
      return next
    })
  }

  async function handleTestVoice() {
    setTestSpeakerFeedback('')
    if (speakerConfig.enabled) {
      setTestSpeakerLoading(true)
      try {
        const res = await testCameraSpeaker()
        if (res.success) {
          setTestSpeakerFeedback('✅ Đã phát câu chào qua loa Camera thành công!')
        } else {
          setTestSpeakerFeedback(`⚠️ Lỗi loa camera: ${res.message || 'Không thể kết nối'}`)
        }
      } catch (err) {
        setTestSpeakerFeedback(`⚠️ Lỗi: ${err.message}`)
      } finally {
        setTestSpeakerLoading(false)
      }
    } else {
      speakAttendanceOutcome('Nguyễn Văn A', 'IN', false)
      setTestSpeakerFeedback('✅ Đã phát câu chào qua loa Máy tính (PC)')
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="space-y-1">
        <h1 id="system-settings-title" data-translate-probe="1" className="text-2xl font-bold text-slate-800 tracking-tight">Cài đặt & Quản lý Camera</h1>
        <p data-translate-probe="1" className="text-sm text-slate-500">
          Quản lý bật/tắt module, cấu hình chấm công và cấu hình camera hệ thống.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-800">Cấu hình hệ thống dùng chung</p>
          <p className="text-xs text-slate-500">
            Cấu hình được lưu vào SQLite backend. Sau khi lưu, mọi người truy cập sẽ dùng cùng một thiết lập.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadSystemSettings}
            disabled={settingsControlsDisabled}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw size={14} className={settingsLoading ? 'animate-spin' : ''} />
            Tải lại
          </button>

          <button
            type="button"
            onClick={handleSaveSystemSettings}
            disabled={!settingsDirty || settingsControlsDisabled}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary-600 text-white border border-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {settingsSaving ? <RefreshCw size={14} className="animate-spin" /> : null}
            {settingsSaving ? 'Đang lưu...' : 'Lưu cài đặt'}
          </button>
        </div>
      </div>

      {settingsStatusText && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${
          settingsStatusType === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-600'
        }`}>
          {settingsStatusText}
        </div>
      )}

      {/* Hệ thống đa kênh máy chủ AI */}
      <MultiChannelSettings />

      <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-4 lg:gap-6">
        <div className="space-y-4 lg:space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <h2 data-translate-probe="1" className="text-base font-semibold text-slate-800">Bật/Tắt module</h2>
                <p className="text-xs text-slate-500">Đang bật {enabledCount}/{MODULE_TOGGLE_DEFINITIONS.length} module</p>
              </div>

              <button
                type="button"
                onClick={handleResetModules}
                disabled={settingsControlsDisabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw size={14} />
                Bật lại tất cả
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {MODULE_TOGGLE_DEFINITIONS.map(moduleDef => {
                const enabled = moduleVisibility[moduleDef.key] !== false
                return (
                  <div key={moduleDef.key} className="px-4 sm:px-5 py-4 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-800">{moduleDef.label}</p>
                      <p className="text-xs text-slate-500">{moduleDef.description}</p>
                      <p className="text-[11px] font-mono text-slate-400">Route: {moduleDef.path}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleModule(moduleDef.key, !enabled)}
                      disabled={settingsControlsDisabled}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        enabled
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      {enabled ? 'Đang bật' : 'Đang tắt'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-800">Cấu hình chấm công</h2>
                <p className="text-xs text-slate-500">Cấu hình giới hạn thời gian giữa các lần chấm công</p>
              </div>

              <button
                type="button"
                onClick={handleResetAttendanceSettings}
                disabled={settingsControlsDisabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw size={14} />
                Khôi phục mặc định
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Giới hạn thời gian chấm công</p>
                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs text-slate-500">Giờ</span>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={attendanceSettings.cooldown_hours}
                      onChange={event => handleAttendanceCooldownChange('cooldown_hours', event.target.value)}
                      disabled={settingsControlsDisabled}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs text-slate-500">Phút</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={attendanceSettings.cooldown_minutes}
                      onChange={event => handleAttendanceCooldownChange('cooldown_minutes', event.target.value)}
                      disabled={settingsControlsDisabled}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs text-slate-500">Giây</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={attendanceSettings.cooldown_seconds}
                      onChange={event => handleAttendanceCooldownChange('cooldown_seconds', event.target.value)}
                      disabled={settingsControlsDisabled}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </label>
                </div>

                <p className="text-xs text-slate-500">
                  Trong khoảng <span className="font-medium text-slate-700">{formatCooldownDuration(attendanceCooldownSeconds)}</span>,
                  {attendanceSettings.mode === ATTENDANCE_MODE_OPTIONS.autoRecord
                    ? ' mỗi người chỉ được ghi chấm công 1 lần.'
                    : ' mỗi người chỉ được 1 lần Checkin và 1 lần Checkout.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-800">Giọng nói chào mừng (TTS)</h2>
              <p className="text-xs text-slate-500">Phát âm thanh tiếng Việt khi nhân viên nhận diện khuôn mặt thành công.</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
              Web Speech AI
            </span>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {/* Nguồn phát âm thanh */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800">Nguồn phát âm thanh câu chào</p>
                  <p className="text-[11px] text-slate-500">Cơ chế loại trừ: chỉ phát qua 1 nguồn duy nhất</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSpeakerModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 shadow-xs transition-colors"
                >
                  <Settings2 size={13} />
                  <span>Cài đặt Loa</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    saveCameraSpeakerConfig({ enabled: false })
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    !speakerConfig.enabled
                      ? 'border-primary-500 bg-white shadow-xs font-semibold text-primary-700'
                      : 'border-slate-200 bg-white/50 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span>💻 Loa Máy tính (PC)</span>
                    {!speakerConfig.enabled && <span className="text-primary-600 text-[11px] font-bold">Đang bật</span>}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Giọng đọc AI qua loa PC</p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    saveCameraSpeakerConfig({ enabled: true })
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    speakerConfig.enabled
                      ? 'border-emerald-500 bg-emerald-50/50 shadow-xs font-semibold text-emerald-800'
                      : 'border-slate-200 bg-white/50 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1">📢 Loa Camera</span>
                    {speakerConfig.enabled && <span className="text-emerald-600 text-[11px] font-bold">{speakerConfig.volume}%</span>}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Two-Way Audio ngoài</p>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  speakerConfig.enabled
                    ? 'bg-emerald-100 text-emerald-700'
                    : ttsEnabled ? 'bg-primary-100 text-primary-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  {speakerConfig.enabled ? <Radio size={18} /> : (ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />)}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    {speakerConfig.enabled ? 'Đang phát qua: Loa ngoài của Camera' : 'Đang phát qua: Loa máy tính (PC)'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {speakerConfig.enabled
                      ? `Camera ${speakerConfig.cameraName || speakerConfig.cameraId || 'đã chọn'} • Âm lượng ${speakerConfig.volume}% [Loa PC đã câm]`
                      : 'Phát giọng đọc tiếng Việt qua loa laptop / máy tính [Loa Camera đã tắt]'}
                  </p>
                </div>
              </div>

              {!speakerConfig.enabled && (
                <button
                  type="button"
                  onClick={handleToggleTts}
                  className={`p-1 text-2xl transition-colors ${ttsEnabled ? 'text-primary-600' : 'text-slate-400'}`}
                  title={ttsEnabled ? 'Tắt âm thanh PC' : 'Bật âm thanh PC'}
                >
                  {ttsEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleTestVoice}
              disabled={testSpeakerLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-900 disabled:opacity-50 transition-colors shadow-sm"
            >
              {testSpeakerLoading ? <RefreshCw size={14} className="animate-spin" /> : <Volume2 size={14} />}
              <span>{speakerConfig.enabled ? 'Phát thử ra Loa ngoài của Camera' : 'Phát thử giọng nói qua Loa Máy tính'}</span>
            </button>

            {testSpeakerFeedback && (
              <p className="text-xs text-center font-medium text-slate-600 animate-fadeIn">
                {testSpeakerFeedback}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Modal Cấu hình Loa Camera */}
      <CameraSpeakerSettingsModal
        isOpen={isSpeakerModalOpen}
        onClose={() => setIsSpeakerModalOpen(false)}
        selectedCamera={cameras[0] || null}
        cameras={cameras}
      />
    </div>
  )
}
