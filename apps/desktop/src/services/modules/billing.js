import { request } from '../request'

export const billingApi = {
  getBillingPlans: () => request('/api/v1/billing/plans'),
  getBillingSummary: () => request('/api/v1/billing/me'),
  createBillingCheckout: planCode => request('/api/v1/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_code: planCode }),
  }),
  getPaymentStatus: orderCode => request(`/api/v1/billing/payments/${encodeURIComponent(orderCode)}`),
}
