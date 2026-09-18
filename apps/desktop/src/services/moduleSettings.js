import { ROUTES } from '../config/routes'

export const MODULE_SETTINGS_STORAGE_KEY = 'facecheck.module_visibility.v1'
export const MODULE_SETTINGS_EVENT = 'facecheck:module-settings-changed'

export const MODULE_TOGGLE_KEYS = Object.freeze({
  attendance: 'attendance',
  cameraManagement: 'camera_management',
  onlineSync: 'online_sync',
  syncVerify: 'sync_verify',
  offlineManage: 'offline_manage',
  report: 'report',
  onlineAttendanceCheck: 'online_attendance_check',
  accountManagement: 'account_management',
  deviceData: 'device_data',
})

export const MODULE_TOGGLE_DEFINITIONS = Object.freeze([
  {
    key: MODULE_TOGGLE_KEYS.attendance,
    label: 'Chấm công AI toàn diện',
    path: ROUTES.attendance,
    description: 'Chấm công nhận diện khuôn mặt tự động, phát hiện người thật.',
  },
  {
    key: MODULE_TOGGLE_KEYS.offlineManage,
    label: 'Nhân viên & Khuôn mặt',
    path: ROUTES.offlineManage,
    description: 'Quản lý danh sách nhân sự, dữ liệu khuôn mặt offline.',
  },
  {
    key: MODULE_TOGGLE_KEYS.onlineSync,
    label: 'Tải dữ liệu từ ERP',
    path: ROUTES.onlineSync,
    description: 'Tải và đăng ký dữ liệu nhân sự từ hệ thống ERP.',
  },
  {
    key: MODULE_TOGGLE_KEYS.syncVerify,
    label: 'Đối soát & Đồng bộ ERP',
    path: ROUTES.syncVerify,
    description: 'Đối soát & so sánh dữ liệu giữa ERP với hệ thống.',
  },
  {
    key: MODULE_TOGGLE_KEYS.accountManagement,
    label: 'Tài khoản & Phân quyền',
    path: ROUTES.accountManagement,
    description: 'Quản lý tài khoản đăng nhập nội bộ, phân quyền nhân viên.',
  },
  {
    key: MODULE_TOGGLE_KEYS.report,
    label: 'Báo cáo chấm công nội bộ',
    path: ROUTES.report,
    description: 'Báo cáo lịch sử chấm công, xuất file Excel nội bộ.',
  },
  {
    key: MODULE_TOGGLE_KEYS.onlineAttendanceCheck,
    label: 'Báo cáo đã đồng bộ ERP',
    path: ROUTES.onlineAttendanceCheck,
    description: 'Báo cáo & đối soát các lượt chấm công đã đồng bộ lên ERP.',
  },
  {
    key: MODULE_TOGGLE_KEYS.deviceData,
    label: 'Dữ liệu bộ nhớ thiết bị',
    path: ROUTES.deviceData,
    description: 'Quản lý bộ nhớ đệm thiết bị, hàng chờ chấm công offline và đồng bộ ERP.',
  },
  {
    key: MODULE_TOGGLE_KEYS.cameraManagement,
    label: 'Quản lý Camera RTSP',
    path: ROUTES.cameraManagement,
    description: 'Quản lý kết nối camera RTSP, camera nội bộ LAN.',
  },
])

const DEFAULT_VISIBILITY = MODULE_TOGGLE_DEFINITIONS.reduce((accumulator, moduleDef) => {
  accumulator[moduleDef.key] = true
  return accumulator
}, {})

export const DEFAULT_MODULE_VISIBILITY = Object.freeze(DEFAULT_VISIBILITY)

let moduleVisibilityCache = { ...DEFAULT_MODULE_VISIBILITY }

function normalizeVisibility(input) {
  const merged = { ...DEFAULT_MODULE_VISIBILITY }
  if (!input || typeof input !== 'object') {
    return merged
  }

  for (const moduleDef of MODULE_TOGGLE_DEFINITIONS) {
    const rawValue = input[moduleDef.key]
    if (typeof rawValue === 'boolean') {
      merged[moduleDef.key] = rawValue
    }
  }
  return merged
}

export function getModuleVisibility() {
  return { ...moduleVisibilityCache }
}

function emitModuleVisibilityChanged(normalized) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MODULE_SETTINGS_EVENT, { detail: normalized }))
  }
}

export function applyModuleVisibility(nextVisibility, options = {}) {
  const normalized = normalizeVisibility(nextVisibility)
  moduleVisibilityCache = normalized
  if (options.emitEvent !== false) {
    emitModuleVisibilityChanged(normalized)
  }
  return { ...normalized }
}

export function saveModuleVisibility(nextVisibility) {
  return applyModuleVisibility(nextVisibility)
}

export function setModuleEnabled(moduleKey, enabled) {
  if (!moduleKey || !(moduleKey in DEFAULT_MODULE_VISIBILITY)) {
    return getModuleVisibility()
  }

  const current = getModuleVisibility()
  const next = {
    ...current,
    [moduleKey]: Boolean(enabled),
  }
  return applyModuleVisibility(next)
}

export function resetModuleVisibility() {
  return applyModuleVisibility(DEFAULT_MODULE_VISIBILITY)
}

export function isModuleEnabled(moduleKey) {
  if (!moduleKey || !(moduleKey in DEFAULT_MODULE_VISIBILITY)) {
    return true
  }
  const visibility = getModuleVisibility()
  return visibility[moduleKey] !== false
}
