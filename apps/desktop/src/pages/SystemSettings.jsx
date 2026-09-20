import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  ExternalLink,
  Globe,
  Info,
  RotateCcw,
  Save,
  Server,
  Settings,
  Shield,
  Sliders,
  Volume2,
} from 'lucide-react'
import { api } from '../services/api'
import { ROUTES } from '../config/routes'
import { Badge, Button, Card, ConfirmDialog, Input, Tabs } from '../components/ui'

const DEFAULT_SETTINGS = {
  face_match_threshold: 0.55,
  cooldown_seconds: 15,
  sound_feedback: true,
  tts_announcement: true,
  shift_start_time: '08:00',
  shift_end_time: '17:30',
  late_tolerance_minutes: 15,
}

export default function SystemSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [activeTab, setActiveTab] = useState('ai')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [systemInfo, setSystemInfo] = useState({ backend: 'FastAPI', db: 'Connected' })

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const response = await api.getSystemSettings()
        const values = response?.settings || response || {}
        setSettings((prev) => ({
          ...prev,
          ...values,
          face_match_threshold: Number(values.face_match_threshold) || 0.55,
          cooldown_seconds: Number(values.cooldown_seconds) || 15,
          late_tolerance_minutes: Number(values.late_tolerance_minutes) || 15,
        }))
      } catch (loadError) {
        setMessage({
          type: 'error',
          text: loadError?.message || 'Không thể tải cấu hình từ máy chủ.',
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function updateSetting(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  // VAL-04: Threshold validation and strictness helper
  const threshold = Number(settings.face_match_threshold) || 0.55
  let strictnessLabel = 'Cân bằng (Khuyên dùng)'
  let strictnessColor = 'text-emerald-500'
  let strictnessBadge = 'success'
  if (threshold < 0.45) {
    strictnessLabel = 'Lỏng (Dễ nhận nhầm đối tượng khác)'
    strictnessColor = 'text-amber-500'
    strictnessBadge = 'warning'
  } else if (threshold > 0.65) {
    strictnessLabel = 'Nghiêm ngặt (Cần góc nhìn thẳng, đủ sáng)'
    strictnessColor = 'text-blue-500'
    strictnessBadge = 'primary'
  }

  async function handleSave(e) {
    if (e) e.preventDefault()
    setSaving(true)
    setMessage(null)

    // VAL-04: Ensure threshold is clamped between 0.30 and 0.95
    const validatedThreshold = Math.min(Math.max(Number(settings.face_match_threshold) || 0.55, 0.3), 0.95)

    const payload = {
      ...settings,
      face_match_threshold: validatedThreshold,
      cooldown_seconds: Math.max(Number(settings.cooldown_seconds) || 5, 0),
      late_tolerance_minutes: Math.max(Number(settings.late_tolerance_minutes) || 0, 0),
    }

    try {
      await api.saveSystemSettings(payload)
      setSettings(payload)
      setMessage({ type: 'success', text: 'Cấu hình hệ thống đã được lưu thành công!' })
    } catch (saveError) {
      setMessage({
        type: 'error',
        text: saveError?.message || 'Không lưu được cài đặt. Yêu cầu quyền Quản trị viên.',
      })
    } finally {
      setSaving(false)
    }
  }

  function handleResetDefaults() {
    setSettings(DEFAULT_SETTINGS)
    setResetModalOpen(false)
    setMessage({ type: 'info', text: 'Đã khôi phục cài đặt gốc mặc định (chưa lưu vào DB).' })
  }

  const tabs = [
    { id: 'ai', label: 'Nhận diện AI & Âm thanh', icon: Cpu },
    { id: 'operations', label: 'Ca làm việc & Chấm công', icon: Clock },
    { id: 'system', label: 'Hệ thống & Liên kết', icon: Server },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--cv-text-primary)] tracking-tight flex items-center gap-2.5">
            <Settings className="w-7 h-7 text-[var(--cv-brand-500)]" />
            Cài đặt hệ thống
          </h1>
          <p className="text-sm text-[var(--cv-text-secondary)] mt-1">
            Thiết lập thuật toán nhận diện khuôn mặt, chu kỳ điểm danh và ca làm việc.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="md"
            icon={RotateCcw}
            onClick={() => setResetModalOpen(true)}
          >
            Mặc định
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={Save}
            loading={saving}
            onClick={handleSave}
          >
            Lưu cài đặt
          </Button>
        </div>
      </div>

      {/* Alert banner */}
      {message && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-sm animate-in slide-in-from-top-2 duration-200 ${
            message.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
              : message.type === 'info'
              ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300'
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

      {/* Navigation Tabs */}
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        className="w-full sm:w-auto"
      />

      {/* Tab 1: AI Recognition & Audio Settings */}
      {activeTab === 'ai' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="p-6 space-y-6">
            <div className="pb-4 border-b border-[var(--cv-border-default)]">
              <h3 className="text-base font-bold text-[var(--cv-text-primary)] flex items-center gap-2">
                <Cpu className="w-5 h-5 text-[var(--cv-brand-500)]" />
                Độ nhạy nhận diện khuôn mặt (Face Matching)
              </h3>
              <p className="text-xs text-[var(--cv-text-tertiary)] mt-1">
                Cosine Similarity Threshold quy định mức độ tương đồng tối thiểu để xác nhận danh tính nhân viên.
              </p>
            </div>

            {/* Threshold Slider with Live Badge */}
            <div className="space-y-4 p-5 rounded-2xl border border-[var(--cv-border-default)] bg-[var(--cv-bg-surface-elevated)]">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-[var(--cv-text-primary)]">
                    Ngưỡng tương đồng (Threshold):
                  </span>
                  <span className="ml-2 font-mono text-lg font-black text-[var(--cv-brand-600)] dark:text-[var(--cv-brand-400)]">
                    {Number(settings.face_match_threshold).toFixed(2)}
                  </span>
                </div>
                <Badge variant={strictnessBadge} size="md">
                  {strictnessLabel}
                </Badge>
              </div>

              {/* Slider (VAL-04: clamped 0.30 - 0.90) */}
              <input
                type="range"
                min="0.30"
                max="0.90"
                step="0.01"
                value={settings.face_match_threshold}
                onChange={(e) => updateSetting('face_match_threshold', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-[var(--cv-brand-500)]"
              />

              <div className="flex justify-between text-[11px] text-[var(--cv-text-tertiary)] font-mono">
                <span>0.30 (Rất dễ)</span>
                <span className="font-bold text-[var(--cv-brand-600)] dark:text-[var(--cv-brand-400)]">
                  0.55 (Chuẩn khuyến nghị)
                </span>
                <span>0.90 (Cực kỳ khắt khe)</span>
              </div>
            </div>

            {/* Cooldown Settings */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1.5">
                  Thời gian giãn cách giữa các lần ghi (Cooldown giây)
                </label>
                <input
                  type="number"
                  min="0"
                  max="300"
                  value={settings.cooldown_seconds}
                  onChange={(e) => updateSetting('cooldown_seconds', parseInt(e.target.value) || 0)}
                  className="cv-input text-sm"
                />
                <p className="text-[11px] text-[var(--cv-text-tertiary)] mt-1">
                  Tránh spam bản ghi điểm danh lặp lại liên tục cho cùng một nhân viên.
                </p>
              </div>

              <div className="p-4 rounded-2xl border border-[var(--cv-border-default)] bg-[var(--cv-bg-surface-elevated)] space-y-3">
                <span className="text-xs font-bold text-[var(--cv-text-secondary)] uppercase tracking-wider block">
                  Phản hồi âm thanh & Giọng nói
                </span>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!settings.sound_feedback}
                    onChange={(e) => updateSetting('sound_feedback', e.target.checked)}
                    className="w-4 h-4 rounded text-[var(--cv-brand-500)]"
                  />
                  <span className="text-xs font-medium text-[var(--cv-text-primary)]">
                    Phát tiếng chuông 'Bíp' khi chấm công thành công
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!settings.tts_announcement}
                    onChange={(e) => updateSetting('tts_announcement', e.target.checked)}
                    className="w-4 h-4 rounded text-[var(--cv-brand-500)]"
                  />
                  <span className="text-xs font-medium text-[var(--cv-text-primary)]">
                    Đọc tên nhân viên qua bộ chuyển giọng nói (TTS)
                  </span>
                </label>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Operations & Working Shifts */}
      {activeTab === 'operations' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="p-6 space-y-6">
            <div className="pb-4 border-b border-[var(--cv-border-default)]">
              <h3 className="text-base font-bold text-[var(--cv-text-primary)] flex items-center gap-2">
                <Clock className="w-5 h-5 text-[var(--cv-brand-500)]" />
                Thời gian làm việc & Quy tắc đi muộn
              </h3>
              <p className="text-xs text-[var(--cv-text-tertiary)] mt-1">
                Áp dụng để phân loại trạng thái điểm danh: Đúng giờ, Đi muộn hoặc Về sớm trong Báo cáo.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1.5">
                  Giờ bắt đầu ca sáng
                </label>
                <input
                  type="time"
                  value={settings.shift_start_time}
                  onChange={(e) => updateSetting('shift_start_time', e.target.value)}
                  className="cv-input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1.5">
                  Giờ kết thúc ca chiều
                </label>
                <input
                  type="time"
                  value={settings.shift_end_time}
                  onChange={(e) => updateSetting('shift_end_time', e.target.value)}
                  className="cv-input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1.5">
                  Thời gian ân hạn (Phút)
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={settings.late_tolerance_minutes}
                  onChange={(e) => updateSetting('late_tolerance_minutes', parseInt(e.target.value) || 0)}
                  className="cv-input text-sm"
                />
                <p className="text-[11px] text-[var(--cv-text-tertiary)] mt-1">
                  Đến sau giờ ca + ân hạn sẽ bị tính là Đi muộn.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: System & Quick Links */}
      {activeTab === 'system' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="p-6 space-y-6">
            <div className="pb-4 border-b border-[var(--cv-border-default)]">
              <h3 className="text-base font-bold text-[var(--cv-text-primary)] flex items-center gap-2">
                <Server className="w-5 h-5 text-[var(--cv-brand-500)]" />
                Trạng thái hệ thống & Liên kết nhanh
              </h3>
              <p className="text-xs text-[var(--cv-text-tertiary)] mt-1">
                Thông tin kết nối máy chủ AI, cơ sở dữ liệu và chuyển hướng quản trị.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-[var(--cv-border-default)] bg-[var(--cv-bg-surface-elevated)] flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-[var(--cv-text-primary)]">
                    Nguồn thu Camera
                  </h4>
                  <p className="text-xs text-[var(--cv-text-tertiary)] mt-0.5">
                    Quản lý luồng RTSP và thiết bị ghi hình.
                  </p>
                </div>
                <Link to={ROUTES.cameras}>
                  <Button variant="secondary" size="sm" icon={Camera}>
                    Quản lý
                  </Button>
                </Link>
              </div>

              <div className="p-4 rounded-2xl border border-[var(--cv-border-default)] bg-[var(--cv-bg-surface-elevated)] flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-[var(--cv-text-primary)]">
                    Tài khoản & Phân quyền
                  </h4>
                  <p className="text-xs text-[var(--cv-text-tertiary)] mt-0.5">
                    Thêm nhân viên quản trị và vai trò truy cập.
                  </p>
                </div>
                <Link to={ROUTES.accounts}>
                  <Button variant="secondary" size="sm" icon={Shield}>
                    Quản lý
                  </Button>
                </Link>
              </div>

              <div className="p-4 rounded-2xl border border-[var(--cv-border-default)] bg-[var(--cv-bg-surface-elevated)] flex items-center justify-between sm:col-span-2">
                <div>
                  <h4 className="font-bold text-sm text-[var(--cv-text-primary)] flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[var(--cv-brand-500)]" />
                    Hỗ trợ & Liên hệ Covasol
                  </h4>
                  <p className="text-xs text-[var(--cv-text-tertiary)] mt-0.5">
                    Tư vấn triển khai AI camera, gói doanh nghiệp và dịch vụ kỹ thuật.
                  </p>
                </div>
                <a
                  href="https://covasol.com.vn"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="secondary" size="sm" icon={ExternalLink}>
                    covasol.com.vn
                  </Button>
                </a>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-blue-200/60 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900/50 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs text-[var(--cv-text-secondary)] leading-relaxed">
                <p className="font-bold text-[var(--cv-text-primary)] mb-0.5">
                  Cơ chế lưu trữ và bảo mật
                </p>
                Toàn bộ dữ liệu điểm danh, khuôn mặt vector (embeddings) và logs được lưu trữ bảo mật cục bộ tại backend. Thay đổi cấu hình chỉ áp dụng cho tài khoản có quyền Quản trị viên (ADMIN hoặc HR_MANAGER).
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      <ConfirmDialog
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onConfirm={handleResetDefaults}
        title="Khôi phục cấu hình mặc định?"
        message="Hành động này sẽ đưa các thông số nhận diện khuôn mặt và thời gian điểm danh về giá trị xuất xưởng khuyến nghị. Bấm lưu để xác nhận thay đổi vào hệ thống."
        confirmText="Khôi phục"
        variant="warning"
      />
    </div>
  )
}
