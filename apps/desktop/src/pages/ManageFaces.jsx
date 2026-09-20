import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  RotateCw,
  Search,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import SmartAvatar from '../components/SmartAvatar'
import EmployeeRegistrationModal from '../components/EmployeeRegistrationModal'
import { normalizeEmployeeImageUri } from '../utils/avatarUtils'
import { ConfirmDialog } from '../components/ui'

function getManageStatusBadge(employee) {
  const statusCode = (employee?.status_code || '').toLowerCase()

  if (statusCode === 'ready' || employee?.has_face) {
    return {
      label: employee?.status_text || 'Đã đăng ký khuôn mặt',
      tone: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      dot: 'bg-emerald-500',
    }
  }

  if (statusCode === 'image_only' || employee?.has_local_image) {
    return {
      label: employee?.status_text || 'Đã có ảnh (chưa trích xuất)',
      tone: 'bg-sky-50 text-sky-700 border-sky-200/80',
      dot: 'bg-sky-500',
    }
  }

  return {
    label: employee?.status_text || 'Chưa đăng ký khuôn mặt',
    tone: 'bg-amber-50 text-amber-700 border-amber-200/80',
    dot: 'bg-amber-500',
  }
}

function ImagePreviewModal({ viewer, onClose, onUpdateFace, onCaptureFace }) {
  if (!viewer.open) return null

  const resolvedImage =
    normalizeEmployeeImageUri(viewer.imageUrl) ||
    normalizeEmployeeImageUri(viewer.imageBase64)

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <ImageIcon size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Ảnh khuôn mặt đã đăng ký</h2>
              <p className="text-xs text-slate-500 font-medium">
                {viewer.employee?.name || '-'} · <span className="font-mono">{viewer.employee?.employee_id || '-'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white text-slate-400 hover:text-slate-700 border border-slate-200 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="grid md:grid-cols-[300px_1fr] gap-0">
          <div className="bg-slate-900/5 p-6 flex flex-col items-center justify-center border-r border-slate-100 min-h-[300px]">
            {viewer.loading ? (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <span className="text-xs font-medium">Đang tải ảnh từ máy chủ...</span>
              </div>
            ) : viewer.error ? (
              <div className="text-center p-4">
                <ImageIcon size={44} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs text-red-500 font-medium">{viewer.error}</p>
              </div>
            ) : resolvedImage ? (
              <img
                src={resolvedImage}
                alt={viewer.employee?.name || 'Khuôn mặt'}
                className="w-56 h-56 object-cover rounded-2xl shadow-md border-2 border-white"
                onError={e => {
                  e.target.style.display = 'none'
                }}
              />
            ) : (
              <div className="text-center text-slate-400">
                <User size={48} className="mx-auto mb-2 text-slate-300" />
                <p className="text-xs">Chưa có ảnh khuôn mặt</p>
              </div>
            )}
          </div>

          <div className="p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Họ và tên</span>
                  <strong className="text-slate-800 text-sm font-semibold">{viewer.employee?.name || '-'}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Mã nhân viên</span>
                  <strong className="text-slate-800 text-sm font-mono">{viewer.employee?.employee_id || '-'}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Phòng ban</span>
                  <strong className="text-slate-800">{viewer.employee?.department || '-'}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Số mẫu mặt</span>
                  <strong className="text-slate-800">{viewer.employee?.face_count || 1} mẫu</strong>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-xs space-y-1">
                <p className="text-blue-900 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-blue-600" />
                  Mẫu khuôn mặt AI đã sẵn sàng
                </p>
                <p className="text-blue-700/80">
                  Ảnh được lưu trữ an toàn và đồng bộ đa kênh qua cụm máy chủ AI nhận diện sinh trắc học.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => onCaptureFace?.(viewer.employee)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                title="Mở camera để chụp khuôn mặt mới"
              >
                <Camera size={13} />
                <span>Chụp ảnh mới</span>
              </button>

              <button
                type="button"
                onClick={() => onUpdateFace(viewer.employee?.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer"
                title="Tải ảnh từ máy tính"
              >
                <Upload size={13} />
                <span>Tải ảnh từ máy</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const emptyViewer = {
  open: false,
  loading: false,
  employee: null,
  imageUrl: null,
  imageBase64: null,
  imageSource: 'local',
  error: '',
}

export default function ManageFaces() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [faceFilter, setFaceFilter] = useState('all')
  const [viewer, setViewer] = useState(emptyViewer)
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([])
  const [registerModalOpen, setRegisterModalOpen] = useState(false)
  const [selectedEmployeeForReg, setSelectedEmployeeForReg] = useState(null)
  const selectAllRef = useRef(null)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [viewMode, setViewMode] = useState('table')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)

  useEffect(() => {
    loadEmployees()
  }, [])

  const withFaceCount = useMemo(
    () => employees.filter(e => e.has_face || e.status_code === 'ready').length,
    [employees]
  )
  const withoutFaceCount = employees.length - withFaceCount

  const filteredEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return employees.filter(employee => {
      const matchesKeyword =
        !keyword ||
        employee.name.toLowerCase().includes(keyword) ||
        employee.employee_id.toLowerCase().includes(keyword) ||
        (employee.department || '').toLowerCase().includes(keyword)

      const hasFace = employee.has_face || employee.status_code === 'ready'
      const matchesFaceFilter =
        faceFilter === 'all' ||
        (faceFilter === 'with_face' && hasFace) ||
        (faceFilter === 'without_face' && !hasFace)

      return matchesKeyword && matchesFaceFilter
    })
  }, [employees, search, faceFilter])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [search, faceFilter, pageSize])

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize))

  const paginatedEmployees = useMemo(() => {
    const startIndex = (page - 1) * pageSize
    return filteredEmployees.slice(startIndex, startIndex + pageSize)
  }, [filteredEmployees, page, pageSize])

  const paginatedEmployeeIds = useMemo(
    () => paginatedEmployees.map(employee => employee.id),
    [paginatedEmployees]
  )

  const selectedEmployees = useMemo(
    () => filteredEmployees.filter(employee => selectedEmployeeIds.includes(employee.id)),
    [filteredEmployees, selectedEmployeeIds]
  )

  const selectedOnPageCount = useMemo(
    () => paginatedEmployeeIds.filter(id => selectedEmployeeIds.includes(id)).length,
    [paginatedEmployeeIds, selectedEmployeeIds]
  )

  const allOnPageSelected =
    paginatedEmployees.length > 0 && selectedOnPageCount === paginatedEmployees.length
  const someOnPageSelected = selectedOnPageCount > 0 && !allOnPageSelected

  useEffect(() => {
    const visibleEmployeeIds = new Set(filteredEmployees.map(employee => employee.id))
    setSelectedEmployeeIds(prev => prev.filter(id => visibleEmployeeIds.has(id)))
  }, [filteredEmployees])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someOnPageSelected
    }
  }, [someOnPageSelected])

  async function loadEmployees() {
    setLoading(true)
    try {
      const res = await api.getAdminEmployees()
      if (res.success && Array.isArray(res.employees)) {
        setEmployees(res.employees)
      } else {
        toast.error(res.message || 'Không tải được danh sách nhân viên')
      }
    } catch {
      toast.error('Không thể kết nối backend')
    }
    setLoading(false)
  }

  function closeViewer() {
    setViewer(emptyViewer)
  }

  function toggleEmployeeSelection(employeeId) {
    setSelectedEmployeeIds(prev =>
      prev.includes(employeeId) ? prev.filter(id => id !== employeeId) : [...prev, employeeId]
    )
  }

  function toggleSelectAllOnPage(checked) {
    setSelectedEmployeeIds(prev => {
      const pageIds = new Set(paginatedEmployeeIds)
      if (checked) {
        const mergedIds = new Set(prev)
        paginatedEmployeeIds.forEach(id => mergedIds.add(id))
        return Array.from(mergedIds)
      }
      return prev.filter(id => !pageIds.has(id))
    })
  }

  async function handleViewImage(employee) {
    setViewer({
      open: true,
      loading: true,
      employee,
      imageUrl: employee.image_url || null,
      imageBase64: null,
      imageSource: 'local',
      error: '',
    })

    try {
      const res = await api.getAdminEmployeeImage(employee.employee_id)
      if (res.success) {
        setViewer({
          open: true,
          loading: false,
          employee: {
            ...employee,
            ...(res.employee || {}),
          },
          imageUrl: res.image_url || employee.image_url || null,
          imageBase64: res.image_base64 || null,
          imageSource: res.image_source || 'local',
          error: '',
        })
      } else {
        setViewer({
          open: true,
          loading: false,
          employee,
          imageUrl: employee.image_url || null,
          imageBase64: null,
          imageSource: 'local',
          error: employee.image_url ? '' : (res.message || 'Chưa có ảnh trên máy chủ'),
        })
      }
    } catch {
      setViewer({
        open: true,
        loading: false,
        employee,
        imageUrl: employee.image_url || null,
        imageBase64: null,
        imageSource: 'local',
        error: employee.image_url ? '' : 'Không thể tải ảnh từ backend',
      })
    }
  }

  function handleDelete(userId, name) {
    setDeleteTarget({ id: userId, name })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      const res = await api.deleteEmployee(deleteTarget.id)
      if (res.success) {
        toast.success(res.message || 'Đã xóa nhân viên thành công')
        if (viewer.employee?.id === deleteTarget.id) closeViewer()
        setSelectedEmployeeIds(prev => prev.filter(id => id !== deleteTarget.id))
        setDeleteTarget(null)
        await loadEmployees()
      } else {
        toast.error(res.message || 'Xóa thất bại')
      }
    } catch {
      toast.error('Không thể xóa nhân viên')
    }
  }

  function handleBulkDelete() {
    if (selectedEmployees.length === 0) return
    setBulkDeleteDialogOpen(true)
  }

  async function confirmBulkDelete() {
    setBulkDeleting(true)
    const failedIds = []
    let successCount = 0

    for (const employee of selectedEmployees) {
      try {
        const res = await api.deleteEmployee(employee.id)
        if (res.success) {
          successCount += 1
          if (viewer.employee?.id === employee.id) closeViewer()
        } else {
          failedIds.push(employee.id)
        }
      } catch {
        failedIds.push(employee.id)
      }
    }

    if (successCount > 0) {
      toast.success(`Đã xóa ${successCount}/${selectedEmployees.length} nhân viên`)
    }
    if (failedIds.length > 0) {
      toast.error(`Có ${failedIds.length} nhân viên xóa thất bại`)
    }

    setSelectedEmployeeIds(failedIds)
    setBulkDeleteDialogOpen(false)
    await loadEmployees()
    setBulkDeleting(false)
  }

  async function handleUpdateFace(userId) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async event => {
      const file = event.target.files?.[0]
      if (!file) return

      const payload = new FormData()
      payload.append('user_id', userId)
      payload.append('image', file)

      try {
        const res = await api.updateFace(payload)
        if (res.success) {
          toast.success(res.message || 'Đã cập nhật khuôn mặt thành công')
          await loadEmployees()
          if (viewer.employee?.id === userId) {
            handleViewImage({ ...viewer.employee, has_local_image: true, has_face: true })
          }
        } else {
          toast.error(res.message || 'Cập nhật thất bại')
        }
      } catch {
        toast.error('Không thể cập nhật khuôn mặt')
      }
    }
    input.click()
  }

  function handleRegisterFace(employee) {
    setSelectedEmployeeForReg(employee)
    setRegisterModalOpen(true)
  }

  function handleCaptureFace(employee) {
    closeViewer()
    setSelectedEmployeeForReg(employee)
    setRegisterModalOpen(true)
  }

  const filterButtons = [
    { key: 'all', label: 'Tất cả', count: employees.length },
    { key: 'with_face', label: 'Đã có khuôn mặt', count: withFaceCount },
    { key: 'without_face', label: 'Chưa có khuôn mặt', count: withoutFaceCount },
  ]

  const startIndex = (page - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, filteredEmployees.length)

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Registration Modal */}
      <EmployeeRegistrationModal
        open={registerModalOpen}
        initialEmployee={selectedEmployeeForReg}
        onClose={() => {
          setRegisterModalOpen(false)
          setSelectedEmployeeForReg(null)
        }}
        onSuccess={() => {
          setRegisterModalOpen(false)
          setSelectedEmployeeForReg(null)
          loadEmployees()
        }}
      />

      {/* Image Preview Modal */}
      <ImagePreviewModal
        viewer={viewer}
        onClose={closeViewer}
        onUpdateFace={handleUpdateFace}
        onCaptureFace={handleCaptureFace}
      />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
              Nhân sự & Khuôn mặt
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {employees.length} nhân sự
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quản lý nhân viên, xem ảnh sinh trắc học và đăng ký khuôn mặt điểm danh.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setSelectedEmployeeForReg(null)
              setRegisterModalOpen(true)
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm shadow-emerald-700/20 transition-all cursor-pointer"
          >
            <Camera size={16} />
            <span>Đăng ký khuôn mặt mới</span>
          </button>

          <button
            type="button"
            onClick={loadEmployees}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 rounded-xl text-xs sm:text-sm font-semibold border border-slate-200 dark:border-slate-700 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <RotateCw size={15} className={loading ? 'animate-spin text-blue-600 dark:text-blue-400' : ''} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        </div>
      </div>

      {/* Quick Summary Bento Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 flex items-center justify-center shrink-0">
            <Users size={20} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Tổng nhân sự
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100">
              {employees.length}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Đã có khuôn mặt
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400">
              {withFaceCount}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50 flex items-center justify-center shrink-0">
            <Camera size={20} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Chưa có khuôn mặt
            </span>
            <span className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-400">
              {withoutFaceCount}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 dark:bg-slate-800/90 rounded-2xl border border-slate-200/60 dark:border-slate-700 overflow-x-auto">
          {filterButtons.map(btn => {
            const active = faceFilter === btn.key
            return (
              <button
                key={btn.key}
                onClick={() => setFaceFilter(btn.key)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <span>{btn.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    active ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200' : 'bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {btn.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search Field */}
        <div className="relative flex-1 max-w-md flex items-center">
          <Search size={16} className="absolute left-3.5 text-slate-400 pointer-events-none z-10" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên, mã NV, phòng ban..."
            className="cv-input has-icon-left !pl-10 has-icon-right !pr-9 text-xs sm:text-sm font-medium"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 z-10 cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'table'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            title="Dạng bảng chi tiết"
          >
            <List size={16} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            title="Dạng lưới thẻ"
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {/* Bulk Delete Bar */}
      {selectedEmployeeIds.length > 0 && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-red-50 border border-red-200/80 text-xs sm:text-sm animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-red-800 font-semibold">
            <span>Đã chọn {selectedEmployeeIds.length} nhân viên</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedEmployeeIds([])}
              disabled={bulkDeleting}
              className="px-3 py-1.5 bg-white text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-bold border border-slate-200 transition-colors"
            >
              Bỏ chọn
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-60"
            >
              <Trash2 size={13} />
              <span>{bulkDeleting ? 'Đang xóa...' : 'Xóa đã chọn'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Employee Container with Internal Scroll */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="text-sm font-medium">Đang tải danh sách nhân sự...</span>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            <User size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">Không tìm thấy nhân viên phù hợp</p>
            <p className="text-xs text-slate-400 mt-1">
              Thử thay đổi từ khóa tìm kiếm hoặc bấm &quot;Đăng ký khuôn mặt mới&quot;
            </p>
          </div>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[calc(100vh-380px)] min-h-[340px] overflow-y-auto">
                {paginatedEmployees.map(employee => {
                  const badge = getManageStatusBadge(employee)
                  const isSelected = selectedEmployeeIds.includes(employee.id)

                  return (
                    <div
                      key={employee.id}
                      className={`relative p-4 rounded-2xl border transition-all hover:shadow-md ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/40'
                          : 'border-slate-200/80 bg-white hover:border-blue-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleEmployeeSelection(employee.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 cursor-pointer mt-1"
                        />
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${badge.tone}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {badge.label}
                        </span>
                      </div>

                      <div className="flex flex-col items-center text-center">
                        <button
                          type="button"
                          onClick={() => handleViewImage(employee)}
                          className="relative group focus:outline-none mb-2 cursor-pointer"
                        >
                          <SmartAvatar employee={employee} size={64} showRing={true} />
                          <span className="absolute inset-0 rounded-2xl bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Eye size={18} />
                          </span>
                        </button>
                        <h4 className="font-bold text-sm text-slate-800 truncate w-full">
                          {employee.name}
                        </h4>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">
                          {employee.employee_id}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {employee.department || 'Chưa có phòng ban'}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleRegisterFace(employee)}
                          className="flex-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Camera size={13} />
                          <span>Chụp mặt</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(employee.id, employee.name)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                          title="Xóa nhân sự"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Scrollable Table Area (Scroll nội bộ) */
              <div className="max-h-[calc(100vh-380px)] min-h-[340px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse min-w-[850px]">
                {/* Sticky Header */}
                <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-700 text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                  <tr>
                    <th className="py-3 px-4 w-10">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={e => toggleSelectAllOnPage(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4">Nhân sự</th>
                    <th className="py-3 px-4">Mã NV</th>
                    <th className="py-3 px-4">Phòng ban</th>
                    <th className="py-3 px-4 text-center">Trạng thái nhận diện</th>
                    <th className="py-3 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-slate-100">
                  {paginatedEmployees.map(employee => {
                    const isSelected = selectedEmployeeIds.includes(employee.id)
                    const badge = getManageStatusBadge(employee)
                    const hasFace = employee.has_face || employee.status_code === 'ready'

                    return (
                      <tr
                        key={employee.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isSelected ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleEmployeeSelection(employee.id)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 cursor-pointer"
                          />
                        </td>

                        {/* Employee Avatar & Name */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleViewImage(employee)}
                              className="relative group focus:outline-none"
                              title="Bấm để xem ảnh chi tiết"
                            >
                              <SmartAvatar employee={employee} size={42} showRing={true} />
                              <span className="absolute inset-0 rounded-2xl bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Eye size={14} />
                              </span>
                            </button>
                            <div>
                              <p className="font-bold text-slate-800 leading-snug">
                                {employee.name}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Cập nhật: {employee.created_at || 'Mới'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Employee ID */}
                        <td className="py-3 px-4">
                          <span className="inline-block font-mono text-xs font-bold px-2 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60">
                            {employee.employee_id}
                          </span>
                        </td>

                        {/* Department */}
                        <td className="py-3 px-4">
                          <span className="inline-block text-xs font-medium text-slate-600 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                            {employee.department || 'Chưa phân bổ'}
                          </span>
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${badge.tone}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                            {badge.label}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {/* Face Register / Retake Button */}
                            {!hasFace ? (
                              <button
                                type="button"
                                onClick={() => handleRegisterFace(employee)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all active:scale-95"
                                title="Đăng ký khuôn mặt qua camera"
                              >
                                <Camera size={13} />
                                <span>Đăng ký mặt</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRegisterFace(employee)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                                title="Chụp lại khuôn mặt"
                              >
                                <Camera size={13} />
                                <span>Chụp lại</span>
                              </button>
                            )}

                            {/* View Image Button */}
                            <button
                              type="button"
                              onClick={() => handleViewImage(employee)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                              title="Xem ảnh chi tiết"
                            >
                              <Eye size={13} />
                              <span className="hidden xl:inline">Xem ảnh</span>
                            </button>

                            {/* Delete Button */}
                            <button
                              type="button"
                              onClick={() => handleDelete(employee.id, employee.name)}
                              className="inline-flex items-center justify-center p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200/80 transition-colors"
                              title="Xóa nhân sự"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            )}

            {/* Pagination Controls (Sticky at bottom of table card) */}
            <div className="p-3 sm:px-5 sm:py-3.5 border-t border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              {/* Left: Row Count Info */}
              <div className="flex items-center gap-3 text-slate-500 font-medium">
                <span>
                  Hiển thị <strong className="text-slate-800">{filteredEmployees.length === 0 ? 0 : startIndex + 1}</strong> -{' '}
                  <strong className="text-slate-800">{endIndex}</strong> trên tổng số{' '}
                  <strong className="text-slate-800">{filteredEmployees.length}</strong> nhân sự
                </span>

                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                  <span>Số dòng:</span>
                  <select
                    value={pageSize}
                    onChange={e => setPageSize(Number(e.target.value))}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {/* Right: Page Navigation Buttons */}
              <div className="flex items-center gap-1">
                {/* First Page */}
                <button
                  type="button"
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                  title="Trang đầu"
                >
                  <ChevronsLeft size={14} />
                </button>

                {/* Previous Page */}
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                  title="Trang trước"
                >
                  <ChevronLeft size={14} />
                </button>

                {/* Page Number Buttons */}
                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .map((p, idx, arr) => (
                      <React.Fragment key={p}>
                        {idx > 0 && arr[idx - 1] !== p - 1 && (
                          <span className="px-1 text-slate-400 font-bold">...</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setPage(p)}
                          className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold transition-colors ${
                            page === p
                              ? 'bg-blue-700 text-white shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    ))}
                </div>

                {/* Next Page */}
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                  title="Trang sau"
                >
                  <ChevronRight size={14} />
                </button>

                {/* Last Page */}
                <button
                  type="button"
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                  title="Trang cuối"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {/* Confirm Single Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Xác nhận xóa nhân sự"
        message={`Bạn có chắc muốn xóa nhân viên "${deleteTarget?.name}" khỏi hệ thống? Dữ liệu khuôn mặt và quyền điểm danh của nhân sự này sẽ bị hủy.`}
        confirmText="Xóa nhân sự"
        variant="danger"
      />

      {/* Confirm Bulk Delete Dialog */}
      <ConfirmDialog
        isOpen={bulkDeleteDialogOpen}
        onClose={() => setBulkDeleteDialogOpen(false)}
        onConfirm={confirmBulkDelete}
        loading={bulkDeleting}
        title={`Xác nhận xóa ${selectedEmployees.length} nhân sự`}
        message={`Bạn có chắc chắn muốn xóa ${selectedEmployees.length} nhân viên đã chọn khỏi hệ thống? Hành động này không thể hoàn tác.`}
        confirmText="Xóa tất cả đã chọn"
        variant="danger"
      />
    </div>
  )
}
