export const ATTENDANCE_SETTINGS_STORAGE_KEY = 'facecheck.attendance_settings.v1'
export const ATTENDANCE_SETTINGS_EVENT = 'facecheck:attendance-settings-changed'

export const ATTENDANCE_MODE_OPTIONS = Object.freeze({
  checkinCheckout: 'checkin_checkout',
  autoRecord: 'auto_record',
})

export const DEFAULT_ATTENDANCE_SETTINGS = Object.freeze({
  mode: ATTENDANCE_MODE_OPTIONS.checkinCheckout,
  cooldown_hours: 0,
  cooldown_minutes: 10,
  cooldown_seconds: 0,
})

let attendanceSettingsCache = { ...DEFAULT_ATTENDANCE_SETTINGS }

function clampInteger(value, minValue, maxValue, fallbackValue) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallbackValue
  }
  const normalized = Math.trunc(parsed)
  if (normalized < minValue) return minValue
  if (normalized > maxValue) return maxValue
  return normalized
}

function normalizeMode(value) {
  const normalized = String(value || '').trim()
  if (normalized === ATTENDANCE_MODE_OPTIONS.autoRecord) {
    return ATTENDANCE_MODE_OPTIONS.autoRecord
  }
  return ATTENDANCE_MODE_OPTIONS.checkinCheckout
}

export function normalizeAttendanceSettings(input) {
  const source = input && typeof input === 'object' ? input : {}

  const normalized = {
    mode: normalizeMode(source.mode),
    cooldown_hours: clampInteger(source.cooldown_hours, 0, 23, DEFAULT_ATTENDANCE_SETTINGS.cooldown_hours),
    cooldown_minutes: clampInteger(source.cooldown_minutes, 0, 59, DEFAULT_ATTENDANCE_SETTINGS.cooldown_minutes),
    cooldown_seconds: clampInteger(source.cooldown_seconds, 0, 59, DEFAULT_ATTENDANCE_SETTINGS.cooldown_seconds),
  }

  return normalized
}

export function toCooldownTotalSeconds(settings) {
  const normalized = normalizeAttendanceSettings(settings)
  return (
    (normalized.cooldown_hours * 3600)
    + (normalized.cooldown_minutes * 60)
    + normalized.cooldown_seconds
  )
}

export function splitCooldownSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Math.trunc(Number(totalSeconds) || 0))
  const cooldown_hours = Math.min(23, Math.floor(safeSeconds / 3600))
  const remainAfterHours = safeSeconds - (cooldown_hours * 3600)
  const cooldown_minutes = Math.min(59, Math.floor(remainAfterHours / 60))
  const cooldown_seconds = Math.min(59, remainAfterHours - (cooldown_minutes * 60))

  return {
    cooldown_hours,
    cooldown_minutes,
    cooldown_seconds,
  }
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
  if (options.emitEvent !== false) {
    emitAttendanceSettingsChanged(normalized)
  }
  return { ...normalized }
}

export function saveAttendanceSettings(nextSettings) {
  return applyAttendanceSettings(nextSettings)
}

export function updateAttendanceSettings(partialSettings) {
  const current = getAttendanceSettings()
  return applyAttendanceSettings({
    ...current,
    ...(partialSettings || {}),
  })
}

export function resetAttendanceSettings() {
  return applyAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS)
}
