import AsyncStorage from '@react-native-async-storage/async-storage';
import {AUTH_STORAGE_KEY, clearStoredSession, logoutGatewaySession} from '../src/services/authSession';

describe('CovaVision mobile session', () => {
  afterEach(async () => {
    await clearStoredSession();
  });

  test('uses local CovaVision session storage and does not call a legacy logout host', async () => {
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({accessToken: 'token'}));
    const result = await logoutGatewaySession();
    expect(result).toEqual({success: true});
    expect(await AsyncStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
});
