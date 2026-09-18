import { request } from '../request'

export const systemSettingsApi = {
  getSystemSettings: () => request('/api/v1/settings'),
  saveSystemSettings: payload => request('/api/v1/settings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}),
  }),
}

