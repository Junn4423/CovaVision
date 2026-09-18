import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function AccountManagement() {
  const [accounts, setAccounts] = useState([])
  const [form, setForm] = useState({ username: '', password: '', role: 'STAFF' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    try {
      const response = await api.getAccounts()
      setAccounts(Array.isArray(response?.accounts) ? response.accounts : [])
    } catch (loadError) {
      setError(loadError?.message || 'Không tải được danh sách tài khoản.')
    }
  }

  useEffect(() => { load() }, [])

  async function save(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    try {
      await api.upsertEmployeeAccount(form)
      setForm({ username: '', password: '', role: 'STAFF' })
      setMessage('Đã lưu tài khoản.')
      await load()
    } catch (saveError) {
      setError(saveError?.message || 'Không lưu được tài khoản.')
    }
  }

  async function toggle(account) {
    try {
      await api.setEmployeeAccountLock(account.id || account.username, account.is_active !== false)
      await load()
    } catch (toggleError) {
      setError(toggleError?.message || 'Không cập nhật được trạng thái tài khoản.')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><h1 className="text-3xl font-black tracking-tight">Tài khoản</h1><p className="mt-1 text-sm text-slate-500">Quản lý tài khoản và quyền truy cập CovaVision.</p></div>
      {(message || error) && <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || message}</div>}
      <form onSubmit={save} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_1fr_160px_auto] sm:items-end">
        <label className="text-sm font-semibold">Tên đăng nhập<input value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-500" required /></label>
        <label className="text-sm font-semibold">Mật khẩu<input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-500" required /></label>
        <label className="text-sm font-semibold">Vai trò<select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500"><option value="STAFF">Nhân viên</option><option value="SUPERVISOR">Giám sát</option><option value="HR_MANAGER">Quản lý</option><option value="ADMIN">Quản trị</option></select></label>
        <button className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Tạo / cập nhật</button>
      </form>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4 font-bold">Danh sách tài khoản</div><div className="divide-y divide-slate-100">{accounts.length === 0 ? <p className="p-5 text-sm text-slate-500">Chưa có tài khoản.</p> : accounts.map(account => <div key={account.id || account.username} className="flex items-center justify-between gap-3 px-5 py-4"><div><p className="font-semibold text-slate-800">{account.username}</p><p className="text-xs text-slate-500">{account.role || 'STAFF'}</p></div><button onClick={() => toggle(account)} className={`rounded-lg px-3 py-2 text-xs font-bold ${account.is_active === false ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{account.is_active === false ? 'Đang khóa' : 'Đang hoạt động'}</button></div>)}</div></section>
    </div>
  )
}
