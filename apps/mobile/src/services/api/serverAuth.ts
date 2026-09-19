import {request} from '../request';

export const serverAuthApi = {
  adminLogin: (identifier: string, password: string) => request('/api/v1/auth/login', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({identifier, password}),
  }),
  login: (identifier: string, password: string) => request('/api/v1/auth/login', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({identifier, password}),
  }),
  registerAccount: (email: string, password: string, fullName = '', organizationName = '') => request('/api/v1/auth/register', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password, full_name: fullName, organization_name: organizationName}),
  }),
  googleLogin: (idToken: string) => request('/api/v1/auth/google', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id_token: idToken}),
  }),
  adminLogout: () => request('/api/v1/auth/logout', {method: 'POST'}),
  logout: () => request('/api/v1/auth/logout', {method: 'POST'}),
  injectSession: (auth: Record<string, unknown>) => Promise.resolve({success: true, auth}),
  sessionStatus: () => request('/api/v1/auth/me'),
};
