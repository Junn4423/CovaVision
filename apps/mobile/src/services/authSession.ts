import AsyncStorage from '@react-native-async-storage/async-storage';
import {clearAuthState} from './api';

export const AUTH_STORAGE_KEY = 'covavision.mobile.auth.v1';

export async function logoutGatewaySession(): Promise<{success: boolean; message?: string}> {
  clearAuthState();
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
  return {success: true};
}

export async function clearStoredSession(): Promise<void> {
  clearAuthState();
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
}
