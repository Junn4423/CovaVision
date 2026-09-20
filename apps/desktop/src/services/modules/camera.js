/** Camera management. RTSP credentials and stream URLs stay on the API side. */
import { request } from '../request'

export const cameraApi = {
  startCamera: data => request('/api/v1/cameras/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
    timeout: 15000,
  }),

  stopCamera: (cameraId = '') => request('/api/v1/cameras/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cameraId ? { camera_id: cameraId } : {}),
    timeout: 10000,
  }),

  cameraStatus: cameraId => request(`/api/v1/cameras/status${cameraId ? `?camera_id=${encodeURIComponent(cameraId)}` : ''}`),
  cameraSnapshot: cameraId => request(`/api/v1/cameras/snapshot${cameraId ? `?camera_id=${encodeURIComponent(cameraId)}` : ''}`),

  getCameras: () => request('/api/v1/cameras'),
  discoverCameras: options => request('/api/v1/cameras/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
    timeout: 20000,
  }),
  saveCamera: camera => request('/api/v1/cameras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(camera || {}),
  }),
  testCameraConnection: payload => request('/api/v1/cameras/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
    timeout: 12000,
  }),
  deleteCamera: cameraId => request(`/api/v1/cameras/${encodeURIComponent(cameraId)}`, {
    method: 'DELETE',
  }),
}
