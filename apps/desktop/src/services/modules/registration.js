/** Face registration for an employee. */
import { request } from '../request'

export const registrationApi = {
  register: formData => request('/api/v1/employees/face', { method: 'POST', body: formData, timeout: 60000 }),
  registerBase64: data => request('/api/v1/employees/face', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}), timeout: 60000,
  }),
  registerEmployee: (employeeId, employee) => request('/api/v1/employees', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: employeeId, ...(employee || {}) }),
  }),
}

// Kept as a local alias for copied screens during the migration.
registrationApi.registerFromErp = registrationApi.registerEmployee

