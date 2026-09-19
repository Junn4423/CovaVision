import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Save } from 'lucide-react'
import { api } from '../services/api'
import { ROUTES } from '../config/routes'

export default function SystemSettings() {
  const [settings, setSettings] = useState({ face_match_threshold: '0.55' })
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.getSystemSettings().then(response => {
      const values = response?.settings || response || {}
      setSettings(current => ({ ...current, ...values }))
    }).catch(loadError => setError(loadError?.message || 'Không tải được cài đặt.'))
  }, [])

  async function save(event) {
    event.preventDefault()
    setStatus('')
    setError('')
    try {
      await api.saveSystemSettings(settings)
      setStatus('Đã lưu cài đặt.')
    } catch (saveError) {
      setError(saveError?.message || 'Không lưu được cài đặt.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="text-3xl font-black tracking-tight">Cài đặt hệ thống</h1><p className="mt-1 text-sm text-slate-500">Cấu hình nhận diện và vận hành của CovaVision.</p></div>
      {(status || error) && <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || status}</div>}
      <form onSubmit={save} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Ngưỡng khớp khuôn mặt<input type="number" min="0" max="1" step="0.01" value={settings.face_match_threshold} onChange={event => setSettings({ ...settings, face_match_threshold: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-500" /><span className="mt-1 block text-xs font-normal text-slate-400">Giá trị càng cao càng chặt.</span></label><div className="rounded-xl bg-slate-50 p-3 text-sm font-normal text-slate-600">Mỗi lần nhận diện hợp lệ được lưu thành một bản ghi riêng. Không còn chế độ check-in/check-out hoặc chống ghi trùng.</div></div>
        <div className="flex flex-col justify-between gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center"><div><p className="font-semibold text-slate-800">Nguồn camera</p><p className="mt-1 text-xs text-slate-500">RTSP được mở và proxy tại backend; giao diện chỉ nhận frame qua API.</p></div><Link to={ROUTES.cameras} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"><Camera size={15} /> Quản lý camera</Link></div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"><Save size={16} /> Lưu cài đặt</button>
      </form>
    </div>
  )
}
