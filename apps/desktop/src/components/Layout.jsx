import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Activity, BarChart3, Camera, LogOut, Menu, ScanFace, Settings, UserRound, Users, X } from 'lucide-react'
import { api, clearSessionToken, SESSION_EXPIRED_EVENT } from '../services/api'
import { ROUTES } from '../config/routes'

const navGroups = [
  { title: 'Vận hành', items: [
    { to: ROUTES.dashboard, label: 'Tổng quan', icon: Activity },
    { to: ROUTES.attendance, label: 'Điểm danh', icon: ScanFace },
    { to: ROUTES.cameras, label: 'Camera', icon: Camera },
  ] },
  { title: 'Dữ liệu', items: [
    { to: ROUTES.employees, label: 'Nhân viên & khuôn mặt', icon: Users },
    { to: ROUTES.reports, label: 'Báo cáo điểm danh', icon: BarChart3 },
    { to: ROUTES.accounts, label: 'Tài khoản', icon: UserRound },
  ] },
  { title: 'Hệ thống', items: [{ to: ROUTES.settings, label: 'Cài đặt', icon: Settings }] },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024)
  const [apiStatus, setApiStatus] = useState('checking')
  const [authState, setAuthState] = useState({ loading: true, authenticated: false, user: null })
  const location = useLocation()

  useEffect(() => {
    checkSession()
    checkApi()
    const apiTimer = window.setInterval(checkApi, 10000)
    const sessionTimer = window.setInterval(checkSession, 15000)
    return () => {
      window.clearInterval(apiTimer)
      window.clearInterval(sessionTimer)
    }
  }, [])

  useEffect(() => {
    const onExpired = () => setAuthState({ loading: false, authenticated: false, user: null })
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  useEffect(() => {
    if (window.innerWidth < 1024) setSidebarOpen(false)
  }, [location.pathname])

  async function checkSession() {
    try {
      const response = await api.sessionStatus()
      if (response?.authenticated) {
        setAuthState({ loading: false, authenticated: true, user: response.user || null })
      } else {
        clearSessionToken()
        setAuthState({ loading: false, authenticated: false, user: null })
      }
    } catch {
      clearSessionToken()
      setAuthState({ loading: false, authenticated: false, user: null })
    }
  }

  async function checkApi() {
    try {
      const response = await api.health()
      setApiStatus(response?.status === 'ok' ? 'ok' : 'error')
    } catch {
      setApiStatus('error')
    }
  }

  async function handleLogout() {
    try {
      await api.logout()
    } finally {
      clearSessionToken()
      setAuthState({ loading: false, authenticated: false, user: null })
    }
  }

  if (authState.loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">Đang kiểm tra phiên...</div>
  if (!authState.authenticated) return <Navigate to={ROUTES.login} replace />

  const statusClass = apiStatus === 'ok' ? 'bg-emerald-500' : apiStatus === 'error' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'
  const userName = authState.user?.name || authState.user?.username || 'Quản trị viên'

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[280px] border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
          <div>
            <div className="text-lg font-black tracking-tight text-slate-900">CovaVision</div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span className={`h-1.5 w-1.5 rounded-full ${statusClass}`} />
              {apiStatus === 'ok' ? 'API online' : apiStatus === 'error' ? 'API offline' : 'Đang kiểm tra'}
            </div>
          </div>
          <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Đóng menu"><X size={18} /></button>
        </div>
        <nav className="space-y-5 overflow-y-auto px-3 py-5">
          {navGroups.map(group => (
            <div key={group.title}>
              <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group.title}</div>
              <div className="space-y-1">
                {group.items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === ROUTES.dashboard}
                    onClick={() => window.innerWidth < 1024 && setSidebarOpen(false)}
                    className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <item.icon size={17} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-slate-100 bg-white p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-sm font-bold text-blue-700">{userName[0]?.toUpperCase()}</div>
            <div className="min-w-0"><div className="truncate text-sm font-semibold">{userName}</div><div className="truncate text-xs text-slate-400">CovaVision</div></div>
          </div>
          <button onClick={handleLogout} className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600"><LogOut size={15} /> Đăng xuất</button>
        </div>
      </aside>
      <div className="min-h-dvh lg:pl-[280px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setSidebarOpen(value => !value)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Mở menu"><Menu size={20} /></button>
          <div className="flex-1 text-sm font-semibold text-slate-700">Hệ thống điểm danh khuôn mặt</div>
          <NavLink to={ROUTES.attendance} className="hidden rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 sm:inline-flex">Bắt đầu điểm danh</NavLink>
        </header>
        <main className="p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  )
}
