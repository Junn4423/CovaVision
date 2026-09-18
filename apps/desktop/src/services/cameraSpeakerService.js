import { request } from './request'

export const CAMERA_SPEAKER_STORAGE_KEY = 'covavision.camera-speaker.v1'
export const CAMERA_SPEAKER_CONFIG_EVENT = 'covavision:camera-speaker-config-changed'

export const CAMERA_SPEAKER_PROFILES = Object.freeze({
  EZVIZ_H6C: { id: 'EZVIZ_H6C', name: 'EZVIZ / camera tương thích', description: 'Âm thanh hai chiều do API xử lý.' },
  HIKVISION_GENERIC: { id: 'HIKVISION_GENERIC', name: 'Hikvision / camera tương thích', description: 'Âm thanh hai chiều do API xử lý.' },
  ONVIF_STANDARD: { id: 'ONVIF_STANDARD', name: 'Camera chuẩn ONVIF', description: 'Âm thanh hai chiều do API xử lý.' },
  CUSTOM: { id: 'CUSTOM', name: 'Tùy chỉnh', description: 'Tham số được quản lý an toàn ở backend.' },
})

export const DEFAULT_CAMERA_SPEAKER_CONFIG = Object.freeze({
  enabled: false,
  volume: 50,
  cameraId: '',
  cameraName: '',
  profileId: 'ONVIF_STANDARD',
})

export function isCameraSpeakerAvailable(camera) {
  if (!camera || typeof camera !== 'object') return { available: false, reason: 'Chưa chọn camera' }
  if (camera.camera_type === 'browser' || camera.camera_type === 'mobile' || camera.type === 'device') {
    return { available: false, reason: 'Camera thiết bị không có loa mạng.' }
  }
  if (!camera.id) return { available: false, reason: 'Camera chưa có mã cấu hình.' }
  return { available: true, cameraId: String(camera.id), name: camera.name || 'Camera mạng' }
}

export function loadCameraSpeakerConfig() {
  if (typeof window === 'undefined') return { ...DEFAULT_CAMERA_SPEAKER_CONFIG }
  try {
    const raw = localStorage.getItem(CAMERA_SPEAKER_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      ...DEFAULT_CAMERA_SPEAKER_CONFIG,
      ...(parsed || {}),
      volume: Math.max(0, Math.min(100, Number(parsed?.volume ?? 50))),
      enabled: parsed?.enabled === true,
    }
  } catch {
    return { ...DEFAULT_CAMERA_SPEAKER_CONFIG }
  }
}

export function saveCameraSpeakerConfig(draft) {
  const current = loadCameraSpeakerConfig()
  const nextConfig = {
    ...current,
    ...(draft || {}),
    volume: Math.max(0, Math.min(100, Number(draft?.volume ?? current.volume ?? 50))),
    enabled: draft?.enabled !== undefined ? Boolean(draft.enabled) : current.enabled,
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(CAMERA_SPEAKER_STORAGE_KEY, JSON.stringify(nextConfig))
    window.dispatchEvent(new CustomEvent(CAMERA_SPEAKER_CONFIG_EVENT, { detail: nextConfig }))
  }
  return nextConfig
}

export async function speakToCamera(text, options = {}) {
  const config = loadCameraSpeakerConfig()
  const cameraId = String(options.cameraId || config.cameraId || '').trim()
  if (!cameraId) return { success: false, message: 'Chưa chọn camera có loa.' }
  return request(`/api/v1/cameras/${encodeURIComponent(cameraId)}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: String(text || 'Xin chào bạn, chấm công thành công').trim(),
      volume: options.volume !== undefined ? options.volume : config.volume,
      profile_id: options.profileId || config.profileId,
    }),
    timeout: 15000,
  })
}

export function testCameraSpeaker(options = {}) {
  return speakToCamera(options.text || 'Xin chào bạn, kiểm tra loa camera thành công', options)
}

export function speakAttendanceViaCamera(userName, attendanceType = 'IN', isLate = false, options = {}) {
  const name = String(userName || '').trim()
  if (!name) return Promise.resolve({ success: false, message: 'Thiếu tên nhân viên.' })
  const isCheckOut = ['checkout', 'out'].includes(String(attendanceType).toLowerCase())
  const sentence = isCheckOut
    ? `Tạm biệt ${name}, chấm công thành công!`
    : (isLate ? `Xin chào ${name}, ghi nhận vào ca làm việc!` : `Xin chào ${name}, chấm công thành công!`)
  return speakToCamera(sentence, options)
}

