import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ShoppingCart,
  ExternalLink,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react'
import { api, clearSessionToken, setSessionToken } from '../services/api'
import { ROUTES } from '../config/routes'

export default function EmployeeLogin() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    verifyEmployeeSession()
  }, [])

  async function verifyEmployeeSession() {
    try {
      const res = await api.employeeStatus()
      if (res?.authenticated && res?.is_employee) {
        navigate(ROUTES.employeeAttendance, { replace: true })
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
      clearSessionToken()
      const response = await api.employeeLogin(form.username, form.password)
      if (response?.success) {
        setSessionToken(response.token || response.access_token)
        navigate(ROUTES.employeeAttendance, { replace: true })
        return
      }
      setError(response?.message || 'Tài khoản hoặc mật khẩu không chính xác.')
    } catch (error) {
      setError(error?.message || 'Không thể kết nối đến CovaVision API.')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Đang kiểm tra phiên...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-slate-100 px-4 py-8">
      <div className="w-full max-w-md space-y-5">
        {/* Header matching Mobile EmployeeLoginScreen */}
        <div className="text-center mb-6">
          <div className="inline-flex w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden bg-white shadow-md border border-slate-100 p-2.5 mb-3">
            <img src="/icon.png" alt="SOF Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
            <span className="text-red-500">SOF </span>
            <span className="text-blue-700">FACE </span>
            <span className="text-red-500">AI</span>
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Hệ thống Chấm công & Nhận diện</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200 shadow-xl shadow-slate-100 space-y-4">
          {error && (
            <div className="px-3 py-2.5 rounded-xl border border-red-100 bg-red-50 text-red-600 text-xs sm:text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Mã nhân viên
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User size={17} />
              </div>
              <input
                type="text"
                value={form.username}
                onChange={event => setForm({ ...form, username: event.target.value })}
                placeholder="Mã nhân viên"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all text-sm text-slate-800"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Mật khẩu
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock size={17} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={event => setForm({ ...form, password: event.target.value })}
                placeholder="Nhập mật khẩu"
                className="w-full pl-10 pr-11 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all text-sm text-slate-800"
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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold text-sm hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 transition-all shadow-md shadow-emerald-500/20"
          >
            {loading ? 'Đang đăng nhập...' : 'Vào chấm công'}
          </button>
        </form>

        {/* Banner Mua Tài Khoản (Sync with mobile) */}
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

        {/* Links */}
        <div className="pt-1 flex items-center justify-center gap-4 text-xs font-medium text-slate-500">
          <Link to={ROUTES.portal} className="inline-flex items-center gap-1 hover:text-slate-800 transition-colors">
            <ArrowLeft size={13} />
            <span>Về Cổng Chọn Hệ Thống</span>
          </Link>
          <span>•</span>
          <Link to={ROUTES.login} className="inline-flex items-center gap-1 hover:text-slate-800 transition-colors">
            <ShieldCheck size={13} />
            <span>Đăng nhập quản trị</span>
          </Link>
        </div>

        {/* Footer Copyright */}
        <p className="text-center text-xs text-slate-500 font-semibold pt-1">
          © 2026 POWERED BY <span className="text-red-600 font-bold">SOF.COM.VN</span>
        </p>
      </div>
    </div>
  )
}
