import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Camera, CheckCircle2, ScanFace, Users } from 'lucide-react'
import { api } from '../services/api'
import { ROUTES } from '../config/routes'

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, today: 0, accepted: 0 })
  const [employees, setEmployees] = useState([])
  const [cameras, setCameras] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [])

  async function load() {
    try {
      const [statsResponse, employeeResponse, cameraResponse, attendanceResponse] = await Promise.all([
        api.getStats().catch(() => ({})),
        api.getEmployees().catch(() => ({})),
        api.getCameras().catch(() => ({})),
        api.getTodayAttendance().catch(() => ({})),
      ])
      setStats({ total: statsResponse?.total || 0, today: statsResponse?.today || 0, accepted: statsResponse?.accepted || 0 })
      setEmployees(Array.isArray(employeeResponse?.employees) ? employeeResponse.employees : [])
      setCameras(Array.isArray(cameraResponse?.cameras) ? cameraResponse.cameras : [])
      setRecords(Array.isArray(attendanceResponse?.records) ? attendanceResponse.records.slice(0, 6) : [])
    } finally {
      setLoading(false)
    }
  }

  const cards = [
    { label: 'Lượt điểm danh hôm nay', value: stats.today, icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Tổng lượt đã ghi nhận', value: stats.total, icon: Activity, tone: 'text-blue-600 bg-blue-50' },
    { label: 'Nhân viên', value: employees.length, icon: Users, tone: 'text-violet-600 bg-violet-50' },
    { label: 'Camera đã cấu hình', value: cameras.length, icon: Camera, tone: 'text-amber-600 bg-amber-50' },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold text-blue-600">CovaVision</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">Tổng quan</h1><p className="mt-1 text-sm text-slate-500">Theo dõi điểm danh, nhân viên và camera từ một API nội bộ.</p></div>
        <Link to={ROUTES.attendance} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"><ScanFace size={17} /> Bắt đầu điểm danh</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(card => <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${card.tone}`}><card.icon size={20} /></div><p className="text-sm text-slate-500">{card.label}</p><p className="mt-1 text-3xl font-black text-slate-900">{loading ? '—' : card.value}</p></div>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Điểm danh gần đây</h2><Link to={ROUTES.reports} className="text-xs font-bold text-blue-600 hover:underline">Xem báo cáo</Link></div>{records.length === 0 ? <p className="p-5 text-sm text-slate-500">Chưa có bản ghi điểm danh.</p> : <div className="divide-y divide-slate-100">{records.map(record => <div key={record.id} className="flex items-center justify-between gap-3 px-5 py-3"><div><p className="text-sm font-semibold text-slate-800">{record.employee_name || record.employee_id || 'Không xác định'}</p><p className="text-xs text-slate-500">{record.camera_name || 'Camera'} · {record.attendance_type || 'auto'}</p></div><span className="text-xs text-slate-400">{record.captured_at ? new Date(record.captured_at).toLocaleString('vi-VN') : '-'}</span></div>)}</div>}</section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Trạng thái hệ thống</h2><div className="mt-4 space-y-3 text-sm"><div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span>API CovaVision</span><span className="font-bold text-emerald-600">Đang kết nối</span></div><div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span>Camera hoạt động</span><span className="font-bold text-slate-700">{cameras.filter(camera => camera.is_active !== false).length}</span></div><div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span>Đã nhận diện hợp lệ</span><span className="font-bold text-slate-700">{stats.accepted}</span></div></div><div className="mt-5 grid grid-cols-2 gap-2"><Link to={ROUTES.employees} className="rounded-xl border border-slate-200 px-3 py-2 text-center text-xs font-bold text-slate-700 hover:bg-slate-50">Quản lý nhân viên</Link><Link to={ROUTES.cameras} className="rounded-xl border border-slate-200 px-3 py-2 text-center text-xs font-bold text-slate-700 hover:bg-slate-50">Quản lý camera</Link></div></section>
      </div>
    </div>
  )
}
