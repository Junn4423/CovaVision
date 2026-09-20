import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Activity, BarChart3, Building2, Camera, CreditCard, ExternalLink, Globe, LogOut, Menu, Moon, ScanFace, Settings, Sun, UserRound, Users, X } from 'lucide-react'
import { api, clearSessionToken, SESSION_EXPIRED_EVENT } from '../services/api'
import { useTheme } from '../contexts/ThemeContext'
import { ROUTES } from '../config/routes'

const navGroups = [
  { title: 'Vận hành', items: [
    { to: ROUTES.dashboard, label: 'Tổng quan', icon: Activity },
    { to: ROUTES.attendance, label: 'Điểm danh', icon: ScanFace },
    { to: ROUTES.cameras, label: 'Camera', icon: Camera },
  ] },
  { title: 'Dữ liệu', items: [
    { to: ROUTES.employees, label: 'Nhân viên & khuôn mặt', icon: Users },
    { to: ROUTES.departments, label: 'Phòng ban & Chức vụ', icon: Building2 },
    { to: ROUTES.reports, label: 'Báo cáo điểm danh', icon: BarChart3 },
    { to: ROUTES.accounts, label: 'Tài khoản', icon: UserRound },
  ] },
  { title: 'Hệ thống', items: [{ to: ROUTES.billing, label: 'Gói & thanh toán', icon: CreditCard }, { to: ROUTES.settings, label: 'Cài đặt', icon: Settings }] },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024)
  const [apiStatus, setApiStatus] = useState('checking')
  const [authState, setAuthState] = useState({ loading: true, authenticated: false, user: null })
  const location = useLocation()
  const { isDark, toggleTheme } = useTheme()

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

  const [isKiosk, setIsKiosk] = useState(false)

  useEffect(() => {
    const handleKiosk = (e) => setIsKiosk(Boolean(e.detail))
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isKiosk) {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {})
        }
        setIsKiosk(false)
        window.dispatchEvent(new CustomEvent('covavision:kiosk-mode', { detail: false }))
      }
    }
    window.addEventListener('covavision:kiosk-mode', handleKiosk)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('covavision:kiosk-mode', handleKiosk)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isKiosk])

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

  if (authState.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--cv-bg-page)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="cv-spinner" style={{ width: 32, height: 32 }} />
          <span className="text-sm font-medium" style={{ color: 'var(--cv-text-tertiary)' }}>Đang kiểm tra phiên...</span>
        </div>
      </div>
    )
  }

  if (!authState.authenticated) return <Navigate to={ROUTES.login} replace />

  const userName = authState.user?.name || authState.user?.username || 'Quản trị viên'
  const userRole = authState.user?.role || 'ADMIN'

  if (isKiosk) {
    return (
      <div className="min-h-screen w-screen bg-black overflow-hidden select-none">
        <Outlet />
      </div>
    )
  }

  return (
    <div className="min-h-dvh" style={{ background: 'var(--cv-bg-page)', color: 'var(--cv-text-primary)' }}>
      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden cv-fade-in"
          style={{ background: 'var(--cv-bg-overlay)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 ease-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          width: 'var(--cv-sidebar-width)',
          background: 'var(--cv-bg-sidebar)',
          borderRight: '1px solid var(--cv-border-default)',
        }}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-5" style={{ borderBottom: '1px solid var(--cv-border-light)' }}>
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'linear-gradient(135deg, var(--cv-brand-600), var(--cv-brand-700))' }}>
                <ScanFace size={16} className="text-white" />
              </div>
              <span className="text-lg font-black tracking-tight" style={{ color: 'var(--cv-text-primary)' }}>CovaVision</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 pl-[42px]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: apiStatus === 'ok' ? 'var(--cv-accent-500)' : apiStatus === 'error' ? 'var(--cv-danger-500)' : 'var(--cv-warning-500)',
                  animation: apiStatus === 'checking' ? 'cvPulse 2s infinite' : 'none',
                }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--cv-text-tertiary)' }}>
                {apiStatus === 'ok' ? 'Online' : apiStatus === 'error' ? 'Offline' : 'Kiểm tra...'}
              </span>
            </div>
          </div>
          <button
            className="rounded-lg p-2 lg:hidden"
            style={{ color: 'var(--cv-text-tertiary)' }}
            onClick={() => setSidebarOpen(false)}
            aria-label="Đóng menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navGroups.map(group => (
            <div key={group.title}>
              <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--cv-text-tertiary)' }}>
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === ROUTES.dashboard}
                    onClick={() => window.innerWidth < 1024 && setSidebarOpen(false)}
                    className={({ isActive }) => `cv-sidebar-link ${isActive ? 'active' : ''}`}
                  >
                    <item.icon size={17} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4" style={{ borderTop: '1px solid var(--cv-border-light)' }}>
          <div className="mb-3 flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold"
              style={{ background: 'linear-gradient(135deg, var(--cv-brand-100), var(--cv-brand-200))', color: 'var(--cv-brand-700)' }}
            >
              {userName[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold" style={{ color: 'var(--cv-text-primary)' }}>{userName}</div>
              <div className="truncate text-xs" style={{ color: 'var(--cv-text-tertiary)' }}>{userRole}</div>
            </div>
            <button
              onClick={toggleTheme}
              className="cv-btn-ghost cv-btn-icon"
              aria-label={isDark ? 'Chế độ sáng' : 'Chế độ tối'}
              title={isDark ? 'Chế độ sáng' : 'Chế độ tối'}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="cv-btn cv-btn-ghost w-full justify-center"
            style={{ color: 'var(--cv-text-secondary)' }}
          >
            <LogOut size={15} /> Đăng xuất
          </button>
          <a
            href="https://covasol.com.vn"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 flex items-center justify-center gap-1.5 py-1 text-xs font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors"
            title="Website Covasol (covasol.com.vn)"
          >
            <Globe size={13} />
            <span>Website covasol.com.vn</span>
            <ExternalLink size={11} />
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <div className="min-h-dvh transition-[padding] duration-300 lg:pl-[280px]">
        {/* Top Bar */}
        <header
          className="sticky top-0 z-30 flex h-16 items-center gap-3 px-4 sm:px-6"
          style={{
            background: 'var(--cv-glass-bg)',
            backdropFilter: 'var(--cv-glass-blur)',
            WebkitBackdropFilter: 'var(--cv-glass-blur)',
            borderBottom: '1px solid var(--cv-border-light)',
          }}
        >
          <button
            onClick={() => setSidebarOpen(value => !value)}
            className="cv-btn-ghost cv-btn-icon lg:hidden"
            aria-label="Mở menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1 text-sm font-semibold" style={{ color: 'var(--cv-text-secondary)' }}>
            Hệ thống điểm danh khuôn mặt
          </div>
          <a
            href="https://covasol.com.vn"
            target="_blank"
            rel="noopener noreferrer"
            className="cv-btn cv-btn-ghost cv-btn-sm text-xs font-semibold gap-1.5 hidden md:inline-flex text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
            title="Website Covasol (covasol.com.vn)"
          >
            <Globe size={14} />
            <span>Liên hệ Covasol</span>
            <ExternalLink size={12} />
          </a>
          <NavLink to={ROUTES.attendance} className="cv-btn cv-btn-primary cv-btn-sm hidden sm:inline-flex">
            <ScanFace size={15} /> Bắt đầu điểm danh
          </NavLink>
        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6">
          <div className="cv-page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
