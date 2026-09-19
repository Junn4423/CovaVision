import { useEffect, useRef, useState } from 'react'
import { Building2, Eye, EyeOff, LockKeyhole, Mail, ScanFace, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { ROUTES } from '../config/routes'

const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()

function AuthError({ children }) {
  if (!children) return null
  return (
    <div className="cv-slide-up rounded-xl px-4 py-3 text-sm font-medium" style={{ background: 'rgba(220, 38, 38, 0.1)', color: 'var(--cv-text-danger)', border: '1px solid rgba(220, 38, 38, 0.2)' }}>
      {children}
    </div>
  )
}

export default function Login() {
  const [mode, setMode] = useState('login')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)
  const googleButtonRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const savedRemember = localStorage.getItem('covavision.remember') === 'true'
    if (savedRemember) {
      setIdentifier(localStorage.getItem('covavision.username') || '')
      setRemember(true)
    }
    api.sessionStatus()
      .then(response => {
        if (response?.authenticated) navigate(ROUTES.dashboard, { replace: true })
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [navigate])

  useEffect(() => {
    if (mode !== 'login' || !GOOGLE_CLIENT_ID || !googleButtonRef.current) return undefined
    const renderGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async response => {
          setLoading(true)
          setError('')
          const result = await api.googleLogin(response.credential)
          if (result?.success) navigate(ROUTES.dashboard, { replace: true })
          else setError(result?.message || 'Không thể đăng nhập Google.')
          setLoading(false)
        },
      })
      googleButtonRef.current.replaceChildren()
      window.google.accounts.id.renderButton(googleButtonRef.current, { type: 'standard', theme: 'outline', size: 'large', width: 360, text: 'signin_with' })
    }
    if (window.google?.accounts?.id) {
      renderGoogleButton()
      return undefined
    }
    let script = document.querySelector('script[data-covavision-google-identity]')
    if (!script) {
      script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.dataset.covavisionGoogleIdentity = 'true'
      document.head.appendChild(script)
    }
    script.addEventListener('load', renderGoogleButton)
    return () => script.removeEventListener('load', renderGoogleButton)
  }, [mode, navigate])

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const response = mode === 'login'
      ? await api.login(identifier.trim(), password, { persist: remember })
      : await api.register({ email: identifier.trim(), password, fullName, organizationName })
    if (!response?.success) {
      setError(response?.message || 'Thông tin xác thực không hợp lệ.')
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
      setLoading(false)
      return
    }
    if (mode === 'login' && remember) {
      localStorage.setItem('covavision.remember', 'true')
      localStorage.setItem('covavision.username', identifier.trim())
    } else {
      localStorage.removeItem('covavision.remember')
      localStorage.removeItem('covavision.username')
    }
    navigate(ROUTES.dashboard, { replace: true })
    setLoading(false)
  }

  if (checking) {
    return <div className="cv-login-portal flex items-center justify-center"><div className="flex flex-col items-center gap-3"><div className="cv-spinner" style={{ width: 32, height: 32, borderTopColor: 'var(--cv-brand-400)' }} /><span className="text-sm font-medium" style={{ color: 'var(--cv-text-tertiary)' }}>Đang kiểm tra phiên...</span></div></div>
  }

  const isRegister = mode === 'register'
  return (
    <main className="cv-login-portal flex items-center justify-center px-4 py-8">
      <div className={`w-full max-w-md cv-scale-in ${shaking ? 'cv-shake' : ''}`} style={{ background: 'var(--cv-glass-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 'var(--cv-radius-2xl)', boxShadow: 'var(--cv-shadow-xl)', padding: '2rem' }}>
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, var(--cv-brand-700), var(--cv-brand-500))', boxShadow: 'var(--cv-shadow-glow)' }}><ScanFace size={32} className="text-white" /></div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--cv-text-primary)', fontFamily: 'var(--cv-font-heading)' }}>CovaVision</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--cv-text-tertiary)' }}>{isRegister ? 'Tạo workspace chấm công đầu tiên của bạn' : 'Đăng nhập hệ thống điểm danh khuôn mặt'}</p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-xl p-1" style={{ background: 'var(--cv-bg-muted)' }}>
          {[['login', 'Đăng nhập'], ['register', 'Tạo tài khoản']].map(([value, label]) => (
            <button key={value} type="button" onClick={() => { setMode(value); setError('') }} className="rounded-lg px-3 py-2 text-sm font-bold transition-colors" style={{ background: mode === value ? 'var(--cv-bg-surface)' : 'transparent', color: mode === value ? 'var(--cv-text-brand)' : 'var(--cv-text-tertiary)', boxShadow: mode === value ? 'var(--cv-shadow-sm)' : 'none' }}>{label}</button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <AuthError>{error}</AuthError>
          {isRegister && <>
            <label className="block"><span className="cv-form-label">Tên người quản trị</span><span className="relative block"><UserRound className="cv-login-icon" size={17} /><input value={fullName} onChange={event => setFullName(event.target.value)} className="cv-input" style={{ paddingLeft: '2.5rem' }} placeholder="Nguyễn Văn A" autoComplete="name" /></span></label>
            <label className="block"><span className="cv-form-label">Tên công ty / workspace</span><span className="relative block"><Building2 className="cv-login-icon" size={17} /><input value={organizationName} onChange={event => setOrganizationName(event.target.value)} className="cv-input" style={{ paddingLeft: '2.5rem' }} placeholder="Công ty của tôi" autoComplete="organization" /></span></label>
          </>}
          <label className="block"><span className="cv-form-label">Email {isRegister ? '' : 'hoặc tài khoản'}</span><span className="relative block"><Mail className="cv-login-icon" size={17} /><input value={identifier} onChange={event => setIdentifier(event.target.value)} className="cv-input" style={{ paddingLeft: '2.5rem' }} placeholder={isRegister ? 'you@company.vn' : 'Email hoặc username'} autoComplete="username" required /></span></label>
          <label className="block"><span className="cv-form-label">Mật khẩu</span><span className="relative block"><LockKeyhole className="cv-login-icon" size={17} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} className="cv-input" style={{ paddingLeft: '2.5rem', paddingRight: '2.75rem' }} placeholder={isRegister ? 'Tối thiểu 6 ký tự' : 'Nhập mật khẩu'} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 6 : 1} required /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5" style={{ color: 'var(--cv-text-tertiary)' }} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
          {!isRegister && <label className="flex cursor-pointer select-none items-center gap-2.5"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} className="h-4 w-4 rounded accent-teal-700" /><span className="text-sm" style={{ color: 'var(--cv-text-secondary)' }}>Ghi nhớ tài khoản trên máy này</span></label>}
          <button disabled={loading} className="cv-btn cv-btn-primary w-full" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9375rem' }}>{loading ? <><div className="cv-spinner" style={{ width: 18, height: 18, borderTopColor: 'white' }} /> Đang xử lý...</> : isRegister ? 'Tạo tài khoản dùng thử' : 'Đăng nhập'}</button>
        </form>

        {!isRegister && <>
          <div className="my-5 flex items-center gap-3 text-xs" style={{ color: 'var(--cv-text-tertiary)' }}><span className="h-px flex-1" style={{ background: 'var(--cv-border-default)' }} /> hoặc <span className="h-px flex-1" style={{ background: 'var(--cv-border-default)' }} /></div>
          {GOOGLE_CLIENT_ID ? <div ref={googleButtonRef} className="flex min-h-10 justify-center" /> : <button type="button" className="cv-btn w-full" style={{ border: '1px solid var(--cv-border-default)', color: 'var(--cv-text-secondary)' }} onClick={() => setError('Google OAuth chưa được cấu hình. Hãy đặt VITE_GOOGLE_CLIENT_ID cho desktop và GOOGLE_CLIENT_ID cho backend.')}>Tiếp tục với Google</button>}
        </>}
        <p className="mt-6 text-center text-xs" style={{ color: 'var(--cv-text-tertiary)' }}>{isRegister ? 'Dùng thử 14 ngày · 3 nhân viên · 3 khuôn mặt' : 'Camera và dữ liệu chỉ đi qua CovaVision API đã cấu hình.'}</p>
      </div>
    </main>
  )
}
