import { useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { api } from '../services/api'

export default function Report() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await api.getReport()
      setRecords(Array.isArray(response?.records) ? response.records : [])
    } catch (loadError) {
      setError(loadError?.message || 'Không tải được báo cáo.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function download() {
    const result = await api.exportReportExcel()
    const url = URL.createObjectURL(result.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = result.filename || 'covavision-attendance.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-3xl font-black tracking-tight">Báo cáo điểm danh</h1><p className="mt-1 text-sm text-slate-500">Dữ liệu được lấy trực tiếp từ CovaVision API.</p></div><div className="flex gap-2"><button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><RefreshCw size={15} /> Làm mới</button><button onClick={download} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700"><Download size={15} /> Xuất CSV</button></div></div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Nhân viên</th><th className="px-5 py-3">Camera</th><th className="px-5 py-3">Loại ghi nhận</th><th className="px-5 py-3">Thời gian</th><th className="px-5 py-3">Độ tin cậy</th><th className="px-5 py-3">Trạng thái</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan="6" className="px-5 py-8 text-center text-slate-500">Đang tải...</td></tr> : records.length === 0 ? <tr><td colSpan="6" className="px-5 py-8 text-center text-slate-500">Chưa có dữ liệu.</td></tr> : records.map(record => <tr key={record.id}><td className="px-5 py-3 font-semibold text-slate-800">{record.employee_name || record.employee_id || '-'}</td><td className="px-5 py-3 text-slate-600">{record.camera_name || record.camera_id || '-'}</td><td className="px-5 py-3 text-slate-600">Quét mặt</td><td className="px-5 py-3 text-slate-600">{record.captured_at ? new Date(record.captured_at).toLocaleString('vi-VN') : '-'}</td><td className="px-5 py-3 text-slate-600">{record.confidence == null ? '-' : Number(record.confidence).toFixed(3)}</td><td className="px-5 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{record.status || 'accepted'}</span></td></tr>)}</tbody></table></section>
    </div>
  )
}
