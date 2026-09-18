import {
  clearAuthState, clearSessionToken, getApiBaseUrl, getAuthData, getSessionToken,
  request, requestBlob, setApiBaseUrl, setFallbackApiBaseUrl, setAuthData,
  setSessionToken, setUnauthorizedListener,
} from './request';
import {faceRecognitionApi} from './api/faceRecognition';
import {serverAuthApi} from './api/serverAuth';

function queryString(input: string | Record<string, unknown> = ''): string {
  const params = new URLSearchParams();
  const source = typeof input === 'string' ? {date: input} : input || {};
  Object.entries(source).forEach(([key, value]) => {
    if (value != null && String(value).trim()) params.set(key, String(value).trim());
  });
  return params.toString();
}

function formOrJson(path: string, payload: FormData | Record<string, unknown>) {
  const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
  return request(path, {
    method: 'POST',
    ...(isFormData ? {} : {headers: {'Content-Type': 'application/json'}}),
    body: isFormData ? payload : JSON.stringify(payload),
  });
}

export {
  clearAuthState, clearSessionToken, getApiBaseUrl, getAuthData, getSessionToken,
  setApiBaseUrl, setFallbackApiBaseUrl, setAuthData, setSessionToken,
  setUnauthorizedListener,
};

export const api: any = {
  health: () => request('/health'),
  ...serverAuthApi,
  ...faceRecognitionApi,

  register: (formData: FormData) => formOrJson('/api/v1/employees/face', formData),
  registerBase64: (data: Record<string, unknown>) => formOrJson('/api/v1/employees/face', data),
  registerEmployee: (employeeId: string, employee?: Record<string, unknown>) => request('/api/v1/employees', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({employee_id: employeeId, ...(employee || {})}),
  }),

  startCamera: (data: Record<string, unknown>) => request('/api/v1/cameras/start', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data),
  }),
  stopCamera: () => request('/api/v1/cameras/stop', {method: 'POST'}),
  cameraStatus: (cameraId?: string) => request(`/api/v1/cameras/status${cameraId ? `?camera_id=${encodeURIComponent(cameraId)}` : ''}`),
  cameraSnapshot: (cameraId?: string) => request(`/api/v1/cameras/snapshot${cameraId ? `?camera_id=${encodeURIComponent(cameraId)}` : ''}`),
  getCameras: () => request('/api/v1/cameras'),
  saveCamera: (camera: Record<string, unknown>) => request('/api/v1/cameras', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(camera),
  }),
  deleteCamera: (cameraId: string) => request(`/api/v1/cameras/${encodeURIComponent(cameraId)}`, {method: 'DELETE'}),
  speakCamera: (cameraId: string, payload: Record<string, unknown> = {}) => request(`/api/v1/cameras/${encodeURIComponent(cameraId)}/speak`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
  }),

  getEmployeeAttendanceHistory: (filters: Record<string, unknown> = {}) => {
    const query = queryString(filters);
    return request(`/api/v1/attendance/records${query ? `?${query}` : ''}`);
  },
  getEmployeeAttendanceSettings: () => request('/api/v1/settings/attendance'),
  getStats: () => request('/api/v1/attendance/stats'),
  getSystemStorageStats: () => request('/api/v1/system/storage'),
  getRecentActivity: () => request('/api/v1/attendance/recent'),
  getTodayAttendance: () => request('/api/v1/attendance/today'),
  getReport: (filters: string | Record<string, unknown>) => {
    const query = queryString(filters);
    return request(`/api/v1/reports/attendance${query ? `?${query}` : ''}`);
  },
  getOnlineAttendance: (filters: string | Record<string, unknown>) => {
    const query = queryString(filters);
    return request(`/api/v1/reports/attendance/online${query ? `?${query}` : ''}`);
  },
  exportReportExcel: (filters: string | Record<string, unknown>) => {
    const query = queryString(filters);
    return requestBlob(`/api/v1/reports/attendance/export${query ? `?${query}` : ''}`);
  },
  syncAttendance: (payload: Record<string, unknown>) => request('/api/v1/attendance/sync', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
  }),

  getEmployees: () => request('/api/v1/employees'),
  getAdminEmployees: (params?: Record<string, unknown>) => {
    const query = params ? queryString(params) : '';
    return request(`/api/v1/employees${query ? `?${query}` : ''}`);
  },
  getEmployee: (employeeId: string) => request(`/api/v1/employees/${encodeURIComponent(employeeId)}`),
  getAdminEmployeeImage: (employeeId: string) => request(`/api/v1/employees/${encodeURIComponent(employeeId)}/image`),
  updateFace: (formData: FormData) => formOrJson('/api/v1/employees/face', formData),
  updateFaceBase64: (data: Record<string, unknown>) => formOrJson('/api/v1/employees/face', data),
  deleteEmployee: (employeeId: string) => request(`/api/v1/employees/${encodeURIComponent(employeeId)}`, {method: 'DELETE'}),
  clearFace: (employeeId: string) => request(`/api/v1/employees/${encodeURIComponent(employeeId)}/face`, {method: 'DELETE'}),
  getEmployeeAccounts: () => request('/api/v1/accounts'),
  pullEmployeeAccounts: (payload: Record<string, unknown> = {}) => request('/api/v1/accounts/import', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
  }),
  upsertEmployeeAccount: (payload: Record<string, unknown> = {}) => request('/api/v1/accounts', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
  }),
  resetEmployeeAccountPassword: (accountId: string, password: string) => request(`/api/v1/accounts/${encodeURIComponent(accountId)}/password`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password}),
  }),
  setEmployeeAccountLock: (accountId: string, isLocked: boolean) => request(`/api/v1/accounts/${encodeURIComponent(accountId)}/lock`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({is_locked: isLocked}),
  }),

  getLocationState: () => request('/api/v1/location'),
  updateLocationState: (payload: Record<string, unknown>) => request('/api/v1/location', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
  }),
  getSystemSettings: () => request('/api/v1/settings'),
  saveSystemSettings: (payload: Record<string, unknown>) => request('/api/v1/settings', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
  }),
  getMobileConfigSettings: () => request('/api/v1/settings/mobile'),
  saveMobileConfigSettings: (payload: Record<string, unknown>) => request('/api/v1/settings/mobile', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
  }),
};
