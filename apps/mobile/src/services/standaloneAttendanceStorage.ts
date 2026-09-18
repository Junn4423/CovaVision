import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  StandaloneAttendanceConfig,
  DEFAULT_STANDALONE_CONFIG,
  CAMERA_SPEAKER_PROFILES,
} from '../types/cameraSpeaker';
import {api} from './api';

const STORAGE_KEY = 'covavision:standalone_attendance:v1';

export function normalizeVolume(value: unknown, fallback = 50): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue)
    ? Math.max(0, Math.min(100, Math.round(numberValue)))
    : fallback;
}

function sanitizeConfig(input: Partial<StandaloneAttendanceConfig> = {}): StandaloneAttendanceConfig {
  const profileId = input.profileId && CAMERA_SPEAKER_PROFILES[input.profileId]
    ? input.profileId
    : DEFAULT_STANDALONE_CONFIG.profileId;

  return {
    ...DEFAULT_STANDALONE_CONFIG,
    enabled: input.enabled === true,
    volume: normalizeVolume(input.volume, DEFAULT_STANDALONE_CONFIG.volume),
    cameraId: String(input.cameraId || '').trim(),
    cameraName: String(input.cameraName || '').trim(),
    profileId,
    cooldownSeconds: Math.max(1, Number(input.cooldownSeconds) || DEFAULT_STANDALONE_CONFIG.cooldownSeconds),
  };
}

/**
 * Local preferences contain only an opaque camera id. RTSP URLs, credentials
 * and LAN addresses are intentionally discarded, including old saved values.
 */
export async function loadStandaloneAttendanceConfig(): Promise<StandaloneAttendanceConfig> {
  let localConfig: Partial<StandaloneAttendanceConfig> = {};
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) localConfig = JSON.parse(raw);
  } catch {
    localConfig = {};
  }

  if (!localConfig.cameraId) {
    try {
      const response = await api.getSystemSettings();
      const remote = response?.settings?.standalone_camera_config;
      if (remote && typeof remote === 'object') localConfig = remote;
    } catch {
      // The local preference is still useful while the API is offline.
    }
  }

  const clean = sanitizeConfig(localConfig);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(clean)).catch(() => {});
  return clean;
}

export async function saveStandaloneAttendanceConfig(
  draft: Partial<StandaloneAttendanceConfig>,
): Promise<StandaloneAttendanceConfig> {
  const next = sanitizeConfig({...await loadStandaloneAttendanceConfig(), ...draft});
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));

  try {
    await api.saveSystemSettings({standalone_camera_config: next});
  } catch {
    // Local state remains valid if the API is temporarily unavailable.
  }
  return next;
}
