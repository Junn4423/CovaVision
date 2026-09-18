import AsyncStorage from '@react-native-async-storage/async-storage';
import type {ConnectionConfig} from '../types/app';
import {isHttpUrl, normalizeApiBaseUrl, normalizeBaseUrl} from '../utils/url';

const CONNECTION_CONFIG_STORAGE_KEY = 'covavision:connection_config';
export const MULTI_CHANNEL_STORAGE_KEY = 'covavision:selected_camera';

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

export interface AiServerChannel { id: string; title: string; theme: 'green' | 'yellow' | 'rose'; url: string; }
export function buildChannelsFromLv777(): AiServerChannel[] {
  return [{id: 'priority', title: 'CovaVision API', theme: 'green', url: ''}];
}
export function cleanHostAndPort(raw: string): string { return String(raw || '').trim(); }
export function normalizeChannelUrl(raw: string): string { return cleanHostAndPort(raw); }
export async function saveSelectedChannelId(channelId: string): Promise<void> { await AsyncStorage.setItem(MULTI_CHANNEL_STORAGE_KEY, channelId); }
export async function loadSelectedChannelId(): Promise<string> { return (await AsyncStorage.getItem(MULTI_CHANNEL_STORAGE_KEY)) || 'priority'; }

