import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useState} from 'react';
import {ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View} from 'react-native';
import {api, setGatewayAuth, setSessionToken} from '../../services/api';
import {AUTH_STORAGE_KEY} from '../../services/authSession';

type Props = {onBack: () => void; onLoggedIn: (payload: any) => void; onCompanyAttendance: (payload: any) => void};

export function EmployeeLoginScreen({onBack, onLoggedIn}: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!username.trim() || !password) { setError('Vui lòng nhập tài khoản và mật khẩu.'); return; }
    setLoading(true); setError('');
    try {
      const response = await api.employeeLogin(username.trim(), password);
      if (!response?.success) { setError(response?.message || 'Đăng nhập thất bại.'); return; }
      const token = response.access_token || response.token;
      setSessionToken(token); setGatewayAuth(response.user || null);
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({...response, token, sessionToken: token, authMode: 'employee'}));
      onLoggedIn({...response, token, sessionToken: token, authMode: 'employee'});
    } catch (err: any) { setError(err?.message || 'Không thể kết nối CovaVision API.'); }
    finally { setLoading(false); }
  }

  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>COVAVISION</Text>
        <Text style={styles.title}>Đăng nhập nhân viên</Text>
        <TextInput value={username} onChangeText={setUsername} placeholder="Tài khoản" autoCapitalize="none" style={styles.input} />
        <TextInput value={password} onChangeText={setPassword} placeholder="Mật khẩu" secureTextEntry style={styles.input} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable onPress={submit} disabled={loading} style={styles.button}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Đăng nhập</Text>}</Pressable>
        <Pressable onPress={onBack} style={styles.link}><Text style={styles.linkText}>Quay lại</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#f8fafc'}, container: {flex: 1, justifyContent: 'center', padding: 24},
  card: {backgroundColor: '#fff', borderRadius: 24, padding: 24, gap: 14, elevation: 3}, eyebrow: {color: '#2563eb', fontWeight: '800', letterSpacing: 2},
  title: {fontSize: 28, fontWeight: '800', color: '#0f172a', marginBottom: 8}, input: {borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#0f172a'},
  error: {color: '#dc2626'}, button: {backgroundColor: '#2563eb', borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center'}, buttonText: {color: '#fff', fontWeight: '800'}, link: {alignItems: 'center', padding: 8}, linkText: {color: '#475569'},
});

