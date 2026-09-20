import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Filter,
  FileSpreadsheet,
  List,
  Percent,
  RefreshCw,
  Search,
  Table as TableIcon,
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

function formatLocalDate(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getPresetDates(presetId) {
  const now = new Date()
  const toDateStr = (d) => formatLocalDate(d)

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
  const [viewMode, setViewMode] = useState('timesheet') // 'timesheet' | 'logs'
  const [records, setRecords] = useState([])
  const [timesheetRows, setTimesheetRows] = useState([])
  const [timesheetStats, setTimesheetStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exportingLogs, setExportingLogs] = useState(false)
  const [exportingTimesheet, setExportingTimesheet] = useState(false)
  const [error, setError] = useState('')
  const [activePreset, setActivePreset] = useState('today')
  const [startDate, setStartDate] = useState(() => getPresetDates('today').start)
  const [endDate, setEndDate] = useState(() => getPresetDates('today').end)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  async function loadData(start = startDate, end = endDate, status = statusFilter) {
    setLoading(true)
    setError('')
    try {
      const filters = { limit: 500 }
      if (start) filters.start_date = start
      if (end) filters.end_date = end
      if (status && status !== 'ALL') filters.status = status

      const [logsRes, tsRes] = await Promise.all([
        api.getReport(filters).catch(() => ({ records: [] })),
        api.getTimesheetReport({ start_date: start, end_date: end }).catch(() => ({ timesheet: [], stats: null })),
      ])

      const list = Array.isArray(logsRes?.records)
        ? logsRes.records
        : Array.isArray(logsRes?.attendance)
        ? logsRes.attendance
        : []
      setRecords(list)

      const tsList = Array.isArray(tsRes?.timesheet) ? tsRes.timesheet : []
      setTimesheetRows(tsList)
      setTimesheetStats(tsRes?.stats || null)
      setCurrentPage(1)
    } catch (loadError) {
      setError(loadError?.message || 'Không tải được báo cáo điểm danh.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(startDate, endDate, statusFilter)
  }, [startDate, endDate, statusFilter])

  function handlePresetChange(presetId) {
    setActivePreset(presetId)
    const { start, end } = getPresetDates(presetId)
    setStartDate(start)
    setEndDate(end)
  }

  async function handleExportLogs() {
    setExportingLogs(true)
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
        `covavision-attendance-${startDate || 'all'}-${endDate || 'all'}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (exportErr) {
      setError(exportErr?.message || 'Không thể xuất file CSV điểm danh.')
    } finally {
      setExportingLogs(false)
    }
  }

  async function handleExportTimesheet() {
    setExportingTimesheet(true)
    try {
      const filters = {}
      if (startDate) filters.start_date = startDate
      if (endDate) filters.end_date = endDate

      const result = await api.exportTimesheetExcel(filters)
      const url = URL.createObjectURL(result.blob)
      const link = document.createElement('a')
      link.href = url
      link.download =
        result.filename ||
        `covavision-timesheet-${startDate || 'all'}-${endDate || 'all'}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (exportErr) {
      setError(exportErr?.message || 'Không thể xuất Bảng chấm công.')
    } finally {
      setExportingTimesheet(false)
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

  // Filtered timesheet rows by search keyword
  const filteredTimesheet = useMemo(() => {
    if (!search.trim()) return timesheetRows
    const q = search.toLowerCase()
    return timesheetRows.filter(
      (r) =>
        (r.employee_name && r.employee_name.toLowerCase().includes(q)) ||
        (r.employee_id && r.employee_id.toLowerCase().includes(q))
    )
  }, [timesheetRows, search])

  // Active items depending on current view mode
  const activeItems = viewMode === 'timesheet' ? filteredTimesheet : filteredRecords

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

  // Timesheet summary statistics
  const tsSummary = useMemo(() => {
    const totalDays = timesheetStats?.total_work_days ?? filteredTimesheet.length
    const totalEmployees = timesheetStats?.total_employees ?? new Set(filteredTimesheet.map((r) => r.employee_id).filter(Boolean)).size
    const totalLate = timesheetStats?.total_late_cases ?? filteredTimesheet.filter((r) => r.is_late).length
    const totalEarly = timesheetStats?.total_early_cases ?? filteredTimesheet.filter((r) => r.is_early_departure).length
    return { totalDays, totalEmployees, totalLate, totalEarly }
  }, [filteredTimesheet, timesheetStats])

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(activeItems.length / pageSize))
  const paginatedItems = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize
    return activeItems.slice(startIdx, startIdx + pageSize)
  }, [activeItems, currentPage, pageSize])

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
            Tổng hợp công nhật, phát hiện đi muộn / về sớm và xuất file báo cáo chuẩn.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="ghost"
            size="md"
            icon={RefreshCw}
            onClick={() => loadData()}
            loading={loading}
          >
            Làm mới
          </Button>
          <Button
            variant="secondary"
            size="md"
            icon={Download}
            onClick={handleExportLogs}
            loading={exportingLogs}
          >
            Xuất Dữ liệu gốc (CSV)
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={Download}
            onClick={handleExportTimesheet}
            loading={exportingTimesheet}
          >
            Xuất Bảng chấm công (CSV)
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
      {viewMode === 'timesheet' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Tổng ngày công"
            value={tsSummary.totalDays.toLocaleString()}
            subtitle="Số lượt ngày làm việc"
            icon={UserCheck}
            color="blue"
          />
          <StatCard
            title="Nhân sự có mặt"
            value={tsSummary.totalEmployees}
            subtitle="Cá nhân đã ghi nhận"
            icon={Users}
            color="emerald"
          />
          <StatCard
            title="Số lượt đi muộn"
            value={tsSummary.totalLate}
            subtitle="Vượt giờ bắt đầu ca"
            icon={Clock}
            color="amber"
          />
          <StatCard
            title="Số lượt về sớm"
            value={tsSummary.totalEarly}
            subtitle="Rời trước kết thúc ca"
            icon={AlertTriangle}
            color="purple"
          />
        </div>
      ) : (
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
      )}

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

      {/* View Mode Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-[var(--cv-bg-surface-elevated)] border border-[var(--cv-border-default)] rounded-2xl shadow-2xs">
          <button
            onClick={() => {
              setViewMode('timesheet')
              setCurrentPage(1)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'timesheet'
                ? 'bg-[var(--cv-brand-500)] text-white shadow-xs'
                : 'text-[var(--cv-text-secondary)] hover:text-[var(--cv-text-primary)] hover:bg-[var(--cv-bg-surface-hover)]'
            }`}
          >
            <TableIcon className="w-4 h-4" />
            <span>Bảng chấm công tổng hợp</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                viewMode === 'timesheet'
                  ? 'bg-white/20 text-white'
                  : 'bg-[var(--cv-bg-surface-hover)] text-[var(--cv-text-secondary)]'
              }`}
            >
              {filteredTimesheet.length}
            </span>
          </button>

          <button
            onClick={() => {
              setViewMode('logs')
              setCurrentPage(1)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'logs'
                ? 'bg-[var(--cv-brand-500)] text-white shadow-xs'
                : 'text-[var(--cv-text-secondary)] hover:text-[var(--cv-text-primary)] hover:bg-[var(--cv-bg-surface-hover)]'
            }`}
          >
            <List className="w-4 h-4" />
            <span>Lịch sử quét chi tiết</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                viewMode === 'logs'
                  ? 'bg-white/20 text-white'
                  : 'bg-[var(--cv-bg-surface-hover)] text-[var(--cv-text-secondary)]'
              }`}
            >
              {filteredRecords.length}
            </span>
          </button>
        </div>
      </div>

      {/* Main Records Table Card */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-[var(--cv-border-default)] flex items-center justify-between text-xs text-[var(--cv-text-secondary)]">
          <div className="font-semibold">
            Hiển thị{' '}
            <span className="text-[var(--cv-text-primary)] font-bold">
              {activeItems.length ? (currentPage - 1) * pageSize + 1 : 0}
            </span>{' '}
            -{' '}
            <span className="text-[var(--cv-text-primary)] font-bold">
              {Math.min(currentPage * pageSize, activeItems.length)}
            </span>{' '}
            trong tổng số{' '}
            <span className="text-[var(--cv-text-primary)] font-bold">
              {activeItems.length}
            </span>{' '}
            {viewMode === 'timesheet' ? 'ngày công' : 'lượt quét'}
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
        ) : activeItems.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title={
              viewMode === 'timesheet'
                ? 'Không tìm thấy dữ liệu bảng công nào'
                : 'Không tìm thấy bản ghi điểm danh nào'
            }
            description="Hãy thử thay đổi khoảng ngày, từ khóa tìm kiếm hoặc bấm 'Làm mới'."
            className="m-6 border-none bg-transparent"
          />
        ) : viewMode === 'timesheet' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--cv-border-default)] bg-[var(--cv-bg-surface-elevated)] text-[var(--cv-text-primary)] uppercase tracking-wider font-bold text-[11px]">
                  <th className="py-3 px-5">Nhân viên</th>
                  <th className="py-3 px-4">Ngày</th>
                  <th className="py-3 px-4">Giờ vào (Check-in)</th>
                  <th className="py-3 px-4">Giờ ra (Check-out)</th>
                  <th className="py-3 px-4">Tổng giờ làm</th>
                  <th className="py-3 px-4 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cv-border-default)]">
                {paginatedItems.map((row, idx) => {
                  return (
                    <tr
                      key={`${row.employee_id}-${row.date}-${idx}`}
                      className="hover:bg-[var(--cv-bg-surface-hover)]/60 transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-[var(--cv-brand-100)] dark:bg-[var(--cv-brand-950)] text-[var(--cv-brand-700)] dark:text-[var(--cv-brand-300)] flex items-center justify-center font-black text-xs shrink-0">
                            {(row.employee_name || row.employee_id || 'NV')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-[var(--cv-text-primary)]">
                              {row.employee_name || 'Chưa đặt tên'}
                            </p>
                            <p className="text-[11px] text-[var(--cv-text-tertiary)] font-mono">
                              {row.employee_id || '-'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-medium text-[var(--cv-text-secondary)]">
                        {row.date}
                      </td>

                      <td className="py-3.5 px-4">
                        {row.check_in ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[var(--cv-text-primary)]">
                              {row.check_in}
                            </span>
                            {row.is_late ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                Muộn {row.late_minutes}p
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                Đúng giờ
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--cv-text-tertiary)] italic">Chưa ghi nhận</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {row.check_out ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[var(--cv-text-primary)]">
                              {row.check_out}
                            </span>
                            {row.is_early_departure ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                Sớm {row.early_minutes}p
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                Đúng giờ
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--cv-text-tertiary)] italic">Chưa ghi nhận</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-[var(--cv-brand-600)] dark:text-[var(--cv-brand-400)]">
                        {Number(row.work_hours || 0).toFixed(2)} giờ
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <Badge
                          variant={
                            row.status === 'completed'
                              ? 'success'
                              : row.status === 'late' || row.status === 'early_departure'
                              ? 'warning'
                              : row.status === 'late_and_early'
                              ? 'danger'
                              : 'neutral'
                          }
                          size="sm"
                          dot
                        >
                          {row.status === 'completed'
                            ? 'Đúng giờ'
                            : row.status === 'late'
                            ? 'Đi muộn'
                            : row.status === 'early_departure'
                            ? 'Về sớm'
                            : row.status === 'late_and_early'
                            ? 'Muộn & Về sớm'
                            : row.status === 'missing_checkout'
                            ? 'Thiếu giờ ra'
                            : 'Thiếu giờ vào'}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
                {paginatedItems.map((record) => {
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
        {activeItems.length > 0 && (
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
