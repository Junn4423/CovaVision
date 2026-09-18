import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ScanFace,
  ShieldCheck,
  Cpu,
  Database,
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
  Fingerprint,
  ShoppingCart,
  ExternalLink,
} from 'lucide-react'
import { api, setSessionToken } from '../services/api'
import { ROUTES } from '../config/routes'

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loginMode, setLoginMode] = useState('system')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const savedRemember = localStorage.getItem('rememberLogin') === 'true'
    if (savedRemember) {
      const savedUser = localStorage.getItem('savedUsername') || ''
      const savedPass = localStorage.getItem('savedPassword') || ''
      const savedMode = localStorage.getItem('savedLoginMode') || 'system'
      setForm({ username: savedUser, password: savedPass })
      setLoginMode(savedMode === 'internal' ? 'internal' : 'system')
      setRememberMe(true)
    }
    checkCurrentSession()
  }, [])

  async function checkCurrentSession() {
    try {
      const res = await api.sessionStatus()
      if (res.is_admin) {
        navigate(ROUTES.dashboard, { replace: true })
        return
      }
    } catch {
      // Ignore and show login form.
    }
    setChecking(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await api.login(form.username, form.password, loginMode)
      if (res.success) {
        setSessionToken(res.token)

        if (rememberMe) {
          localStorage.setItem('rememberLogin', 'true')
          localStorage.setItem('savedUsername', form.username)
          localStorage.setItem('savedPassword', form.password)
          localStorage.setItem('savedLoginMode', loginMode)
        } else {
          localStorage.removeItem('rememberLogin')
          localStorage.removeItem('savedUsername')
          localStorage.removeItem('savedPassword')
          localStorage.removeItem('savedLoginMode')
        }

        navigate(ROUTES.dashboard, { replace: true })
      } else {
        setError(res.message || (loginMode === 'internal' ? 'Đăng nhập nội bộ thất bại' : 'Đăng nhập hệ thống thất bại'))
      }
    } catch {
      setError('Không thể kết nối backend')
    }

    setLoading(false)
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-400">Đang khởi tạo phiên làm việc...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen h-screen flex flex-col lg:flex-row overflow-hidden bg-slate-50">
      {/* LEFT COLUMN: Enterprise Showcase Banner */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 relative flex-col justify-between p-10 xl:p-12 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white overflow-hidden select-none">
        {/* Ambient Glows */}
        <div className="absolute -top-28 -left-28 w-96 h-96 rounded-full bg-primary-600/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-28 -right-28 w-96 h-96 rounded-full bg-indigo-600/25 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-80" />

        {/* Top: Brand Header */}
        <div className="relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-xl shadow-blue-900/30 p-2">
              <img src="/icon.png" alt="SOF Logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-white">
                  <span className="text-red-500">SOF </span>
                  <span className="text-blue-400">FACE AI</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300 border border-sky-400/30">
                  <Fingerprint size={11} /> SOF BIOMETRIC CLOUD AI
                </span>
              </div>
              <p className="text-xs text-slate-400">Hệ sinh thái chấm công & nhận diện sinh trắc học</p>
            </div>
          </div>
        </div>

        {/* Middle: Feature Highlights matching Mobile AdminHubScreen */}
        <div className="relative z-10 my-auto py-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
            <span className="text-red-500">SOF </span>
            <span className="text-blue-400">FACE </span>
            <span className="text-red-500">AI</span>
          </h1>
          <p className="text-lg font-bold text-slate-200 mt-1">
            Hệ thống Quản trị & Cấu hình
          </p>

          <div className="grid grid-cols-1 gap-3 mt-6 max-w-lg">
            {/* Feature 1 */}
            <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 shrink-0">
                <ScanFace size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Bắt đầu chấm công toàn công ty</p>
                <p className="text-xs text-slate-400 mt-0.5">Nhận diện khuôn mặt tự động qua camera</p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                <Database size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Báo cáo & Dữ liệu</p>
                <p className="text-xs text-slate-400 mt-0.5">Báo cáo đồng bộ ERP, danh sách chờ đẩy và bộ nhớ máy</p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className="p-2 rounded-xl bg-pink-500/20 text-pink-400 shrink-0">
                <User size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Nhân sự & Khuôn mặt</p>
                <p className="text-xs text-slate-400 mt-0.5">Quản lý nhân viên, đăng ký mẫu mặt và tài khoản</p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                <Cpu size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Cài đặt & Camera</p>
                <p className="text-xs text-slate-400 mt-0.5">Quản lý camera RTSP, chế độ chấm công và cấu hình hệ thống</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Powered By */}
        <div className="relative z-10 border-t border-white/10 pt-4 flex items-center justify-between text-xs text-slate-400">
          <span>© 2026 POWERED BY <strong className="text-red-400">SOF.COM.VN</strong></span>
          <span className="font-medium text-slate-400">v1.0.0</span>
        </div>
      </div>

      {/* RIGHT COLUMN: Desktop Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-10 lg:p-12 xl:p-14 bg-white lg:bg-gradient-to-br lg:from-slate-50 lg:via-white lg:to-blue-50/40 overflow-y-auto">
        <div className="w-full max-w-md my-auto space-y-5">
          {/* Mobile Header */}
          <div className="lg:hidden text-center mb-4">
            <div className="inline-flex w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden bg-white shadow-md border border-slate-100 p-2.5 mb-2">
              <img src="/icon.png" alt="SOF Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl font-black text-slate-800">
              <span className="text-red-500">SOF </span>
              <span className="text-blue-700">FACE </span>
              <span className="text-red-500">AI</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Hệ thống Quản trị & Cấu hình</p>
          </div>

          {/* Desktop Form Title */}
          <div className="hidden lg:block">
            <h2 className="text-2xl xl:text-3xl font-bold text-slate-800 tracking-tight">
              Hệ thống Quản trị & Cấu hình
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Đăng nhập để quản lý thiết bị camera, xem báo cáo và cấu hình hệ thống.
            </p>
          </div>

          {/* Main Login Form Container */}
          <form
            onSubmit={handleSubmit}
            className="bg-white p-6 sm:p-7 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/80 space-y-4"
          >
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-200/80 flex items-start gap-2.5">
                <span className="text-red-500 font-bold mt-0.5">✕</span>
                <p className="font-medium text-xs sm:text-sm">{error}</p>
              </div>
            )}



            {/* Login Mode Switch */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Chế độ đăng nhập
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setLoginMode('system')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    loginMode === 'system'
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <User size={15} />
                  <span>Login hệ thống</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLoginMode('internal')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    loginMode === 'internal'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck size={15} />
                  <span>Admin nội bộ</span>
                </button>
              </div>
            </div>

            {/* Username Field */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Tài khoản hệ thống
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User size={17} />
                </div>
                <input
                  type="text"
                  value={form.username}
                  onChange={event => setForm({ ...form, username: event.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm text-slate-800 placeholder:text-slate-400"
                  placeholder="Nhập tài khoản hệ thống"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Mật khẩu hệ thống
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock size={17} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={event => setForm({ ...form, password: event.target.value })}
                  className="w-full pl-10 pr-11 py-2.5 bg-slate-50/50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm text-slate-800 placeholder:text-slate-400"
                  placeholder="Nhập mật khẩu hệ thống"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={event => setRememberMe(event.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                />
                <span className="text-xs sm:text-sm font-medium text-slate-600">Ghi nhớ đăng nhập</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 active:scale-[0.99] text-white rounded-xl font-bold text-sm shadow-md shadow-primary-500/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Đang đăng nhập...</span>
                </>
              ) : (
                <span>Đăng nhập hệ thống</span>
              )}
            </button>
          </form>

          {/* Banner Mua Tài Khoản (Exact sync with mobile AdminLoginScreen) */}
          <div className="rounded-xl bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-3.5 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <ShoppingCart size={18} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide">MUA TÀI KHOẢN SOF</p>
                <p className="text-[11px] text-blue-100">Trải nghiệm đầy đủ tính năng</p>
                <p className="text-[10px] text-blue-200">Mua tại: sof.com.vn</p>
              </div>
            </div>
            <a
              href="https://sof.com.vn"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-blue-800 hover:bg-blue-50 text-xs font-bold shrink-0 transition-colors"
            >
              <span>Mua ngay</span>
              <ExternalLink size={12} />
            </a>
          </div>

          {/* Navigation Links */}
          <div className="pt-1 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
            <Link
              to={ROUTES.portal}
              className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-primary-700 transition-colors py-1 px-2 rounded-lg hover:bg-slate-100"
            >
              <ArrowLeft size={14} />
              <span>Về Cổng Chọn Hệ Thống</span>
            </Link>

            <Link
              to={ROUTES.employeeLogin}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100 transition-colors shadow-sm"
            >
              <CheckCircle2 size={13} className="text-emerald-600" />
              <span>Cổng Điểm Danh Nhân Viên</span>
            </Link>
          </div>

          {/* Footer Copyright */}
          <p className="text-center text-xs text-slate-500 font-semibold pt-1">
            © 2026 POWERED BY <span className="text-red-600 font-bold">SOF.COM.VN</span>
          </p>
        </div>
      </div>
    </div>
  )
}
