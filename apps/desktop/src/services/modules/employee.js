/** Employee and face-template management backed by CovaVision. */
import { request } from '../request'
import { normalizeEmployeeImageUri, resolveEmployeeAvatar } from '../../utils/avatarUtils'

function buildQuery(params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params || {})) {
    if (value != null && String(value).trim()) query.set(key, String(value).trim())
  }
  return query.toString()
}

function normalizeEmployee(employee) {
  const image = resolveEmployeeAvatar(employee, 'local')
  return {
    ...employee,
    image_url: image || employee?.image_url || '',
    local_image_url: image || employee?.local_image_url || '',
  }
}

async function getEmployees(params = {}) {
  const query = buildQuery(params)
  const response = await request(`/api/v1/employees${query ? `?${query}` : ''}`, { timeout: 30000 })
  return response?.employees && Array.isArray(response.employees)
    ? { ...response, employees: response.employees.map(normalizeEmployee) }
    : response
}

function faceRequest(path, payload, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData
  return request(path, {
    method: 'POST',
    ...(isFormData ? {} : { headers: { 'Content-Type': 'application/json' } }),
    body: isFormData ? payload : JSON.stringify(payload || {}),
    ...options,
  })
}

export const employeeApi = {
  getEmployees: () => getEmployees(),
  getAdminEmployees: params => getEmployees(params),
  getEmployeeRoster: () => getEmployees(),
  getEmployee: employeeId => request(`/api/v1/employees/${encodeURIComponent(employeeId)}`),
  getAdminEmployeeImage: employeeId => request(`/api/v1/employees/${encodeURIComponent(employeeId)}/image`),
  updateFace: formData => faceRequest('/api/v1/employees/face', formData, { timeout: 60000 }),
  updateFaceBase64: data => faceRequest('/api/v1/employees/face', data, { timeout: 60000 }),
  deleteEmployee: userId => request(`/api/v1/employees/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  clearFace: userId => request(`/api/v1/employees/${encodeURIComponent(userId)}/face`, { method: 'DELETE' }),
  getEmployeeAccounts: () => request('/api/v1/accounts'),
  pullEmployeeAccounts: payload => request('/api/v1/accounts/import', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}),
  }),
  upsertEmployeeAccount: payload => request('/api/v1/accounts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}),
  }),
  resetEmployeeAccountPassword: (accountId, newPassword) => request(`/api/v1/accounts/${encodeURIComponent(accountId)}/password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: newPassword }),
  }),
  setEmployeeAccountLock: (accountId, isLocked) => request(`/api/v1/accounts/${encodeURIComponent(accountId)}/lock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_locked: Boolean(isLocked) }),
  }),
}

// Temporary UI aliases while the copied screens are migrated to CovaVision names.
employeeApi.getErpEmployees = employeeApi.getEmployees
employeeApi.getSyncCompare = () => request('/api/v1/employees/compare')
employeeApi.importAllFromErp = payload => request('/api/v1/employees/import', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}), timeout: 60000,
})
employeeApi.getErpEmployeeInfo = employeeApi.getEmployee
employeeApi.reloadFromErp = employeeId => employeeApi.getEmployee(employeeId)
employeeApi.pushToErp = employeeId => request(`/api/v1/employees/${encodeURIComponent(employeeId)}`, { method: 'PATCH' })

