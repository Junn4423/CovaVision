import { useEffect, useState } from 'react'
import {
  HardDrive,
  RefreshCw,
  Send,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Layers,
} from 'lucide-react'
import {
  getPendingAttendanceQueue,
  removeOfflineAttendanceRecord,
  getDeviceDataSummary,
  exportDeviceDataSnapshot,
  clearDeviceCache,
} from '../services/deviceDataService'
import { pushAttendanceToErp } from '../services/api'
import { useToast } from '../components/Toast'

export default function DeviceData() {
  const [loading, setLoading] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncingKey, setSyncingKey] = useState('')
  const [pendingRecords, setPendingRecords] = useState([])
  const [summary, setSummary] = useState({
    pendingAttendanceCount: 0,
    employeeCount: 0,
    accountsCount: 0,
    storageSizeMb: 0,
  })
  const { toast } = useToast() || {}

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const queue = getPendingAttendanceQueue()
      setPendingRecords(queue)

      const sum = await getDeviceDataSummary()
      setSummary(sum)
    } catch {
      toast?.error ? toast.error('Không thể nạp dữ liệu bộ nhớ thiết bị') : alert('Không thể nạp dữ liệu')
    } finally {
      setLoading(false)
    }
  }

  async function handlePushSingleRecord(record) {
    setSyncingKey(record.record_key)
    try {
      const res = await pushAttendanceToErp({
        employee_id: record.employee_id,
        record_key: record.record_key,
        attendance_date: record.attendance_date,
        attendance_time: record.attendance_time,
        attendance_type: record.attendance_type || 'IN',
        source: 'Desktop Device Memory Sync',
      })

      if (res?.success || res?.erp_pushed) {
        removeOfflineAttendanceRecord(record.record_key)
        toast?.success?.(`Đã đẩy bản ghi [${record.name || record.employee_id}] lên ERP thành công!`)
        loadData()
      } else {
        toast?.error?.(res?.message || 'ERP từ chối bản ghi chấm công này')
      }
    } catch {
      toast?.error?.('Lỗi kết nối khi gửi dữ liệu lên ERP')
    } finally {
      setSyncingKey('')
    }
  }

  async function handleSyncAllToErp() {
    if (pendingRecords.length === 0) {
      toast?.info?.('Không có bản ghi offline nào cần đồng bộ.')
      return
    }

    setSyncingAll(true)
    let successCount = 0
    let failCount = 0

    for (const record of pendingRecords) {
      try {
        const res = await pushAttendanceToErp({
          employee_id: record.employee_id,
          record_key: record.record_key,
          attendance_date: record.attendance_date,
          attendance_time: record.attendance_time,
          attendance_type: record.attendance_type || 'IN',
          source: 'Desktop Batch Push',
        })
        if (res?.success || res?.erp_pushed) {
          removeOfflineAttendanceRecord(record.record_key)
          successCount++
        } else {
          failCount++
        }
      } catch {
        failCount++
      }
    }

    setSyncingAll(false)
    loadData()

    if (successCount > 0) {
      toast?.success?.(`Đã đồng bộ thành công ${successCount} bản ghi lên ERP!`)
    }
    if (failCount > 0) {
      toast?.error?.(`Có ${failCount} bản ghi chưa đẩy được do lỗi ERP hoặc mạng.`)
    }
  }

  function handleExportBackup() {
    exportDeviceDataSnapshot()
    toast?.success?.('Đã xuất file sao lưu dữ liệu bộ nhớ máy!')
  }

  function handleClearCache() {
    if (window.confirm('Bạn có chắc chắn muốn dọn dẹp bộ nhớ đệm tạm thời (không ảnh hưởng dữ liệu chấm công)?')) {
      clearDeviceCache()
      loadData()
      toast?.success?.('Đã dọn dẹp bộ nhớ đệm hệ thống thành công!')
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Dữ liệu bộ nhớ máy</h1>
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
              Bộ Nhớ Máy
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 font-medium">
            Quản lý hàng chờ chấm công lưu tạm khi mất mạng và đồng bộ lên ERP.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>
          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <Download size={14} />
            <span>Xuất sao lưu JSON</span>
          </button>
          <button
            type="button"
            onClick={handleSyncAllToErp}
            disabled={syncingAll || pendingRecords.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-700/20 hover:bg-blue-800 transition-all disabled:opacity-50"
          >
            <Send size={14} className={syncingAll ? 'animate-spin' : ''} />
            <span>Đồng bộ tất cả lên ERP ({pendingRecords.length})</span>
          </button>
        </div>
      </div>

      {/* 3 Bento Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="desktop-bento-stat rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/70 via-white to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Chờ gửi lên ERP</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Clock size={16} />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black text-amber-800 font-mono">
            {summary.pendingAttendanceCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Bản ghi offline lưu an toàn trên máy</p>
        </div>

        <div className="desktop-bento-stat rounded-2xl border border-blue-200/90 bg-gradient-to-br from-blue-50/70 via-white to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-800">Nhân sự trong cache</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-800">
              <User size={16} />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900 font-mono">
            {summary.employeeCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Dữ liệu hồ sơ khả dụng trên máy</p>
        </div>

        <div className="desktop-bento-stat rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/70 via-white to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Dung lượng bộ nhớ</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <HardDrive size={16} />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900 font-mono">
            {summary.storageSizeMb} MB
          </p>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Cache lưu trữ máy trạm</span>
            <button
              type="button"
              onClick={handleClearCache}
              className="text-[11px] font-bold text-rose-600 hover:underline inline-flex items-center gap-1"
            >
              <Trash2 size={11} />
              Dọn dẹp
            </button>
          </div>
        </div>
      </div>

      {/* Main Data Table of Offline Attendance Records */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Danh Sách Lượt Chấm Công Chờ Đồng Bộ ERP</h2>
            <p className="text-xs text-slate-400">
              Tự động lưu lại khi thiết bị mất kết nối mạng hoặc server ERP bận
            </p>
          </div>
          {pendingRecords.length > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
              {pendingRecords.length} bản ghi
            </span>
          )}
        </div>

        {pendingRecords.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
            <h3 className="text-sm font-bold text-slate-800">Tất cả dữ liệu đã được đồng bộ lên ERP</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Không có bản ghi nào bị kẹt lại trong bộ nhớ tạm thời của máy. Toàn bộ lượt chấm công đã được máy chủ ghi nhận.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 uppercase tracking-wider text-[10px] font-bold">
                  <th className="py-3.5 px-4">STT</th>
                  <th className="py-3.5 px-4">Mã Nhân Viên</th>
                  <th className="py-3.5 px-4">Họ Và Tên</th>
                  <th className="py-3.5 px-4">Ngày Chấm</th>
                  <th className="py-3.5 px-4">Giờ Ghi Nhận</th>
                  <th className="py-3.5 px-4">Loại Ca</th>
                  <th className="py-3.5 px-4">Trạng Thái ERP</th>
                  <th className="py-3.5 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {pendingRecords.map((item, idx) => (
                  <tr key={item.record_key || idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold font-mono text-blue-700">{item.employee_id}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{item.name || item.employee_name || 'Nhân sự'}</td>
                    <td className="py-3 px-4 font-mono">{item.attendance_date || 'Hôm nay'}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-800">{item.attendance_time}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded font-bold text-[10px] ${
                        String(item.attendance_type).toUpperCase() === 'OUT'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {item.attendance_type || 'IN'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                        <AlertTriangle size={11} /> Chưa gửi
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handlePushSingleRecord(item)}
                        disabled={syncingKey === item.record_key}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-800 transition-colors disabled:opacity-50"
                      >
                        <Send size={12} className={syncingKey === item.record_key ? 'animate-spin' : ''} />
                        <span>Gửi ERP</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
