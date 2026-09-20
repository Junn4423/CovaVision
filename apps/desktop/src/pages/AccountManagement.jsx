import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  UserCheck,
  UserPlus,
  UserRound,
  UserX,
  Users,
} from 'lucide-react'
import { api } from '../services/api'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, StatCard } from '../components/ui'

const ROLE_CONFIG = {
  ADMIN: {
    label: 'Quản trị viên',
    badgeVariant: 'danger',
    icon: ShieldAlert,
    desc: 'Toàn quyền truy cập hệ thống',
  },
  HR_MANAGER: {
    label: 'Quản lý nhân sự',
    badgeVariant: 'violet',
    icon: ShieldCheck,
    desc: 'Quản lý nhân viên & báo cáo',
  },
  SUPERVISOR: {
    label: 'Giám sát viên',
    badgeVariant: 'warning',
    icon: Shield,
    desc: 'Theo dõi điểm danh & camera',
  },
  STAFF: {
    label: 'Nhân viên',
    badgeVariant: 'primary',
    icon: UserRound,
    desc: 'Xem điểm danh cá nhân',
  },
}

export default function AccountManagement() {
  const [accounts, setAccounts] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [form, setForm] = useState({ username: '', password: '', role: 'STAFF', employee_id: '' })
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)

  async function load() {
    try {
      setLoading(true)
      const [accRes, empRes] = await Promise.allSettled([
        api.getAccounts(),
        api.getEmployees(),
      ])
      if (accRes.status === 'fulfilled') {
        setAccounts(Array.isArray(accRes.value?.accounts) ? accRes.value.accounts : [])
      }
      if (empRes.status === 'fulfilled') {
        const list = empRes.value?.employees || []
        setEmployees(Array.isArray(list) ? list : [])
      }
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Không tải được danh sách tài khoản.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // VAL-01: Realtime duplicate username detection
  const isDuplicateUsername = useMemo(() => {
    if (!form.username.trim()) return false
    return accounts.some(
      (a) => a.username.toLowerCase() === form.username.trim().toLowerCase()
    )
  }, [accounts, form.username])

  // Password strength helper
  const passwordStrength = useMemo(() => {
    const pw = form.password
    if (!pw) return { score: 0, text: '', color: '' }
    if (pw.length < 6) return { score: 1, text: 'Quá ngắn (tối thiểu 6 ký tự)', color: 'text-red-500' }
    const hasLetters = /[a-zA-Z]/.test(pw)
    const hasNumbers = /\d/.test(pw)
    const hasSpecial = /[^a-zA-Z0-9]/.test(pw)
    if (pw.length >= 8 && hasLetters && hasNumbers && hasSpecial) {
      return { score: 3, text: 'Mật khẩu mạnh', color: 'text-emerald-500' }
    }
    if (pw.length >= 6 && hasLetters && hasNumbers) {
      return { score: 2, text: 'Mật khẩu trung bình', color: 'text-amber-500' }
    }
    return { score: 1, text: 'Mật khẩu yếu', color: 'text-rose-500' }
  }, [form.password])

  // Stats calculation
  const stats = useMemo(() => {
    const total = accounts.length
    const active = accounts.filter((a) => a.is_active !== false).length
    const locked = total - active
    const admins = accounts.filter((a) => a.role === 'ADMIN').length
    return { total, active, locked, admins }
  }, [accounts])

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const matchSearch =
        account.username?.toLowerCase().includes(search.toLowerCase()) ||
        (account.role && account.role.toLowerCase().includes(search.toLowerCase()))
      const matchRole = roleFilter === 'ALL' || account.role === roleFilter
      return matchSearch && matchRole
    })
  }, [accounts, search, roleFilter])

  async function handleSave(event) {
    event.preventDefault()
    if (form.password && form.password.length < 6) {
      setMessage({ type: 'error', text: 'Mật khẩu phải có ít nhất 6 ký tự.' })
      return
    }

    setSubmitting(true)
    setMessage(null)
    try {
      await api.upsertEmployeeAccount(form)
      setForm({ username: '', password: '', role: 'STAFF' })
      setIsFormOpen(false)
      setMessage({
        type: 'success',
        text: isDuplicateUsername ? 'Đã cập nhật tài khoản.' : 'Đã tạo tài khoản thành công.',
      })
      await load()
    } catch (saveError) {
      setMessage({ type: 'error', text: saveError?.message || 'Không lưu được tài khoản.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleLock() {
    if (!confirmTarget) return
    setActionLoading(true)
    try {
      // BIZ-06: If currently active (is_active !== false), shouldLock is true
      const shouldLock = confirmTarget.is_active !== false
      await api.setEmployeeAccountLock(
        confirmTarget.id || confirmTarget.username,
        shouldLock
      )
      setMessage({
        type: 'success',
        text: shouldLock
          ? `Đã khóa tài khoản ${confirmTarget.username}.`
          : `Đã mở khóa tài khoản ${confirmTarget.username}.`,
      })
      setConfirmTarget(null)
      await load()
    } catch (err) {
      setMessage({
        type: 'error',
        text: err?.message || 'Không cập nhật được trạng thái tài khoản.',
      })
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--cv-text-primary)] tracking-tight flex items-center gap-2.5">
            <Users className="w-7 h-7 text-[var(--cv-brand-500)]" />
            Quản lý tài khoản
          </h1>
          <p className="text-sm text-[var(--cv-text-secondary)] mt-1">
            Quản trị viên, phân quyền và trạng thái bảo mật của người dùng.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="md"
            icon={RefreshCw}
            onClick={load}
            loading={loading}
          >
            Làm mới
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={UserPlus}
            onClick={() => {
              setIsFormOpen(!isFormOpen)
              setMessage(null)
            }}
          >
            {isFormOpen ? 'Đóng biểu mẫu' : 'Thêm tài khoản'}
          </Button>
        </div>
      </div>

      {/* Alert message */}
      {message && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-sm animate-in slide-in-from-top-2 duration-200 ${
            message.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
              : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {message.type === 'error' ? (
              <AlertCircle className="w-5 h-5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            )}
            <span className="font-medium">{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-xs font-bold underline cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Tổng tài khoản"
          value={stats.total}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Đang hoạt động"
          value={stats.active}
          icon={UserCheck}
          color="emerald"
        />
        <StatCard
          title="Đã khóa"
          value={stats.locked}
          icon={UserX}
          color="rose"
        />
        <StatCard
          title="Quản trị viên"
          value={stats.admins}
          icon={ShieldAlert}
          color="purple"
        />
      </div>

      {/* Form collapse container */}
      {isFormOpen && (
        <Card className="p-6 border-[var(--cv-brand-300)] shadow-md animate-in zoom-in-95 duration-200">
          <Card.Title className="mb-4">
            <UserPlus className="w-5 h-5 text-[var(--cv-brand-500)]" />
            {isDuplicateUsername ? 'Cập nhật mật khẩu / quyền' : 'Tạo tài khoản mới'}
          </Card.Title>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Username field */}
              <div>
                <Input
                  label="Tên đăng nhập"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="ví dụ: admin, nv_kinhdoanh"
                  icon={UserRound}
                  required
                />
                {isDuplicateUsername && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1 font-medium">
                    <Check className="w-3.5 h-3.5" />
                    Tài khoản đã tồn tại. Nhập để cập nhật quyền / mật khẩu.
                  </p>
                )}
              </div>

              {/* Password field */}
              <div>
                <Input
                  label="Mật khẩu"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={isDuplicateUsername ? 'Để trống nếu không đổi' : 'Tối thiểu 6 ký tự'}
                  icon={KeyRound}
                  required={!isDuplicateUsername}
                />
                {passwordStrength.text && (
                  <p className={`text-xs mt-1 font-medium ${passwordStrength.color}`}>
                    {passwordStrength.text}
                  </p>
                )}
              </div>

              {/* Role field */}
              <div>
                <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1.5">
                  Vai trò & Quyền
                </label>
                <div className="relative">
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="cv-input font-medium appearance-none cursor-pointer"
                  >
                    <option value="STAFF">Nhân viên (Xem điểm danh)</option>
                    <option value="SUPERVISOR">Giám sát viên (Theo dõi camera)</option>
                    <option value="HR_MANAGER">Quản lý nhân sự (Quản lý hồ sơ, báo cáo)</option>
                    <option value="ADMIN">Quản trị viên (Toàn quyền hệ thống)</option>
                  </select>
                </div>
              </div>

              {/* Linked Employee field */}
              <div>
                <label className="block text-xs font-semibold text-[var(--cv-text-secondary)] mb-1.5">
                  Liên kết với Nhân sự
                </label>
                <div className="relative">
                  <select
                    value={form.employee_id || ''}
                    onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                    className="cv-input font-medium appearance-none cursor-pointer text-xs"
                  >
                    <option value="">-- Không liên kết (Độc lập) --</option>
                    {employees.map((emp) => (
                      <option key={emp.id || emp.employee_id} value={emp.employee_id || emp.id}>
                        {emp.name} ({emp.employee_id || 'Chưa có mã'}{emp.department ? ` · ${emp.department}` : ''})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--cv-border-default)]">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setIsFormOpen(false)}
              >
                Hủy
              </Button>
              <Button
                variant="primary"
                type="submit"
                loading={submitting}
                icon={Check}
              >
                {isDuplicateUsername ? 'Cập nhật tài khoản' : 'Tạo tài khoản'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Main Table Card */}
      <Card>
        {/* Table Filters Header */}
        <div className="p-5 pb-4 border-b border-[var(--cv-border-default)] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-[var(--cv-text-tertiary)] pointer-events-none z-10" />
            <input
              type="text"
              placeholder="Tìm theo username hoặc vai trò..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="cv-input has-icon-left !pl-10 text-xs font-medium"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {['ALL', 'ADMIN', 'HR_MANAGER', 'SUPERVISOR', 'STAFF'].map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  roleFilter === role
                    ? 'bg-[var(--cv-brand-500)] text-white shadow-xs'
                    : 'bg-[var(--cv-bg-surface-hover)] text-[var(--cv-text-secondary)] hover:text-[var(--cv-text-primary)]'
                }`}
              >
                {role === 'ALL' ? 'Tất cả' : ROLE_CONFIG[role]?.label || role}
              </button>
            ))}
          </div>
        </div>

        {/* Account List */}
        {loading ? (
          <div className="p-12 text-center text-sm text-[var(--cv-text-tertiary)] flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[var(--cv-brand-500)]" />
            <span>Đang tải danh sách tài khoản...</span>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Không tìm thấy tài khoản nào"
            description={
              search || roleFilter !== 'ALL'
                ? 'Không có kết quả khớp với bộ lọc hiện tại.'
                : 'Hệ thống chưa có tài khoản nào được lưu.'
            }
            actionLabel="Tạo tài khoản đầu tiên"
            onAction={() => setIsFormOpen(true)}
            actionIcon={Plus}
          />
        ) : (
          <div className="divide-y divide-[var(--cv-border-default)] overflow-x-auto">
            {filteredAccounts.map((account) => {
              const roleMeta = ROLE_CONFIG[account.role] || ROLE_CONFIG.STAFF
              const RoleIcon = roleMeta.icon
              const isActive = account.is_active !== false

              return (
                <div
                  key={account.id || account.username}
                  className="flex items-center justify-between gap-4 p-4 sm:px-6 hover:bg-[var(--cv-bg-surface-hover)]/60 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${
                        isActive
                          ? 'bg-[var(--cv-brand-100)] text-[var(--cv-brand-700)] dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {account.username?.slice(0, 2).toUpperCase() || 'U'}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--cv-text-primary)] truncate">
                          {account.username}
                        </span>
                        <Badge
                          variant={roleMeta.badgeVariant}
                          size="sm"
                          className="shrink-0"
                        >
                          <RoleIcon className="w-3 h-3 mr-1" />
                          {roleMeta.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-[var(--cv-text-tertiary)] truncate mt-0.5">
                        {roleMeta.desc}
                      </p>
                      {account.employee ? (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                          <UserRound className="w-3.5 h-3.5 shrink-0" />
                          <span>Liên kết: <strong>{account.employee.name}</strong></span>
                          <span className="text-[11px] text-[var(--cv-text-tertiary)]">
                            ({account.employee.employee_code || account.employee.id}{account.employee.department ? ` · ${account.employee.department}` : ''})
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-[var(--cv-text-tertiary)] italic">
                          <span>Chưa liên kết hồ sơ nhân sự</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={UserCheck}
                      onClick={() => {
                        setForm({
                          id: account.id,
                          username: account.username,
                          password: '',
                          role: account.role || 'STAFF',
                          employee_id: account.employee_id || account.employee?.employee_code || account.employee?.id || '',
                        })
                        setIsFormOpen(true)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                      title="Chỉnh sửa hoặc liên kết hồ sơ nhân sự"
                    >
                      Liên kết
                    </Button>

                    <Badge
                      variant={isActive ? 'success' : 'neutral'}
                      dot
                      size="sm"
                    >
                      {isActive ? 'Hoạt động' : 'Đã khóa'}
                    </Badge>

                    <Button
                      variant={isActive ? 'ghost' : 'secondary'}
                      size="sm"
                      icon={isActive ? Lock : Unlock}
                      onClick={() => setConfirmTarget(account)}
                    >
                      {isActive ? 'Khóa' : 'Mở khóa'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Confirm Lock / Unlock Dialog */}
      <ConfirmDialog
        isOpen={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleToggleLock}
        loading={actionLoading}
        title={
          confirmTarget?.is_active !== false
            ? `Khóa tài khoản ${confirmTarget?.username}`
            : `Mở khóa tài khoản ${confirmTarget?.username}`
        }
        message={
          confirmTarget?.is_active !== false
            ? `Bạn có chắc muốn khóa tài khoản "${confirmTarget?.username}"? Người này sẽ không thể đăng nhập vào ứng dụng cho đến khi được mở khóa.`
            : `Mở khóa tài khoản "${confirmTarget?.username}" để người dùng có thể tiếp tục đăng nhập và làm việc.`
        }
        confirmText={
          confirmTarget?.is_active !== false ? 'Khóa tài khoản' : 'Mở khóa'
        }
        variant={confirmTarget?.is_active !== false ? 'warning' : 'info'}
      />
    </div>
  )
}
