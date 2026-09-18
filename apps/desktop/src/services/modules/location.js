import { request } from '../request'

export const locationApi = {
  getLocationState: () => request('/api/v1/location'),
  updateLocationState: payload => request('/api/v1/location', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}),
  }),
}

