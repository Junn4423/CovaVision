import { clearActiveApiBase, getApiBase } from './connectionTarget'

export { getApiBase }

export const SESSION_EXPIRED_EVENT = 'covavision:session-expired'
export const CLIENT_DEVICE_TYPE = 'desktop'
const SESSION_TOKEN_STORAGE_KEY = 'covavision.session-token.v1'
const AUTH_STORAGE_KEY = 'covavision.auth.v1'
const EXPIRED_SESSION_MESSAGE = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.'

let sessionExpiredNotified = false
let sessionToken = null
let authData = null

function readStoredToken() {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY)
      || localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)
      || null
  } catch {
    return null
  }
}

function readStoredAuth() {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(AUTH_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

sessionToken = readStoredToken()
authData = readStoredAuth()

export function setSessionToken(token) {
  sessionToken = token ? String(token).trim() : null
  if (sessionToken) sessionExpiredNotified = false
  if (typeof window === 'undefined') return
  try {
    if (sessionToken) {
      sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, sessionToken)
      localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, sessionToken)
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY)
      localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY)
    }
  } catch {
    // Storage is optional.
  }
}

export function getSessionToken() {
  return sessionToken || readStoredToken()
}

export function setGatewayAuth(value) {
  authData = value && typeof value === 'object' ? { ...value } : null
  if (typeof window === 'undefined') return
  try {
    if (authData) {
      const serialized = JSON.stringify(authData)
      sessionStorage.setItem(AUTH_STORAGE_KEY, serialized)
      localStorage.setItem(AUTH_STORAGE_KEY, serialized)
    } else {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  } catch {
    // Storage is optional.
  }
}

export function getGatewayAuth() {
  return authData || readStoredAuth()
}

export function clearAuthState() {
  sessionToken = null
  authData = null
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY)
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY)
      localStorage.removeItem(AUTH_STORAGE_KEY)
    } catch {
      // Ignore storage failures.
    }
  }
  clearActiveApiBase()
}

export function clearSessionToken() {
  setSessionToken(null)
}

function notifySessionExpired(message = EXPIRED_SESSION_MESSAGE) {
  if (sessionExpiredNotified) return
  sessionExpiredNotified = true
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: message }))
  }
  setTimeout(() => { sessionExpiredNotified = false }, 3000)
}

export function getAuthHeaders(headers = {}) {
  const nextHeaders = { ...headers, 'X-Device-Type': CLIENT_DEVICE_TYPE }
  const token = getSessionToken()
  if (token) nextHeaders.Authorization = `Bearer ${token}`
  return nextHeaders
}

export function resolveUrl(apiBase, path) {
  const base = String(apiBase || '').trim().replace(/\/+$/, '')
  if (!base) throw new Error('Chưa cấu hình địa chỉ CovaVision API.')
  const endpoint = String(path || '').startsWith('/') ? String(path) : `/${path}`
  return `${base}${endpoint}`
}

async function readJsonSafe(response) {
  const text = await response.text()
  if (!text || text.trim().startsWith('<')) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 30000, ...fetchOptions } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(resource, { ...fetchOptions, signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Kết nối API quá thời gian chờ.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function doRequest(path, apiBase, options = {}) {
  const { timeout = 30000, ...fetchOptions } = options
  const response = await fetchWithTimeout(resolveUrl(apiBase, path), {
    ...fetchOptions,
    headers: getAuthHeaders(fetchOptions.headers || {}),
    timeout,
  })

  const payload = await readJsonSafe(response)
  if (response.status === 401) {
    notifySessionExpired(payload?.message || EXPIRED_SESSION_MESSAGE)
    return { ...(payload || {}), success: false, message: payload?.message || EXPIRED_SESSION_MESSAGE }
  }
  if (!response.ok) {
    if (payload && typeof payload === 'object') return payload
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  if (payload == null) throw new Error('API trả về dữ liệu không hợp lệ.')
  return payload
}

export function request(path, options = {}) {
  return doRequest(path, getApiBase(), options)
}

export function requestAt(baseUrl, path, options = {}) {
  return doRequest(path, String(baseUrl || '').trim(), options)
}

export function requestFaceApi(path, options = {}) {
  return request(path, options)
}

export async function requestBlob(path, options = {}) {
  const { timeout = 30000, ...fetchOptions } = options
  const response = await fetchWithTimeout(resolveUrl(getApiBase(), path), {
    ...fetchOptions,
    headers: getAuthHeaders(fetchOptions.headers || {}),
    timeout,
  })
  if (response.status === 401) {
    notifySessionExpired()
    throw new Error(EXPIRED_SESSION_MESSAGE)
  }
  if (!response.ok) {
    const payload = await readJsonSafe(response)
    throw new Error(payload?.message || `HTTP ${response.status}: ${response.statusText}`)
  }
  const disposition = response.headers.get('Content-Disposition') || ''
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  const basicMatch = disposition.match(/filename="?([^";]+)"?/i)
  return {
    blob: await response.blob(),
    filename: utf8Match?.[1] ? decodeURIComponent(utf8Match[1]) : (basicMatch?.[1] || ''),
  }
}

