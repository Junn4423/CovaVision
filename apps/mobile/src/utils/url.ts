import type {ConnectionConfig, WebTarget} from '../types/app';

const HTTP_PROTOCOL_REGEX = /^https?:\/\//i;

export function normalizeBaseUrl(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const withProtocol = HTTP_PROTOCOL_REGEX.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

export function isHttpUrl(value: string): boolean {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeApiBaseUrl(value: string): string {
  return normalizeBaseUrl(value).replace(/\/api$/i, '');
}

export function resolveApiBaseUrl(config: ConnectionConfig): string {
  return normalizeApiBaseUrl(config.apiBaseUrl || config.webBaseUrl || '');
}

export function resolveEndpointUrl(apiBase: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return apiBase ? `${apiBase.replace(/\/+$/, '')}${normalizedPath}` : normalizedPath;
}

export function buildWebAppUrl(config: ConnectionConfig, target: WebTarget): string {
  const baseUrl = normalizeBaseUrl(config.webBaseUrl || resolveApiBaseUrl(config));
  const route: Record<WebTarget, string> = {portal: '/', employee: '/employee/login', admin: '/admin/login'};
  return `${baseUrl}/#${route[target]}`;
}

export function getTargetLabel(target: WebTarget): string {
  if (target === 'employee') return 'Cổng chấm công';
  if (target === 'admin') return 'Cổng quản trị';
  return 'CovaVision';
}

