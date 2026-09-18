import { getApiBase, resolveUrl } from '../services/request'

/**
 * Normalizes an employee image URI from various formats:
 * - base64 string with or without data:image prefix
 * - absolute URL (http/https)
 * - relative API path (e.g. /api/image/token/...) resolved against the current active API base
 */
export function normalizeEmployeeImageUri(value) {
  const text = String(value || '').trim()
  if (!text) return ''

  if (text.startsWith('data:image/')) {
    return text
  }

  // Raw base64 string without data:image/jpeg;base64, prefix
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(text) && text.length > 100) {
    return `data:image/jpeg;base64,${text.replace(/\s+/g, '')}`
  }

  if (/^https?:\/\//i.test(text)) {
    return text
  }

  if (text.startsWith('/')) {
    const apiBase = String(getApiBase() || '').trim()
    if (apiBase) {
      return resolveUrl(apiBase, text)
    }
  }

  return text
}

/**
 * Builds the official ERP cloud image URL for a given image token.
 */
export function buildErpTokenImageUri(token) {
  const cleanToken = String(token || '').trim()
  if (!cleanToken) return ''
  return `https://sof.com.vn/loadimage/${encodeURIComponent(cleanToken)}`
}

/**
 * Builds the local backend image URL for a given image token,
 * resolving against the current active API gateway.
 */
export function buildLocalTokenImageUri(token) {
  const cleanToken = String(token || '').trim()
  if (!cleanToken) return ''
  const apiBase = String(getApiBase() || '').trim()
  const path = `/api/image/token/${encodeURIComponent(cleanToken)}`
  return apiBase ? resolveUrl(apiBase, path) : path
}

/**
 * Determines and returns the best valid image URI for an employee object,
 * prioritizing either 'local' or 'erp' sources as requested.
 */
export function resolveEmployeeAvatar(input, preferredSource = 'local') {
  if (!input) return ''
  if (typeof input !== 'object') {
    return normalizeEmployeeImageUri(input)
  }

  const erpCandidates = [
    input?.erp_image_base64,
    buildErpTokenImageUri(input?.erp_image_token),
    input?.erp_image_url,
  ]

  const legacyLocalCandidates =
    !input?.erp_image_token && input?.image_source !== 'erp'
      ? [input?.image_base64, input?.image_url, buildLocalTokenImageUri(input?.image_token)]
      : []

  const localCandidates = [
    input?.local_image_base64,
    buildLocalTokenImageUri(input?.local_image_token || input?.image_token),
    input?.local_image_url,
    input?.image_url,
    input?.image_base64,
    ...legacyLocalCandidates,
  ]

  const candidateList =
    preferredSource === 'erp'
      ? [...erpCandidates, ...localCandidates]
      : [...localCandidates, ...erpCandidates]

  for (const candidate of candidateList) {
    const uri = normalizeEmployeeImageUri(candidate)
    if (uri) {
      return uri
    }
  }

  return ''
}
