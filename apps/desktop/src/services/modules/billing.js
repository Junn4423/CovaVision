import { request } from '../request'

export const billingApi = {
  getBillingPlans: () => request('/api/v1/billing/plans'),
  getBillingSummary: () => request('/api/v1/billing/me'),
  getPaymentMethods: () => request('/api/v1/billing/payment-methods'),
  createBillingCheckout: (planCode, paymentMethod = 'vietqr') => request('/api/v1/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_code: planCode, payment_method: paymentMethod }),
  }),
  getPaymentStatus: orderCode => request(`/api/v1/billing/payments/${encodeURIComponent(orderCode)}`),
  syncPaymentStatus: orderCode => request(`/api/v1/billing/payments/${encodeURIComponent(orderCode)}/sync`, {
    method: 'POST',
  }),
  syncPaymentSession: (payload = {}) => request('/api/v1/billing/sync-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
}
