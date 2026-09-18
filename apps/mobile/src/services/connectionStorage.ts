import AsyncStorage from '@react-native-async-storage/async-storage';
import type {ConnectionConfig} from '../types/app';
import {isHttpUrl, normalizeApiBaseUrl} from '../utils/url';

const CONNECTION_CONFIG_STORAGE_KEY = 'covavision:connection_config';

export function sanitizeConnectionConfig(draft: ConnectionConfig): ConnectionConfig {
  const apiBaseUrl = normalizeApiBaseUrl(draft.apiBaseUrl || '');
  if (!apiBaseUrl || !isHttpUrl(apiBaseUrl)) throw new Error('API URL không hợp lệ.');
  return {
    label: String(draft.label || '').trim() || 'CovaVision API',
    apiBaseUrl,
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
