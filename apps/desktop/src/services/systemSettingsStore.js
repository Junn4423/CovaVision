import { request } from './request'
import {
  applyModuleVisibility,
  getModuleVisibility,
} from './moduleSettings'
import {
  applyAttendanceSettings,
  getAttendanceSettings,
} from './attendanceSettings'

function normalizeServerSettings(response) {
  const payload = response && typeof response === 'object' ? response : {}
  const settings = payload.settings && typeof payload.settings === 'object'
    ? payload.settings
    : payload

  return {
    module_visibility: settings.module_visibility,
    attendance_settings: settings.attendance_settings,
  }
}

export function getCachedSystemSettings() {
  return {
    module_visibility: getModuleVisibility(),
    attendance_settings: getAttendanceSettings(),
  }
}

export function applySystemSettings(settingsPayload, options = {}) {
  const source = settingsPayload && typeof settingsPayload === 'object' ? settingsPayload : {}

  const moduleVisibility = applyModuleVisibility(
    source.module_visibility,
    { emitEvent: options.emitEvent !== false },
  )
  const attendanceSettings = applyAttendanceSettings(
    source.attendance_settings,
    { emitEvent: options.emitEvent !== false },
  )

  return {
    module_visibility: moduleVisibility,
    attendance_settings: attendanceSettings,
  }
}

export async function syncSystemSettingsFromServer() {
  try {
    const response = await request('/api/v1/settings')
    if (!response?.success) {
      return {
        success: false,
        message: response?.message || 'Không thể tải cài đặt hệ thống',
        settings: getCachedSystemSettings(),
      }
    }

    const normalized = normalizeServerSettings(response)
    const appliedSettings = applySystemSettings(normalized)

    return {
      success: true,
      message: response?.message || '',
      settings: appliedSettings,
    }
  } catch (error) {
    return {
      success: false,
      message: error?.message || 'Không thể tải cài đặt hệ thống',
      settings: getCachedSystemSettings(),
    }
  }
}

export async function saveSystemSettingsToServer(settingsPayload) {
  try {
    const response = await request('/api/v1/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsPayload || {}),
    })

    if (!response?.success) {
      return {
        success: false,
        message: response?.message || 'Không thể lưu cài đặt hệ thống',
        settings: getCachedSystemSettings(),
      }
    }

    const normalized = normalizeServerSettings(response)
    const appliedSettings = applySystemSettings(normalized)

    return {
      success: true,
      message: response?.message || 'Đã lưu cài đặt hệ thống',
      settings: appliedSettings,
    }
  } catch (error) {
    return {
      success: false,
      message: error?.message || 'Không thể lưu cài đặt hệ thống',
      settings: getCachedSystemSettings(),
    }
  }
}
