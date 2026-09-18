/** Camera management. RTSP credentials and stream URLs stay on the API side. */
import { getApiBase } from '../connectionTarget'
import { request, resolveUrl } from '../request'

export const cameraApi = {
  startCamera: data => request('/api/v1/cameras/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
    timeout: 15000,
  }),

  startLocalCamera: data => {
    const bridge = typeof window !== 'undefined' ? window.electronAPI?.localRtsp : null
    return bridge?.start
      ? bridge.start(data)
      : Promise.resolve({ success: false, message: 'Local camera bridge không khả dụng.' })
  },

  stopCamera: () => request('/api/v1/cameras/stop', { method: 'POST', timeout: 10000 }),

  stopLocalCamera: () => {
    const bridge = typeof window !== 'undefined' ? window.electronAPI?.localRtsp : null
    return bridge?.stop ? bridge.stop() : Promise.resolve({ success: true })
  },

  cameraStatus: () => request('/api/v1/cameras/status'),
  cameraSnapshot: () => request('/api/v1/cameras/snapshot'),

  localCameraSnapshot: () => {
    const bridge = typeof window !== 'undefined' ? window.electronAPI?.localRtsp : null
    return bridge?.snapshot
      ? bridge.snapshot()
      : Promise.resolve({ success: false, message: 'Local camera bridge không khả dụng.' })
  },

  onLocalCameraFrameTick: callback => {
    const bridge = typeof window !== 'undefined' ? window.electronAPI?.localRtsp : null
    return bridge?.onFrameTick ? bridge.onFrameTick(callback) : () => {}
  },

  getCameras: () => request('/api/v1/cameras'),
  saveCamera: camera => request('/api/v1/cameras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(camera || {}),
  }),
  deleteCamera: cameraId => request(`/api/v1/cameras/${encodeURIComponent(cameraId)}`, {
    method: 'DELETE',
  }),
  videoFeedUrl: () => resolveUrl(getApiBase(), '/api/v1/cameras/stream'),
}

