const DEFAULT_API_BASE = 'http://127.0.0.1:8000'

export const BACKEND_CONNECTION_STORAGE_KEY = 'covavision.backend.connection.v1'
export const ACTIVE_API_BASE_STORAGE_KEY = 'covavision.active.api-base.v1'
export const DEFAULT_COVAVISION_API_BASE = DEFAULT_API_BASE

export const BACKEND_CONNECTION_OPTIONS = Object.freeze([
  {
    id: 'covavision-api',
    label: 'CovaVision API',
    description: 'Kết nối tới API CovaVision đã cấu hình.',
    apiBaseUrl: DEFAULT_API_BASE,
    source: 'covavision',
  },
])

function normalizeApiBase(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export function resolveRuntimeApiBase() {
  if (typeof window === 'undefined') {
    return normalizeApiBase(import.meta.env?.VITE_COVAVISION_API_URL || DEFAULT_API_BASE)
  }

  const injectedApiBase = typeof window.__COVAVISION_API_BASE__ === 'string'
    ? window.__COVAVISION_API_BASE__
    : (import.meta.env?.VITE_COVAVISION_API_URL || '')

  return normalizeApiBase(
    window.electronAPI?.apiBaseUrl || injectedApiBase || DEFAULT_API_BASE,
  )
}

export function getBackendConnectionOptionById(connectionId) {
  return BACKEND_CONNECTION_OPTIONS.find(option => option.id === connectionId) || null
}

export function resolveBackendConnectionApiBase(connection) {
  return normalizeApiBase(connection?.apiBaseUrl || resolveRuntimeApiBase())
}

export function findBackendConnectionByApiBase(apiBaseUrl) {
  const normalized = normalizeApiBase(apiBaseUrl)
  return BACKEND_CONNECTION_OPTIONS.find(
    option => resolveBackendConnectionApiBase(option) === normalized,
  ) || null
}

export function getStoredBackendConnectionId() {
  if (typeof window === 'undefined') return ''
  try {
    return String(localStorage.getItem(BACKEND_CONNECTION_STORAGE_KEY) || '').trim()
  } catch {
    return ''
  }
}

export function setStoredBackendConnectionId(connectionId) {
  if (typeof window === 'undefined') return
  const normalized = String(connectionId || '').trim()
  if (!getBackendConnectionOptionById(normalized)) return
  try {
    localStorage.setItem(BACKEND_CONNECTION_STORAGE_KEY, normalized)
  } catch {
    // Storage is optional in restricted browser contexts.
  }
}

export function getSelectedBackendConnection() {
  return getBackendConnectionOptionById(getStoredBackendConnectionId())
    || BACKEND_CONNECTION_OPTIONS[0]
}

export function setActiveApiBase(apiBaseUrl) {
  const normalized = normalizeApiBase(apiBaseUrl)
  if (typeof window !== 'undefined' && normalized) {
    try {
      sessionStorage.setItem(ACTIVE_API_BASE_STORAGE_KEY, normalized)
      localStorage.setItem(ACTIVE_API_BASE_STORAGE_KEY, normalized)
    } catch {
      // Ignore storage failures.
    }
  }
  return normalized
}

export function clearActiveApiBase() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(ACTIVE_API_BASE_STORAGE_KEY)
    localStorage.removeItem(ACTIVE_API_BASE_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function getApiBase() {
  if (typeof window !== 'undefined') {
    try {
      const active = normalizeApiBase(
        sessionStorage.getItem(ACTIVE_API_BASE_STORAGE_KEY)
        || localStorage.getItem(ACTIVE_API_BASE_STORAGE_KEY),
      )
      if (active) return active
    } catch {
      // Fall back to runtime configuration.
    }
  }
  return resolveRuntimeApiBase()
}

