// Kept as a compatibility module for older desktop builds.
// Attendance now has one behaviour only: every valid face scan creates a record.
export const ATTENDANCE_SETTINGS_STORAGE_KEY = 'covavision.attendance_settings.v1'
export const ATTENDANCE_SETTINGS_EVENT = 'covavision:attendance-settings-changed'

export const ATTENDANCE_MODE_OPTIONS = Object.freeze({
  scanRecord: 'scan_record',
})

export const DEFAULT_ATTENDANCE_SETTINGS = Object.freeze({
  mode: ATTENDANCE_MODE_OPTIONS.scanRecord,
})

let attendanceSettingsCache = { ...DEFAULT_ATTENDANCE_SETTINGS }

export function normalizeAttendanceSettings() {
  return { ...DEFAULT_ATTENDANCE_SETTINGS }
}

export function toCooldownTotalSeconds() {
  return 0
}

export function splitCooldownSeconds() {
  return { cooldown_hours: 0, cooldown_minutes: 0, cooldown_seconds: 0 }
}

export function getAttendanceSettings() {
  return { ...attendanceSettingsCache }
}

function emitAttendanceSettingsChanged(normalized) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ATTENDANCE_SETTINGS_EVENT, { detail: normalized }))
  }
}

export function applyAttendanceSettings(nextSettings, options = {}) {
  const normalized = normalizeAttendanceSettings(nextSettings)
  attendanceSettingsCache = normalized
  if (options.emitEvent !== false) emitAttendanceSettingsChanged(normalized)
  return { ...normalized }
}

export function saveAttendanceSettings(nextSettings) {
  return applyAttendanceSettings(nextSettings)
}

export function updateAttendanceSettings(partialSettings) {
  return applyAttendanceSettings(partialSettings)
}

export function resetAttendanceSettings() {
  return applyAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS)
}
