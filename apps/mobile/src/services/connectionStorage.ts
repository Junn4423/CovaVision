import AsyncStorage from '@react-native-async-storage/async-storage';
import type {ConnectionConfig} from '../types/app';
import {isHttpUrl, normalizeApiBaseUrl, normalizeBaseUrl} from '../utils/url';

const CONNECTION_CONFIG_STORAGE_KEY = 'covavision:connection_config';

export function sanitizeConnectionConfig(draft: ConnectionConfig): ConnectionConfig {
  const apiBaseUrl = normalizeApiBaseUrl(draft.apiBaseUrl || draft.webBaseUrl || '');
  if (!apiBaseUrl || !isHttpUrl(apiBaseUrl)) throw new Error('API URL không hợp lệ.');
  const webBaseUrl = normalizeBaseUrl(draft.webBaseUrl || '');
  return {
    label: String(draft.label || '').trim() || 'CovaVision API',
    apiBaseUrl,
    webBaseUrl: webBaseUrl || undefined,
    serverId: String(draft.serverId || '').trim() || undefined,
    pairVersion: Number.isFinite(Number(draft.pairVersion)) ? Math.trunc(Number(draft.pairVersion)) : undefined,
    pairingMethod: String(draft.pairingMethod || '').trim() || undefined,
  };
}

export async function saveConnectionConfig(draft: ConnectionConfig): Promise<ConnectionConfig> {
  const sanitized = sanitizeConnectionConfig(draft);
  await AsyncStorage.setItem(CONNECTION_CONFIG_STORAGE_KEY, JSON.stringify(sanitized));
  return sanitized;
}

export async function loadConnectionConfig(): Promise<ConnectionConfig | null> {
  const raw = await AsyncStorage.getItem(CONNECTION_CONFIG_STORAGE_KEY);
  if (!raw) return null;
  try { return sanitizeConnectionConfig(JSON.parse(raw) as ConnectionConfig); } catch { return null; }
}
