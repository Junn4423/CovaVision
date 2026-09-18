import {request} from '../request';

export const serverAuthApi = {
  adminLogin: (username: string, password: string) => request('/api/v1/auth/login', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password}),
  }),
  login: (username: string, password: string) => request('/api/v1/auth/login', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password}),
  }),
  adminLogout: () => request('/api/v1/auth/logout', {method: 'POST'}),
  logout: () => request('/api/v1/auth/logout', {method: 'POST'}),
  injectSession: (auth: Record<string, unknown>) => Promise.resolve({success: true, auth}),
  sessionStatus: () => request('/api/v1/auth/me'),
};
