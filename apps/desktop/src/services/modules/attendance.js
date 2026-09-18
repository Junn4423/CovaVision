/** Attendance recognition and reports. */
import { request, requestBlob } from '../request'

function buildQuery(input) {
  const params = new URLSearchParams()
  const source = typeof input === 'string' ? { date: input } : (input || {})
  for (const [key, value] of Object.entries(source)) {
    if (value == null || String(value).trim() === '') continue
    params.set(key, String(value).trim())
  }
  return params.toString()
}

function recognize(path, payload, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData
  return request(path, {
    method: 'POST',
    ...(isFormData ? {} : { headers: { 'Content-Type': 'application/json' } }),
    body: isFormData ? payload : JSON.stringify(payload || {}),
    ...options,
  })
}

export const attendanceApi = {
  checkAttendance: (employeeId, location = null, attendanceType = 'checkin', options = null) => (
    request('/api/v1/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employeeId, location, attendance_type: attendanceType, ...(options || {}) }),
    })
  ),

  attendanceImage: formData => recognize('/api/v1/attendance/recognize', formData),
  attendanceImageBase64: data => recognize('/api/v1/attendance/recognize', data),
  employeeAttendanceImage: formData => recognize('/api/v1/attendance/recognize', formData),
  employeeAttendanceImageBase64: data => recognize('/api/v1/attendance/recognize', data),
  employeeAttendanceDetectFrame: data => recognize('/api/v1/attendance/detect', data),
  employeeAttendanceDetectImage: formData => recognize('/api/v1/attendance/detect', formData),
  attendanceDetectFrame: data => recognize('/api/v1/attendance/detect', data),
  attendanceDetectImage: formData => recognize('/api/v1/attendance/detect', formData),

  getEmployeeAttendanceHistory: filters => {
    const query = buildQuery(filters)
    return request(`/api/v1/attendance/records${query ? `?${query}` : ''}`)
  },
  getEmployeeAttendanceSettings: () => request('/api/v1/settings/attendance'),
  attendanceSyncStatus: id => request(`/api/v1/attendance/${encodeURIComponent(id)}`),
  getStats: () => request('/api/v1/attendance/stats'),
  getSystemStorageStats: () => request('/api/v1/system/storage'),
  getRecentActivity: () => request('/api/v1/attendance/recent'),
  getTodayAttendance: () => request('/api/v1/attendance/today'),
  getReport: filters => {
    const query = buildQuery(filters)
    return request(`/api/v1/reports/attendance${query ? `?${query}` : ''}`)
  },
  getOnlineAttendance: filters => {
    const query = buildQuery(filters)
    return request(`/api/v1/reports/attendance/online${query ? `?${query}` : ''}`)
  },
  exportReportExcel: filters => {
    const query = buildQuery(filters)
    return requestBlob(`/api/v1/reports/attendance/export${query ? `?${query}` : ''}`)
  },
  syncAttendance: payload => request('/api/v1/attendance/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  }),
}

// Compatibility aliases are local CovaVision actions; they do not contact another system.
attendanceApi.attendanceErpSyncStatus = attendanceApi.attendanceSyncStatus
attendanceApi.pushReportToErp = attendanceApi.syncAttendance
attendanceApi.pushAttendanceToErp = attendanceApi.syncAttendance
export const pushAttendanceToErp = attendanceApi.syncAttendance

