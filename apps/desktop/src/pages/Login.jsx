import { useEffect, useState } from 'react'
import { Eye, EyeOff, LockKeyhole, ScanFace, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api, setSessionToken } from '../services/api'
import { ROUTES } from '../config/routes'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const savedRemember = localStorage.getItem('covavision.remember') === 'true'
    if (savedRemember) {
      setUsername(localStorage.getItem('covavision.username') || '')
      setRemember(true)
    }
    api.sessionStatus()
      .then(response => {
        if (response?.authenticated) navigate(ROUTES.dashboard, { replace: true })
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [navigate])

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await api.login(username.trim(), password)
      if (!response?.success) throw new Error(response?.message || 'Thông tin đăng nhập không đúng.')
      setSessionToken(response.access_token || response.token)
      if (remember) {
        localStorage.setItem('covavision.remember', 'true')
        localStorage.setItem('covavision.username', username.trim())
      } else {
        localStorage.removeItem('covavision.remember')
        localStorage.removeItem('covavision.username')
      }
      navigate(ROUTES.dashboard, { replace: true })
    } catch (submitError) {
      setError(submitError?.message || 'Không thể kết nối CovaVision API.')
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="cv-login-portal flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="cv-spinner" style={{ width: 32, height: 32, borderTopColor: 'var(--cv-brand-400)' }} />
          <span className="text-sm font-medium text-slate-400">Đang kiểm tra phiên...</span>
        </div>
      </div>
    )
  }

  return (
    <main className="cv-login-portal flex items-center justify-center px-4 py-8">
      {/* Login Card */}
      <div
        className={`w-full max-w-md cv-scale-in ${shaking ? 'cv-shake' : ''}`}
        style={{
          background: 'var(--cv-glass-bg)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 'var(--cv-radius-2xl)',
          boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          padding: '2rem',
        }}
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl cv-slide-up"
            style={{
              background: 'linear-gradient(135deg, var(--cv-brand-500), var(--cv-brand-700))',
              boxShadow: '0 8px 30px -5px rgba(37, 99, 235, 0.5)',
            }}
          >
            <ScanFace size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--cv-text-primary)' }}>
            CovaVision
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--cv-text-tertiary)' }}>
            Đăng nhập hệ thống điểm danh khuôn mặt
          </p>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="space-y-5">
          {error && (
            <div
              className="cv-slide-up rounded-xl px-4 py-3 text-sm font-medium"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--cv-danger-400)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              {error}
            </div>
          )}

          {/* Username */}
          <label className="block">
            <span className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--cv-text-secondary)' }}>Tài khoản</span>
            <span className="relative block">
              <UserRound className="absolute left-3 top-1/2 -translate-y-1/2" size={17} style={{ color: 'var(--cv-text-tertiary)' }} />
              <input
                value={username}
                onChange={event => setUsername(event.target.value)}
                className="cv-input"
                style={{ paddingLeft: '2.5rem' }}
                placeholder="Nhập tên tài khoản"
                autoComplete="username"
                required
              />
            </span>
          </label>

          {/* Password */}
          <label className="block">
            <span className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--cv-text-secondary)' }}>Mật khẩu</span>
            <span className="relative block">
              <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2" size={17} style={{ color: 'var(--cv-text-tertiary)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="cv-input"
                style={{ paddingLeft: '2.5rem', paddingRight: '2.75rem' }}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 transition-colors"
                style={{ color: 'var(--cv-text-tertiary)' }}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          {/* Remember */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={event => setRemember(event.target.checked)}
              className="h-4 w-4 rounded accent-blue-600"
            />
            <span className="text-sm" style={{ color: 'var(--cv-text-secondary)' }}>Ghi nhớ tài khoản trên máy này</span>
          </label>

          {/* Submit */}
          <button
            disabled={loading}
            className="cv-btn cv-btn-primary w-full"
            style={{ padding: '0.75rem 1.5rem', fontSize: '0.9375rem' }}
          >
            {loading ? (
              <>
                <div className="cv-spinner" style={{ width: 18, height: 18, borderTopColor: 'white' }} />
                Đang đăng nhập...
              </>
            ) : (
              'Đăng nhập'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-xs" style={{ color: 'var(--cv-text-tertiary)', opacity: 0.7 }}>
          Camera và dữ liệu chỉ đi qua CovaVision API đã cấu hình.
        </p>
      </div>
    </main>
  )
}
