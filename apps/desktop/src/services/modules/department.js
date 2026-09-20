import { request } from '../request'

export const departmentApi = {
  listDepartments: () => request('/api/v1/departments'),
  saveDepartment: payload => request('/api/v1/departments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  }),
  deleteDepartment: departmentId => request(`/api/v1/departments/${encodeURIComponent(departmentId)}`, {
    method: 'DELETE',
  }),

  listPositions: () => request('/api/v1/positions'),
  savePosition: payload => request('/api/v1/positions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  }),
  deletePosition: positionId => request(`/api/v1/positions/${encodeURIComponent(positionId)}`, {
    method: 'DELETE',
  }),
}
