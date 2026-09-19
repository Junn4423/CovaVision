import { useEffect, useMemo, useState } from 'react'
import { Check, CreditCard, ExternalLink, QrCode, ShieldCheck, UsersRound, X } from 'lucide-react'
import { api } from '../services/api'

const money = value => Number(value || 0).toLocaleString('vi-VN') + 'đ'
const BILLING_CONTACT_URL = String(import.meta.env.VITE_BILLING_CONTACT_URL || '').trim()

export default function Billing() {
  const [plans, setPlans] = useState([])
  const [summary, setSummary] = useState(null)
  const [payment, setPayment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busyPlan, setBusyPlan] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const [planResponse, summaryResponse] = await Promise.all([api.getBillingPlans(), api.getBillingSummary()])
    if (Array.isArray(planResponse?.plans)) setPlans(planResponse.plans)
    if (summaryResponse?.plan) setSummary(summaryResponse)
    if (!planResponse?.success || !summaryResponse?.success) setError('Không tải được thông tin gói. Vui lòng kiểm tra kết nối API.')
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!payment?.order_code || payment.status === 'PAID') return undefined
    const timer = window.setInterval(async () => {
      const response = await api.getPaymentStatus(payment.order_code)
      if (response?.payment) {
        setPayment(response.payment)
        if (response.payment.status === 'PAID') load()
      }
    }, 3000)
    return () => window.clearInterval(timer)
  }, [payment?.order_code, payment?.status])

  const activeCode = String(summary?.plan?.code || '').toLowerCase()
  const usage = summary?.usage || {}
  const usagePercent = useMemo(() => {
    const limit = Number(summary?.plan?.max_employees || 0)
    return limit ? Math.min(100, Math.round((Number(usage.employees || 0) / limit) * 100)) : 0
  }, [summary, usage.employees])

  async function buy(plan) {
    if (plan.contact_only) {
      if (BILLING_CONTACT_URL) window.open(BILLING_CONTACT_URL, '_blank', 'noopener,noreferrer')
      else setError('Gói Business cần liên hệ kinh doanh. Hãy cấu hình VITE_BILLING_CONTACT_URL cho desktop.')
      return
    }
    setBusyPlan(plan.code)
    setError('')
    const response = await api.createBillingCheckout(plan.code)
    if (!response?.success) setError(response?.message || 'Không tạo được đơn thanh toán.')
    else setPayment(response.payment)
    setBusyPlan('')
  }

  if (loading) return <div className="cv-page-loading"><div className="cv-spinner" /></div>
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="cv-eyebrow">Workspace & subscription</div><h1 className="cv-page-title">Gói nhân sự</h1><p className="cv-page-subtitle">Quản lý hạn mức nhân viên, khuôn mặt và thanh toán theo workspace.</p></div>
        <div className="cv-badge cv-badge-success"><ShieldCheck size={14} /> Đang bảo vệ quota backend</div>
      </div>

      {error && <div className="cv-alert cv-alert-danger">{error}</div>}
      {summary && <div className="cv-card grid gap-5 p-5 md:grid-cols-[1.2fr_1fr_1fr]">
        <div><div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--cv-text-tertiary)' }}>Gói hiện tại</div><div className="mt-2 flex items-center gap-3"><span className="text-2xl font-black" style={{ color: 'var(--cv-text-primary)', fontFamily: 'var(--cv-font-heading)' }}>{summary.plan.name}</span><span className="cv-badge cv-badge-info">{summary.subscription?.status}</span></div><div className="mt-1 text-sm" style={{ color: 'var(--cv-text-secondary)' }}>Hết hạn: {summary.subscription?.ends_at ? new Date(summary.subscription.ends_at).toLocaleDateString('vi-VN') : 'Theo hợp đồng'}</div></div>
        <div><div className="flex items-center justify-between text-sm"><span><UsersRound size={15} className="mr-2 inline" />Nhân viên</span><strong>{usage.employees || 0} / {summary.plan.max_employees ?? '∞'}</strong></div><div className="cv-progress mt-3"><span style={{ width: `${usagePercent}%` }} /></div></div>
        <div><div className="flex items-center justify-between text-sm"><span><CreditCard size={15} className="mr-2 inline" />Khuôn mặt</span><strong>{usage.face_templates || 0} / {summary.plan.max_face_templates ?? '∞'}</strong></div><div className="mt-3 text-sm" style={{ color: 'var(--cv-text-secondary)' }}>Gói được kiểm tra ở server cho mọi request.</div></div>
      </div>}

      <div className="grid gap-4 xl:grid-cols-5">
        {plans.map(plan => {
          const current = activeCode === plan.code
          return <article key={plan.code} className={`cv-card relative flex flex-col p-5 ${current ? 'cv-card-highlight' : ''}`}>
            {current && <span className="absolute right-4 top-4 cv-badge cv-badge-success">Đang dùng</span>}
            <div className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--cv-text-brand)' }}>{plan.name}</div>
            <div className="mt-3 text-2xl font-black" style={{ color: 'var(--cv-text-primary)', fontFamily: 'var(--cv-font-heading)' }}>{plan.contact_only ? 'Liên hệ' : plan.monthly_price_vnd === 0 ? 'Miễn phí' : `${money(plan.monthly_price_vnd)} / tháng`}</div>
            <div className="mt-4 flex-1 space-y-2 text-sm" style={{ color: 'var(--cv-text-secondary)' }}><div><Check size={15} className="mr-2 inline text-emerald-600" />{plan.max_employees ?? 'Không giới hạn'} nhân viên</div><div><Check size={15} className="mr-2 inline text-emerald-600" />{plan.max_face_templates ?? 'Không giới hạn'} khuôn mặt</div><div><Check size={15} className="mr-2 inline text-emerald-600" />Ghi nhận quét mặt tự động</div></div>
            <button disabled={current || busyPlan === plan.code} onClick={() => buy(plan)} className={`cv-btn mt-6 w-full justify-center ${current ? 'cv-btn-secondary' : 'cv-btn-primary'}`}>{busyPlan === plan.code ? 'Đang tạo đơn...' : plan.contact_only ? 'Liên hệ tư vấn' : current ? 'Gói hiện tại' : 'Chọn gói'}</button>
          </article>
        })}
      </div>

      {payment && <div className="cv-modal-backdrop" role="dialog" aria-modal="true"><div className="cv-modal cv-modal-sm">
        <button className="cv-modal-close" onClick={() => setPayment(null)} aria-label="Đóng"><X size={18} /></button>
        {payment.status === 'PAID' ? <div className="py-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={28} /></div><h2 className="mt-4 text-xl font-black">Thanh toán thành công</h2><p className="mt-2 text-sm" style={{ color: 'var(--cv-text-secondary)' }}>Gói {payment.plan_code} đã được kích hoạt cho workspace.</p></div> : <><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--cv-brand-100)', color: 'var(--cv-text-brand)' }}><QrCode size={20} /></div><div><h2 className="text-lg font-black">Quét QR để thanh toán</h2><p className="text-sm" style={{ color: 'var(--cv-text-secondary)' }}>Mã đơn: <strong>{payment.order_code}</strong></p></div></div>{payment.qr_code_url ? <img src={payment.qr_code_url} alt="QR thanh toán SePay" className="mx-auto my-6 h-64 w-64 rounded-xl border p-2" /> : <div className="cv-alert cv-alert-warning my-6">Backend chưa cấu hình `SEPAY_BANK_ACCOUNT` và `SEPAY_BANK_CODE`, nên chưa thể hiển thị QR.</div>}<div className="cv-alert cv-alert-info text-sm">Đang chờ SePay xác nhận. Trang tự kiểm tra mỗi 3 giây; bạn có thể đóng cửa sổ và mở lại trạng thái thanh toán.</div><div className="mt-4 flex items-center justify-between text-sm"><span style={{ color: 'var(--cv-text-secondary)' }}>Số tiền</span><strong>{money(payment.amount_vnd)}</strong></div><a className="cv-btn cv-btn-secondary mt-4 w-full justify-center" href="https://developer.sepay.vn/vi/sepay-webhooks/tao-qr-va-form-thanh-toan" target="_blank" rel="noreferrer">Hướng dẫn thanh toán <ExternalLink size={14} /></a></>}
      </div></div>}
    </div>
  )
}
