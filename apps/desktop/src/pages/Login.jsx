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
    } finally {
      setLoading(false)
    }
  }

  if (checking) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">Đang kiểm tra phiên...</div>

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white"><ScanFace size={30} /></div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">CovaVision</h1>
          <p className="mt-2 text-sm text-slate-500">Đăng nhập hệ thống điểm danh khuôn mặt</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
          <label className="block text-sm font-semibold text-slate-700">Tài khoản
            <span className="relative mt-1.5 block"><UserRound className="absolute left-3 top-3 text-slate-400" size={17} /><input value={username} onChange={event => setUsername(event.target.value)} className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" autoComplete="username" required /></span>
          </label>
          <label className="block text-sm font-semibold text-slate-700">Mật khẩu
            <span className="relative mt-1.5 block"><LockKeyhole className="absolute left-3 top-3 text-slate-400" size={17} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-11 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /> Ghi nhớ tài khoản trên máy này</label>
          <button disabled={loading} className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-400">Camera và dữ liệu chỉ đi qua CovaVision API đã cấu hình.</p>
      </div>
    </main>
  )
}
