import {
  clearAuthState,
  getAuthData,
  request,
  setAuthData,
  setSessionToken,
} from '../request'

function firstText(...values) {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (normalized) return normalized
  }
  return ''
}

function applyLoginContext(payload, username) {
  const token = firstText(payload?.access_token, payload?.token, payload?.data?.access_token)
  const user = payload?.user || payload?.account || {}
  const context = {
    ...(payload || {}),
    success: payload?.success !== false,
    token,
    username,
    user,
    role: firstText(payload?.role, user?.role, 'admin'),
  }
  setAuthData(context)
  setSessionToken(token)
  return context
}

async function loginSystem(username, password) {
  const normalizedUser = String(username || '').trim()
  const normalizedPass = String(password || '').trim()
  if (!normalizedUser || !normalizedPass) {
    return { success: false, message: 'Vui lòng nhập tài khoản và mật khẩu.' }
  }

  try {
    const payload = await request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: normalizedUser, password: normalizedPass }),
      timeout: 15000,
    })
    return applyLoginContext(payload, normalizedUser)
  } catch (error) {
    return { success: false, message: error?.message || 'Không thể kết nối CovaVision API.' }
  }
}

async function logout() {
  try {
    await request('/api/v1/auth/logout', { method: 'POST', timeout: 10000 })
  } catch {
    // Local cleanup remains authoritative when the API is unavailable.
  }
  clearAuthState()
  return { success: true }
}

export const authApi = {
  adminLogin: (username, password) => loginSystem(username, password),
  login: (username, password) => loginSystem(username, password),
  adminLogout: logout,
  logout,
  injectSession: (auth) => {
    setAuthData(auth || null)
    setSessionToken(auth?.access_token || auth?.token || null)
    return Promise.resolve({ success: true, auth })
  },
  sessionStatus: () => request('/api/v1/auth/me'),
  employeeLogin: (username, password) => loginSystem(username, password),
  employeeLogout: logout,
  employeeStatus: () => request('/api/v1/auth/me'),
  currentAuth: () => getAuthData(),
}
