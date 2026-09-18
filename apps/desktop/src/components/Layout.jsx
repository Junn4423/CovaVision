import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api, clearSessionToken, SESSION_EXPIRED_EVENT } from '../services/api'
import {
  Home,
  Camera,
  UserPlus,
  Video,
  Search,
  Settings,
  BarChart,
  Shuffle,
  Users,
  KeyRound,
  HardDrive,
  ScanFace,
} from 'lucide-react'
import { ROUTES } from '../config/routes'
import {
  MODULE_SETTINGS_EVENT,
  MODULE_TOGGLE_KEYS,
  getModuleVisibility,
} from '../services/moduleSettings'
import { syncSystemSettingsFromServer } from '../services/systemSettingsStore'
import { getPendingAttendanceQueue } from '../services/deviceDataService'

const navGroups = [
  {
    title: 'Tổng quan',
    items: [
      { to: ROUTES.dashboard, label: 'Tổng quan chức năng', icon: Home },
    ],
  },
  {
    title: 'Chấm công',
    items: [
      { to: ROUTES.attendance, label: 'Bắt đầu chấm công toàn công ty', icon: ScanFace, moduleKey: MODULE_TOGGLE_KEYS.attendance },
    ],
  },
  {
    title: 'Quản lý Nhân sự',
    items: [
      { to: ROUTES.offlineManage, label: 'Nhân viên & Khuôn mặt', icon: Users, moduleKey: MODULE_TOGGLE_KEYS.offlineManage },
      { to: ROUTES.onlineSync, label: 'Tải dữ liệu từ ERP', icon: UserPlus, moduleKey: MODULE_TOGGLE_KEYS.onlineSync },
      { to: ROUTES.syncVerify, label: 'Đối soát dữ liệu ERP', icon: Shuffle, moduleKey: MODULE_TOGGLE_KEYS.syncVerify },
      { to: ROUTES.accountManagement, label: 'Tài khoản nhân viên', icon: KeyRound, moduleKey: MODULE_TOGGLE_KEYS.accountManagement },
    ],
  },
  {
    title: 'Báo cáo & Dữ liệu',
    items: [
      { to: ROUTES.report, label: 'Trung tâm Báo cáo & Dữ liệu', icon: BarChart, moduleKey: MODULE_TOGGLE_KEYS.report },
      { to: ROUTES.onlineAttendanceCheck, label: 'Báo cáo đã đồng bộ ERP', icon: Search, moduleKey: MODULE_TOGGLE_KEYS.onlineAttendanceCheck },
      { to: ROUTES.deviceData, label: 'Dữ liệu bộ nhớ máy', icon: HardDrive, moduleKey: MODULE_TOGGLE_KEYS.deviceData },
    ],
  },
  {
    title: 'Cài đặt & Camera',
    items: [
      { to: ROUTES.cameraManagement, label: 'Quản lý Camera RTSP', icon: Video, moduleKey: MODULE_TOGGLE_KEYS.cameraManagement },
      { to: ROUTES.systemSettings, label: 'Cài đặt & Quản lý Camera', icon: Settings },
    ],
  },
]

const routedSystemNames = {
  hr: 'Hệ thống Nhân Sự',
  er: 'Hệ thống ERP',
  lg: 'Hệ thống Vận Tải',
  cf: 'Chuỗi hệ thống Cafe, Nhà Hàng Quán Ăn',
  ht: 'Hệ thống Khách Sạn',
  pk: 'Hệ thống Bãi Xe',
  sl: 'Hệ thống Bán Hàng',
}

export default function Layout() {
  const [apiStatus, setApiStatus] = useState('checking')
  const [moduleVisibility, setModuleVisibility] = useState(() => getModuleVisibility())
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('sidebarOpen')
    if (saved !== null) return saved === 'true'
    if (typeof window !== 'undefined') return window.innerWidth >= 1024
    return true
  })
  const [authState, setAuthState] = useState({
    loading: true,
    authenticated: false,
    user: null,
  })
  const [offlineCount, setOfflineCount] = useState(0)
  const location = useLocation()

  useEffect(() => {
    function updateOffline() {
      const q = getPendingAttendanceQueue()
      setOfflineCount(q.length)
    }
    updateOffline()
    const t = setInterval(updateOffline, 8000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    checkSession()
    checkApi()
    const apiInterval = setInterval(checkApi, 10000)
    const sessionInterval = setInterval(checkSession, 15000)
    return () => {
      clearInterval(apiInterval)
      clearInterval(sessionInterval)
    }
  }, [])

  useEffect(() => {
    if (!authState.authenticated) {
      return
    }

    syncSystemSettingsFromServer()
  }, [authState.authenticated])

  useEffect(() => {
    function handleSessionExpired() {
      setAuthState({ loading: false, authenticated: false, user: null })
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired)
  }, [])

  useEffect(() => {
    function refreshModuleVisibility() {
      setModuleVisibility(getModuleVisibility())
    }

    refreshModuleVisibility()
    window.addEventListener(MODULE_SETTINGS_EVENT, refreshModuleVisibility)
    window.addEventListener('storage', refreshModuleVisibility)
    return () => {
      window.removeEventListener(MODULE_SETTINGS_EVENT, refreshModuleVisibility)
      window.removeEventListener('storage', refreshModuleVisibility)
    }
  }, [])


  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
  }, [location.pathname])

  function toggleSidebar() {
    const next = !sidebarOpen
    setSidebarOpen(next)
    localStorage.setItem('sidebarOpen', String(next))
  }

  async function checkSession() {
    try {
      const res = await api.sessionStatus()
      if (res.is_admin) {
        setAuthState({
          loading: false,
          authenticated: true,
          user: {
            name: res.user?.name || 'Admin',
            code: res.user?.code || 'admin',
              department: res.user?.department || 'Quản trị viên',
            route_prefix: res.user?.route_prefix || '',
            system_name: res.user?.system_name || '',
            system_note: res.user?.system_note || '',
            welcome_message: res.user?.welcome_message || '',
          },
        })
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
      const res = await api.health()
      setApiStatus(res.status === 'ok' ? 'ok' : 'error')
    } catch {
      setApiStatus('error')
    }
  }

  async function handleLogout() {
    try {
      await api.logout()
    } finally {
      clearSessionToken()
      localStorage.removeItem('savedUsername')
      localStorage.removeItem('savedPassword')
      localStorage.removeItem('rememberLogin')
      setAuthState({ loading: false, authenticated: false, user: null })
    }
  }

  if (authState.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Đang kiểm tra phiên...</p>
        </div>
      </div>
    )
  }

  if (!authState.authenticated) {
    return <Navigate to={ROUTES.login} replace />
  }

  const statusDot = {
    ok: 'bg-emerald-400',
    error: 'bg-red-400',
    checking: 'bg-amber-400 animate-pulse',
  }
  const routedPrefix = (authState.user?.route_prefix || '').trim().toLowerCase()
  const resolvedSystemName = authState.user?.system_name
    || authState.user?.system_note
    || routedSystemNames[routedPrefix]
    || ''
  const welcomeMessage = resolvedSystemName
    ? `Xin chào, đây là hệ thống chấm công ${resolvedSystemName}`
    : (authState.user?.welcome_message || '')

  return (
    <div className="relative min-h-dvh bg-slate-50 overflow-x-hidden">
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-slate-900/50 sidebar-overlay backdrop-blur-[1px]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed top-0 left-0 z-50 h-screen
        w-[84vw] max-w-[300px] sm:w-[260px] bg-white border-r border-slate-200
        flex flex-col transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden bg-white shrink-0">
            <img src="/icon.png" alt="SOF Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-slate-900">
              <span className="text-red-600">SOF </span>
              <span className="text-blue-700">FACE AI</span>
            </h1>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${statusDot[apiStatus]}`} />
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
                {apiStatus === 'ok' ? 'Online' : apiStatus === 'error' ? 'Offline' : '...'}
              </span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-3 overflow-y-auto">
          {navGroups.map(group => {
            const visibleItems = group.items.filter(
              item => !item.moduleKey || moduleVisibility[item.moduleKey] !== false
            )
            if (visibleItems.length === 0) return null
            return (
              <div key={group.title} className="space-y-0.5">
                <div className="px-3 pt-1.5 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {group.title}
                </div>
                {visibleItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === ROUTES.dashboard}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                        isActive
                          ? 'bg-primary-50 text-primary-700 shadow-sm shadow-primary-100 font-bold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                      }`
                    }
                  >
                    <span className="flex items-center justify-center w-5 text-center shrink-0">
                      <item.icon size={17} strokeWidth={2.2} />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 font-semibold text-xs">
              {(authState.user?.name || authState.user?.code || '?')[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700 truncate">{authState.user?.name || authState.user?.code}</p>
              <p className="text-xs text-slate-400 truncate">{authState.user?.department || 'ERP Session'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors text-center"
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      <div className={`min-h-dvh min-w-0 flex flex-col transition-[margin] duration-300 ${
        sidebarOpen ? 'lg:ml-[260px]' : 'lg:ml-0'
      }`}>
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/60 px-3 sm:px-4 lg:px-6">
          <div className="flex items-center h-12 sm:h-14 gap-3 sm:gap-4">
            <button
              onClick={toggleSidebar}
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-600 transition-colors"
              title={sidebarOpen ? 'Đóng menu' : 'Mở menu'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={sidebarOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'}
                />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              {welcomeMessage && (
                <p className="text-xs sm:text-sm font-medium text-primary-700 truncate">{welcomeMessage}</p>
              )}
            </div>
            <div className="flex items-center gap-2.5 text-xs font-medium">
              {offlineCount > 0 && (
                <NavLink
                  to={ROUTES.deviceData}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800 hover:bg-amber-100 transition-colors"
                  title="Có bản ghi chấm công offline đang chờ gửi lên ERP"
                >
                  <HardDrive size={13} className="text-amber-600" />
                  <span>Chờ gửi ERP: <strong>{offlineCount}</strong></span>
                </NavLink>
              )}
              <NavLink
                to={ROUTES.attendance}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
              >
                <ScanFace size={14} />
                <span>Bắt đầu chấm công</span>
              </NavLink>
              <span className="text-slate-500 hidden md:inline ml-1 font-semibold">{authState.user?.name || authState.user?.code}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 lg:p-6 page-content">
          <div className="w-full mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

