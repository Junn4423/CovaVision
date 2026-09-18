import React, {useEffect, useState} from 'react';
import {Alert, StatusBar, useColorScheme} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ConnectionConfigScreen} from './src/screens/ConnectionConfigScreen';
import {AdminLoginScreen} from './src/screens/native/AdminLoginScreen';
import {AttendanceActionScreen} from './src/screens/native/AttendanceActionScreen';
import {EmployeeRegistrationScreen} from './src/screens/native/EmployeeRegistrationScreen';
import {CovaVisionAdminHomeScreen} from './src/screens/CovaVisionAdminHomeScreen';
import {api, setApiBaseUrl, setSessionToken, setUnauthorizedListener} from './src/services/api';
import {AUTH_STORAGE_KEY, clearStoredSession} from './src/services/authSession';
import {loadConnectionConfig, saveConnectionConfig} from './src/services/connectionStorage';
import {initializeMobileLocalDataStore} from './src/services/nativeLocalAttendance';
import {colors} from './src/theme';
import type {AppScreen, ConnectionConfig, ConnectionHealth} from './src/types/app';

function sessionUser(payload: any): any {
  return payload?.user || {username: payload?.username || 'CovaVision', name: payload?.username || 'CovaVision'};
}

export default function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [bootstrapped, setBootstrapped] = useState(false);
  const [screen, setScreen] = useState<AppScreen>('admin_login');
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [health, setHealth] = useState<ConnectionHealth | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [initialAdminUser, setInitialAdminUser] = useState<any>(null);
  const [employeeRegistrationSeed, setEmployeeRegistrationSeed] = useState<any>(null);
  const [attendanceBack, setAttendanceBack] = useState<'admin_home'>('admin_home');

  useEffect(() => {
    setUnauthorizedListener(message => {
      Alert.alert('Phiên hết hạn', message, [{text: 'Đăng nhập lại', onPress: () => clearStoredSession().then(() => setScreen('admin_login'))}], {cancelable: false});
    });
    initializeMobileLocalDataStore().catch(() => {});
    (async () => {
      const saved = await loadConnectionConfig().catch(() => null);
      setConfig(saved);
      if (!saved) { setScreen('manual_config'); setBootstrapped(true); return; }
      setApiBaseUrl(saved.apiBaseUrl);
      const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY).catch(() => null);
      if (raw) {
        try {
          const auth = JSON.parse(raw);
          const token = auth?.access_token || auth?.sessionToken || auth?.token;
          if (token) {
            setSessionToken(token);
            const me = await api.sessionStatus();
            if (me?.success || me?.authenticated) { setInitialAdminUser(sessionUser(auth)); setScreen('admin_home'); }
          }
        } catch { /* Show login when persisted state is invalid. */ }
      }
      setBootstrapped(true);
    })().catch(() => setBootstrapped(true));
    return () => setUnauthorizedListener(null);
  }, []);

  async function checkConnection(draft: ConnectionConfig) {
    setCheckingConnection(true);
    try {
      setApiBaseUrl(draft.apiBaseUrl);
      const response = await api.health();
      const next: ConnectionHealth = {ok: response?.status === 'ok', apiBaseUrl: draft.apiBaseUrl, checkedAt: new Date().toISOString(), message: response?.status === 'ok' ? 'API đang hoạt động.' : 'API chưa phản hồi đúng.', apiStatus: response?.status || 'error'};
      setHealth(next);
      if (!next.ok) Alert.alert('Kiểm tra kết nối', next.message);
    } catch (error: any) { setHealth({ok: false, apiBaseUrl: draft.apiBaseUrl, checkedAt: new Date().toISOString(), message: error?.message || 'Không kết nối được API.', apiStatus: 'error'}); }
    finally { setCheckingConnection(false); }
  }

  async function saveConnection(draft: ConnectionConfig) {
    setSavingConfig(true);
    try {
      const saved = await saveConnectionConfig(draft); setConfig(saved); setApiBaseUrl(saved.apiBaseUrl);
      await checkConnection(saved); setScreen('admin_login');
    } catch (error: any) { Alert.alert('Không lưu được cấu hình', error?.message || 'URL không hợp lệ.'); }
    finally { setSavingConfig(false); }
  }

  function handleLoggedIn(payload: any) { setInitialAdminUser(sessionUser(payload)); setScreen('admin_home'); }
  async function handleLogout() { await clearStoredSession(); setInitialAdminUser(null); setScreen('admin_login'); }

  if (!bootstrapped) return <SafeAreaProvider><StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={colors.pageBackground} /></SafeAreaProvider>;

  return <SafeAreaProvider>
    <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={colors.pageBackground} />
    {screen === 'manual_config' && <ConnectionConfigScreen initialConfig={config} status={health} checkingConnection={checkingConnection} savingConfig={savingConfig} onCheckConnection={checkConnection} onSaveConnection={saveConnection} onCancel={config ? () => setScreen('admin_login') : undefined} />}
    {screen === 'admin_login' && <AdminLoginScreen onBack={() => { if (config) setScreen('manual_config'); }} onLoggedIn={handleLoggedIn} />}
    {screen === 'admin_home' && <CovaVisionAdminHomeScreen adminUser={initialAdminUser} onOpenAttendance={() => {setAttendanceBack('admin_home'); setScreen('admin_attendance');}} onOpenEmployeeRegister={() => {setEmployeeRegistrationSeed(null); setScreen('employee_register');}} onOpenSettings={() => setScreen('manual_config')} onLogout={handleLogout} />}
    {screen === 'admin_attendance' && <AttendanceActionScreen adminUser={initialAdminUser} onBack={() => setScreen(attendanceBack)} />}
    {screen === 'employee_register' && <EmployeeRegistrationScreen initialEmployee={employeeRegistrationSeed} onBack={() => {setEmployeeRegistrationSeed(null); setScreen('admin_home');}} />}
  </SafeAreaProvider>;
}
