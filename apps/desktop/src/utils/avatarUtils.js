import { getApiBase, resolveUrl } from '../services/request'

/** Normalize the local image formats returned by the CovaVision API. */
export function normalizeEmployeeImageUri(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.startsWith('data:image/')) return text

  if (/^[A-Za-z0-9+/=\r\n]+$/.test(text) && text.length > 100) {
    return `data:image/jpeg;base64,${text.replace(/\s+/g, '')}`
  }

  if (/^https?:\/\//i.test(text)) return text
  if (text.startsWith('/')) {
    const apiBase = String(getApiBase() || '').trim()
    return apiBase ? resolveUrl(apiBase, text) : text
  }
  return text
}

/** Resolve only local image fields owned by the CovaVision backend. */
export function resolveEmployeeAvatar(input) {
  if (!input) return ''
  if (typeof input !== 'object') return normalizeEmployeeImageUri(input)

  const candidates = [
    input.image_base64,
    input.local_image_base64,
    input.image_url,
    input.local_image_url,
  ]
  for (const candidate of candidates) {
    const uri = normalizeEmployeeImageUri(candidate)
    if (uri) return uri
  }
  return ''
}
