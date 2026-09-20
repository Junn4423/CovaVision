import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Briefcase,
  Building2,
  CheckCircle2,
  Edit2,
  FolderTree,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import { api } from '../services/api'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  StatCard,
  Tabs,
} from '../components/ui'

export default function Departments() {
  const [activeTab, setActiveTab] = useState('departments')
  const [departments, setDepartments] = useState([])
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Form Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create') // 'create' | 'edit'
  const [formData, setFormData] = useState({ id: '', name: '', code: '', description: '', is_active: true })
  const [saving, setSaving] = useState(false)

  // Confirm Delete State
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Notification State
  const [notification, setNotification] = useState(null)

  function showNotification(type, message) {
    setNotification({ type, message })
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev))
    }, 4000)
  }

  async function loadData() {
    try {
      setLoading(true)
      const [deptRes, posRes] = await Promise.allSettled([
        api.listDepartments(),
        api.listPositions(),
      ])

      if (deptRes.status === 'fulfilled' && deptRes.value?.success) {
        setDepartments(deptRes.value.departments || [])
      }
      if (posRes.status === 'fulfilled' && posRes.value?.success) {
        setPositions(posRes.value.positions || [])
      }
    } catch (err) {
      showNotification('error', err?.message || 'Không thể tải dữ liệu phòng ban & chức vụ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Filtered lists
  const filteredDepartments = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return departments
    return departments.filter(
      (d) =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.code || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
    )
  }, [departments, search])

  const filteredPositions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return positions
    return positions.filter(
      (p) =>
        (p.name || p.title || '').toLowerCase().includes(q) ||
        (p.code || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
    )
  }, [positions, search])

  // Stats calculation
  const totalEmployeesInDepts = useMemo(() => {
    return departments.reduce((acc, cur) => acc + (cur.employee_count || 0), 0)
  }, [departments])

  const totalEmployeesInPositions = useMemo(() => {
    return positions.reduce((acc, cur) => acc + (cur.employee_count || 0), 0)
  }, [positions])

  function handleOpenCreate() {
    setModalMode('create')
    setFormData({ id: '', name: '', code: '', description: '', is_active: true })
    setModalOpen(true)
  }

  function handleOpenEdit(item) {
    setModalMode('edit')
    setFormData({
      id: item.id || '',
      name: item.name || item.title || '',
      code: item.code || '',
      description: item.description || '',
      is_active: item.is_active !== false,
    })
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!formData.name.trim()) {
      showNotification('error', 'Vui lòng nhập tên!')
      return
    }

    try {
      setSaving(true)
      if (activeTab === 'departments') {
        const res = await api.saveDepartment({
          id: formData.id || undefined,
          name: formData.name.trim(),
          code: formData.code.trim() || undefined,
          description: formData.description.trim(),
          is_active: formData.is_active,
        })
        if (res?.success) {
          showNotification('success', modalMode === 'create' ? 'Tạo phòng ban thành công' : 'Cập nhật phòng ban thành công')
          setModalOpen(false)
          await loadData()
        }
      } else {
        const res = await api.savePosition({
          id: formData.id || undefined,
          name: formData.name.trim(),
          code: formData.code.trim() || undefined,
          description: formData.description.trim(),
          is_active: formData.is_active,
        })
        if (res?.success) {
          showNotification('success', modalMode === 'create' ? 'Tạo chức vụ thành công' : 'Cập nhật chức vụ thành công')
          setModalOpen(false)
          await loadData()
        }
      }
    } catch (err) {
      showNotification('error', err?.message || 'Có lỗi xảy ra khi lưu')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      if (deleteTarget.type === 'department') {
        await api.deleteDepartment(deleteTarget.item.id)
        showNotification('success', `Đã xóa phòng ban "${deleteTarget.item.name}"`)
      } else {
        await api.deletePosition(deleteTarget.item.id)
        showNotification('success', `Đã xóa chức vụ "${deleteTarget.item.name || deleteTarget.item.title}"`)
      }
      setDeleteTarget(null)
      await loadData()
    } catch (err) {
      showNotification('error', err?.message || 'Không thể xóa mục này')
    } finally {
      setDeleting(false)
    }
  }

  const tabOptions = [
    {
      id: 'departments',
      label: 'Phòng ban',
      icon: Building2,
      badge: departments.length,
    },
    {
      id: 'positions',
      label: 'Chức vụ',
      icon: Briefcase,
      badge: positions.length,
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--cv-brand-600)] dark:text-[var(--cv-brand-400)] uppercase tracking-wider mb-1">
            <FolderTree className="w-4 h-4" />
            Quản trị tổ chức
          </div>
          <h1 className="text-2xl font-bold text-[var(--cv-text-primary)]">
            Phòng ban & Chức vụ
          </h1>
          <p className="text-sm text-[var(--cv-text-secondary)] mt-0.5">
            Quản lý cơ cấu phòng ban và danh mục chức danh chức vụ trong doanh nghiệp
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5"
            title="Tải lại danh sách"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </Button>

          <Button
            variant="primary"
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm {activeTab === 'departments' ? 'phòng ban' : 'chức vụ'}</span>
          </Button>
        </div>
      </div>

      {/* Notification Toast Banner */}
      {notification && (
        <div
          className={`flex items-center gap-3 p-3.5 rounded-xl border text-sm font-medium animate-fade-in ${
            notification.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Building2}
          title="Tổng phòng ban"
          value={departments.length}
          trend={departments.length > 0 ? 'Đang hoạt động' : undefined}
          trendDirection="neutral"
          variant="primary"
        />
        <StatCard
          icon={Users}
          title="Nhân sự / Phòng ban"
          value={totalEmployeesInDepts}
          trend="Đã phân bổ"
          trendDirection="neutral"
          variant="indigo"
        />
        <StatCard
          icon={Briefcase}
          title="Tổng chức vụ"
          value={positions.length}
          trend={positions.length > 0 ? 'Đang áp dụng' : undefined}
          trendDirection="neutral"
          variant="emerald"
        />
        <StatCard
          icon={Users}
          title="Nhân sự / Chức vụ"
          value={totalEmployeesInPositions}
          trend="Đã phân bổ"
          trendDirection="neutral"
          variant="amber"
        />
      </div>

      {/* Main Container */}
      <Card className="p-0 overflow-hidden">
        {/* Controls: Tabs & Search */}
        <div className="p-4 border-b border-[var(--cv-border-default)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-[var(--cv-bg-surface-elevated)]/40">
          <Tabs
            tabs={tabOptions}
            activeTab={activeTab}
            onChange={(tabId) => {
              setActiveTab(tabId)
              setSearch('')
            }}
          />

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-[var(--cv-text-tertiary)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="text"
              placeholder={`Tìm kiếm ${activeTab === 'departments' ? 'phòng ban' : 'chức vụ'}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        {/* Content View: Departments Table */}
        {activeTab === 'departments' && (
          <div className="overflow-x-auto">
            {filteredDepartments.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={Building2}
                  title="Chưa có phòng ban nào"
                  description={
                    search
                      ? 'Không tìm thấy phòng ban phù hợp với từ khóa tìm kiếm.'
                      : 'Bắt đầu bằng việc thêm các phòng ban chính trong công ty của bạn.'
                  }
                  action={
                    search ? (
                      <Button variant="secondary" onClick={() => setSearch('')}>
                        Xóa tìm kiếm
                      </Button>
                    ) : (
                      <Button variant="primary" onClick={handleOpenCreate}>
                        <Plus className="w-4 h-4 mr-1.5" />
                        Tạo phòng ban đầu tiên
                      </Button>
                    )
                  }
                />
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--cv-border-default)] bg-[var(--cv-bg-surface-elevated)]/60 text-[var(--cv-text-tertiary)] font-semibold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Mã phòng ban</th>
                    <th className="py-3.5 px-4">Tên phòng ban</th>
                    <th className="py-3.5 px-4">Mô tả</th>
                    <th className="py-3.5 px-4 text-center">Số nhân viên</th>
                    <th className="py-3.5 px-4 text-center">Trạng thái</th>
                    <th className="py-3.5 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--cv-border-default)]">
                  {filteredDepartments.map((dept) => (
                    <tr
                      key={dept.id}
                      className="hover:bg-[var(--cv-bg-surface-hover)]/60 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[var(--cv-brand-600)] dark:text-[var(--cv-brand-400)]">
                        {dept.code || '---'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[var(--cv-text-primary)]">
                        {dept.name}
                      </td>
                      <td className="py-3 px-4 text-[var(--cv-text-secondary)] max-w-xs truncate">
                        {dept.description || '---'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          <Users className="w-3 h-3" />
                          {dept.employee_count || 0}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={dept.is_active !== false ? 'success' : 'default'}>
                          {dept.is_active !== false ? 'Hoạt động' : 'Tạm khóa'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(dept)}
                            className="p-1.5 rounded-lg text-[var(--cv-text-secondary)] hover:text-[var(--cv-brand-600)] hover:bg-[var(--cv-bg-surface-hover)] transition-colors cursor-pointer"
                            title="Chỉnh sửa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({
                                type: 'department',
                                item: dept,
                              })
                            }
                            className="p-1.5 rounded-lg text-[var(--cv-text-secondary)] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Xóa phòng ban"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Content View: Positions Table */}
        {activeTab === 'positions' && (
          <div className="overflow-x-auto">
            {filteredPositions.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={Briefcase}
                  title="Chưa có chức vụ nào"
                  description={
                    search
                      ? 'Không tìm thấy chức vụ phù hợp với từ khóa tìm kiếm.'
                      : 'Bắt đầu bằng việc thêm các chức vụ, vị trí công tác cho nhân viên.'
                  }
                  action={
                    search ? (
                      <Button variant="secondary" onClick={() => setSearch('')}>
                        Xóa tìm kiếm
                      </Button>
                    ) : (
                      <Button variant="primary" onClick={handleOpenCreate}>
                        <Plus className="w-4 h-4 mr-1.5" />
                        Tạo chức vụ đầu tiên
                      </Button>
                    )
                  }
                />
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--cv-border-default)] bg-[var(--cv-bg-surface-elevated)]/60 text-[var(--cv-text-tertiary)] font-semibold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Mã chức vụ</th>
                    <th className="py-3.5 px-4">Tên chức vụ</th>
                    <th className="py-3.5 px-4">Mô tả</th>
                    <th className="py-3.5 px-4 text-center">Số nhân viên</th>
                    <th className="py-3.5 px-4 text-center">Trạng thái</th>
                    <th className="py-3.5 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--cv-border-default)]">
                  {filteredPositions.map((pos) => (
                    <tr
                      key={pos.id}
                      className="hover:bg-[var(--cv-bg-surface-hover)]/60 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {pos.code || '---'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[var(--cv-text-primary)]">
                        {pos.name || pos.title}
                      </td>
                      <td className="py-3 px-4 text-[var(--cv-text-secondary)] max-w-xs truncate">
                        {pos.description || '---'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          <Users className="w-3 h-3" />
                          {pos.employee_count || 0}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={pos.is_active !== false ? 'success' : 'default'}>
                          {pos.is_active !== false ? 'Hoạt động' : 'Tạm khóa'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(pos)}
                            className="p-1.5 rounded-lg text-[var(--cv-text-secondary)] hover:text-[var(--cv-brand-600)] hover:bg-[var(--cv-bg-surface-hover)] transition-colors cursor-pointer"
                            title="Chỉnh sửa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({
                                type: 'position',
                                item: pos,
                              })
                            }
                            className="p-1.5 rounded-lg text-[var(--cv-text-secondary)] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Xóa chức vụ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      {/* Modal: Create / Edit Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--cv-bg-overlay)] backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full max-w-md bg-[var(--cv-bg-surface)] border border-[var(--cv-border-default)] rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-[var(--cv-border-default)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[var(--cv-brand-50)] dark:bg-[var(--cv-brand-950)] text-[var(--cv-brand-600)] dark:text-[var(--cv-brand-400)]">
                  {activeTab === 'departments' ? (
                    <Building2 className="w-5 h-5" />
                  ) : (
                    <Briefcase className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--cv-text-primary)]">
                    {modalMode === 'create' ? 'Thêm mới' : 'Cập nhật'}{' '}
                    {activeTab === 'departments' ? 'phòng ban' : 'chức vụ'}
                  </h3>
                  <p className="text-xs text-[var(--cv-text-secondary)]">
                    {activeTab === 'departments'
                      ? 'Thiết lập thông tin phòng ban cơ cấu'
                      : 'Thiết lập danh xưng và chức vụ làm việc'}
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1">
                  Tên {activeTab === 'departments' ? 'phòng ban' : 'chức vụ'}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <Input
                  type="text"
                  required
                  placeholder={
                    activeTab === 'departments'
                      ? 'Ví dụ: Phòng Kỹ thuật & Công nghệ'
                      : 'Ví dụ: Trưởng nhóm Phát triển'
                  }
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1">
                  Mã định danh (tùy chọn)
                </label>
                <Input
                  type="text"
                  placeholder={
                    activeTab === 'departments' ? 'Ví dụ: DEPT_TECH' : 'Ví dụ: POS_LEAD'
                  }
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
                <p className="text-[11px] text-[var(--cv-text-tertiary)] mt-1">
                  Nếu để trống, hệ thống sẽ tự sinh mã tương ứng.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1">
                  Mô tả
                </label>
                <textarea
                  rows={3}
                  placeholder="Ghi chú thêm về chức năng, nhiệm vụ..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-xl border border-[var(--cv-border-default)] bg-[var(--cv-bg-surface)] p-2.5 text-xs text-[var(--cv-text-primary)] placeholder-[var(--cv-text-tertiary)] focus:outline-hidden focus:ring-2 focus:ring-[var(--cv-brand-500)] transition-all"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="status_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-[var(--cv-border-default)] text-[var(--cv-brand-600)] focus:ring-[var(--cv-brand-500)] cursor-pointer"
                />
                <label
                  htmlFor="status_active"
                  className="text-xs font-medium text-[var(--cv-text-primary)] cursor-pointer"
                >
                  Đang hoạt động
                </label>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--cv-border-default)]">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Hủy
                </Button>
                <Button type="submit" variant="primary" loading={saving}>
                  {modalMode === 'create' ? 'Tạo mới' : 'Lưu thay đổi'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        loading={deleting}
        title={
          deleteTarget?.type === 'department'
            ? `Xóa phòng ban "${deleteTarget?.item?.name}"?`
            : `Xóa chức vụ "${deleteTarget?.item?.name || deleteTarget?.item?.title}"?`
        }
        message={
          deleteTarget?.item?.employee_count > 0
            ? `Cảnh báo: Hiện có ${deleteTarget.item.employee_count} nhân viên đang được gắn với mục này. Bạn có chắc chắn muốn xóa không?`
            : 'Hành động này không thể hoàn tác. Dữ liệu sẽ bị gỡ bỏ hoàn toàn khỏi hệ thống.'
        }
        confirmText="Xác nhận xóa"
        variant="danger"
      />
    </div>
  )
}
