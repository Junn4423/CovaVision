/** CovaVision uses one authenticated API; no client-side AI host list is needed. */
import { request } from './request'

export const MULTI_CHANNEL_STORAGE_KEY = 'covavision.camera.channel'
export const ACTIVE_AI_HOST_STORAGE_KEY = 'covavision.camera.host'
export const CHANNEL_DESCRIPTIONS = {
  priority: 'Camera CovaVision đang được chọn',
}

let activeApiHost = ''

export function setActiveAiHost(host) {
  activeApiHost = String(host || '').trim()
}

export function getActiveAiHost() {
  return activeApiHost
}

export function cleanHostAndPort(value) {
  return String(value || '').trim()
}

export function normalizeChannelUrl(value) {
  return cleanHostAndPort(value)
}

export function buildChannelsFromLv777() {
  return [{ id: 'priority', title: 'Camera CovaVision', theme: 'green', url: '' }]
}

export function loadSelectedChannelId() {
  if (typeof window === 'undefined') return 'priority'
  return localStorage.getItem(MULTI_CHANNEL_STORAGE_KEY) || 'priority'
}

export function saveSelectedChannelId(channelId) {
  if (typeof window !== 'undefined') localStorage.setItem(MULTI_CHANNEL_STORAGE_KEY, channelId)
}

export function syncActiveAiChannel() {
  return buildChannelsFromLv777()[0]
}

export async function pingAiChannel(_channelUrl, timeoutMs = 8000) {
  const startedAt = Date.now()
  try {
    const payload = await request('/health', { timeout: timeoutMs })
    return {
      online: payload?.status === 'ok',
      latency: Date.now() - startedAt,
      status: payload?.status === 'ok' ? 'online' : 'offline',
      error: payload?.status === 'ok' ? '' : (payload?.message || 'API offline'),
    }
  } catch (error) {
    return { online: false, latency: null, status: 'offline', error: error?.message || 'Mất kết nối' }
  }
}
