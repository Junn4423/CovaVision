import { getAuthHeaders, getApiBase, resolveUrl } from './request'

function appendBytes(left, right) {
  const combined = new Uint8Array(left.length + right.length)
  combined.set(left)
  combined.set(right, left.length)
  return combined
}

function findMarker(bytes, first, second, start = 0) {
  for (let index = start; index < bytes.length - 1; index += 1) {
    if (bytes[index] === first && bytes[index + 1] === second) return index
  }
  return -1
}

function takeJpegFrame(buffer) {
  const start = findMarker(buffer, 0xff, 0xd8)
  if (start < 0) return { frame: null, rest: buffer.slice(Math.max(0, buffer.length - 1)) }

  const end = findMarker(buffer, 0xff, 0xd9, start + 2)
  if (end < 0) return { frame: null, rest: buffer.slice(start) }

  return {
    frame: buffer.slice(start, end + 2),
    rest: buffer.slice(end + 2),
  }
}

/**
 * Consume the authenticated backend MJPEG proxy without exposing the RTSP URL
 * to the renderer. onFrame receives one JPEG Uint8Array at a time.
 */
export async function openBackendMjpegStream(cameraId, { signal, onFrame } = {}) {
  const query = cameraId ? `?camera_id=${encodeURIComponent(cameraId)}` : ''
  const response = await fetch(resolveUrl(getApiBase(), `/api/v1/cameras/stream${query}`), {
    headers: getAuthHeaders(),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Không mở được proxy camera (HTTP ${response.status}).`)
  }
  if (!response.body) throw new Error('Backend không trả về luồng camera.')

  const reader = response.body.getReader()
  let buffer = new Uint8Array(0)

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      buffer = appendBytes(buffer, value)

      while (buffer.length > 0) {
        const result = takeJpegFrame(buffer)
        buffer = result.rest
        if (!result.frame) break
        await onFrame?.(result.frame)
      }
    }
  } finally {
    reader.releaseLock()
  }
}
