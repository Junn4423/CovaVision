import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpToLine,
  CheckCircle2,
  Eye,
  FileDown,
  RefreshCw,
  X,
} from 'lucide-react'
import { api } from '../services/api'
import { useToast } from '../components/Toast'

const TAB_KEYS = {
  NEW: 'new',
  PROFILE: 'profile',
  FACE: 'face',
}

function formatDateTime(input) {
  if (!input) return 'Chưa có dữ liệu'
  try {
    return new Date(input).toLocaleString('vi-VN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return input
  }
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadCsv(filename, columns, rows) {
  const header = columns.map(col => csvEscape(col.label)).join(',')
  const body = rows
    .map(row => columns.map(col => csvEscape(typeof col.get === 'function' ? col.get(row) : '')).join(','))
    .join('\n')

  const csvText = `\uFEFF${header}${body ? `\n${body}` : ''}`
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function DetailModal({ open, title, children, onClose }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors"
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function ConfirmModal({ open, title, lines, confirmLabel, danger = false, loading = false, onCancel, onConfirm }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2 text-amber-700">
          <AlertTriangle size={18} />
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        </div>

        <div className="px-5 py-4 space-y-2">
          {lines.map((line, idx) => (
            <p key={`${line}-${idx}`} className="text-sm text-slate-700 leading-6">{line}</p>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors"
            disabled={loading}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {loading ? 'Đang xử lý...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SyncVerify() {
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const autoRunRef = useRef(false)

  const [authMode, setAuthMode] = useState('system')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(TAB_KEYS.NEW)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [runningActionKey, setRunningActionKey] = useState('')
  const [result, setResult] = useState(null)

  const [detailState, setDetailState] = useState({ open: false, type: TAB_KEYS.NEW, item: null })
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: '',
    lines: [],
    confirmLabel: 'Xác nhận',
    danger: false,
    loading: false,
    onConfirm: null,
  })

  const newEmployees = result?.new_employees || []
  const profileMismatches = result?.profile_mismatches || []
  const faceMismatches = result?.face_mismatches || []
  const summary = result?.summary || {
    erp_total: 0,
    system_total: 0,
    new_count: 0,
    profile_mismatch_count: 0,
    face_mismatch_count: 0,
  }

  const tabList = useMemo(() => ([
    {
      key: TAB_KEYS.NEW,
      label: 'Nhân viên mới',
      count: summary.new_count || 0,
    },
    {
      key: TAB_KEYS.PROFILE,
      label: 'Sai lệch thông tin',
      count: summary.profile_mismatch_count || 0,
    },
    {
      key: TAB_KEYS.FACE,
      label: 'Sai lệch khuôn mặt',
      count: summary.face_mismatch_count || 0,
    },
  ]), [summary.face_mismatch_count, summary.new_count, summary.profile_mismatch_count])

  const activeRows = useMemo(() => {
    if (activeTab === TAB_KEYS.NEW) return newEmployees
    if (activeTab === TAB_KEYS.PROFILE) return profileMismatches
    return faceMismatches
  }, [activeTab, faceMismatches, newEmployees, profileMismatches])

  const totalPages = useMemo(() => {
    if (activeRows.length === 0) return 1
    return Math.ceil(activeRows.length / pageSize)
  }, [activeRows.length, pageSize])
  const safeCurrentPage = Math.min(currentPage, totalPages)

  const paginatedRows = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize
    return activeRows.slice(startIndex, startIndex + pageSize)
  }, [activeRows, pageSize, safeCurrentPage])

  const loadAuthMode = useCallback(async () => {
    try {
      const res = await api.sessionStatus()
      const mode = (res?.auth_mode || res?.user?.auth_mode || 'system').toLowerCase()
      setAuthMode(mode === 'internal' ? 'internal' : 'system')
    } catch {
      setAuthMode('system')
    }
  }, [])

  const loadComparison = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getSyncCompare()
      if (res?.success) {
        setResult(res)
      } else {
        toast.error(res?.message || 'Không thể lấy dữ liệu so sánh đồng bộ')
      }
    } catch (error) {
      toast.error(error?.message || 'Không thể lấy dữ liệu so sánh đồng bộ')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => {
    loadAuthMode()
  }, [loadAuthMode])

  useEffect(() => {
    const shouldAutoRun = searchParams.get('run') === '1'
    if (!shouldAutoRun || autoRunRef.current) return

    autoRunRef.current = true
    loadComparison()
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('run')
      return next
    }, { replace: true })
  }, [loadComparison, searchParams, setSearchParams])

  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, activeRows.length])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  function openConfirmModal(config) {
    setConfirmState({
      open: true,
      title: config.title || 'Xác nhận thao tác',
      lines: Array.isArray(config.lines) ? config.lines : [],
      confirmLabel: config.confirmLabel || 'Xác nhận',
      danger: Boolean(config.danger),
      loading: false,
      onConfirm: config.onConfirm,
    })
  }

  function closeConfirmModal() {
    setConfirmState(prev => ({
      ...prev,
      open: false,
      loading: false,
      onConfirm: null,
    }))
  }

  async function executeConfirmAction() {
    if (typeof confirmState.onConfirm !== 'function') {
      closeConfirmModal()
      return
    }

    setConfirmState(prev => ({ ...prev, loading: true }))
    try {
      await confirmState.onConfirm()
      closeConfirmModal()
    } catch {
      setConfirmState(prev => ({ ...prev, loading: false }))
    }
  }

  function handleExportCurrentTab() {
    if (activeTab === TAB_KEYS.NEW) {
      downloadCsv(
        'nhan-vien-moi.csv',
        [
          { label: 'Mã NV', get: row => row.employee_id },
          { label: 'Họ tên', get: row => row.name },
          { label: 'Phòng ban', get: row => row.department },
          { label: 'Vị trí', get: row => row.position },
          { label: 'Token ảnh ERP', get: row => row.erp_image_token },
        ],
        newEmployees,
      )
      return
    }

    if (activeTab === TAB_KEYS.PROFILE) {
      const flattened = []
      for (const item of profileMismatches) {
        for (const diff of item.differences || []) {
          flattened.push({
            employee_id: item.employee_id,
            field: diff.label,
            erp_value: diff.erp_value,
            system_value: diff.system_value,
          })
        }
      }
      downloadCsv(
        'sai-lech-thong-tin.csv',
        [
          { label: 'Mã NV', get: row => row.employee_id },
          { label: 'Trường dữ liệu', get: row => row.field },
          { label: 'ERP', get: row => row.erp_value },
          { label: 'Hệ thống', get: row => row.system_value },
        ],
        flattened,
      )
    }
  }

  function openDetail(type, item) {
    setDetailState({ open: true, type, item })
  }

  function closeDetail() {
    setDetailState({ open: false, type: TAB_KEYS.NEW, item: null })
  }

  function handlePushLocalToErp(item) {
    if (!item?.employee_id) return
    openConfirmModal({
      title: 'Xác nhận đẩy ảnh local lên ERP',
      confirmLabel: 'Đẩy ảnh lên ERP',
      lines: [
        `Nhân viên: ${item.employee_id} - ${item.name || '-'}`,
        `Token ERP hiện tại: ${item.erp_image_token || '(trống)'}`,
        `Token hệ thống hiện tại: ${item.system_image_token || '(trống)'}`,
        'Sau khi xác nhận, hệ thống sẽ ghi đè token ảnh trên ERP theo ảnh local hiện tại.',
      ],
      onConfirm: async () => {
        if (authMode === 'internal') {
          toast.error('Đang ở chế độ nội bộ. Vui lòng đăng nhập hệ thống để đồng bộ ERP.')
          throw new Error('internal-mode')
        }

        const actionKey = `push-${item.employee_id}`
        setRunningActionKey(actionKey)
        try {
          const res = await api.pushToErp(item.employee_id)
          if (res?.success) {
            toast.success(res.message || `Đã cập nhật ảnh ERP cho ${item.employee_id}`)
            await loadComparison()
          } else {
            toast.error(res?.message || 'Không thể cập nhật ảnh lên ERP')
            throw new Error('push-failed')
          }
        } finally {
          setRunningActionKey('')
        }
      },
    })
  }

  function handlePullErpToSystem(item) {
    if (!item?.employee_id) return
    openConfirmModal({
      title: 'Xác nhận cập nhật hệ thống theo ERP',
      confirmLabel: 'Cập nhật hệ thống',
      lines: [
        `Nhân viên: ${item.employee_id} - ${item.name || '-'}`,
        `Token ERP hiện tại: ${item.erp_image_token || '(trống)'}`,
        `Token hệ thống hiện tại: ${item.system_image_token || '(trống)'}`,
        'Sau khi xác nhận, hệ thống sẽ tải lại ảnh từ ERP và cập nhật dữ liệu khuôn mặt local.',
      ],
      onConfirm: async () => {
        if (authMode === 'internal') {
          toast.error('Đang ở chế độ nội bộ. Vui lòng đăng nhập hệ thống để đồng bộ ERP.')
          throw new Error('internal-mode')
        }

        const actionKey = `pull-${item.employee_id}`
        setRunningActionKey(actionKey)
        try {
          const res = await api.reloadFromErp(item.employee_id)
          if (res?.success) {
            toast.success(res.message || `Đã cập nhật dữ liệu local từ ERP cho ${item.employee_id}`)
            await loadComparison()
          } else {
            toast.error(res?.message || 'Không thể cập nhật dữ liệu local từ ERP')
            throw new Error('pull-failed')
          }
        } finally {
          setRunningActionKey('')
        }
      },
    })
  }

  const canExport = activeTab === TAB_KEYS.NEW || activeTab === TAB_KEYS.PROFILE

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Đối soát dữ liệu ERP</h1>
          <p className="text-sm text-slate-500">
            So sánh đối soát dữ liệu ERP với hệ thống hiện tại trước khi thực thi thao tác ghi dữ liệu.
          </p>
          {authMode === 'internal' && (
            <p className="text-sm text-amber-700">
              Đang ở chế độ nội bộ. Các thao tác ghi dữ liệu vào ERP đang bị khóa.
            </p>
          )}
        </div>

        <div className="w-full lg:w-auto flex flex-col sm:flex-row gap-2">
          <button
            onClick={loadComparison}
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Đang đối soát dữ liệu...' : 'Đối soát dữ liệu ERP'}
          </button>

          <button
            onClick={handleExportCurrentTab}
            disabled={!canExport || activeRows.length === 0}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-100 border border-slate-200 disabled:opacity-50 transition-colors"
          >
            <FileDown size={16} />
            Xuất danh sách tab hiện tại
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Tổng nhân viên ERP</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{summary.erp_total || 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Nhân viên mới</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{summary.new_count || 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Sai lệch thông tin</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{summary.profile_mismatch_count || 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Sai lệch khuôn mặt</p>
          <p className="mt-1 text-2xl font-bold text-sky-700">{summary.face_mismatch_count || 0}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {tabList.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary-50 text-primary-700 border-primary-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
            <label className="inline-flex items-center gap-1.5">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={event => {
                  setPageSize(Number(event.target.value) || 20)
                  setCurrentPage(1)
                }}
                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>dòng</span>
            </label>
            <span className="text-slate-400">Cập nhật lúc: {formatDateTime(result?.generated_at)}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50">
              {activeTab === TAB_KEYS.NEW && (
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Mã NV</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Họ tên</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Phòng ban</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Vị trí</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Token ảnh ERP</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Thao tác</th>
                </tr>
              )}

              {activeTab === TAB_KEYS.PROFILE && (
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Mã NV</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Hệ thống</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">ERP</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Số trường lệch</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Thao tác</th>
                </tr>
              )}

              {activeTab === TAB_KEYS.FACE && (
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Mã NV</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Họ tên</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Token ERP</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Token hệ thống</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Gợi ý xử lý</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Thao tác</th>
                </tr>
              )}
            </thead>

            <tbody className="divide-y divide-slate-100">
              {paginatedRows.map(item => {
                if (activeTab === TAB_KEYS.NEW) {
                  return (
                    <tr key={`new-${item.employee_id}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{item.employee_id}</td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{item.name || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{item.department || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{item.position || '-'}</td>
                      <td className="px-4 py-3 text-slate-500 break-all">{item.erp_image_token || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openDetail(TAB_KEYS.NEW, item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
                        >
                          <Eye size={14} />
                          Xem
                        </button>
                      </td>
                    </tr>
                  )
                }

                if (activeTab === TAB_KEYS.PROFILE) {
                  return (
                    <tr key={`profile-${item.employee_id}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{item.employee_id}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {(item.system?.name || '-')}
                        <p className="text-xs text-slate-400 mt-1">{item.system?.department || '-'}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {(item.erp?.name || '-')}
                        <p className="text-xs text-slate-400 mt-1">{item.erp?.department || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
                          {item.differences?.length || 0} trường
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openDetail(TAB_KEYS.PROFILE, item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
                        >
                          <Eye size={14} />
                          Xem
                        </button>
                      </td>
                    </tr>
                  )
                }

                const pushKey = `push-${item.employee_id}`
                const pullKey = `pull-${item.employee_id}`
                return (
                  <tr key={`face-${item.employee_id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{item.employee_id}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{item.name || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 break-all">{item.erp_image_token || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 break-all">{item.system_image_token || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.direction_hint === 'push_local_to_erp' && 'Ưu tiên đẩy ảnh local lên ERP'}
                      {item.direction_hint === 'pull_erp_to_system' && 'Ưu tiên cập nhật local theo ERP'}
                      {item.direction_hint === 'review' && 'Cần xem chi tiết trước khi chọn hướng đồng bộ'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2 flex-wrap justify-end">
                        <button
                          type="button"
                          onClick={() => openDetail(TAB_KEYS.FACE, item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors"
                        >
                          <Eye size={14} />
                          Xem
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePushLocalToErp(item)}
                          disabled={!item.can_push_local_to_erp || authMode === 'internal' || runningActionKey === pushKey || runningActionKey === pullKey}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                        >
                          <ArrowUpToLine size={14} />
                          {runningActionKey === pushKey ? 'Đang đẩy...' : 'Đẩy ảnh lên ERP'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePullErpToSystem(item)}
                          disabled={!item.can_pull_erp_to_system || authMode === 'internal' || runningActionKey === pushKey || runningActionKey === pullKey}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 disabled:opacity-50 transition-colors"
                        >
                          <ArrowDownToLine size={14} />
                          {runningActionKey === pullKey ? 'Đang cập nhật...' : 'Cập nhật theo ERP'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!loading && activeRows.length === 0 && (
          <div className="px-5 py-10 text-center text-slate-400 text-sm">
            Chưa có dữ liệu cho tab hiện tại. Hãy bấm "Đồng bộ và kiểm tra với hệ thống" để bắt đầu.
          </div>
        )}

        {!loading && activeRows.length > 0 && (
          <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-slate-500">
              Hiển thị {((safeCurrentPage - 1) * pageSize) + 1} - {Math.min(safeCurrentPage * pageSize, activeRows.length)} trên {activeRows.length} dòng
            </p>

            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={safeCurrentPage <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50"
              >
                Trang trước
              </button>
              <span className="text-xs text-slate-500 min-w-[80px] text-center">
                Trang {safeCurrentPage}/{totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50"
              >
                Trang sau
              </button>
            </div>
          </div>
        )}
      </div>

      <DetailModal
        open={detailState.open}
        title={
          detailState.type === TAB_KEYS.NEW
            ? `Chi tiết nhân viên mới: ${detailState.item?.employee_id || ''}`
            : detailState.type === TAB_KEYS.PROFILE
              ? `Chi tiết sai lệch thông tin: ${detailState.item?.employee_id || ''}`
              : `Chi tiết sai lệch khuôn mặt: ${detailState.item?.employee_id || ''}`
        }
        onClose={closeDetail}
      >
        {detailState.type === TAB_KEYS.NEW && detailState.item && (
          <div className="space-y-2 text-sm text-slate-700">
            <p><span className="font-semibold">Mã NV:</span> {detailState.item.employee_id}</p>
            <p><span className="font-semibold">Họ tên:</span> {detailState.item.name || '-'}</p>
            <p><span className="font-semibold">Phòng ban:</span> {detailState.item.department || '-'}</p>
            <p><span className="font-semibold">Vị trí:</span> {detailState.item.position || '-'}</p>
            <p className="break-all"><span className="font-semibold">Token ảnh ERP:</span> {detailState.item.erp_image_token || '-'}</p>
            <p className="break-all"><span className="font-semibold">URL ảnh ERP:</span> {detailState.item.erp_image_url || '-'}</p>
          </div>
        )}

        {detailState.type === TAB_KEYS.PROFILE && detailState.item && (
          <div className="space-y-3">
            <div className="text-sm text-slate-700">
              <p><span className="font-semibold">Mã NV:</span> {detailState.item.employee_id}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm border border-slate-200 rounded-xl overflow-hidden">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Trường dữ liệu</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">ERP</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Hệ thống</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(detailState.item.differences || []).map(diff => (
                    <tr key={`${detailState.item.employee_id}-${diff.field}`}>
                      <td className="px-3 py-2 text-slate-700">{diff.label}</td>
                      <td className="px-3 py-2 text-slate-600">{diff.erp_value || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{diff.system_value || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {detailState.type === TAB_KEYS.FACE && detailState.item && (
          <div className="space-y-3 text-sm text-slate-700">
            <p><span className="font-semibold">Mã NV:</span> {detailState.item.employee_id}</p>
            <p><span className="font-semibold">Họ tên:</span> {detailState.item.name || '-'}</p>
            <p className="break-all"><span className="font-semibold">Token ERP:</span> {detailState.item.erp_image_token || '-'}</p>
            <p className="break-all"><span className="font-semibold">Token hệ thống:</span> {detailState.item.system_image_token || '-'}</p>
            <p className="break-all"><span className="font-semibold">Token ảnh local:</span> {detailState.item.local_image_token || '-'}</p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
              <p className="font-semibold text-amber-800">Các điểm cần lưu ý:</p>
              {(detailState.item.reasons || []).length > 0 ? (
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  {(detailState.item.reasons || []).map((reason, idx) => (
                    <li key={`${reason}-${idx}`}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-amber-800">Không có mô tả chi tiết.</p>
              )}
            </div>
            <div className="inline-flex items-center gap-2 text-emerald-700">
              <CheckCircle2 size={16} />
              <span>
                {detailState.item.direction_hint === 'push_local_to_erp' && 'Khuyến nghị: Đẩy ảnh local lên ERP'}
                {detailState.item.direction_hint === 'pull_erp_to_system' && 'Khuyến nghị: Cập nhật local theo ERP'}
                {detailState.item.direction_hint === 'review' && 'Khuyến nghị: Xem xét thủ công trước khi quyết định'}
              </span>
            </div>
          </div>
        )}
      </DetailModal>

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        lines={confirmState.lines}
        confirmLabel={confirmState.confirmLabel}
        danger={confirmState.danger}
        loading={confirmState.loading}
        onCancel={closeConfirmModal}
        onConfirm={executeConfirmAction}
      />
    </div>
  )
}
