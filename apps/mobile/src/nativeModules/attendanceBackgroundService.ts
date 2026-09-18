import {NativeModules, Platform} from 'react-native';
import {StandaloneAttendanceConfig} from '../types/cameraSpeaker';
import {getBackgroundServiceAuthContext} from '../services/request';

type AttendanceBackgroundModuleShape = {
  startService?: (config: Record<string, any>) => Promise<boolean>;
  stopService?: () => Promise<boolean>;
  isServiceRunning?: () => Promise<boolean>;
  testSpeaker?: (config: Record<string, any>) => Promise<boolean>;
  testNotification?: (name?: string) => Promise<boolean>;
};

const nativeModule = NativeModules.AttendanceBackgroundService as AttendanceBackgroundModuleShape | undefined;

/** The mobile worker talks to CovaVision; it never opens an RTSP URL itself. */
export async function startAttendanceBackgroundService(config: StandaloneAttendanceConfig): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeModule?.startService) return false;
  const authCtx = getBackgroundServiceAuthContext();
  if (!authCtx.endpoint || !config.cameraId) return false;
  try {
    return await nativeModule.startService({
      cameraId: config.cameraId,
      apiUrl: authCtx.endpoint,
      authHeadersJson: JSON.stringify(authCtx.headers || {}),
      volume: config.volume ?? 50,
      cooldownSeconds: config.cooldownSeconds ?? 30,
    });
  } catch {
    return false;
  }
}

export async function stopAttendanceBackgroundService(): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeModule?.stopService) return false;
  try { return await nativeModule.stopService(); } catch { return false; }
}

export async function isAttendanceBackgroundServiceRunning(): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeModule?.isServiceRunning) return false;
  try { return await nativeModule.isServiceRunning(); } catch { return false; }
}

export async function checkCameraConnectionNative(): Promise<null> {
  // Camera connectivity is checked by the backend stream manager.
  return null;
}

export async function testSpeakerNative(config: Record<string, any>): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeModule?.testSpeaker || !config.cameraId) return false;
  try { return await nativeModule.testSpeaker(config); } catch { return false; }
}

export async function testAttendanceNotificationNative(name = 'Nhân viên'): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeModule?.testNotification) return false;
  try { return await nativeModule.testNotification(name); } catch { return false; }
}

