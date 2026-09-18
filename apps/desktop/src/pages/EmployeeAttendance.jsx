import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, clearSessionToken } from '../services/api'
import { ROUTES } from '../config/routes'

const SETTINGS_REFRESH_INTERVAL_MS = 15000
const MIRROR_COMPENSATION_STORAGE_KEY = 'facecheck.employee.mirror_compensation'
const CAPTURE_CENTER_CROP_RATIO = 0.9

function readMirrorCompensationSetting() {
  if (typeof window === 'undefined') {
    return true
  }

  const raw = window.localStorage.getItem(MIRROR_COMPENSATION_STORAGE_KEY)
  if (raw == null) {
    return true
  }

  return raw !== '0'
}

function persistMirrorCompensationSetting(enabled) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(MIRROR_COMPENSATION_STORAGE_KEY, enabled ? '1' : '0')
}

function todayIsoDate() {
  const now = new Date()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function modeLabel(mode, selectedType) {
  if (mode === 'auto_record') {
    return 'Ghi chấm công tự động'
  }
  return selectedType === 'checkout' ? 'Checkout' : 'Checkin'
}

function normalizeAttendanceMode(value) {
  return String(value || '').trim().toLowerCase() === 'auto_record'
    ? 'auto_record'
    : 'checkin_checkout'
}

async function applyWidestCameraZoom(stream) {
  try {
    const [track] = stream?.getVideoTracks?.() || []
    if (!track || typeof track.getCapabilities !== 'function' || typeof track.applyConstraints !== 'function') {
      return
    }

    const capabilities = track.getCapabilities()
    const zoomRange = capabilities?.zoom
    if (!zoomRange) {
      return
    }

    const minZoom = Number(zoomRange.min)
    const maxZoom = Number(zoomRange.max)
    if (!Number.isFinite(minZoom)) {
      return
    }

    // Keep optical zoom around 1x when available.
    const targetZoom = Number.isFinite(maxZoom)
      ? Math.min(maxZoom, Math.max(minZoom, 1))
      : Math.max(minZoom, 1)

    await track.applyConstraints({
      advanced: [{ zoom: targetZoom }],
    })
  } catch {
    // Some devices/browsers do not support manual zoom constraints.
  }
}

export default function EmployeeAttendance() {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const [checking, setChecking] = useState(true)
  const [employeeUser, setEmployeeUser] = useState(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [historyDate, setHistoryDate] = useState(todayIsoDate())
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRecords, setHistoryRecords] = useState([])
  const [attendanceMode, setAttendanceMode] = useState('checkin_checkout')
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [selectedAttendanceType, setSelectedAttendanceType] = useState('checkin')
  const [mirrorCompensation, setMirrorCompensation] = useState(() => readMirrorCompensationSetting())

  useEffect(() => {
    initializeEmployeePage()
    return () => {
      stopCamera()
    }
  }, [])

  async function initializeEmployeePage() {
    try {
      const status = await api.employeeStatus()
      if (!status?.authenticated || !status?.is_employee) {
        clearSessionToken()
        navigate(ROUTES.employeeLogin, { replace: true })
        return
      }

      setEmployeeUser(status.user || null)
      await Promise.all([
        loadEmployeeAttendanceSettings(),
        loadHistory(todayIsoDate()),
      ])
      await startCamera()
    } catch {
      clearSessionToken()
      navigate(ROUTES.employeeLogin, { replace: true })
      return
    }

    setChecking(false)
  }

  async function loadEmployeeAttendanceSettings() {
    try {
      const res = await api.getEmployeeAttendanceSettings()
      if (!res?.success) return null

      const mode = normalizeAttendanceMode(res.attendance_settings?.mode)
      setAttendanceMode(mode)
      const nextCooldownSeconds = Number(res.attendance_settings?.cooldown_seconds) || 0
      setCooldownSeconds(nextCooldownSeconds)
      return {
        mode,
        cooldownSeconds: nextCooldownSeconds,
      }
    } catch {
      // Keep default local mode when API is unavailable.
      return null
    }
  }

  function syncAttendanceModeFromResponse(payload) {
    if (!payload || payload.attendance_mode == null) {
      return
    }
    const mode = normalizeAttendanceMode(payload?.attendance_mode)
    setAttendanceMode(mode)
  }

  async function startCamera() {
    setCameraError('')

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError('Trình duyệt không hỗ trợ camera trực tiếp')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          aspectRatio: { ideal: 3 / 4 },
          facingMode: 'user',
        },
        audio: false,
      })

      await applyWidestCameraZoom(stream)

      streamRef.current = stream
      const video = videoRef.current
      if (!video) return

      video.srcObject = stream
      await video.play()
      setCameraReady(true)
    } catch (error) {
      setCameraError(error?.message || 'Không thể mở camera')
      setCameraReady(false)
    }
  }

  function stopCamera() {
    const stream = streamRef.current
    if (!stream) return

    for (const track of stream.getTracks()) {
      track.stop()
    }

    streamRef.current = null
    setCameraReady(false)
  }

  function captureImageBase64() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return ''
    if (!video.videoWidth || !video.videoHeight) return ''

    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
    const cropRatio = CAPTURE_CENTER_CROP_RATIO

    let sx = 0
    let sy = 0
    let sw = sourceWidth
    let sh = sourceHeight

    if (cropRatio > 0 && cropRatio < 1) {
      sw = Math.max(1, Math.floor(sourceWidth * cropRatio))
      sh = Math.max(1, Math.floor(sourceHeight * cropRatio))
      sx = Math.max(0, Math.floor((sourceWidth - sw) / 2))
      sy = Math.max(0, Math.floor((sourceHeight - sh) / 2))
    }

    canvas.width = sw
    canvas.height = sh
    const context = canvas.getContext('2d')
    if (!context) return ''

    context.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
    return canvas.toDataURL('image/jpeg', 0.92)
  }

  async function submitAttendance() {
    if (!cameraReady || submitting) return

    let imageBase64 = ''
    setSubmitting(true)
    setFeedback(null)

    try {
      // Pull latest server-side mode right before submit so employee flow follows admin setting instantly.
      const latestSettings = await loadEmployeeAttendanceSettings()
      const effectiveMode = latestSettings?.mode || attendanceMode

      imageBase64 = captureImageBase64()
      if (!imageBase64) {
        setFeedback({
          type: 'error',
          message: 'Không lấy được khung hình từ camera',
        })
        setSubmitting(false)
        return
      }

      const attendanceType = effectiveMode === 'auto_record'
        ? 'auto'
        : selectedAttendanceType

      const res = await api.employeeAttendanceImageBase64({
        image_base64: imageBase64,
        attendance_type: attendanceType,
        include_preview: true,
        tolerance: 0.58,
      })

      syncAttendanceModeFromResponse(res)

      if (!res?.success) {
        setFeedback({
          type: res?.mismatch ? 'warning' : 'error',
          message: res?.message || 'Không thể chấm công',
          similarityPercent: Number(res?.similarity_percent || 0),
          mismatch: Boolean(res?.mismatch),
          expectedUser: res?.expected_user || null,
          detectedUser: res?.detected_user || null,
          previewImageBase64: res?.preview_image_base64 || imageBase64,
        })
        setSubmitting(false)
        return
      }

      setFeedback({
        type: 'success',
        message: res?.message || 'Chấm công thành công',
        similarityPercent: Number(res?.similarity_percent || 0),
        checkInTime: res?.check_in_time || '',
        checkOutTime: res?.check_out_time || '',
        locationText: res?.location_text || '',
        attendanceTypeLabel: res?.attendance_type_label || modeLabel(attendanceMode, selectedAttendanceType),
        previewImageBase64: res?.preview_image_base64 || imageBase64,
      })

      await loadHistory(historyDate)
    } catch {
      setFeedback({
        type: 'error',
        message: 'Không thể gửi dữ liệu chấm công',
        previewImageBase64: imageBase64,
      })
    }

    setSubmitting(false)
  }

  useEffect(() => {
    const refreshSettings = () => {
      loadEmployeeAttendanceSettings()
    }

    const timerId = setInterval(refreshSettings, SETTINGS_REFRESH_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSettings()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      clearInterval(timerId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  async function loadHistory(dateValue = historyDate) {
    setHistoryLoading(true)
    try {
      const res = await api.getEmployeeAttendanceHistory({ date: dateValue, limit: 150 })
      if (res?.success) {
        setHistoryRecords(Array.isArray(res.records) ? res.records : [])
      } else {
        setHistoryRecords([])
      }
    } catch {
      setHistoryRecords([])
    }
    setHistoryLoading(false)
  }

  async function handleLogout() {
    try {
      await api.employeeLogout()
    } finally {
      clearSessionToken()
      navigate(ROUTES.employeeLogin, { replace: true })
    }
  }

  function handleToggleMirrorCompensation() {
    setMirrorCompensation(current => {
      const nextValue = !current
      persistMirrorCompensationSetting(nextValue)
      return nextValue
    })
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Đang kiểm tra phiên đăng nhập...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 space-y-5">
        <header className="rounded-2xl border border-emerald-100 bg-white px-4 py-4 sm:px-5 sm:py-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Chấm Công Nhân Viên</h1>
              <p className="text-sm text-slate-500 mt-1">
                Xin chào {employeeUser?.name || employeeUser?.code || 'Nhân viên'}
                {employeeUser?.employee_id ? ` • Mã: ${employeeUser.employee_id}` : ''}
              </p>
              <p className="text-xs text-emerald-700 mt-1">
                Chế độ hiện tại: {modeLabel(attendanceMode, selectedAttendanceType)}
                {cooldownSeconds > 0 ? ` • Giãn cách: ${cooldownSeconds}s` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to={ROUTES.portal}
                className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
              >
                Trang chọn cổng
              </Link>
              <button
                onClick={handleLogout}
                className="px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-5">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-800">Camera chấm công</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleMirrorCompensation}
                  className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium"
                >
                  {mirrorCompensation ? 'Mirror: chuẩn' : 'Mirror: gốc'}
                </button>
                {!cameraReady ? (
                  <button
                    onClick={startCamera}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
                  >
                    Bật camera
                  </button>
                ) : (
                  <button
                    onClick={stopCamera}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
                  >
                    Tắt camera
                  </button>
                )}
              </div>
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 aspect-[3/4] min-h-[420px] max-h-[78vh] sm:aspect-[4/5] sm:min-h-[520px] lg:aspect-[4/3] lg:min-h-0 lg:max-h-none flex items-center justify-center">
              <video
                ref={videoRef}
                className="w-full h-full object-contain lg:object-cover"
                style={{ transform: mirrorCompensation ? 'scaleX(-1)' : 'none' }}
                playsInline
                muted
                autoPlay
              />

              {cameraReady && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="w-[70%] h-[72%] max-w-[360px] rounded-[36%] border-2 border-white/70 shadow-[0_0_0_9999px_rgba(2,6,23,0.22)]" />
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />

            <p className="text-xs sm:text-sm text-slate-500">
              Ở điện thoại, khung camera đã ưu tiên tỉ lệ dọc để khuôn mặt hiển thị lớn hơn.
              Chế độ mirror mặc định đã bù ngược để thao tác không bị đảo chiều.
            </p>

            {cameraError && (
              <div className="px-3 py-2 rounded-lg border border-red-100 bg-red-50 text-sm text-red-700">
                {cameraError}
              </div>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-slate-600">Thao tác:</span>
              <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setSelectedAttendanceType('checkin')}
                  disabled={attendanceMode === 'auto_record'}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedAttendanceType === 'checkin'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  } ${attendanceMode === 'auto_record' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Checkin
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAttendanceType('checkout')}
                  disabled={attendanceMode === 'auto_record'}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedAttendanceType === 'checkout'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  } ${attendanceMode === 'auto_record' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Checkout
                </button>
              </div>
            </div>

            <button
              onClick={submitAttendance}
              disabled={!cameraReady || submitting}
              className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold text-sm hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
            >
              {submitting ? 'Đang xử lý...' : 'Chụp và chấm công'}
            </button>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Kết quả nhận diện</h2>

            {!feedback && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                Chưa có kết quả. Hãy bấm Chụp và chấm công để bắt đầu.
              </div>
            )}

            {feedback && (
              <div className={`rounded-xl border px-4 py-4 space-y-2 text-sm ${
                feedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : feedback.type === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-red-200 bg-red-50 text-red-700'
              }`}>
                <p className="font-semibold">{feedback.message}</p>
                {feedback.attendanceTypeLabel && (
                  <p>Loại chấm công: <span className="font-medium">{feedback.attendanceTypeLabel}</span></p>
                )}
                {Number.isFinite(feedback.similarityPercent) && (
                  <p>Tương đồng khuôn mặt: <span className="font-semibold">{feedback.similarityPercent.toFixed(2)}%</span></p>
                )}
                {feedback.checkInTime && <p>Checkin: {feedback.checkInTime}</p>}
                {feedback.checkOutTime && <p>Checkout: {feedback.checkOutTime}</p>}
                {feedback.locationText && <p>Vị trí: {feedback.locationText}</p>}
                {feedback.previewImageBase64 && (
                  <div className="pt-2 space-y-1">
                    <p className="text-xs font-medium">Ảnh vừa chụp</p>
                    <img
                      src={feedback.previewImageBase64}
                      alt="Ảnh vừa chụp"
                      className="w-full max-h-64 object-contain rounded-xl border border-slate-300/60 bg-slate-900/5"
                    />
                  </div>
                )}
                {feedback.mismatch && (
                  <div className="pt-1 space-y-1">
                    <p className="font-semibold">Cảnh báo sai người chấm công:</p>
                    <p>
                      Tài khoản đăng nhập: {feedback.expectedUser?.name || '-'}
                      {feedback.expectedUser?.employee_id ? ` (${feedback.expectedUser.employee_id})` : ''}
                    </p>
                    <p>
                      Hệ thống nhận diện: {feedback.detectedUser?.name || '-'}
                      {feedback.detectedUser?.employee_id ? ` (${feedback.detectedUser.employee_id})` : ''}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="pt-1 border-t border-slate-100">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Ngày xem lịch sử</label>
                  <input
                    type="date"
                    value={historyDate}
                    onChange={event => setHistoryDate(event.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <button
                  onClick={() => loadHistory(historyDate)}
                  disabled={historyLoading}
                  className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium disabled:opacity-50"
                >
                  {historyLoading ? 'Đang tải...' : 'Lọc lịch sử'}
                </button>
              </div>
            </div>
          </section>
        </div>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <h2 className="text-base sm:text-lg font-semibold text-slate-800">Lịch sử chấm công cá nhân</h2>
            <span className="text-xs text-slate-500">{historyRecords.length} bản ghi</span>
          </div>

          {historyLoading ? (
            <div className="px-5 py-8 text-sm text-slate-500">Đang tải dữ liệu...</div>
          ) : historyRecords.length === 0 ? (
            <div className="px-5 py-8 text-sm text-slate-500">Chưa có dữ liệu chấm công cho ngày đã chọn.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-left">
                    <th className="px-4 py-3 font-semibold">Ngày</th>
                    <th className="px-4 py-3 font-semibold">Checkin</th>
                    <th className="px-4 py-3 font-semibold">Checkout</th>
                    <th className="px-4 py-3 font-semibold">Trạng thái</th>
                    <th className="px-4 py-3 font-semibold">Vị trí</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRecords.map(row => (
                    <tr key={row.id} className="border-t border-slate-100 text-slate-700">
                      <td className="px-4 py-3 whitespace-nowrap">{row.date || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.check_in_time || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.check_out_time || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.status || '-'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[320px] truncate" title={row.check_in_location_text || row.check_out_location_text || ''}>
                        {row.check_in_location_text || row.check_out_location_text || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
