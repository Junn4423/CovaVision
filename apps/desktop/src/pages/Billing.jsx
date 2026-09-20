import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import {
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Globe,
  Lock,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UsersRound,
  X,
} from 'lucide-react'
import QRCode from 'qrcode'
import { api } from '../services/api'

const money = value => Number(value || 0).toLocaleString('vi-VN') + 'đ'
const BILLING_CONTACT_URL = String(import.meta.env.VITE_BILLING_CONTACT_URL || 'https://covasol.com.vn').trim() || 'https://covasol.com.vn'

const DEFAULT_METHODS = [
  { code: 'vietqr', name: 'VietQR', provider: 'vietqr' },
  { code: 'momo', name: 'MoMo', provider: 'momo' },
  { code: 'zalopay', name: 'ZaloPay', provider: 'zalopay' },
  { code: 'stripe', name: 'Stripe (Thẻ quốc tế)', provider: 'stripe' },
]

const BILLING_SYNC_KEY = 'covavision_payment_completed'
const BILLING_CHANNEL = 'covavision_billing_channel'

function notifyPaymentCompleted(payload) {
  try {
    localStorage.setItem(BILLING_SYNC_KEY, JSON.stringify({ ...payload, timestamp: Date.now() }))
    if (typeof window.BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(BILLING_CHANNEL)
      channel.postMessage({ ...payload, timestamp: Date.now() })
      channel.close()
    }
  } catch {
    // ignore cross-origin or storage disabled
  }
}

export default function Billing() {
  const [plans, setPlans] = useState([])
  const [summary, setSummary] = useState(null)
  const [paymentMethods, setPaymentMethods] = useState(DEFAULT_METHODS)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [selectedMethod, setSelectedMethod] = useState('vietqr')
  const [payment, setPayment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busyPlan, setBusyPlan] = useState('')
  const [methodLoading, setMethodLoading] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [error, setError] = useState('')
  const [checkoutError, setCheckoutError] = useState('')
  const [viewMode, setViewMode] = useState('qr') // 'qr' | 'gateway'
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copiedKey, setCopiedKey] = useState('')

  const location = useLocation()

  // Generate crisp QR code whenever payment intent changes
  useEffect(() => {
    let active = true
    if (!payment) {
      setQrDataUrl('')
      return
    }

    const raw =
      payment.qr_code_url ||
      payment.metadata?.raw_qr ||
      payment.qr_code ||
      payment.payment_url ||
      ''

    if (
      raw.startsWith('data:image/') ||
      (raw.startsWith('http') && (raw.includes('.png') || raw.includes('.jpg') || raw.includes('img.vietqr.io')))
    ) {
      setQrDataUrl(raw)
      return
    }

    if (raw) {
      QRCode.toDataURL(raw, {
        width: 300,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      })
        .then(url => {
          if (active) setQrDataUrl(url)
        })
        .catch(() => {
          if (active) {
            setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(raw)}`)
          }
        })
    } else {
      setQrDataUrl('')
    }

    return () => {
      active = false
    }
  }, [payment])

  async function load() {
    setLoading(true)
    try {
      const [planResponse, summaryResponse, methodsResponse] = await Promise.all([
        api.getBillingPlans(),
        api.getBillingSummary(),
        api.getPaymentMethods().catch(() => ({ payment_methods: DEFAULT_METHODS })),
      ])
      if (Array.isArray(planResponse?.plans)) setPlans(planResponse.plans)
      if (summaryResponse?.plan) setSummary(summaryResponse)
      if (Array.isArray(methodsResponse?.payment_methods) && methodsResponse.payment_methods.length > 0) {
        setPaymentMethods(methodsResponse.payment_methods)
      }
      if (!planResponse?.success || !summaryResponse?.success) {
        setError('Không tải được thông tin gói. Vui lòng kiểm tra kết nối API.')
      }
    } catch {
      setError('Không thể kết nối đến máy chủ thanh toán.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // 1. Cross-window / Cross-tab synchronization listener
  useEffect(() => {
    const handleSuccessEvent = (eventData) => {
      if (eventData?.status === 'PAID') {
        load()
        setPayment(prev => prev ? { ...prev, status: 'PAID' } : { status: 'PAID', plan_code: eventData.plan_code, order_code: eventData.order_code })
      }
    }

    let bc
    try {
      if (typeof window.BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(BILLING_CHANNEL)
        bc.onmessage = (e) => handleSuccessEvent(e.data)
      }
    } catch {
      // ignore
    }

    const handleStorage = (e) => {
      if (e.key === BILLING_SYNC_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          handleSuccessEvent(parsed)
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener('storage', handleStorage)

    return () => {
      if (bc) bc.close()
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  // 2. Active Polling while payment modal is open
  useEffect(() => {
    if (!payment?.order_code || payment.status === 'PAID') return undefined
    const timer = window.setInterval(async () => {
      try {
        const response = await api.getPaymentStatus(payment.order_code)
        if (response?.payment) {
          setPayment(response.payment)
          if (response.payment.status === 'PAID') {
            load()
            notifyPaymentCompleted({
              status: 'PAID',
              order_code: response.payment.order_code,
              plan_code: response.payment.plan_code,
            })
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 2500)
    return () => window.clearInterval(timer)
  }, [payment?.order_code, payment?.status])

  // 3. Gateway Return Handler (Stripe, MoMo, ZaloPay redirects)
  useEffect(() => {
    const search = new URLSearchParams(location.search)
    const sessionId = search.get('session_id')
    const stripeStatus = search.get('status')
    const momoOrderId = search.get('orderId')
    const momoResultCode = search.get('resultCode')
    const zalopayTransId = search.get('apptransid')
    const zalopayStatus = search.get('status')
    const directOrderCode = search.get('order_code')

    const hasGatewayCallback = Boolean(
      sessionId ||
      stripeStatus === 'success' ||
      (momoOrderId && momoResultCode === '0') ||
      (zalopayTransId && zalopayStatus === '1') ||
      directOrderCode
    )

    if (!hasGatewayCallback) return

    let active = true
    const syncCallback = async () => {
      let orderCode = directOrderCode || momoOrderId || ''
      if (!orderCode && zalopayTransId && zalopayTransId.includes('_')) {
        orderCode = zalopayTransId.split('_')[1]
      }

      try {
        const response = await api.syncPaymentSession({
          session_id: sessionId || undefined,
          order_code: orderCode || undefined,
        })
        if (!active) return

        if (response?.success && response?.payment?.status === 'PAID') {
          setPayment(response.payment)
          load()
          notifyPaymentCompleted({
            status: 'PAID',
            order_code: response.payment.order_code,
            plan_code: response.payment.plan_code,
          })
        }
      } catch (err) {
        console.warn('Sync gateway return error:', err)
      }
    }

    syncCallback()
    return () => { active = false }
  }, [location.search])

  const activeCode = String(summary?.plan?.code || '').toLowerCase()
  const usage = summary?.usage || {}
  const usagePercent = useMemo(() => {
    const limit = Number(summary?.plan?.max_employees || 0)
    return limit ? Math.min(100, Math.round((Number(usage.employees || 0) / limit) * 100)) : 0
  }, [summary, usage.employees])

  async function buy(plan, methodCode) {
    if (plan.contact_only) {
      window.open(BILLING_CONTACT_URL, '_blank', 'noopener,noreferrer')
      return
    }
    const chosenMethod = methodCode || selectedMethod || 'vietqr'
    setSelectedPlan(plan)
    setSelectedMethod(chosenMethod)
    setBusyPlan(plan.code)
    setMethodLoading(true)
    setError('')
    setCheckoutError('')
    // Default viewMode based on method: Stripe defaults to gateway tab
    setViewMode(chosenMethod === 'stripe' ? 'gateway' : 'qr')
    try {
      const response = await api.createBillingCheckout(plan.code, chosenMethod)
      if (!response?.success) {
        setCheckoutError(response?.message || 'Không tạo được đơn thanh toán.')
      } else {
        setPayment(response.payment)
        // Automatically open Stripe checkout in a new window for seamless experience
        if (chosenMethod === 'stripe' && response.payment?.payment_url) {
          window.open(response.payment.payment_url, '_blank', 'noopener,noreferrer')
        }
      }
    } catch (err) {
      setCheckoutError(err?.message || 'Không tạo được đơn thanh toán.')
    } finally {
      setBusyPlan('')
      setMethodLoading(false)
    }
  }

  async function handleSwitchMethod(newMethod) {
    if (!selectedPlan || newMethod === selectedMethod || methodLoading) return
    setSelectedMethod(newMethod)
    setMethodLoading(true)
    setCheckoutError('')
    setViewMode(newMethod === 'stripe' ? 'gateway' : 'qr')
    try {
      const response = await api.createBillingCheckout(selectedPlan.code, newMethod)
      if (!response?.success) {
        setCheckoutError(response?.message || `Cổng thanh toán ${newMethod.toUpperCase()} chưa khả dụng.`)
      } else {
        setPayment(response.payment)
        if (newMethod === 'stripe' && response.payment?.payment_url) {
          window.open(response.payment.payment_url, '_blank', 'noopener,noreferrer')
        }
      }
    } catch (err) {
      setCheckoutError(err?.message || `Không tạo được đơn thanh toán qua ${newMethod.toUpperCase()}.`)
    } finally {
      setMethodLoading(false)
    }
  }

  async function handleManualSync() {
    if (!payment?.order_code || checkingStatus) return
    setCheckingStatus(true)
    try {
      const res = await api.syncPaymentStatus(payment.order_code)
      if (res?.payment) {
        setPayment(res.payment)
        if (res.payment.status === 'PAID') {
          load()
          notifyPaymentCompleted({
            status: 'PAID',
            order_code: res.payment.order_code,
            plan_code: res.payment.plan_code,
          })
        }
      }
    } catch (err) {
      console.warn('Manual sync error:', err)
    } finally {
      setCheckingStatus(false)
    }
  }

  function copyToClipboard(key, text) {
    if (!text) return
    navigator.clipboard.writeText(String(text).trim()).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(''), 2000)
    }).catch(() => {})
  }

  function closeModal() {
    setSelectedPlan(null)
    setPayment(null)
    setCheckoutError('')
    setCheckingStatus(false)
  }

  const activeMethodObj = paymentMethods.find(m => m.code === (payment?.provider || payment?.payment_method || selectedMethod))
  const activeMethodName = activeMethodObj?.name || (selectedMethod === 'momo' ? 'MoMo' : selectedMethod === 'zalopay' ? 'ZaloPay' : selectedMethod === 'stripe' ? 'Stripe' : 'VietQR')

  if (loading) return <div className="cv-page-loading"><div className="cv-spinner" /></div>

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="cv-eyebrow">Workspace & subscription</div>
          <h1 className="cv-page-title">Gói nhân sự</h1>
          <p className="cv-page-subtitle">Quản lý hạn mức nhân viên, khuôn mặt và thanh toán theo workspace.</p>
        </div>
        <div className="cv-badge cv-badge-success"><ShieldCheck size={14} /> Đang bảo vệ quota backend</div>
      </div>

      {error && <div className="cv-alert cv-alert-danger">{error}</div>}

      {summary && (
        <div className="cv-card grid gap-5 p-5 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--cv-text-tertiary)' }}>Gói hiện tại</div>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-2xl font-black" style={{ color: 'var(--cv-text-primary)', fontFamily: 'var(--cv-font-heading)' }}>
                {summary.plan.name}
              </span>
              <span className="cv-badge cv-badge-info">{summary.subscription?.status}</span>
            </div>
            <div className="mt-1 text-sm" style={{ color: 'var(--cv-text-secondary)' }}>
              Hết hạn: {summary.subscription?.ends_at ? new Date(summary.subscription.ends_at).toLocaleDateString('vi-VN') : 'Theo hợp đồng'}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span><UsersRound size={15} className="mr-2 inline" />Nhân viên</span>
              <strong>{usage.employees || 0} / {summary.plan.max_employees ?? '∞'}</strong>
            </div>
            <div className="cv-progress mt-3"><span style={{ width: `${usagePercent}%` }} /></div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span><CreditCard size={15} className="mr-2 inline" />Khuôn mặt</span>
              <strong>{usage.face_templates || 0} / {summary.plan.max_face_templates ?? '∞'}</strong>
            </div>
            <div className="mt-3 text-sm" style={{ color: 'var(--cv-text-secondary)' }}>Gói được kiểm tra ở server cho mọi request.</div>
          </div>
        </div>
      )}

      {/* Danh sách các gói dịch vụ */}
      <div className="grid gap-4 xl:grid-cols-5">
        {plans.map(plan => {
          const current = activeCode === plan.code
          return (
            <article key={plan.code} className={`cv-card relative flex flex-col p-5 ${current ? 'cv-card-highlight' : ''}`}>
              {current && <span className="absolute right-4 top-4 cv-badge cv-badge-success">Đang dùng</span>}
              <div className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--cv-text-brand)' }}>{plan.name}</div>
              <div className="mt-3 text-2xl font-black" style={{ color: 'var(--cv-text-primary)', fontFamily: 'var(--cv-font-heading)' }}>
                {plan.contact_only ? 'Liên hệ' : plan.monthly_price_vnd === 0 ? 'Miễn phí' : `${money(plan.monthly_price_vnd)} / tháng`}
              </div>
              <div className="mt-4 flex-1 space-y-2 text-sm" style={{ color: 'var(--cv-text-secondary)' }}>
                <div><Check size={15} className="mr-2 inline text-emerald-600" />{plan.max_employees ?? 'Không giới hạn'} nhân viên</div>
                <div><Check size={15} className="mr-2 inline text-emerald-600" />{plan.max_face_templates ?? 'Không giới hạn'} khuôn mặt</div>
                <div><Check size={15} className="mr-2 inline text-emerald-600" />Ghi nhận quét mặt tự động</div>
              </div>
              {plan.contact_only ? (
                <a
                  href={BILLING_CONTACT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cv-btn cv-btn-secondary mt-6 w-full justify-center gap-1.5 font-bold"
                  title="Mở website Covasol (covasol.com.vn)"
                >
                  <span>Liên hệ tư vấn</span>
                  <ExternalLink size={14} />
                </a>
              ) : (
                <button
                  disabled={current || busyPlan === plan.code}
                  onClick={() => buy(plan)}
                  className={`cv-btn mt-6 w-full justify-center font-bold ${current ? 'cv-btn-secondary' : 'cv-btn-primary'}`}
                >
                  {busyPlan === plan.code ? 'Đang tạo đơn...' : current ? 'Gói hiện tại' : 'Chọn gói'}
                </button>
              )}
            </article>
          )
        })}
      </div>

      {/* Banner Liên hệ tư vấn Covasol */}
      <div className="cv-card p-5 flex flex-col sm:flex-row items-center justify-between gap-4 border border-indigo-100 dark:border-indigo-900/50 bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-transparent dark:from-indigo-950/30 dark:via-purple-950/20">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 justify-center sm:justify-start">
            <Globe size={16} className="text-indigo-600 dark:text-indigo-400" />
            Cần giải pháp riêng hoặc tư vấn gói doanh nghiệp lớn?
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Đội ngũ chuyên gia Covasol luôn sẵn sàng hỗ trợ khảo sát, tư vấn tích hợp phần cứng và tùy biến tính năng.
          </p>
        </div>
        <a
          href={BILLING_CONTACT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="cv-btn cv-btn-primary shrink-0 gap-2 text-xs font-bold shadow-md"
          title="Mở website Covasol (covasol.com.vn)"
        >
          <span>Liên hệ Covasol</span>
          <ExternalLink size={13} />
        </a>
      </div>

      {/* MODAL THANH TOÁN (Sử dụng createPortal gắn vào document.body để không bao giờ bị cắt top hay ẩn trong container) */}
      {(selectedPlan || payment) && createPortal(
        <div className="cv-modal-backdrop" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="cv-modal w-full max-w-lg shadow-2xl relative my-auto">
            <button
              className="cv-modal-close"
              onClick={closeModal}
              aria-label="Đóng cửa sổ"
              title="Đóng cửa sổ (Esc)"
            >
              <X size={20} />
            </button>

            {payment?.status === 'PAID' ? (
              <div className="py-8 text-center animate-in zoom-in-95 duration-200">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shadow-inner">
                  <Check size={32} />
                </div>
                <h2 className="mt-4 text-2xl font-black text-slate-900 dark:text-white">Thanh toán thành công!</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Gói <strong className="text-emerald-600 uppercase">{payment.plan_code}</strong> đã được kích hoạt thành công cho workspace của bạn.
                </p>
                <div className="mt-6 flex justify-center">
                  <button className="cv-btn cv-btn-primary px-8 py-2.5 font-bold shadow-md" onClick={closeModal}>
                    Bắt đầu sử dụng
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Header Modal */}
                <div className="flex items-center gap-3 pr-8 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
                    <QrCode size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white truncate">
                      Thanh toán gói {selectedPlan?.name || payment?.plan_code}
                    </h2>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {payment?.order_code ? (
                        <>Mã đơn: <strong className="font-mono text-indigo-600 dark:text-indigo-400">{payment.order_code}</strong></>
                      ) : (
                        'Chọn phương thức thanh toán phù hợp'
                      )}
                    </p>
                  </div>
                </div>

                {/* Danh sách 4 cổng thanh toán */}
                <div className="mt-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-2 text-slate-400">
                    Phương thức thanh toán ({paymentMethods.length} cổng khả dụng)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {paymentMethods.map(m => {
                      const isSelected = selectedMethod === m.code
                      return (
                        <button
                          key={m.code}
                          type="button"
                          disabled={methodLoading}
                          onClick={() => handleSwitchMethod(m.code)}
                          className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold shadow-sm ring-2 ring-indigo-500/20'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                          }`}
                        >
                          <div className="mb-1">
                            {m.code === 'momo' ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-black bg-pink-100 text-pink-700">MoMo</span>
                            ) : m.code === 'zalopay' ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-black bg-sky-100 text-sky-700">ZaloPay</span>
                            ) : m.code === 'stripe' ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-black bg-indigo-100 text-indigo-700">Stripe</span>
                            ) : (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-black bg-emerald-100 text-emerald-700">VietQR</span>
                            )}
                          </div>
                          <span className="text-xs font-semibold leading-tight">{m.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {checkoutError && (
                  <div className="cv-alert cv-alert-danger mt-3 text-xs">
                    {checkoutError}
                  </div>
                )}

                {methodLoading ? (
                  <div className="my-10 text-center space-y-3">
                    <div className="cv-spinner mx-auto" />
                    <p className="text-xs text-slate-500">Đang khởi tạo giao dịch qua {activeMethodName}...</p>
                  </div>
                ) : payment ? (
                  <>
                    {/* View Mode Toggle: Luôn hiển thị cho cả 4 phương thức */}
                    <div className="mt-4 flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 text-xs font-semibold border border-slate-200/60 dark:border-slate-700/60">
                      <button
                        type="button"
                        onClick={() => setViewMode('qr')}
                        className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          viewMode === 'qr'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-bold'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        <QrCode size={14} /> Quét mã QR trực tiếp
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('gateway')}
                        className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          viewMode === 'gateway'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-bold'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        <Globe size={14} />
                        {selectedMethod === 'vietqr' ? 'Chuyển khoản trực tiếp' : 'Cổng thanh toán trực tiếp'}
                      </button>
                    </div>

                    {/* NỘI DUNG THEO TAB */}
                    {viewMode === 'gateway' ? (
                      /* TAB 2: CỔNG THANH TOÁN TRỰC TIẾP / CHUYỂN KHOẢN TRỰC TIẾP */
                      <div className="my-4 space-y-3">
                        {/* 1. STRIPE CHECKOUT CARD */}
                        {selectedMethod === 'stripe' && (
                          <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-b from-indigo-50/60 to-white dark:from-indigo-950/30 dark:to-slate-900 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-black bg-[#635BFF] text-white">STRIPE</span>
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Cổng thanh toán thẻ quốc tế</span>
                              </div>
                              <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                                <Lock size={12} /> Bảo mật SSL 256-bit
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              Hỗ trợ thẻ Visa, Mastercard, JCB, American Express, Apple Pay và Google Pay. Stripe mở trong cửa sổ bảo mật riêng của Stripe.
                            </p>

                            {payment.payment_url ? (
                              <div className="space-y-2 pt-1">
                                <a
                                  href={payment.payment_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="cv-btn w-full justify-center py-3 text-sm font-bold text-white bg-[#635BFF] hover:bg-[#5851EA] active:bg-[#4E47D6] rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2.5 transition-all hover:scale-[1.01]"
                                >
                                  <CreditCard size={18} />
                                  <span>Mở trang thanh toán Stripe Checkout</span>
                                  <ExternalLink size={15} />
                                </a>

                                <button
                                  type="button"
                                  onClick={handleManualSync}
                                  disabled={checkingStatus}
                                  className="cv-btn cv-btn-secondary w-full justify-center text-xs py-2 font-semibold gap-1.5 cursor-pointer"
                                >
                                  <RefreshCw size={13} className={checkingStatus ? 'animate-spin' : ''} />
                                  <span>{checkingStatus ? 'Đang kiểm tra Stripe...' : 'Đã thanh toán trên Stripe, kiểm tra ngay'}</span>
                                </button>
                              </div>
                            ) : (
                              <div className="cv-alert cv-alert-warning text-xs">
                                Đang tải đường dẫn thanh toán Stripe...
                              </div>
                            )}
                          </div>
                        )}

                        {/* 2. VIETQR DIRECT BANK TRANSFER DETAILS CARD */}
                        {selectedMethod === 'vietqr' && (
                          <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">
                                Thông tin chuyển khoản ngân hàng
                              </span>
                              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                Tự động xác nhận qua SePay
                              </span>
                            </div>

                            <div className="space-y-2 text-xs">
                              <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                                <span className="text-slate-500">Ngân hàng:</span>
                                <div className="flex items-center gap-2">
                                  <strong className="font-bold text-slate-800 dark:text-white">
                                    {payment.bank_code || 'MB Bank (Ngân hàng Quân Đội)'}
                                  </strong>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard('bank', payment.bank_code || 'MB')}
                                    className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                                    title="Sao chép tên ngân hàng"
                                  >
                                    {copiedKey === 'bank' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                                <span className="text-slate-500">Số tài khoản:</span>
                                <div className="flex items-center gap-2">
                                  <strong className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                    {payment.bank_account || '0987654321'}
                                  </strong>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard('acc', payment.bank_account || '0987654321')}
                                    className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                                    title="Sao chép số tài khoản"
                                  >
                                    {copiedKey === 'acc' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                                <span className="text-slate-500">Chủ tài khoản:</span>
                                <strong className="font-bold text-slate-800 dark:text-white uppercase">
                                  {payment.account_name || 'CONG TY TNHH COVASOL'}
                                </strong>
                              </div>

                              <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                                <span className="text-slate-500">Số tiền:</span>
                                <div className="flex items-center gap-2">
                                  <strong className="font-bold text-rose-600 text-sm">
                                    {money(payment.amount_vnd)}
                                  </strong>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard('amt', payment.amount_vnd)}
                                    className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                                    title="Sao chép số tiền"
                                  >
                                    {copiedKey === 'amt' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/80">
                                <div className="space-y-0.5">
                                  <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">Nội dung chuyển khoản (bắt buộc):</span>
                                  <div className="font-mono text-sm font-black text-slate-900 dark:text-white">
                                    {payment.order_code}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard('des', payment.order_code)}
                                  className="cv-btn cv-btn-sm cv-btn-primary text-xs font-bold gap-1 py-1 px-2.5"
                                >
                                  {copiedKey === 'des' ? <Check size={12} /> : <Copy size={12} />}
                                  <span>{copiedKey === 'des' ? 'Đã sao chép' : 'Sao chép mã'}</span>
                                </button>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={handleManualSync}
                              disabled={checkingStatus}
                              className="cv-btn cv-btn-primary w-full justify-center text-xs py-2 font-bold gap-1.5 cursor-pointer mt-1"
                            >
                              <RefreshCw size={13} className={checkingStatus ? 'animate-spin' : ''} />
                              <span>{checkingStatus ? 'Đang kiểm tra giao dịch...' : 'Tôi đã chuyển khoản, kiểm tra ngay'}</span>
                            </button>
                          </div>
                        )}

                        {/* 3. MOMO & ZALOPAY DIRECT GATEWAY CARD */}
                        {(selectedMethod === 'momo' || selectedMethod === 'zalopay') && (
                          <div className="space-y-3">
                            {payment.payment_url && (
                              <div className="space-y-2">
                                <a
                                  href={payment.payment_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`cv-btn w-full justify-center py-2.5 text-xs font-bold text-white shadow-md flex items-center gap-2 ${
                                    selectedMethod === 'momo'
                                      ? 'bg-pink-600 hover:bg-pink-700'
                                      : 'bg-sky-600 hover:bg-sky-700'
                                  }`}
                                >
                                  <Globe size={15} />
                                  <span>Mở cổng thanh toán {activeMethodName} trong tab mới</span>
                                  <ExternalLink size={14} />
                                </a>

                                <div className="rounded-xl border overflow-hidden bg-white shadow-sm">
                                  <iframe
                                    src={payment.payment_url}
                                    title={`Cổng thanh toán ${activeMethodName}`}
                                    className="w-full h-[360px] border-0"
                                  />
                                </div>

                                <button
                                  type="button"
                                  onClick={handleManualSync}
                                  disabled={checkingStatus}
                                  className="cv-btn cv-btn-secondary w-full justify-center text-xs py-2 font-semibold gap-1.5 cursor-pointer"
                                >
                                  <RefreshCw size={13} className={checkingStatus ? 'animate-spin' : ''} />
                                  <span>{checkingStatus ? 'Đang kiểm tra...' : `Kiểm tra trạng thái ${activeMethodName} ngay`}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* TAB 1: QUÉT MÃ QR TRỰC TIẾP */
                      <div className="my-4 text-center">
                        {qrDataUrl ? (
                          <div className="inline-block p-3 rounded-2xl border bg-white shadow-sm">
                            <img
                              src={qrDataUrl}
                              alt={`QR thanh toán ${activeMethodName}`}
                              className="mx-auto h-52 w-52 object-contain"
                            />
                            {selectedMethod === 'stripe' ? (
                              <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-indigo-700">
                                <CreditCard size={13} /> Quét để thanh toán thẻ Visa / Mastercard / JCB
                              </div>
                            ) : (
                              <p className="text-[11px] mt-1.5 text-slate-500 font-medium">
                                Quét mã bằng App Ngân hàng hoặc ứng dụng {activeMethodName}
                              </p>
                            )}
                          </div>
                        ) : selectedMethod === 'vietqr' ? (
                          <div className="cv-alert cv-alert-warning text-xs">
                            Backend chưa cấu hình `VIETQR_BANK_ACCOUNT` / `SEPAY_BANK_ACCOUNT` và `SEPAY_BANK_CODE`.
                          </div>
                        ) : (
                          <div className="cv-alert cv-alert-warning text-xs">
                            Đang chuẩn bị mã QR thanh toán...
                          </div>
                        )}

                        {payment.payment_url && (
                          <div className="mt-2.5">
                            <a
                              href={payment.payment_url}
                              target="_blank"
                              rel="noreferrer"
                              className="cv-btn cv-btn-secondary w-full justify-center gap-2 text-xs font-semibold py-2"
                            >
                              <span>Mở cổng thanh toán {activeMethodName} trong tab mới</span>
                              <ExternalLink size={13} />
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Thanh trạng thái kiểm tra tự động & nút kiểm tra thủ công */}
                    <div className="cv-alert cv-alert-info text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                        <span>Đang đợi {activeMethodName} xác nhận. Hệ thống tự động kiểm tra và kích hoạt gói ngay khi nhận thanh toán.</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleManualSync}
                        disabled={checkingStatus}
                        className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shrink-0 cursor-pointer flex items-center gap-1"
                        title="Kiểm tra trạng thái thanh toán ngay"
                      >
                        <RefreshCw size={11} className={checkingStatus ? 'animate-spin' : ''} />
                        <span>Kiểm tra</span>
                      </button>
                    </div>

                    {/* Số tiền thanh toán */}
                    <div className="mt-3 flex items-center justify-between text-sm pt-3 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500 text-xs font-medium">Tổng tiền thanh toán</span>
                      <strong className="text-lg font-black text-rose-600">{money(payment.amount_vnd)}</strong>
                    </div>

                    {selectedMethod === 'vietqr' && (
                      <a
                        className="cv-btn cv-btn-ghost mt-2 w-full justify-center text-xs text-slate-400 hover:text-slate-600"
                        href="https://vietqr.net"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Hướng dẫn thanh toán VietQR <ExternalLink size={12} />
                      </a>
                    )}
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
