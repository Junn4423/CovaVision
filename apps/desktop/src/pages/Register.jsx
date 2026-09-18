import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, getSessionToken } from '../services/api'
import { ROUTES } from '../config/routes'
import { useToast } from '../components/Toast'
import { Download, Eye, RotateCw, UserSquare } from 'lucide-react'
import SmartAvatar from '../components/SmartAvatar'
import { normalizeEmployeeImageUri, resolveEmployeeAvatar } from '../utils/avatarUtils'

const REGISTER_CACHE_VERSION = 2

function buildRegisterCacheKey() {
  const sessionToken = getSessionToken() || 'guest'
  return `register-page-cache:v${REGISTER_CACHE_VERSION}:${sessionToken}`
}

function sanitizeEmployeeForCache(employee) {
  if (!employee || typeof employee !== 'object') return null
  const cachedEmployee = { ...employee }
  delete cachedEmployee.image_base64
  return cachedEmployee
}

function getStatusText(employee) {
  return employee?.registered
    ? 'Đã có thông tin trong hệ thống chấm công'
    : 'Chưa có thông tin trong hệ thống chấm công'
}

function getPrimaryActionLabel(employee, { isInternalMode = false } = {}) {
  if (!employee?.registered) return 'Đăng ký khuôn mặt'
  return isInternalMode ? 'Cập nhật thông tin mới' : 'Cập nhật thông tin mới và đẩy lên ERP'
}

function hasErpTokenWithoutLocalImage(employee) {
  const erpToken = (employee?.erp_image_token || employee?.image_token || '').trim()
  const localReady = Boolean(employee?.has_local_image || employee?.local_image_token)
  return Boolean(erpToken) && !localReady
}

function StatusBadge({ employee }) {
  const registered = Boolean(employee?.registered)
  const tone = registered
    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    : 'bg-amber-50 text-amber-700 border border-amber-200'

  return (
    <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium ${tone}`}>
      {getStatusText(employee)}
    </span>
  )
}

function EmployeeListAvatar({ imageUrl, name, employee }) {
  return (
    <SmartAvatar
      employee={employee}
      src={imageUrl}
      name={name || employee?.name || employee?.employee_id}
      size={40}
      showRing={true}
    />
  )
}

export default function Register() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [authMode, setAuthMode] = useState('system')
  const [erpEmployees, setErpEmployees] = useState([])
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([])
  const [overwriteExisting, setOverwriteExisting] = useState(true)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [erpSyncLoading, setErpSyncLoading] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncMessage, setSyncMessage] = useState('Danh sách trống. Bấm "Đồng bộ data từ ERP" để bắt đầu.')
  const [lastSyncedAt, setLastSyncedAt] = useState('')
  const [hasSyncedOnce, setHasSyncedOnce] = useState(false)
  // Internal registration form state
  const [internalRegForm, setInternalRegForm] = useState({ employee_id: '', name: '', department: '', position: '' })
  const [internalRegImage, setInternalRegImage] = useState(null)
  const [internalRegImagePreview, setInternalRegImagePreview] = useState(null)
  const [internalRegLoading, setInternalRegLoading] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const lastFetchedId = useRef('')
  const selectionRequestSeq = useRef(0)
  const registerCacheKeyRef = useRef(buildRegisterCacheKey())
  const restoredCacheRef = useRef(false)

  const preselectedEmployeeId = (searchParams.get('employee_id') || '').trim()

  const filteredErpEmployees = useMemo(() => {
    const keyword = employeeSearch.trim().toLowerCase()
    if (!keyword) return erpEmployees

    return erpEmployees.filter(employee =>
      employee.employee_id.toLowerCase().includes(keyword)
      || (employee.name || '').toLowerCase().includes(keyword)
      || (employee.department || '').toLowerCase().includes(keyword)
    )
  }, [employeeSearch, erpEmployees])

  const filteredEmployeeIds = useMemo(
    () => filteredErpEmployees.map(employee => employee.employee_id),
    [filteredErpEmployees],
  )

  const selectedCount = selectedEmployeeIds.length
  const allFilteredSelected = useMemo(
    () => filteredEmployeeIds.length > 0 && filteredEmployeeIds.every(id => selectedEmployeeIds.includes(id)),
    [filteredEmployeeIds, selectedEmployeeIds],
  )

  useEffect(() => {
    setPage(1)
  }, [employeeSearch, pageSize])

  const paginatedErpEmployees = useMemo(() => {
    const startIndex = (page - 1) * pageSize
    return filteredErpEmployees.slice(startIndex, startIndex + pageSize)
  }, [filteredErpEmployees, page, pageSize])

  const totalPages = Math.max(1, Math.ceil(filteredErpEmployees.length / pageSize))
  const isInternalMode = authMode === 'internal'
  const previewImage = imagePreview
    || selectedEmployee?.erp_image_url
    || selectedEmployee?.image_url
    || selectedEmployee?.image_base64
    || null
  const previewFallbackImage = !imagePreview ? (selectedEmployee?.image_base64 || null) : null
  const hasErpFaceSource = Boolean(
    selectedEmployee?.has_erp_image
    || selectedEmployee?.erp_image_url
    || selectedEmployee?.erp_image_token
    || selectedEmployee?.image_base64
  )
  const needsErpImageSync = Boolean(
    selectedEmployee?.needs_erp_image_sync
    || (selectedEmployee?.local_image_token && !selectedEmployee?.erp_image_token)
  )
  const hasReadyFaceSource = Boolean(
    imageFile
    || hasErpFaceSource
    || (!selectedEmployee?.registered && (selectedEmployee?.erp_image_url || selectedEmployee?.image_url))
  )
  const canSubmitSelectedEmployee = Boolean(
    selectedEmployee
    && (!selectedEmployee.registered || selectedEmployee.user_id)
    && (
      imageFile
      || (!selectedEmployee.registered ? hasReadyFaceSource : hasErpFaceSource)
    )
  )

  const formatSyncDateTime = useCallback((isoText) => {
    if (!isoText) return 'Chưa đồng bộ'
    try {
      const date = new Date(isoText)
      return date.toLocaleString('vi-VN', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return 'Chưa đồng bộ'
    }
  }, [])

  const fetchEmployeeDetail = useCallback(async employeeId => {
    const res = await api.getErpEmployeeInfo(employeeId)
    if (!res.success) {
      throw new Error(res.message || 'Không tải được thông tin nhân viên')
    }
    return res.employee
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadAuthMode() {
      try {
        const res = await api.sessionStatus()
        const mode = (res?.auth_mode || res?.user?.auth_mode || 'system').toLowerCase()
        if (mounted) {
          setAuthMode(mode === 'internal' ? 'internal' : 'system')
        }
      } catch {
        if (mounted) {
          setAuthMode('system')
        }
      }
    }

    loadAuthMode()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (restoredCacheRef.current) return
    restoredCacheRef.current = true

    try {
      const rawCache = sessionStorage.getItem(registerCacheKeyRef.current)
      if (!rawCache) return

      const parsedCache = JSON.parse(rawCache)
      if (parsedCache?.version !== REGISTER_CACHE_VERSION) return

      setErpEmployees(Array.isArray(parsedCache.erpEmployees) ? parsedCache.erpEmployees : [])
      setSelectedEmployeeIds(Array.isArray(parsedCache.selectedEmployeeIds) ? parsedCache.selectedEmployeeIds : [])
      setOverwriteExisting(typeof parsedCache.overwriteExisting === 'boolean' ? parsedCache.overwriteExisting : true)
      setEmployeeSearch(typeof parsedCache.employeeSearch === 'string' ? parsedCache.employeeSearch : '')
      setSyncProgress(Number.isFinite(parsedCache.syncProgress) ? parsedCache.syncProgress : 0)
      setSyncMessage(typeof parsedCache.syncMessage === 'string' ? parsedCache.syncMessage : syncMessage)
      setLastSyncedAt(typeof parsedCache.lastSyncedAt === 'string' ? parsedCache.lastSyncedAt : '')
      setHasSyncedOnce(Boolean(parsedCache.hasSyncedOnce))
      setPage(Number.isFinite(parsedCache.page) && parsedCache.page > 0 ? parsedCache.page : 1)
      setPageSize(Number.isFinite(parsedCache.pageSize) && parsedCache.pageSize > 0 ? parsedCache.pageSize : 10)

      const cachedEmployeeId = typeof parsedCache.selectedEmployeeId === 'string' ? parsedCache.selectedEmployeeId : ''
      const cachedEmployee = sanitizeEmployeeForCache(parsedCache.selectedEmployee)
      if (cachedEmployeeId) {
        setSelectedEmployeeId(cachedEmployeeId)
        lastFetchedId.current = cachedEmployeeId
      }
      if (cachedEmployee) {
        setSelectedEmployee(cachedEmployee)
      }
    } catch {
      sessionStorage.removeItem(registerCacheKeyRef.current)
    }
  }, [syncMessage])

  useEffect(() => {
    if (!restoredCacheRef.current) return

    const shouldClearCache = (
      !hasSyncedOnce
      && erpEmployees.length === 0
      && selectedEmployeeIds.length === 0
      && !selectedEmployeeId
      && !selectedEmployee
      && !employeeSearch
      && !lastSyncedAt
    )

    if (shouldClearCache) {
      sessionStorage.removeItem(registerCacheKeyRef.current)
      return
    }

    const cachePayload = {
      version: REGISTER_CACHE_VERSION,
      erpEmployees,
      selectedEmployeeIds,
      overwriteExisting,
      employeeSearch,
      selectedEmployeeId,
      selectedEmployee: sanitizeEmployeeForCache(selectedEmployee),
      syncProgress,
      syncMessage,
      lastSyncedAt,
      hasSyncedOnce,
      page,
      pageSize,
    }
    sessionStorage.setItem(registerCacheKeyRef.current, JSON.stringify(cachePayload))
  }, [
    employeeSearch,
    erpEmployees,
    hasSyncedOnce,
    lastSyncedAt,
    overwriteExisting,
    page,
    pageSize,
    selectedEmployee,
    selectedEmployeeId,
    selectedEmployeeIds,
    syncMessage,
    syncProgress,
  ])

  const handleSelectEmployee = useCallback(async (employeeId, options = {}) => {
    const { force = false, keepUpload = false } = options
    if (!employeeId) return
    if (!force && lastFetchedId.current === employeeId && selectedEmployeeId === employeeId) return

    const requestSeq = ++selectionRequestSeq.current
    lastFetchedId.current = employeeId
    setSelectedEmployeeId(employeeId)
    setDetailLoading(true)

    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      if (params.get('employee_id') !== employeeId) {
        params.set('employee_id', employeeId)
        return params
      }
      return prev
    }, { replace: true })

    if (!keepUpload) {
      setImageFile(null)
      setImagePreview(null)
    }

    try {
      const employee = await fetchEmployeeDetail(employeeId)
      if (requestSeq !== selectionRequestSeq.current) return

      setSelectedEmployee(employee)
    } catch (error) {
      if (requestSeq !== selectionRequestSeq.current) return
      setSelectedEmployee(null)
      toast.error(error.message || 'Không tải được thông tin nhân viên')
    }

    if (requestSeq === selectionRequestSeq.current) {
      setDetailLoading(false)
    }
  }, [fetchEmployeeDetail, searchParams, selectedEmployeeId, setSearchParams, toast])

  const loadErpEmployees = useCallback(async (focusEmployeeId = '', options = {}) => {
    if (isInternalMode) {
      setSyncProgress(0)
      setSyncMessage('Đang ở chế độ nội bộ. Vui lòng đăng nhập hệ thống để đồng bộ dữ liệu ERP.')
      toast.error('Đang ở chế độ nội bộ')
      return
    }

    const { keepCurrentSelection = false } = options
    setListLoading(true)
    setSyncProgress(8)
    setSyncMessage('Đang kết nối dữ liệu ERP...')

    let progressTimer = null
    progressTimer = setInterval(() => {
      setSyncProgress(current => (current < 90 ? current + 5 : current))
    }, 120)

    try {
      const res = await api.getErpEmployees()
      if (res.success) {
        const employees = res.employees || []
        setErpEmployees(employees)
        setSelectedEmployeeIds(prev => prev.filter(id => employees.some(emp => emp.employee_id === id)))
        setHasSyncedOnce(true)

        const syncedAt = new Date().toISOString()
        setLastSyncedAt(syncedAt)
        setSyncProgress(100)
        setSyncMessage(`Kết nối dữ liệu thành công, đã đồng bộ ${employees.length} nhân viên từ hệ thống.`)

        const nextEmployeeId = focusEmployeeId || selectedEmployeeId
        if (nextEmployeeId) {
          const exists = employees.some(employee => employee.employee_id === nextEmployeeId)
          if (exists) {
            await handleSelectEmployee(nextEmployeeId, {
              force: true,
              keepUpload: keepCurrentSelection && nextEmployeeId === selectedEmployeeId,
            })
          } else if (selectedEmployeeId === nextEmployeeId) {
            setSelectedEmployee(null)
            setSelectedEmployeeId('')
          }
        }
      } else {
        setSyncProgress(0)
        setSyncMessage('Không thể đồng bộ dữ liệu từ ERP.')
        toast.error(res.message || 'Không tải được danh sách ERP')
      }
    } catch {
      setSyncProgress(0)
      setSyncMessage('Không thể đồng bộ dữ liệu từ ERP.')
      toast.error('Không thể tải danh sách ERP')
    } finally {
      if (progressTimer) clearInterval(progressTimer)
      setListLoading(false)
    }
  }, [handleSelectEmployee, isInternalMode, selectedEmployeeId, toast])

  const handleActionClick = useCallback((employeeId, e) => {
    if (e) e.stopPropagation()
    if (selectedEmployeeId === employeeId) {
      handleSelectEmployee(employeeId, { force: true })
    } else {
      setSearchParams(prev => {
        const params = new URLSearchParams(prev)
        params.set('employee_id', employeeId)
        return params
      }, { replace: true })
    }
  }, [selectedEmployeeId, handleSelectEmployee, setSearchParams])

  useEffect(() => {
    if (!preselectedEmployeeId || erpEmployees.length === 0) return
    if (selectedEmployeeId === preselectedEmployeeId) return
    if (lastFetchedId.current === preselectedEmployeeId) return

    const employee = erpEmployees.find(item => item.employee_id === preselectedEmployeeId)
    if (employee) {
      handleSelectEmployee(employee.employee_id)
    }
  }, [erpEmployees, handleSelectEmployee, preselectedEmployeeId, selectedEmployeeId])

  const toggleEmployeeSelection = useCallback((employeeId, checked) => {
    setSelectedEmployeeIds(prev => {
      const exists = prev.includes(employeeId)
      if (checked && !exists) return [...prev, employeeId]
      if (!checked && exists) return prev.filter(id => id !== employeeId)
      return prev
    })
  }, [])

  const toggleSelectAllFiltered = useCallback((checked) => {
    setSelectedEmployeeIds(prev => {
      if (checked) {
        return Array.from(new Set([...prev, ...filteredEmployeeIds]))
      }
      const filteredSet = new Set(filteredEmployeeIds)
      return prev.filter(id => !filteredSet.has(id))
    })
  }, [filteredEmployeeIds])

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    setImageFile(file || null)

    if (!file) {
      setImagePreview(null)
      return
    }

    const reader = new FileReader()
    reader.onload = loadEvent => setImagePreview(loadEvent.target?.result || null)
    reader.readAsDataURL(file)
  }

  async function handleSubmitEmployee(event) {
    event.preventDefault()

    const actionLabel = getPrimaryActionLabel(selectedEmployee, { isInternalMode })

    if (!selectedEmployee) {
      toast.error('Vui lòng chọn nhân viên ERP trước khi thao tác')
      return
    }

    if (!imageFile && !hasReadyFaceSource) {
      toast.error('Nhân viên chưa có ảnh ERP hợp lệ. Vui lòng tải ảnh khuôn mặt lần trước khi tiếp tục')
      return
    }

    setSubmitLoading(true)

    try {
      let res
      let shouldPushErpToken = false

      if (selectedEmployee.registered) {
        if (!selectedEmployee.user_id) {
          toast.error('Không tìm thấy bản ghi của nhân viên trong hệ thống chấm công')
          setSubmitLoading(false)
          return
        }

        if (imageFile) {
          const payload = new FormData()
          payload.append('user_id', selectedEmployee.user_id)
          payload.append('image', imageFile)
          payload.append('replace_all', 'true')
          res = await api.updateFace(payload)
          shouldPushErpToken = true
        } else {
          res = await api.reloadFromErp(selectedEmployee.employee_id)
          shouldPushErpToken = true
        }
      } else if (imageFile) {
        const payload = new FormData()
        payload.append('employee_id', selectedEmployee.employee_id)
        payload.append('name', selectedEmployee.name || '')
        payload.append('department', selectedEmployee.department || '')
        payload.append('image', imageFile)
        res = await api.register(payload)
        shouldPushErpToken = true
      } else {
        if (isInternalMode) {
          toast.error('Đang ở chế độ nội bộ')
          setSubmitLoading(false)
          return
        }
        res = await api.registerFromErp(selectedEmployee.employee_id)
        shouldPushErpToken = true
      }

      if (res?.success) {
        let pushRes = null
        if (shouldPushErpToken && !isInternalMode) {
          try {
            pushRes = await api.pushToErp(selectedEmployee.employee_id)
          } catch {
            pushRes = { success: false, message: 'Không thể đẩy token ảnh lên ERP' }
          }
        }

        if (pushRes && !pushRes.success) {
          toast.error(pushRes.message || 'Không thể đẩy token ảnh lên ERP')
          toast.success((res.message || `${actionLabel} thành công`) + '. Dữ liệu cục bộ đã cập nhật.')
        } else {
          toast.success(res.message || `${actionLabel} thành công`)
        }

        setImageFile(null)
        setImagePreview(null)
        lastFetchedId.current = ''
        await loadErpEmployees(selectedEmployee.employee_id, { keepCurrentSelection: true })
      } else {
        toast.error(res?.message || `${actionLabel} thất bại`)
      }
    } catch {
      toast.error(
        selectedEmployee.registered
          ? 'Không thể cập nhật thông tin nhân viên'
          : 'Không thể đăng ký khuôn mặt cho nhân viên'
      )
    }

    setSubmitLoading(false)
  }

  async function handleSyncImageToErp() {
    if (!selectedEmployee?.employee_id) return

    if (isInternalMode) {
      toast.error('Đang ở chế độ nội bộ')
      return
    }

    if (!selectedEmployee.local_image_token && !selectedEmployee.has_local_image) {
      toast.error('Không tìm thấy ảnh local để cập nhật ERP')
      return
    }

    if (!window.confirm(`Cập nhật ảnh local của ${selectedEmployee.employee_id} lên ERP?`)) {
      return
    }

    setErpSyncLoading(true)
    try {
      const res = await api.pushToErp(selectedEmployee.employee_id)
      if (res?.success) {
        toast.success(res.message || 'Đã cập nhật ảnh lên ERP')
        await loadErpEmployees(selectedEmployee.employee_id, { keepCurrentSelection: true })
      } else {
        toast.error(res?.message || 'Không thể cập nhật ảnh lên ERP')
      }
    } catch {
      toast.error('Không thể cập nhật ảnh lên ERP')
    }
    setErpSyncLoading(false)
  }

  async function pushAllToAttendanceSystem() {
    if (isInternalMode) {
      toast.error('Đang ở chế độ nội bộ')
      return
    }

    if (!selectedEmployeeIds.length) {
      toast.error('Vui lòng chọn ít nhất 1 nhân viên để đẩy dữ liệu.')
      return
    }

    const confirmMessage = overwriteExisting
      ? `Đẩy ${selectedEmployeeIds.length} nhân viên đã chọn và overwrite dữ liệu đã có?`
      : `Đẩy ${selectedEmployeeIds.length} nhân viên đã chọn (nhân viên đã có sẽ bị bỏ qua)?`

    if (!window.confirm(confirmMessage)) {
      return
    }

    setPushLoading(true)
    try {
      const res = await api.importAllFromErp({
        employee_ids: selectedEmployeeIds,
        overwrite_existing: overwriteExisting,
      })

      if (res.success) {
        const {
          imported,
          updated,
          skipped,
          errors,
          total,
          without_face,
          overwrite_existing,
          account_sync,
        } = res.result || {}

        let accountSyncText = ''
        if (account_sync && typeof account_sync === 'object') {
          if (account_sync.error) {
            accountSyncText = ` Đồng bộ tài khoản: lỗi (${account_sync.error}).`
          } else {
            accountSyncText = (
              ` Đồng bộ tài khoản: tạo mới ${account_sync.created || 0}, `
              + `cập nhật ${account_sync.updated || 0}, `
              + `đổi hash ${account_sync.password_updated || 0}.`
            )
          }
        }

        toast.success(
          `Đã xử lý ${total} nhân viên đã chọn. Thêm mới: ${imported || 0}, cập nhật: ${updated || 0}, bỏ qua: ${skipped || 0}, chưa có khuôn mặt: ${without_face || 0}, lỗi: ${errors || 0}.${overwrite_existing ? ' Dữ liệu cũ đã được overwrite theo lựa chọn.' : ''}${accountSyncText}`
        )
        await loadErpEmployees(selectedEmployeeId, { keepCurrentSelection: true })
      } else {
        toast.error(res.message || 'Không thể đẩy dữ liệu vào hệ thống chấm công')
      }
    } catch {
      toast.error('Không thể đẩy dữ liệu vào hệ thống chấm công')
    }
    setPushLoading(false)
  }

  function handleInternalRegImageChange(event) {
    const file = event.target.files?.[0] || null
    setInternalRegImage(file)
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setInternalRegImagePreview(reader.result)
      reader.readAsDataURL(file)
    } else {
      setInternalRegImagePreview(null)
    }
  }

  async function handleInternalRegSubmit(event) {
    event.preventDefault()
    const { employee_id, name } = internalRegForm
    if (!employee_id.trim() || !name.trim()) {
      toast.error('Vui lòng nhập mã nhân viên và tên.')
      return
    }
    if (!internalRegImage) {
      toast.error('Vui lòng chọn ảnh khuôn mặt.')
      return
    }
    setInternalRegLoading(true)
    try {
      const imageBase64 = internalRegImagePreview || await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result || '')
        reader.onerror = reject
        reader.readAsDataURL(internalRegImage)
      })
      const res = await api.registerBase64({
        employee_id: employee_id.trim(),
        name: name.trim(),
        department: (internalRegForm.department || '').trim(),
        position: (internalRegForm.position || '').trim(),
        image_base64: imageBase64,
      })
      if (res?.success) {
        toast.success(res.message || 'Đăng ký nhân viên nội bộ thành công!')
        setInternalRegForm({ employee_id: '', name: '', department: '', position: '' })
        setInternalRegImage(null)
        setInternalRegImagePreview(null)
      } else {
        toast.error(res?.message || 'Đăng ký thất bại.')
      }
    } catch {
      toast.error('Không thể đăng ký nhân viên nội bộ.')
    }
    setInternalRegLoading(false)
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Tải dữ liệu từ ERP</h1>
          <p className="text-sm text-slate-500">
            Tải danh sách nhân viên từ ERP về hệ thống máy để quản lý và đăng ký khuôn mặt.
          </p>
          {isInternalMode && (
            <p className="text-sm text-amber-700">
              Đang ở chế độ nội bộ. Các thao tác ERP đang bị khóa. Có thể đăng ký nhân viên nội bộ bên dưới.
            </p>
          )}
        </div>

        <div className="w-full lg:w-auto flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => loadErpEmployees(selectedEmployeeId, { keepCurrentSelection: true })}
            disabled={listLoading || isInternalMode}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-100 border border-slate-200 disabled:opacity-50 transition-colors"
          >
            <RotateCw size={16} className={listLoading ? 'animate-spin' : ''} />
            {listLoading ? 'Đang tải dữ liệu...' : 'Tải dữ liệu từ ERP'}
          </button>

          <button
            onClick={() => navigate(`${ROUTES.syncVerify}?run=1`)}
            disabled={isInternalMode}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Eye size={16} />
            Đối soát & Đồng bộ ERP
          </button>

          <button
            onClick={pushAllToAttendanceSystem}
            disabled={pushLoading || selectedCount === 0 || isInternalMode}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Download size={16} />
            {pushLoading ? 'Đang đẩy dữ liệu...' : 'Đẩy dữ liệu vào hệ thống chấm công'}
          </button>
        </div>

        <div className="w-full flex items-center gap-4 flex-wrap text-sm">
          <label className="inline-flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={overwriteExisting}
              onChange={event => setOverwriteExisting(event.target.checked)}
              disabled={pushLoading}
            />
            Overwrite dữ liệu đã có khi đẩy
          </label>
          <span className="text-slate-500">
            Đã chọn {selectedCount} nhân viên
          </span>
          <span className="text-slate-500">
            Đồng bộ lần cuối: {formatSyncDateTime(lastSyncedAt)}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-emerald-200/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-emerald-100 bg-emerald-50/40">
            <h2 className="text-base font-semibold text-emerald-800">Đăng ký nhân viên nội bộ</h2>
            <p className="text-xs text-emerald-600 mt-0.5">Đăng ký thủ công khi không có kết nối ERP.</p>
          </div>
          <form onSubmit={handleInternalRegSubmit} className="p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mã nhân viên *</label>
                <input
                  type="text"
                  value={internalRegForm.employee_id}
                  onChange={event => setInternalRegForm(prev => ({ ...prev, employee_id: event.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  placeholder="VD: NV001"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tên nhân viên *</label>
                <input
                  type="text"
                  value={internalRegForm.name}
                  onChange={event => setInternalRegForm(prev => ({ ...prev, name: event.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  placeholder="VD: Nguyễn Văn A"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Phòng ban</label>
                <input
                  type="text"
                  value={internalRegForm.department}
                  onChange={event => setInternalRegForm(prev => ({ ...prev, department: event.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  placeholder="VD: Kỹ thuật"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Chức vụ</label>
                <input
                  type="text"
                  value={internalRegForm.position}
                  onChange={event => setInternalRegForm(prev => ({ ...prev, position: event.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  placeholder="VD: Nhân viên"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ảnh khuôn mặt *</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleInternalRegImageChange}
                className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
              />
              {internalRegImagePreview && (
                <div className="mt-3 flex items-center gap-3">
                  <img src={internalRegImagePreview} alt="Preview" className="h-24 w-24 object-cover rounded-xl border border-slate-200" />
                  <button type="button" onClick={() => { setInternalRegImage(null); setInternalRegImagePreview(null) }} className="text-xs text-red-500 hover:text-red-700">Xóa ảnh</button>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={internalRegLoading}
              className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {internalRegLoading ? 'Đang đăng ký...' : 'Đăng ký nhân viên nội bộ'}
            </button>
          </form>
      </div>

      <div className="grid xl:grid-cols-[1.15fr_0.85fr] gap-4 lg:gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-base font-semibold text-slate-800">Danh sách nhân viên ERP</h2>
              <button
                onClick={() => loadErpEmployees(selectedEmployeeId, { keepCurrentSelection: true })}
                disabled={listLoading || isInternalMode}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 disabled:opacity-50 transition-colors"
              >
                <RotateCw size={14} className={listLoading ? 'animate-spin' : ''} />
                Làm mới
              </button>
            </div>

            <input
              type="text"
              value={employeeSearch}
              onChange={event => setEmployeeSearch(event.target.value)}
              placeholder="Tìm theo mã, tên hoặc phòng ban"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
            />
            <p className="text-xs text-slate-400">
              Dùng nút Xem để nạp thông tin nhân viên vào khung bên phải và kiểm tra ảnh ERP trước khi đăng ký/cập nhật.
            </p>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-xs text-slate-600">{syncMessage}</p>
              <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-2 bg-primary-500 transition-all duration-200"
                  style={{ width: `${Math.max(0, Math.min(100, syncProgress))}%` }}
                />
              </div>
            </div>
          </div>

          <div className="hidden lg:block overflow-x-auto max-h-[calc(100vh-360px)] overflow-y-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-xs border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-center font-medium text-slate-500 text-xs uppercase tracking-wider">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={allFilteredSelected}
                      onChange={event => toggleSelectAllFiltered(event.target.checked)}
                      disabled={filteredEmployeeIds.length === 0 || listLoading}
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs uppercase tracking-wider">Ảnh</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs uppercase tracking-wider">Mã NV</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs uppercase tracking-wider">Tên</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs uppercase tracking-wider">Phòng ban</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-500 text-xs uppercase tracking-wider">Trạng thái</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 text-xs uppercase tracking-wider">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedErpEmployees.map(employee => {
                  const erpTokenOnly = hasErpTokenWithoutLocalImage(employee)
                  return (
                  <tr
                    key={employee.employee_id}
                    className={`transition-colors ${
                      selectedEmployeeId === employee.employee_id ? 'bg-primary-50/60' : 'hover:bg-slate-50'
                    } ${erpTokenOnly ? 'erp-token-only-row' : ''}`}
                    onClick={(e) => handleActionClick(employee.employee_id, e)}
                  >
                    <td className="px-4 py-3 text-center" onClick={event => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={selectedEmployeeIds.includes(employee.employee_id)}
                        onChange={event => toggleEmployeeSelection(employee.employee_id, event.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <EmployeeListAvatar
                        imageUrl={employee.image_url}
                        name={employee.name || employee.employee_id}
                        employee={employee}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{employee.employee_id}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{employee.name || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{employee.department || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge employee={employee} />
                      {erpTokenOnly && (
                        <p className="text-[11px] text-amber-700 mt-1">ERP có ảnh, local chưa sync</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end flex-wrap">
                        <button
                          type="button"
                          onClick={event => handleActionClick(employee.employee_id, event)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
                        >
                          <Eye size={14} />
                          Xem
                        </button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden divide-y divide-slate-100 max-h-[calc(100vh-360px)] overflow-y-auto">
            {paginatedErpEmployees.map(employee => {
              const erpTokenOnly = hasErpTokenWithoutLocalImage(employee)
              return (
              <div
                key={employee.employee_id}
                className={`p-3 sm:p-4 transition-colors ${selectedEmployeeId === employee.employee_id ? 'bg-primary-50/70' : ''} ${erpTokenOnly ? 'erp-token-only-row' : ''}`}
                onClick={(e) => handleActionClick(employee.employee_id, e)}
              >
                <div className="flex items-start gap-3">
                  <div className="pt-0.5" onClick={event => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={selectedEmployeeIds.includes(employee.employee_id)}
                      onChange={event => toggleEmployeeSelection(employee.employee_id, event.target.checked)}
                    />
                  </div>
                  <EmployeeListAvatar
                    imageUrl={employee.image_url}
                    name={employee.name || employee.employee_id}
                    employee={employee}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-semibold text-slate-800 truncate">{employee.name || '-'}</p>
                    <p className="text-xs text-slate-500 font-mono">{employee.employee_id}</p>
                    <p className="text-xs text-slate-500 truncate">{employee.department || '-'}</p>
                    <StatusBadge employee={employee} />
                    {erpTokenOnly && (
                      <p className="text-[11px] text-amber-700">ERP có ảnh, local chưa sync</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={event => handleActionClick(employee.employee_id, event)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
                  >
                    <Eye size={14} />
                    Xem
                  </button>
                </div>
              </div>
            )})}
          </div>

          <div>
            {listLoading && (
              <div className="px-5 py-10 text-center text-slate-400 text-sm">Đang tải danh sách ERP...</div>
            )}

            {!listLoading && filteredErpEmployees.length > 0 && (
              <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Hiển thị</span>
                  <select
                    value={pageSize}
                    onChange={event => setPageSize(Number(event.target.value))}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-sm text-slate-500">trên tổng {filteredErpEmployees.length}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(current => Math.max(1, current - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Trước
                  </button>
                  <span className="text-sm text-slate-500">
                    Trang {page}/{totalPages}
                  </span>
                  <button
                    onClick={() => setPage(current => Math.min(totalPages, current + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}

            {!listLoading && filteredErpEmployees.length === 0 && (
              <div className="px-5 py-10 text-center text-slate-400 text-sm">
                {hasSyncedOnce
                  ? 'Không có nhân viên ERP phù hợp'
                  : 'Trang đang trống. Bấm "Đồng bộ data từ ERP" để tải danh sách nhân viên.'}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-4 sm:p-6">
          {!selectedEmployee ? (
            <div className="h-full min-h-[360px] flex items-center justify-center text-center text-slate-400">
              <div>
                <div className="flex justify-center mb-3 opacity-30"><UserSquare size={48} /></div>
                <p className="text-sm">Chọn một nhân viên ERP để đăng ký hoặc cập nhật thông tin khuôn mặt</p>
              </div>
            </div>
          ) : (
            <form key={selectedEmployeeId} onSubmit={handleSubmitEmployee} className="space-y-5">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <SmartAvatar
                  employee={selectedEmployee}
                  src={imagePreview || previewImage || previewFallbackImage}
                  name={selectedEmployee.name}
                  size={96}
                  showRing={true}
                  className="w-24 h-24 rounded-2xl shadow-sm shrink-0"
                />

                <div className="space-y-1.5 flex-1 min-w-0">
                  <p className="text-xl font-bold text-slate-800 truncate">{selectedEmployee.name}</p>
                  <p className="text-sm text-slate-500">Mã NV: <span className="font-mono">{selectedEmployee.employee_id}</span></p>
                  <p className="text-sm text-slate-500">Phòng ban: {selectedEmployee.department || '-'}</p>
                  <p className="text-sm text-slate-500">Email: {selectedEmployee.email || '-'}</p>
                  <p className="text-sm text-slate-500">SĐT: {selectedEmployee.phone || '-'}</p>
                  <StatusBadge employee={selectedEmployee} />
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-700 space-y-2">
                <p>
                  {selectedEmployee.registered
                    ? 'Nhân viên này đã có bản ghi trong hệ thống chấm công. Bạn có thể tải ảnh mới lên, hoặc dùng ngay ảnh hiện có từ ERP để cập nhật lại dữ liệu khuôn mặt.'
                    : 'Nhân viên này chưa có bản ghi trong hệ thống chấm công. Bạn có thể đăng ký trực tiếp bằng ảnh từ ERP, hoặc tải ảnh khuôn mặt mới lên trước khi đăng ký.'}
                </p>
                <p className="text-blue-600">
                  {hasErpFaceSource
                    ? 'ERP hiện đã có ảnh khuôn mặt cho nhân viên này.'
                    : 'ERP chưa có ảnh khuôn mặt. Muốn thao tác thành công, bạn cần tải ảnh mới lên.'}
                </p>
              </div>

              {needsErpImageSync && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-2">
                  <p>Phát hiện hệ thống chấm công có ảnh của nhân viên nhưng hệ thống ERP chưa có, bạn có muốn cập nhật cho ERP?</p>
                  <button
                    type="button"
                    onClick={handleSyncImageToErp}
                    disabled={erpSyncLoading || submitLoading || detailLoading || isInternalMode}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {erpSyncLoading ? 'Đang cập nhật ERP...' : 'Cập nhật cho ERP'}
                  </button>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tải ảnh khuôn mặt mới</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-primary-50 file:text-primary-700 file:font-medium file:cursor-pointer hover:file:bg-primary-100"
                />
              </div>

              {!hasReadyFaceSource && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Chưa có nguồn ảnh khuôn mặt khả dụng. Hãy tải ảnh mới lên trước khi tiếp tục.
                </div>
              )}

              <button
                type="submit"
                disabled={submitLoading || detailLoading || !canSubmitSelectedEmployee}
                className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm text-sm"
              >
                {submitLoading ? 'Đang xử lý...' : `${getPrimaryActionLabel(selectedEmployee, { isInternalMode })} cho ${selectedEmployee.employee_id}`}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

