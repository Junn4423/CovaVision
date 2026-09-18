import {
  clearAuthState,
  clearSessionToken,
  getGatewayAuth,
  getSessionToken,
  request,
  setGatewayAuth,
  setSessionToken,
  SESSION_EXPIRED_EVENT,
} from './request'
import { authApi } from './modules/auth'
import { registrationApi } from './modules/registration'
import { cameraApi } from './modules/camera'
import { attendanceApi, pushAttendanceToErp } from './modules/attendance'
import { employeeApi } from './modules/employee'
import { locationApi } from './modules/location'
import { systemSettingsApi } from './modules/systemSettings'

export {
  clearAuthState,
  clearSessionToken,
  getGatewayAuth,
  getSessionToken,
  request,
  setGatewayAuth,
  setSessionToken,
  SESSION_EXPIRED_EVENT,
  pushAttendanceToErp,
}

export const api = {
  health: () => request('/health'),
  ...authApi,
  employeeSession: () => request('/api/v1/auth/me'),
  ...registrationApi,
  ...cameraApi,
  ...attendanceApi,
  ...employeeApi,
  ...locationApi,
  ...systemSettingsApi,
  getAccounts: () => request('/api/v1/accounts'),
}

