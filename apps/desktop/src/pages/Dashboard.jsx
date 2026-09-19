import { useEffect, useMemo, useState } from 'react'
import { Activity, Camera, CheckCircle, Clock, TrendingUp, UserCheck, Users, XCircle } from 'lucide-react'
import { Area, AreaChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { api } from '../services/api'

/* ── helpers ── */
function AnimatedCounter({ value, duration = 800 }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (typeof value !== 'number' || value === display) return
    const start = display
    const diff = value - start
    const startTime = performance.now()
    let raf
    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out
      setDisplay(Math.round(start + diff * eased))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value]) // eslint-disable-line
  return <span className="cv-number-pulse">{display.toLocaleString('vi-VN')}</span>
}

function formatTime(isoStr) {
  try {
    const d = new Date(isoStr)
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  } catch { return '--:--' }
}

function formatDate(isoStr) {
  try {
    const d = new Date(isoStr)
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  } catch { return '--/--' }
}

/* ── Stat Card ── */
function StatCard({ icon: Icon, label, value, color, gradient }) {
  return (
    <div className="cv-card cv-stat-card p-5 flex items-start gap-4">
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
        style={{ background: gradient || `linear-gradient(135deg, ${color}15, ${color}25)` }}
      >
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <div className="text-sm font-semibold" style={{ color: 'var(--cv-text-secondary)' }}>{label}</div>
        <div className="mt-1 text-3xl font-black tracking-tight" style={{ color: 'var(--cv-text-primary)' }}>
          <AnimatedCounter value={typeof value === 'number' ? value : 0} />
        </div>
      </div>
    </div>
  )
}

/* ── Recent Activity Row ── */
function ActivityRow({ record }) {
  const name = record.employee_name || record.employee_id || 'Không xác định'
  const time = formatTime(record.captured_at || record.created_at)
  const accepted = String(record.status || '').toLowerCase() === 'accepted'
  const confidence = record.confidence != null ? `${(Number(record.confidence) * 100).toFixed(0)}%` : null
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors"
      style={{ background: 'var(--cv-bg-surface-hover)' }}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold"
        style={{
          background: accepted ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.1)',
          color: accepted ? 'var(--cv-accent-500)' : 'var(--cv-danger-500)',
        }}
      >
        {accepted ? <CheckCircle size={16} /> : <XCircle size={16} />}
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold" style={{ color: 'var(--cv-text-primary)' }}>{name}</span>
        {confidence && <span className="text-xs" style={{ color: 'var(--cv-text-tertiary)' }}>Độ chính xác: {confidence}</span>}
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums" style={{ color: 'var(--cv-text-tertiary)' }}>{time}</span>
    </div>
  )
}

/* ── Main Page ── */
export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, today: 0, accepted: 0 })
  const [recent, setRecent] = useState([])
  const [employees, setEmployees] = useState([])
  const [cameras, setCameras] = useState([])

  useEffect(() => {
    async function load() {
      try {
        const [statsR, recentR, empR, camR] = await Promise.all([
          api.getStats().catch(() => null),
          api.getRecentActivity().catch(() => null),
          api.getEmployees().catch(() => null),
          api.getCameras().catch(() => null),
        ])
        if (statsR) setStats({ total: statsR.total || 0, today: statsR.today || 0, accepted: statsR.accepted || 0 })
        setRecent(recentR?.records || recentR?.attendance || [])
        const empList = empR?.employees || empR?.data || []
        setEmployees(empList)
        setCameras(camR?.cameras || camR?.data || [])
      } finally {
        setLoading(false)
      }
    }
    load()
    const refreshTimer = window.setInterval(load, 30000)
    return () => window.clearInterval(refreshTimer)
  }, [])

  /* Derived data */
  const registeredCount = useMemo(() => employees.filter(e => e.has_face || e.registered || e.face_count > 0).length, [employees])
  const todayRecords = useMemo(() => recent.filter(r => {
    try { return new Date(r.captured_at || r.created_at).toDateString() === new Date().toDateString() } catch { return false }
  }), [recent])

  /* Mini chart data */
  const hourlyData = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, i) => ({ hour: `${String(i).padStart(2, '0')}:00`, count: 0 }))
    todayRecords.forEach(r => {
      try {
        const h = new Date(r.captured_at || r.created_at).getHours()
        buckets[h].count++
      } catch {}
    })
    return buckets.filter(b => b.count > 0 || (b.hour >= '06:00' && b.hour <= '20:00'))
  }, [todayRecords])

  const pieData = useMemo(() => {
    const accepted = todayRecords.filter(r => String(r.status).toLowerCase() === 'accepted').length
    const rejected = todayRecords.length - accepted
    return [
      { name: 'Thành công', value: accepted || 0, color: '#10b981' },
      { name: 'Thất bại', value: rejected || 0, color: '#ef4444' },
    ].filter(d => d.value > 0)
  }, [todayRecords])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 cv-stagger">
          {[1, 2, 3, 4].map(i => <div key={i} className="cv-skeleton h-28 rounded-xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="cv-skeleton h-72 rounded-xl lg:col-span-2" />
          <div className="cv-skeleton h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 cv-page-enter">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--cv-text-primary)' }}>Tổng quan</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--cv-text-tertiary)' }}>
          Thống kê điểm danh thời gian thực • Cập nhật mỗi 30 giây
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 cv-stagger">
        <StatCard icon={Activity} label="Tổng điểm danh" value={stats.total} color="#3b82f6" />
        <StatCard icon={UserCheck} label="Hôm nay" value={stats.today} color="#10b981" />
        <StatCard icon={TrendingUp} label="Thành công" value={stats.accepted} color="#06b6d4" />
        <StatCard icon={Users} label="Nhân viên đã đăng ký" value={registeredCount} color="#8b5cf6" />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Timeline chart */}
        <div className="cv-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold" style={{ color: 'var(--cv-text-primary)' }}>Điểm danh theo giờ</h2>
            <span className="cv-badge cv-badge-info">
              <Clock size={11} /> Hôm nay
            </span>
          </div>
          {hourlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="gradient-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--cv-border-light)" strokeDasharray="3 3" />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'var(--cv-text-tertiary)' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--cv-text-tertiary)' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--cv-bg-surface-elevated)',
                    border: '1px solid var(--cv-border-default)',
                    borderRadius: 12,
                    fontSize: 12,
                    boxShadow: 'var(--cv-shadow-lg)',
                  }}
                  labelFormatter={v => `${v}`}
                  formatter={v => [`${v} lượt`, 'Điểm danh']}
                />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gradient-area)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-56 items-center justify-center rounded-xl" style={{ background: 'var(--cv-bg-muted)' }}>
              <span className="text-sm" style={{ color: 'var(--cv-text-tertiary)' }}>Chưa có dữ liệu điểm danh hôm nay</span>
            </div>
          )}
        </div>

        {/* Pie chart */}
        <div className="cv-card p-5">
          <h2 className="mb-4 text-base font-bold" style={{ color: 'var(--cv-text-primary)' }}>Tỷ lệ nhận diện</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} innerRadius={55} outerRadius={80} dataKey="value" stroke="none" paddingAngle={3}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Legend formatter={(value) => <span style={{ fontSize: 12, color: 'var(--cv-text-secondary)' }}>{value}</span>} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--cv-bg-surface-elevated)',
                    border: '1px solid var(--cv-border-default)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={v => [`${v} lượt`]}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl" style={{ background: 'var(--cv-bg-muted)' }}>
              <span className="text-sm" style={{ color: 'var(--cv-text-tertiary)' }}>Chưa có dữ liệu</span>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl p-3" style={{ background: 'rgba(16, 185, 129, 0.08)' }}>
              <div className="text-xl font-black" style={{ color: 'var(--cv-accent-500)' }}>
                <AnimatedCounter value={pieData.find(d => d.name === 'Thành công')?.value || 0} />
              </div>
              <div className="text-[11px] font-medium" style={{ color: 'var(--cv-text-tertiary)' }}>Thành công</div>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(239, 68, 68, 0.06)' }}>
              <div className="text-xl font-black" style={{ color: 'var(--cv-danger-500)' }}>
                <AnimatedCounter value={pieData.find(d => d.name === 'Thất bại')?.value || 0} />
              </div>
              <div className="text-[11px] font-medium" style={{ color: 'var(--cv-text-tertiary)' }}>Thất bại</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent Activity */}
        <div className="cv-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold" style={{ color: 'var(--cv-text-primary)' }}>Hoạt động gần đây</h2>
            <div className="flex items-center gap-1.5">
              <span className="cv-pulse-dot" />
              <span className="text-xs font-semibold" style={{ color: 'var(--cv-text-tertiary)' }}>Trực tiếp</span>
            </div>
          </div>
          {recent.length > 0 ? (
            <div className="space-y-2 cv-stagger" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {recent.slice(0, 8).map((r, i) => <ActivityRow key={r.id || i} record={r} />)}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl" style={{ background: 'var(--cv-bg-muted)' }}>
              <span className="text-sm" style={{ color: 'var(--cv-text-tertiary)' }}>Chưa có hoạt động</span>
            </div>
          )}
        </div>

        {/* Camera + Employee Overview */}
        <div className="space-y-4">
          {/* Camera status */}
          <div className="cv-card p-5">
            <h2 className="mb-3 text-base font-bold" style={{ color: 'var(--cv-text-primary)' }}>Camera</h2>
            {cameras.length > 0 ? (
              <div className="space-y-2">
                {cameras.slice(0, 5).map(cam => (
                  <div key={cam.id} className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: 'var(--cv-bg-surface-hover)' }}>
                    <div className="flex items-center gap-2.5">
                      <Camera size={15} style={{ color: 'var(--cv-text-tertiary)' }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--cv-text-primary)' }}>{cam.name || 'Camera'}</span>
                    </div>
                    <span className={`cv-badge ${cam.status === 'ACTIVE' || cam.is_active !== false ? 'cv-badge-success' : 'cv-badge-danger'}`}>
                      {cam.status === 'ACTIVE' || cam.is_active !== false ? 'Hoạt động' : 'Tắt'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center rounded-xl" style={{ background: 'var(--cv-bg-muted)' }}>
                <span className="text-sm" style={{ color: 'var(--cv-text-tertiary)' }}>Chưa có camera</span>
              </div>
            )}
          </div>

          {/* Employee Summary */}
          <div className="cv-card p-5">
            <h2 className="mb-2 text-base font-bold" style={{ color: 'var(--cv-text-primary)' }}>Nhân viên</h2>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex-1 text-center">
                <div className="text-2xl font-black" style={{ color: 'var(--cv-brand-500)' }}>
                  <AnimatedCounter value={employees.length} />
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--cv-text-tertiary)' }}>Tổng số</div>
              </div>
              <div className="h-10 w-px" style={{ background: 'var(--cv-border-default)' }} />
              <div className="flex-1 text-center">
                <div className="text-2xl font-black" style={{ color: 'var(--cv-accent-500)' }}>
                  <AnimatedCounter value={registeredCount} />
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--cv-text-tertiary)' }}>Đã đăng ký khuôn mặt</div>
              </div>
              <div className="h-10 w-px" style={{ background: 'var(--cv-border-default)' }} />
              <div className="flex-1 text-center">
                <div className="text-2xl font-black" style={{ color: 'var(--cv-warning-500)' }}>
                  <AnimatedCounter value={employees.length - registeredCount} />
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--cv-text-tertiary)' }}>Chưa đăng ký</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
