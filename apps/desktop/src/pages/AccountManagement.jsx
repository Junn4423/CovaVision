import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import Modal from '../components/Modal'

function formatDateTime(value) {
  const raw = String(value || '').trim()
  if (!raw) return '-'
  const dt = new Date(raw)
  if (Number.isNaN(dt.getTime())) return raw
  return dt.toLocaleString('vi-VN')
}

export default function AccountManagement() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [pulling, setPulling] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [search, setSearch] = useState('')
  const [overwritePassword, setOverwritePassword] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [statusType, setStatusType] = useState('info')
  const [authMode, setAuthMode] = useState('')

  // State for Upsert Modal
  const [upsertModalOpen, setUpsertModalOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [formUsername, setFormUsername] = useState('')
  const [formPassword, setFormPassword] = useState('')

  // State for Reset Modal
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetPassword, setResetPassword] = useState('')

  useEffect(() => {
    initializePage()
  }, [])

  async function initializePage() {
    setLoading(true)
    await Promise.all([
      loadAccounts(),
      loadAuthMode(),
    ])
    setLoading(false)
  }

  async function loadAuthMode() {
    try {
      const status = await api.sessionStatus()
      setAuthMode(String(status?.auth_mode || '').trim().toLowerCase())
    } catch {
      setAuthMode('')
    }
  }

  async function loadAccounts() {
    try {
      const res = await api.getEmployeeAccounts()
      if (!res?.success) {
        setStatusType('error')
        setStatusText(res?.message || 'Không thể tải danh sách tài khoản')
        setAccounts([])
        return
      }

      setAccounts(Array.isArray(res.accounts) ? res.accounts : [])
      setStatusText('')
    } catch {
      setStatusType('error')
      setStatusText('Không thể kết nối backend')
      setAccounts([])
    }
  }

  async function handlePullFromErp() {
    setPulling(true)
    setStatusText('')

    try {
      const res = await api.pullEmployeeAccounts({ overwrite_password: overwritePassword })
      if (!res?.success && !res?.result) {
        setStatusType('error')
        setStatusText(res?.message || 'Đồng bộ tài khoản thất bại')
        setPulling(false)
        return
      }

      const result = res?.result || {}
      const summaryText = [
        `Đã tạo mới: ${result.created || 0}`,
        `Cập nhật: ${result.updated || 0}`,
        `Đổi hash: ${result.password_updated || 0}`,
        `Thiếu user local: ${result.skipped_missing_user || 0}`,
        `Thiếu hash ERP: ${result.skipped_missing_hash || 0}`,
      ].join(' | ')

      const missingHashCount = Number(result.skipped_missing_hash || 0)
      const helperText = missingHashCount > 0
        ? ` Có ${missingHashCount} nhân viên không có mật khẩu hash từ ERP. Hãy bấm Đăng ký TK để tạo thủ công.`
        : ''

      setStatusType((result.errors || []).length > 0 ? 'warning' : 'success')
      setStatusText(`${summaryText}.${helperText}`)
      await loadAccounts()
    } catch {
      setStatusType('error')
      setStatusText('Không thể đồng bộ tài khoản từ ERP')
    }

    setPulling(false)
  }

  async function handleToggleLock(account) {
    if (!account?.account_id) return
    setSavingId(account.account_id)

    try {
      const res = await api.setEmployeeAccountLock(account.account_id, !account.is_locked)
      if (!res?.success) {
        setStatusType('error')
        setStatusText(res?.message || 'Không thể cập nhật trạng thái khóa')
        setSavingId(null)
        return
      }

      setStatusType('success')
      setStatusText('Đã cập nhật trạng thái khóa tài khoản')
      await loadAccounts()
    } catch {
      setStatusType('error')
      setStatusText('Không thể cập nhật trạng thái khóa')
    }

    setSavingId(null)
  }

  function openUpsertModal(account) {
    setSelectedAccount(account)
    setFormUsername(String(account.username || account.employee_id || '').trim())
    setFormPassword('')
    setUpsertModalOpen(true)
    setStatusText('')
  }

  async function performUpsert() {
    if (!selectedAccount?.user_id) return

    const username = formUsername.trim()
    if (!username) {
      setStatusType('error')
      setStatusText('Username không được để trống')
      return
    }

    const password = formPassword.trim()
    if (!password) {
      setStatusType('error')
      setStatusText('Mật khẩu không được để trống')
      return
    }

    const saveKey = selectedAccount.account_id || `create-${selectedAccount.user_id}`
    setSavingId(saveKey)
    setUpsertModalOpen(false)

    try {
      const res = await api.upsertEmployeeAccount({
        user_id: selectedAccount.user_id,
        employee_id: selectedAccount.employee_id,
        username,
        password,
      })

      if (!res?.success) {
        setStatusType('error')
        setStatusText(res?.message || 'Không thể đăng ký tài khoản nhân viên')
        setSavingId(null)
        return
      }

      setStatusType('success')
      setStatusText(res?.message || 'Đã lưu tài khoản nhân viên')
      await loadAccounts()
    } catch {
      setStatusType('error')
      setStatusText('Không thể đăng ký tài khoản nhân viên')
    }

    setSavingId(null)
  }

  function openResetModal(account) {
    setSelectedAccount(account)
    setResetPassword('')
    setResetModalOpen(true)
    setStatusText('')
  }

  async function performReset() {
    if (!selectedAccount?.account_id) return

    const normalized = resetPassword.trim()
    if (!normalized) {
      setStatusType('error')
      setStatusText('Mật khẩu mới không được để trống')
      return
    }

    setSavingId(selectedAccount.account_id)
    setResetModalOpen(false)

    try {
      const res = await api.resetEmployeeAccountPassword(selectedAccount.account_id, normalized)
      if (!res?.success) {
        setStatusType('error')
        setStatusText(res?.message || 'Không thể reset mật khẩu')
        setSavingId(null)
        return
      }

      setStatusType('success')
      setStatusText('Đã reset mật khẩu và mở khóa tài khoản')
      await loadAccounts()
    } catch {
      setStatusType('error')
      setStatusText('Không thể reset mật khẩu')
    }

    setSavingId(null)
  }

  const filteredAccounts = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return accounts

    return accounts.filter(item => {
      const haystack = [
        item.employee_id,
        item.name,
        item.department,
        item.position,
        item.username,
      ]
        .map(value => String(value || '').toLowerCase())
        .join(' ')
      return haystack.includes(keyword)
    })
  }, [accounts, search])

  const canPullFromErp = authMode === 'system'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Tài khoản nhân viên</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý tài khoản đăng nhập nội bộ, mật khẩu và phân quyền nhân viên.
          </p>
          {!canPullFromErp && (
            <p className="text-sm text-amber-700 mt-1">
              Đang ở chế độ nội bộ. Chức năng tải tài khoản từ ERP bị khóa, vẫn có thể tạo/sửa tài khoản nội bộ.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={overwritePassword}
              onChange={event => setOverwritePassword(event.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              disabled={pulling || !canPullFromErp}
            />
            Ghi đè mật khẩu
          </label>
          <button
            onClick={handlePullFromErp}
            disabled={pulling || !canPullFromErp}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors shadow-sm"
          >
            {pulling ? 'Đang tải từ ERP...' : 'Tải tài khoản từ ERP'}
          </button>
          <button
            onClick={loadAccounts}
            disabled={loading || pulling}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium disabled:opacity-50 transition-colors shadow-sm"
          >
            Làm mới
          </button>
        </div>
      </div>

      {statusText && (
        <div className={`px-4 py-3 rounded-xl border text-sm animate-in fade-in slide-in-from-top-2 duration-300 ${
          statusType === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : statusType === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : statusType === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-slate-200 bg-slate-50 text-slate-700'
        }`}>
          {statusText}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <input
            type="text"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Tìm theo mã NV, tên, phòng ban, username..."
            className="w-full max-w-xl px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          <span className="text-xs text-slate-500 font-medium">{filteredAccounts.length} bản ghi</span>
        </div>

        {loading ? (
          <div className="px-5 py-20 text-center text-sm text-slate-400">
            <div className="animate-pulse">Đang tải dữ liệu...</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-left">
                  <th className="px-4 py-3 font-semibold">Mã NV</th>
                  <th className="px-4 py-3 font-semibold">Họ tên</th>
                  <th className="px-4 py-3 font-semibold">Username</th>
                  <th className="px-4 py-3 font-semibold">Trạng thái</th>
                  <th className="px-4 py-3 font-semibold">Sai mật khẩu</th>
                  <th className="px-4 py-3 font-semibold">Lần đăng nhập cuối</th>
                  <th className="px-4 py-3 font-semibold">Lần đồng bộ</th>
                  <th className="px-4 py-3 font-semibold text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map(account => {
                  const hasAccount = Boolean(account.has_account)
                  const rowBusy = savingId !== null && (
                    savingId === account.account_id ||
                    savingId === `create-${account.user_id}`
                  )
                  return (
                    <tr key={account.user_id} className="border-t border-slate-100 text-slate-700 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{account.employee_id || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{account.name || '-'}</div>
                        <div className="text-xs text-slate-500">{account.department || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-slate-600">{account.username || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        {!hasAccount ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            Chưa có account
                          </span>
                        ) : account.is_locked ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-red-700 border border-red-100">
                            Đang khóa
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            Hoạt động
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={account.failed_attempts > 0 ? 'text-red-600 font-bold' : ''}>
                          {account.failed_attempts || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDateTime(account.last_login_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDateTime(account.synced_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            disabled={rowBusy}
                            onClick={() => openUpsertModal(account)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${
                              hasAccount
                                ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {hasAccount ? 'Sửa tài khoản' : 'Đăng ký TK'}
                          </button>

                          {hasAccount && (
                            <button
                              disabled={rowBusy}
                              onClick={() => openResetModal(account)}
                              className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all"
                            >
                              Reset
                            </button>
                          )}

                          {hasAccount && (
                            <button
                              disabled={rowBusy}
                              onClick={() => handleToggleLock(account)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 border ${
                                account.is_locked
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                              }`}
                            >
                              {account.is_locked ? 'Mở khóa' : 'Khóa'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upsert Account Modal */}
      {upsertModalOpen && (
        <Modal
          title={selectedAccount?.has_account ? 'Sửa tài khoản nhân viên' : 'Đăng ký tài khoản nhân viên'}
          onClose={() => setUpsertModalOpen(false)}
          footer={(
            <>
              <button
                onClick={() => setUpsertModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={performUpsert}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
              >
                Lưu tài khoản
              </button>
            </>
          )}
        >
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-sm font-bold text-blue-900">{selectedAccount?.name}</p>
              <p className="text-xs text-blue-700 mt-0.5">Mã nhân viên: {selectedAccount?.employee_id}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider px-1">
                Tên đăng nhập
              </label>
              <input
                type="text"
                autoFocus
                value={formUsername}
                onChange={e => setFormUsername(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800"
                placeholder="VD: user.01"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider px-1">
                {selectedAccount?.has_account ? 'Mật khẩu mới' : 'Mật khẩu'}
              </label>
              <input
                type="password"
                value={formPassword}
                onChange={e => setFormPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800"
                placeholder="Ít nhất 4 ký tự"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Reset Password Modal */}
      {resetModalOpen && (
        <Modal
          title="Reset mật khẩu"
          onClose={() => setResetModalOpen(false)}
          footer={(
            <>
              <button
                onClick={() => setResetModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={performReset}
                className="px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-bold hover:bg-orange-700 transition-colors shadow-sm shadow-orange-200"
              >
                Reset mật khẩu
              </button>
            </>
          )}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600 px-1 leading-relaxed">
              Bạn đang thực hiện reset mật khẩu cho tài khoản 
              <span className="font-bold text-slate-900 mx-1">@{selectedAccount?.username}</span> 
              của nhân viên <span className="font-bold text-slate-900">{selectedAccount?.name}</span>.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider px-1">
                Mật khẩu mới
              </label>
              <input
                type="password"
                autoFocus
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-800"
                placeholder="Ít nhất 4 ký tự"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
