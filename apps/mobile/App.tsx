import React, {useEffect, useState} from 'react';
import {Alert, StatusBar, useColorScheme} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ConnectionConfigScreen} from './src/screens/ConnectionConfigScreen';
import {AdminLoginScreen} from './src/screens/native/AdminLoginScreen';
import {AdminWorkspaceScreen} from './src/screens/native/AdminWorkspaceScreen';
import {AdminHubScreen} from './src/screens/native/AdminHubScreen';
import {AttendanceActionScreen} from './src/screens/native/AttendanceActionScreen';
import {EmployeeAttendanceScreen} from './src/screens/native/EmployeeAttendanceScreen';
import {EmployeeLoginScreen} from './src/screens/native/EmployeeLoginScreen';
import {EmployeeRegistrationScreen} from './src/screens/native/EmployeeRegistrationScreen';
import {PortalScreen} from './src/screens/native/PortalScreen';
import {api, setApiBaseUrl, setGatewayAuth, setSessionToken, setUnauthorizedListener} from './src/services/api';
import {AUTH_STORAGE_KEY, clearStoredSession} from './src/services/authSession';
import {loadConnectionConfig, saveConnectionConfig} from './src/services/connectionStorage';
import {initializeMobileLocalDataStore} from './src/services/nativeLocalAttendance';
import {colors} from './src/theme';
import type {AdminModuleKey, AppScreen, ConnectionConfig, ConnectionHealth} from './src/types/app';

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
  const [initialModule, setInitialModule] = useState<AdminModuleKey>('dashboard');
  const [attendanceBack, setAttendanceBack] = useState<'admin_hub' | 'admin_workspace' | 'portal'>('admin_hub');

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
            setSessionToken(token); setGatewayAuth(auth.user || auth);
            const me = await api.sessionStatus();
            if (me?.success) { setInitialAdminUser(sessionUser(auth)); setScreen('admin_workspace'); }
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

  function handleLoggedIn(payload: any) { setInitialAdminUser(sessionUser(payload)); setScreen('admin_workspace'); }
  async function handleLogout() { await clearStoredSession(); setInitialAdminUser(null); setScreen('admin_login'); }

  if (!bootstrapped) return <SafeAreaProvider><StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={colors.pageBackground} /></SafeAreaProvider>;

  return <SafeAreaProvider>
    <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={colors.pageBackground} />
    {screen === 'manual_config' && <ConnectionConfigScreen initialConfig={config} status={health} checkingConnection={checkingConnection} savingConfig={savingConfig} onCheckConnection={checkConnection} onSaveConnection={saveConnection} onCancel={config ? () => setScreen('admin_login') : undefined} />}
    {screen === 'portal' && <PortalScreen onOpenEmployee={() => setScreen('employee_login')} onOpenAdmin={() => setScreen('admin_login')} />}
    {screen === 'admin_login' && <AdminLoginScreen onBack={() => setScreen('portal')} onLoggedIn={handleLoggedIn} />}
    {screen === 'employee_login' && <EmployeeLoginScreen onBack={() => setScreen('portal')} onLoggedIn={payload => { setInitialAdminUser(sessionUser(payload)); setScreen('employee_attendance'); }} onCompanyAttendance={handleLoggedIn} />}
    {screen === 'employee_attendance' && <EmployeeAttendanceScreen onBackToLogin={() => setScreen('employee_login')} />}
    {screen === 'admin_hub' && <AdminHubScreen adminUser={initialAdminUser} onOpenAttendance={() => {setAttendanceBack('admin_hub'); setScreen('admin_attendance');}} onOpenConfig={(module?: AdminModuleKey) => {setInitialModule(module || 'dashboard'); setScreen('admin_workspace');}} onLogout={() => handleLogout()} />}
    {screen === 'admin_attendance' && <AttendanceActionScreen adminUser={initialAdminUser} onBack={() => setScreen(attendanceBack)} />}
    {screen === 'admin_workspace' && <AdminWorkspaceScreen key={`workspace-${initialModule}`} initialAdminUser={initialAdminUser} initialModule={initialModule} onBackToPortal={() => setScreen('portal')} onOpenEmployeeRegister={(employee?: any) => {setEmployeeRegistrationSeed(employee || null); setScreen('employee_register');}} onRequireLogin={() => setScreen('admin_login')} onOpenAttendanceScreen={() => {setAttendanceBack('admin_workspace'); setScreen('admin_attendance');}} />}
    {screen === 'employee_register' && <EmployeeRegistrationScreen initialEmployee={employeeRegistrationSeed} onBack={() => {setEmployeeRegistrationSeed(null); setScreen('admin_workspace');}} />}
  </SafeAreaProvider>;
}

