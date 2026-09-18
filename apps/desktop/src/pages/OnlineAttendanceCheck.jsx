import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Search } from 'lucide-react'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { ROUTES } from '../config/routes'

function todayString() {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function createDefaultFilters() {
  const today = todayString()
  return {
    startDate: today,
    endDate: today,
    employeeId: '',
    keyword: '',
    attendanceType: 'all',
    sortBy: 'date',
    sortDir: 'desc',
    pageSize: 20,
  }
}

function normalizeAttendanceType(value) {
  const key = String(value || '').trim().toUpperCase()
  if (key === 'OUT') return 'OUT'
  if (key === 'IN') return 'IN'
  return 'IN'
}

function buildRequestFilters(filters, pageOverride = null) {
  return {
    start_date: filters.startDate,
    end_date: filters.endDate,
    employee_id: filters.employeeId,
    keyword: filters.keyword,
    attendance_type: filters.attendanceType,
    sort_by: filters.sortBy,
    sort_dir: filters.sortDir,
    page: pageOverride ?? 1,
    page_size: filters.pageSize,
  }
}

export default function OnlineAttendanceCheck() {
  const { toast } = useToast()
  const [filters, setFilters] = useState(createDefaultFilters)
  const [records, setRecords] = useState([])
  const [meta, setMeta] = useState({
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 1,
  })
  const [loading, setLoading] = useState(false)

  const page = Math.max(1, Number(meta.page || 1))
  const totalPages = Math.max(1, Number(meta.total_pages || 1))
  const totalRows = Math.max(0, Number(meta.total || 0))

  useEffect(() => {
    loadOnlineAttendance(1, filters)
  }, [])

  const pageList = useMemo(() => {
    const pages = []
    for (let item = 1; item <= totalPages; item += 1) {
      if (item === 1 || item === totalPages || Math.abs(item - page) <= 1) {
        pages.push(item)
      }
    }
    return pages
  }, [page, totalPages])

  async function loadOnlineAttendance(nextPage = 1, activeFilters = filters) {
    setLoading(true)
    try {
      const res = await api.getOnlineAttendance(buildRequestFilters(activeFilters, nextPage))
      if (!res?.success) {
        toast.error(res?.message || 'Không tải được dữ liệu chấm công online')
        setRecords([])
        setMeta({ page: 1, page_size: activeFilters.pageSize || 20, total: 0, total_pages: 1 })
        return
      }

      const nextRecords = Array.isArray(res.records)
        ? res.records
        : (Array.isArray(res.data) ? res.data : [])
      const nextMeta = res.meta && typeof res.meta === 'object' ? res.meta : {}

      setRecords(nextRecords)
      setMeta({
        page: Number(nextMeta.page || nextPage || 1),
        page_size: Number(nextMeta.page_size || activeFilters.pageSize || 20),
        total: Number(nextMeta.total || 0),
        total_pages: Number(nextMeta.total_pages || 1),
      })
    } catch (error) {
      console.error(error)
      toast.error(error?.message || 'Không thể kết nối backend')
      setRecords([])
      setMeta({ page: 1, page_size: activeFilters.pageSize || 20, total: 0, total_pages: 1 })
    } finally {
      setLoading(false)
    }
  }

  async function handleApplyFilters() {
    await loadOnlineAttendance(1, filters)
  }

  async function handleResetFilters() {
    const nextFilters = createDefaultFilters()
    setFilters(nextFilters)
    await loadOnlineAttendance(1, nextFilters)
  }

  async function handleChangePage(nextPage) {
    await loadOnlineAttendance(nextPage, filters)
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Báo cáo đã đồng bộ ERP</h1>
          <p className="text-sm text-slate-500 mt-1">
            Báo cáo đối soát các lượt chấm công đã đồng bộ thành công lên máy chủ ERP.
          </p>
        </div>
        <Link
          to={ROUTES.report}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Quay lại báo cáo nội bộ
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-4 sm:p-5 space-y-4">
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Từ ngày</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={event => setFilters(prev => ({ ...prev, startDate: event.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Đến ngày</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={event => setFilters(prev => ({ ...prev, endDate: event.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Mã nhân viên</label>
            <input
              type="text"
              value={filters.employeeId}
              onChange={event => setFilters(prev => ({ ...prev, employeeId: event.target.value }))}
              placeholder="VD: NV0001"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Loại chấm công</label>
            <select
              value={filters.attendanceType}
              onChange={event => setFilters(prev => ({ ...prev, attendanceType: event.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
            >
              <option value="all">Tất cả</option>
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Từ khóa</label>
            <input
              type="text"
              value={filters.keyword}
              onChange={event => setFilters(prev => ({ ...prev, keyword: event.target.value }))}
              placeholder="Mã NV / source / camera IP"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Sắp xếp theo</label>
            <select
              value={filters.sortBy}
              onChange={event => setFilters(prev => ({ ...prev, sortBy: event.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
            >
              <option value="date">Ngày</option>
              <option value="time">Giờ</option>
              <option value="employee_id">Mã nhân viên</option>
              <option value="attendance_type">Loại chấm công</option>
              <option value="source">Nguồn</option>
              <option value="camera_ip">Camera IP</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Thứ tự</label>
            <select
              value={filters.sortDir}
              onChange={event => setFilters(prev => ({ ...prev, sortDir: event.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
            >
              <option value="desc">Giảm dần</option>
              <option value="asc">Tăng dần</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Số dòng / trang</label>
            <select
              value={filters.pageSize}
              onChange={event => setFilters(prev => ({ ...prev, pageSize: Number(event.target.value) }))}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleApplyFilters}
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            <Search size={16} />
            {loading ? 'Đang tải...' : 'Kiểm tra dữ liệu online'}
          </button>

          <button
            onClick={handleResetFilters}
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={16} />
            Đặt lại bộ lọc
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Tổng bản ghi online</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{totalRows}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        {loading ? (
          <div className="px-5 py-12 text-center text-slate-400">Đang tải...</div>
        ) : (
          <div>
            <div className="hidden xl:block overflow-x-auto">
              <table className="w-full text-sm min-w-[1080px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">#</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Mã NV</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Ngày</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Giờ</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Loại</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Nguồn</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Camera IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {records.map((record, index) => (
                    <tr key={`${record.employee_id || 'row'}-${record.attendance_date || ''}-${record.attendance_time || ''}-${index}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-400">{(page - 1) * Number(meta.page_size || filters.pageSize || 20) + index + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{record.employee_id || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{record.attendance_date || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{record.attendance_time || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{normalizeAttendanceType(record.attendance_type)}</td>
                      <td className="px-4 py-3 text-slate-600">{record.source || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{record.camera_ip || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="xl:hidden divide-y divide-slate-100">
              {records.map((record, index) => (
                <div key={`${record.employee_id || 'card'}-${record.attendance_date || ''}-${record.attendance_time || ''}-${index}`} className="px-4 py-4 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{record.employee_id || '-'}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {record.attendance_date || '-'} | {record.attendance_time || '-'} | {normalizeAttendanceType(record.attendance_type)}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">STT {(page - 1) * Number(meta.page_size || filters.pageSize || 20) + index + 1}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <p className="col-span-2">Nguồn: {record.source || '-'}</p>
                    <p className="col-span-2">Camera IP: {record.camera_ip || '-'}</p>
                  </div>
                </div>
              ))}
            </div>

            {records.length > 0 && (
              <div className="px-4 sm:px-5 py-4 border-t border-slate-200 flex items-center justify-between flex-wrap gap-4">
                <p className="text-sm text-slate-500">
                  Trang {page}/{totalPages} - {records.length} dòng hiển thị
                </p>

                {totalPages > 1 && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleChangePage(Math.max(1, page - 1))}
                      disabled={page === 1 || loading}
                      className="px-3 py-1 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 text-slate-600"
                    >
                      Trước
                    </button>

                    {pageList.map((item, index) => (
                      <React.Fragment key={item}>
                        {index > 0 && pageList[index - 1] !== item - 1 && (
                          <span className="px-2 py-1 text-slate-400">...</span>
                        )}
                        <button
                          onClick={() => handleChangePage(item)}
                          disabled={loading}
                          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                            page === item
                              ? 'bg-primary-600 text-white'
                              : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {item}
                        </button>
                      </React.Fragment>
                    ))}

                    <button
                      onClick={() => handleChangePage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages || loading}
                      className="px-3 py-1 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 text-slate-600"
                    >
                      Sau
                    </button>
                  </div>
                )}
              </div>
            )}

            {records.length === 0 && (
              <div className="px-5 py-12 text-center text-slate-400">
                Không có dữ liệu chấm công online theo bộ lọc hiện tại
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
