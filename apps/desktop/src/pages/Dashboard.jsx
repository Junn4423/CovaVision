import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  CheckCircle2,
  Clock,
  UserX,
  ScanFace,
  BarChart3,
  HardDrive,
  Settings,
  ArrowRight,
  ShieldCheck,
  Server,
  Zap,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { api } from '../services/api'
import { ROUTES } from '../config/routes'
import { getPendingAttendanceQueue } from '../services/deviceDataService'
import { getGatewayAuth } from '../services/api'

function formatStorageSize(storageMb) {
  if (typeof storageMb !== 'number' || Number.isNaN(storageMb)) return '0 MB'
  if (storageMb >= 1024) {
    return `${(storageMb / 1024).toFixed(2)} GB`
  }
  return `${storageMb.toFixed(2)} MB`
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [systemStats, setSystemStats] = useState(null)
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0)
  const [activeAiHost, setActiveAiHost] = useState('')

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const [statsRes, systemStatsRes, actRes] = await Promise.all([
        api.getStats().catch(() => ({ success: false })),
        api.getSystemStorageStats().catch(() => ({ success: false })),
        api.getRecentActivity().catch(() => ({ success: false })),
      ])

      if (statsRes?.success) setStats(statsRes.data)
      if (systemStatsRes?.success) setSystemStats(systemStatsRes.data)
      if (actRes?.success) setActivities(actRes.activities || [])

      const queue = getPendingAttendanceQueue()
      setPendingOfflineCount(queue.length)

      const auth = getGatewayAuth()
      const configuredHost = String(
        localStorage.getItem('facecheck.active_ai_host')
          || auth?.gateway_data?.ai_channels
          || '',
      ).split(/[;,]/)[0].trim()
      const isPrivateEndpoint = /^https?:\/\//i.test(configuredHost)
        || /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(configuredHost)
      setActiveAiHost(
        isPrivateEndpoint
          ? 'Máy chủ AI qua gateway'
          : (configuredHost || 'Máy chủ AI Chính'),
      )
    } catch (e) {
      console.error('Dashboard load error:', e)
    } finally {
      setLoading(false)
    }
  }

  const currentDate = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <div className="space-y-6">
      {/* Top Header & Fast Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Tổng quan chức năng</h1>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200">
              SOF Face AI
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 font-medium capitalize">
            {currentDate} · Trực quan hóa dữ liệu chấm công và tài nguyên hệ thống
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadData}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
            title="Làm mới số liệu"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <Link
            to={ROUTES.attendance}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-[0.99]"
          >
            <ScanFace size={16} />
            <span>Bắt đầu chấm công toàn công ty</span>
          </Link>
        </div>
      </div>

      {/* Offline Pending Alert Bar (if records exist) */}
      {pendingOfflineCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-900">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle size={18} />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold">
                Có {pendingOfflineCount} lượt chấm công lưu tạm trong bộ nhớ máy chưa gửi lên ERP
              </p>
              <p className="text-[11px] text-amber-700">
                Các bản ghi này đã được lưu an toàn cục bộ và sẵn sàng đồng bộ khi kết nối ERP thông suốt.
              </p>
            </div>
          </div>
          <Link
            to={ROUTES.deviceData}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-700 px-3.5 py-1.5 text-xs font-bold text-white shadow hover:bg-amber-800 transition-colors"
          >
            <span>Xem & Đồng bộ ngay</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* KPI Bento Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="desktop-bento-stat rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/70 via-white to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Tổng nhân sự</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <Users size={16} />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900 font-mono">
            {stats?.total_employees ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Đã đăng ký trong hệ sinh thái</p>
        </div>

        <div className="desktop-bento-stat rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Có mặt hôm nay</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black text-emerald-700 font-mono">
            {stats?.present_today ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Đã điểm danh qua khuôn mặt</p>
        </div>

        <div className="desktop-bento-stat rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/70 via-white to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Đi muộn</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Clock size={16} />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black text-amber-700 font-mono">
            {stats?.late_today ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Sau giờ quy định của ca</p>
        </div>

        <div className="desktop-bento-stat rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50/70 via-white to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Vắng mặt</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <UserX size={16} />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black text-rose-700 font-mono">
            {stats?.absent_today ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Chưa ghi nhận ca làm</p>
        </div>
      </div>

      {/* Desktop Quick Actions Grid - Synchronized with Mobile Feature Hub */}
      <div className="space-y-2.5">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">Tính năng hệ thống</h2>
          <p className="text-xs text-slate-400">Nhấp để truy cập nhanh các phân hệ nghiệp vụ</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Link
            to={ROUTES.attendance}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all group"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <ScanFace size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 truncate">Bắt đầu chấm công</p>
              <p className="text-[10px] text-slate-400 truncate">Nhận diện khuôn mặt qua camera</p>
            </div>
          </Link>

          <Link
            to={ROUTES.report}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 group-hover:bg-blue-700 group-hover:text-white transition-colors">
              <BarChart3 size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 group-hover:text-blue-700 truncate">Báo cáo & Dữ liệu</p>
              <p className="text-[10px] text-slate-400 truncate">Đồng bộ ERP và bộ nhớ máy</p>
            </div>
          </Link>

          <Link
            to={ROUTES.offlineManage}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md hover:border-pink-300 transition-all group"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-pink-700 group-hover:bg-pink-700 group-hover:text-white transition-colors">
              <Users size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 group-hover:text-pink-700 truncate">Nhân sự & Khuôn mặt</p>
              <p className="text-[10px] text-slate-400 truncate">Quản lý mẫu mặt và tài khoản</p>
            </div>
          </Link>

          <Link
            to={ROUTES.onlineSync}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all group"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 group-hover:bg-emerald-700 group-hover:text-white transition-colors">
              <HardDrive size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 truncate">Tải dữ liệu từ ERP</p>
              <p className="text-[10px] text-slate-400 truncate">Đồng bộ danh sách nhân viên</p>
            </div>
          </Link>

          <Link
            to={ROUTES.systemSettings}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md hover:border-amber-300 transition-all group"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 group-hover:bg-amber-700 group-hover:text-white transition-colors">
              <Settings size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 group-hover:text-amber-700 truncate">Cài đặt & Camera</p>
              <p className="text-[10px] text-slate-400 truncate">Camera RTSP và cấu hình</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Split Widescreen Section: Left Table (65%), Right System Resources (35%) */}
      <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
        {/* Left: Recent Activity Feed */}
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Lượt Chấm Công Gần Đây</h2>
                <p className="text-xs text-slate-400">Các lượt ghi nhận thời gian thực trong ngày hôm nay</p>
              </div>
              <Link to={ROUTES.report} className="text-xs font-bold text-blue-700 hover:underline">
                Xem toàn bộ →
              </Link>
            </div>

            <div className="divide-y divide-slate-100 overflow-x-auto">
              {activities.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  {loading ? 'Đang nạp dữ liệu hoạt động...' : 'Chưa có lượt chấm công nào hôm nay.'}
                </div>
              ) : (
                activities.slice(0, 7).map((act, i) => (
                  <div key={i} className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 font-black text-xs border border-blue-200/60">
                        {String(act.name || 'N').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-xs sm:text-sm text-slate-800 truncate">{act.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{act.department || act.employee_id || 'Nhân sự'}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-block px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-full border border-emerald-200">
                        {act.status || 'Hợp lệ'}
                      </span>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">{act.time}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: System Resources & AI Node Status */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Hạ Tầng & Tài Nguyên</h2>
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Sẵn sàng
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50">
                <span className="text-slate-500 font-medium">Nhân viên trong hệ thống</span>
                <span className="font-bold text-slate-800 font-mono">{systemStats?.employee_count ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50">
                <span className="text-slate-500 font-medium">Ảnh mẫu khuôn mặt AI</span>
                <span className="font-bold text-blue-700 font-mono">{systemStats?.face_sample_count ?? 0} mẫu</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50">
                <span className="text-slate-500 font-medium">Dung lượng dữ liệu</span>
                <span className="font-bold text-slate-800 font-mono">{formatStorageSize(systemStats?.storage_mb)}</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50">
                <span className="text-slate-500 font-medium">Camera đang bật</span>
                <span className="font-bold text-emerald-700 font-mono">{systemStats?.enabled_camera_count ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1.5">
                <span className="text-slate-500 font-medium">Máy chủ AI phục vụ</span>
                <span className="font-bold text-blue-800 truncate max-w-[170px]" title={activeAiHost}>
                  {activeAiHost}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-900 to-slate-900 p-5 text-white shadow-md">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-blue-300">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-blue-200">SOF Biometric Engine</h3>
                <p className="text-[11px] text-slate-300">Nhận diện khuôn mặt chuẩn xác dưới 0.3s</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-300 leading-relaxed">
              Hệ thống tự động đồng bộ 2 chiều với nền tảng ERP nhân sự và hỗ trợ đa kênh máy chủ AI.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
