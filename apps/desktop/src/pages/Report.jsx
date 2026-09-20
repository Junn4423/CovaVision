import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  FileSpreadsheet,
  Percent,
  RefreshCw,
  Search,
  UserCheck,
  Users,
} from 'lucide-react'
import { api } from '../services/api'
import { Badge, Button, Card, EmptyState, Input, StatCard } from '../components/ui'

const PRESET_RANGES = [
  { id: 'today', label: 'Hôm nay' },
  { id: '7days', label: '7 ngày qua' },
  { id: '30days', label: '30 ngày qua' },
  { id: 'thisMonth', label: 'Tháng này' },
  { id: 'all', label: 'Toàn bộ' },
]

function getPresetDates(presetId) {
  const now = new Date()
  const toDateStr = (d) => d.toISOString().split('T')[0]

  switch (presetId) {
    case 'today':
      return { start: toDateStr(now), end: toDateStr(now) }
    case '7days': {
      const past = new Date(now)
      past.setDate(past.getDate() - 6)
      return { start: toDateStr(past), end: toDateStr(now) }
    }
    case '30days': {
      const past = new Date(now)
      past.setDate(past.getDate() - 29)
      return { start: toDateStr(past), end: toDateStr(now) }
    }
    case 'thisMonth': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: toDateStr(firstDay), end: toDateStr(now) }
    }
    case 'all':
    default:
      return { start: '', end: '' }
  }
}

export default function Report() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [activePreset, setActivePreset] = useState('today')
  const [startDate, setStartDate] = useState(() => getPresetDates('today').start)
  const [endDate, setEndDate] = useState(() => getPresetDates('today').end)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  async function loadReport(start = startDate, end = endDate, status = statusFilter) {
    setLoading(true)
    setError('')
    try {
      const filters = {}
      if (start) filters.start_date = start
      if (end) filters.end_date = end
      if (status && status !== 'ALL') filters.status = status

      const response = await api.getReport(filters)
      const list = Array.isArray(response?.records)
        ? response.records
        : Array.isArray(response?.attendance)
        ? response.attendance
        : []
      setRecords(list)
      setCurrentPage(1)
    } catch (loadError) {
      setError(loadError?.message || 'Không tải được báo cáo điểm danh.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReport(startDate, endDate, statusFilter)
  }, [startDate, endDate, statusFilter])

  function handlePresetChange(presetId) {
    setActivePreset(presetId)
    const { start, end } = getPresetDates(presetId)
    setStartDate(start)
    setEndDate(end)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const filters = {}
      if (startDate) filters.start_date = startDate
      if (endDate) filters.end_date = endDate
      if (statusFilter && statusFilter !== 'ALL') filters.status = statusFilter

      const result = await api.exportReportExcel(filters)
      const url = URL.createObjectURL(result.blob)
      const link = document.createElement('a')
      link.href = url
      link.download =
        result.filename ||
        `covavision-report-${startDate || 'all'}-${endDate || 'all'}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (exportErr) {
      setError(exportErr?.message || 'Không thể xuất file CSV.')
    } finally {
      setExporting(false)
    }
  }

  // Filtered records by search keyword
  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records
    const q = search.toLowerCase()
    return records.filter(
      (r) =>
        (r.employee_name && r.employee_name.toLowerCase().includes(q)) ||
        (r.employee_id && r.employee_id.toLowerCase().includes(q)) ||
        (r.camera_name && r.camera_name.toLowerCase().includes(q))
    )
  }, [records, search])

  // Summary statistics computed from filtered records
  const stats = useMemo(() => {
    const total = filteredRecords.length
    const uniqueEmployees = new Set(
      filteredRecords.map((r) => r.employee_id || r.employee_name).filter(Boolean)
    ).size

    const validConfidences = filteredRecords
      .map((r) => Number(r.confidence))
      .filter((c) => !isNaN(c) && c > 0)
    const avgConfidence = validConfidences.length
      ? (
          (validConfidences.reduce((a, b) => a + b, 0) / validConfidences.length) *
          100
        ).toFixed(1)
      : '0.0'

    const uniqueCameras = new Set(
      filteredRecords.map((r) => r.camera_id || r.camera_name).filter(Boolean)
    ).size

    return { total, uniqueEmployees, avgConfidence, uniqueCameras }
  }, [filteredRecords])

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))
  const paginatedRecords = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize
    return filteredRecords.slice(startIdx, startIdx + pageSize)
  }, [filteredRecords, currentPage, pageSize])

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--cv-text-primary)] tracking-tight flex items-center gap-2.5">
            <FileSpreadsheet className="w-7 h-7 text-[var(--cv-brand-500)]" />
            Báo cáo & Thống kê điểm danh
          </h1>
          <p className="text-sm text-[var(--cv-text-secondary)] mt-1">
            Tra cứu lịch sử nhận diện khuôn mặt, lọc theo thời gian và xuất báo cáo CSV.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="md"
            icon={RefreshCw}
            onClick={() => loadReport()}
            loading={loading}
          >
            Làm mới
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={Download}
            onClick={handleExport}
            loading={exporting}
          >
            Xuất file CSV
          </Button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/50 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError('')}
            className="text-xs font-bold underline cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Tổng lượt điểm danh"
          value={stats.total.toLocaleString()}
          subtitle="Trong phạm vi lọc"
          icon={UserCheck}
          color="blue"
        />
        <StatCard
          title="Nhân viên có mặt"
          value={stats.uniqueEmployees}
          subtitle="Cá nhân xác thực"
          icon={Users}
          color="emerald"
        />
        <StatCard
          title="Độ tin cậy TB"
          value={`${stats.avgConfidence}%`}
          subtitle="Độ khớp AI trung bình"
          icon={Percent}
          color="purple"
        />
        <StatCard
          title="Camera ghi nhận"
          value={stats.uniqueCameras}
          subtitle="Thiết bị tham gia thu"
          icon={Camera}
          color="cyan"
        />
      </div>

      {/* Filter and Date Range Control Card */}
      <Card className="p-5 space-y-4">
        {/* Preset Range Pills */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[var(--cv-border-default)]">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--cv-brand-500)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--cv-text-tertiary)]">
              Khoảng thời gian:
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESET_RANGES.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetChange(preset.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activePreset === preset.id
                    ? 'bg-[var(--cv-brand-500)] text-white shadow-xs'
                    : 'bg-[var(--cv-bg-surface-elevated)] border border-[var(--cv-border-default)] text-[var(--cv-text-secondary)] hover:text-[var(--cv-text-primary)] hover:bg-[var(--cv-bg-surface-hover)]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Detailed Filters row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          {/* Search Input */}
          <div className="relative">
            <label className="block text-xs font-bold text-[var(--cv-text-primary)] mb-1">
              Tìm theo nhân viên / camera
            </label>
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3 text-[var(--cv-text-tertiary)] pointer-events-none z-10" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Tên, mã nhân viên..."
                className="cv-input has-icon-left !pl-10 text-xs font-medium"
              />
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-xs font-bold text-[var(--cv-text-primary)] mb-1">
              Từ ngày
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setActivePreset('custom')
              }}
              className="cv-input text-xs font-medium"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-xs font-bold text-[var(--cv-text-primary)] mb-1">
              Đến ngày
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setActivePreset('custom')
              }}
              className="cv-input text-xs font-medium"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-bold text-[var(--cv-text-primary)] mb-1">
              Trạng thái
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="cv-input text-xs cursor-pointer font-medium"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACCEPTED">Thành công (Accepted)</option>
              <option value="PENDING">Chờ duyệt (Pending)</option>
              <option value="REJECTED">Từ chối (Rejected)</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Main Records Table Card */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-[var(--cv-border-default)] flex items-center justify-between text-xs text-[var(--cv-text-secondary)]">
          <div className="font-semibold">
            Hiển thị{' '}
            <span className="text-[var(--cv-text-primary)] font-bold">
              {filteredRecords.length ? (currentPage - 1) * pageSize + 1 : 0}
            </span>{' '}
            -{' '}
            <span className="text-[var(--cv-text-primary)] font-bold">
              {Math.min(currentPage * pageSize, filteredRecords.length)}
            </span>{' '}
            trong tổng số{' '}
            <span className="text-[var(--cv-text-primary)] font-bold">
              {filteredRecords.length}
            </span>{' '}
            bản ghi
          </div>

          <div className="flex items-center gap-2">
            <span>Mỗi trang:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="px-2 py-1 bg-[var(--cv-bg-surface-elevated)] border border-[var(--cv-border-default)] rounded-lg text-xs font-medium cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-16 text-center text-sm text-[var(--cv-text-tertiary)] flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-[var(--cv-brand-500)]" />
            <span>Đang tải dữ liệu báo cáo...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="Không tìm thấy bản ghi điểm danh nào"
            description="Hãy thử thay đổi khoảng ngày, từ khóa tìm kiếm hoặc bấm 'Làm mới'."
            className="m-6 border-none bg-transparent"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--cv-border-default)] bg-[var(--cv-bg-surface-elevated)] text-[var(--cv-text-primary)] uppercase tracking-wider font-bold text-[11px]">
                  <th className="py-3 px-5">Nhân viên</th>
                  <th className="py-3 px-4">Camera</th>
                  <th className="py-3 px-4">Thời gian ghi nhận</th>
                  <th className="py-3 px-4">Độ tin cậy</th>
                  <th className="py-3 px-4 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cv-border-default)]">
                {paginatedRecords.map((record) => {
                  const confidenceNum = Number(record.confidence)
                  const hasConf = !isNaN(confidenceNum) && confidenceNum > 0
                  const confPct = hasConf ? (confidenceNum * 100).toFixed(1) : '-'
                  const dateStr = record.captured_at
                    ? new Date(record.captured_at).toLocaleString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : '-'

                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-[var(--cv-bg-surface-hover)]/60 transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-[var(--cv-brand-100)] dark:bg-[var(--cv-brand-950)] text-[var(--cv-brand-700)] dark:text-[var(--cv-brand-300)] flex items-center justify-center font-black text-xs shrink-0">
                            {(record.employee_name || record.employee_id || 'U')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-[var(--cv-text-primary)]">
                              {record.employee_name || 'Chưa đặt tên'}
                            </p>
                            <p className="text-[11px] text-[var(--cv-text-tertiary)] font-mono">
                              {record.employee_id || '-'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-[var(--cv-text-secondary)]">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Camera className="w-3.5 h-3.5 text-[var(--cv-text-tertiary)]" />
                          <span>{record.camera_name || record.camera_id || 'Cục bộ'}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[var(--cv-text-secondary)]">
                        {dateStr}
                      </td>

                      <td className="py-3.5 px-4">
                        {hasConf ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  confidenceNum >= 0.7
                                    ? 'bg-emerald-500'
                                    : confidenceNum >= 0.5
                                    ? 'bg-blue-500'
                                    : 'bg-amber-500'
                                }`}
                                style={{ width: `${Math.min(confidenceNum * 100, 100)}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-[var(--cv-text-primary)]">
                              {confPct}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-[var(--cv-text-tertiary)]">-</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <Badge
                          variant={
                            record.status === 'rejected'
                              ? 'danger'
                              : record.status === 'pending'
                              ? 'warning'
                              : 'success'
                          }
                          size="sm"
                          dot
                        >
                          {record.status === 'rejected'
                            ? 'Từ chối'
                            : record.status === 'pending'
                            ? 'Chờ duyệt'
                            : 'Hợp lệ'}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredRecords.length > 0 && (
          <div className="p-4 border-t border-[var(--cv-border-default)] flex items-center justify-between">
            <span className="text-xs text-[var(--cv-text-tertiary)]">
              Trang <span className="font-bold text-[var(--cv-text-primary)]">{currentPage}</span>{' '}
              / {totalPages}
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={ChevronLeft}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                Trước
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={ChevronRight}
                iconPosition="right"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
