import {normalizeApiBaseUrl, resolveEndpointUrl} from '../utils/url';

const EXPIRED_SESSION_MESSAGE = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';
export const CLIENT_DEVICE_TYPE = 'mobile';

let runtimeApiBase = '';
let runtimeFallbackApiBase = '';
let sessionToken: string | null = null;
let authData: Record<string, any> | null = null;
let activeAiHost: string | null = null;

export function setActiveAiHost(host: string | null): void { activeAiHost = host ? String(host).trim() : null; }
export function getActiveAiHost(): string | null { return activeAiHost; }

type UnauthorizedListener = (message: string) => void;
let unauthorizedListener: UnauthorizedListener | null = null;
let isAlertingUnauthorized = false;

export function setUnauthorizedListener(listener: UnauthorizedListener | null): void { unauthorizedListener = listener; }

function notifyUnauthorized(message?: string): void {
  clearAuthState();
  if (unauthorizedListener && !isAlertingUnauthorized) {
    isAlertingUnauthorized = true;
    unauthorizedListener(message || EXPIRED_SESSION_MESSAGE);
    setTimeout(() => { isAlertingUnauthorized = false; }, 3000);
  }
}

export function setApiBaseUrl(baseUrl: string): string { runtimeApiBase = normalizeApiBaseUrl(baseUrl); return runtimeApiBase; }
export function setFallbackApiBaseUrl(baseUrl: string): string { runtimeFallbackApiBase = normalizeApiBaseUrl(baseUrl); return runtimeFallbackApiBase; }
export function getApiBaseUrl(): string { return runtimeApiBase; }
export function setSessionToken(token: string | null): void { sessionToken = token ? String(token).trim() : null; }
export function getSessionToken(): string | null { return sessionToken; }
export function clearSessionToken(): void { sessionToken = null; }
export function setAuthData(auth: Record<string, any> | null): void { authData = auth; }
export function getAuthData(): Record<string, any> | null { return authData; }
export function clearAuthState(): void { sessionToken = null; authData = null; }

function buildAuthHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const nextHeaders: Record<string, string> = {...headers, 'X-Device-Type': CLIENT_DEVICE_TYPE};
  if (sessionToken) nextHeaders.Authorization = `Bearer ${sessionToken}`;
  return nextHeaders;
}

export function getAuthHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return buildAuthHeaders(headers);
}

export function getBackgroundServiceAuthContext(): {endpoint: string; headers: Record<string, string>} {
  return {
    endpoint: runtimeApiBase ? resolveUrl('/api/v1/attendance/recognize', runtimeApiBase) : '',
    headers: buildAuthHeaders({'Content-Type': 'application/json', Accept: 'application/json'}),
  };
}

function resolveUrl(path: string, base: string = runtimeApiBase): string {
  if (!base) throw new Error('API URL chưa được cấu hình.');
  return resolveEndpointUrl(base, path);
}

async function readJsonSafe(response: Response): Promise<any> {
  const text = await response.text();
  if (!text || text.trim().startsWith('<')) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function fetchWithTimeout(resource: string, options: RequestInit & {timeout?: number} = {}): Promise<Response> {
  const {timeout = 12000, ...fetchOptions} = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(resource, {...fetchOptions, signal: controller.signal});
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('Kết nối API quá thời gian chờ.');
    throw error;
  } finally { clearTimeout(timer); }
}

async function doRequest(path: string, baseUrl: string, options: RequestInit & {timeout?: number} = {}): Promise<any> {
  const {timeout = 12000, ...fetchOptions} = options;
  let response: Response;
  try {
    response = await fetchWithTimeout(resolveUrl(path, baseUrl), {
      ...fetchOptions,
      headers: buildAuthHeaders((fetchOptions.headers || {}) as Record<string, string>),
      timeout,
    });
  } catch (error) {
    if (!runtimeFallbackApiBase || runtimeFallbackApiBase === runtimeApiBase) throw error;
    response = await fetchWithTimeout(resolveUrl(path, runtimeFallbackApiBase), {
      ...fetchOptions,
      headers: buildAuthHeaders((fetchOptions.headers || {}) as Record<string, string>),
      timeout,
    });
  }
  const payload = await readJsonSafe(response);
  if (response.status === 401) {
    notifyUnauthorized(payload?.detail || payload?.message);
    return {...(payload || {}), success: false, message: payload?.detail || payload?.message || EXPIRED_SESSION_MESSAGE};
  }
  if (!response.ok) {
    if (payload && typeof payload === 'object') return payload;
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return payload;
}

export function request(path: string, options: RequestInit & {timeout?: number} = {}): Promise<any> { return doRequest(path, runtimeApiBase, options); }
export function requestAt(baseUrl: string, path: string, options: RequestInit & {timeout?: number} = {}): Promise<any> { return doRequest(path, normalizeApiBaseUrl(baseUrl), options); }
export function requestFaceApi(path: string, options: RequestInit & {timeout?: number} = {}): Promise<any> { return request(path, options); }

export async function requestBlob(path: string, options: RequestInit & {timeout?: number} = {}): Promise<{blob: Blob; filename: string}> {
  const {timeout = 12000, ...fetchOptions} = options;
  const response = await fetchWithTimeout(resolveUrl(path), {
    ...fetchOptions,
    headers: buildAuthHeaders((fetchOptions.headers || {}) as Record<string, string>),
    timeout,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return {blob: await response.blob(), filename: match?.[1] || ''};
}
