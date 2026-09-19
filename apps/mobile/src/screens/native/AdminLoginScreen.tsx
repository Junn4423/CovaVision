import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {api, setAuthData, setSessionToken} from '../../services/api';
import {AUTH_STORAGE_KEY} from '../../services/authSession';
import {colors, radii, shadows, spacing} from '../../design-system';

type Props = {onBack: () => void; onLoggedIn: (payload: any) => void};

export function AdminLoginScreen({onBack, onLoggedIn}: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!username.trim() || !password) {
      setError(mode === 'register' ? 'Vui lòng nhập email và mật khẩu.' : 'Vui lòng nhập email/tài khoản và mật khẩu.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = mode === 'register'
        ? await api.registerAccount(username.trim(), password, fullName, organizationName)
        : await api.adminLogin(username.trim(), password);
      if (!response?.success) {
        setError(response?.message || 'Đăng nhập thất bại.');
        return;
      }
      const token = response.access_token || response.token;
      setSessionToken(token);
      setAuthData(response.user || null);
      await AsyncStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({...response, token, sessionToken: token})
      );
      onLoggedIn({...response, token, sessionToken: token});
    } catch (err: any) {
      setError(err?.message || 'Không thể kết nối máy chủ CovaVision API.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          {/* Brand Header */}
          <View style={styles.brandHeader}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>CV</Text>
            </View>
            <View>
              <Text style={styles.eyebrow}>COVAVISION</Text>
              <Text style={styles.versionBadge}>v3.1 Mobile</Text>
            </View>
          </View>

          <Text style={styles.title}>{mode === 'register' ? 'Tạo workspace' : 'Đăng nhập quản trị'}</Text>
          <Text style={styles.subtitle}>
            {mode === 'register' ? 'Bắt đầu dùng thử 14 ngày với 3 nhân viên và 3 khuôn mặt.' : 'Quản trị viên và nhân viên vận hành hệ thống điểm danh CovaVision.'}
          </Text>

          {/* Form inputs */}
          <View style={styles.form}>
            <View>
              <Text style={styles.fieldLabel}>{mode === 'register' ? 'Email' : 'Email hoặc tài khoản'}</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder={mode === 'register' ? 'you@company.vn' : 'Nhập email hoặc username'}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={styles.input}
              />
            </View>

            {mode === 'register' ? <>
              <View>
                <Text style={styles.fieldLabel}>Tên người quản trị</Text>
                <TextInput value={fullName} onChangeText={setFullName} placeholder="Nguyễn Văn A" placeholderTextColor={colors.textMuted} autoCapitalize="words" style={styles.input} />
              </View>
              <View>
                <Text style={styles.fieldLabel}>Tên công ty / workspace</Text>
                <TextInput value={organizationName} onChangeText={setOrganizationName} placeholder="Công ty của tôi" placeholderTextColor={colors.textMuted} style={styles.input} />
              </View>
            </> : null}

            <View>
              <Text style={styles.fieldLabel}>Mật khẩu</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Nhập mật khẩu"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  style={styles.passwordInput}
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  <Text style={styles.eyeText}>{showPassword ? 'Ẩn' : 'Hiện'}</Text>
                </Pressable>
              </View>
            </View>

            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              onPress={submit}
              disabled={loading}
              style={({pressed}) => [styles.button, pressed && styles.buttonPressed]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>{mode === 'register' ? 'Tạo tài khoản dùng thử' : 'Đăng nhập'}</Text>
              )}
            </Pressable>

            <Pressable onPress={() => {setMode(current => current === 'login' ? 'register' : 'login'); setError('');}} style={styles.link}>
              <Text style={styles.linkText}>{mode === 'register' ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Tạo workspace bằng email'}</Text>
            </Pressable>

            <Pressable onPress={onBack} style={styles.link}>
              <Text style={styles.linkText}>Thay đổi cấu hình máy chủ API</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii['2xl'] || 24,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    marginBottom: spacing.md,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: radii.xl || 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
  },
  versionBadge: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  form: {
    gap: spacing.md,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs + 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg || 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    color: colors.textPrimary,
    fontSize: 15,
    backgroundColor: colors.slate[50],
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg || 12,
    backgroundColor: colors.slate[50],
    paddingHorizontal: spacing.md,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: spacing.md - 2,
    color: colors.textPrimary,
    fontSize: 15,
  },
  eyeButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  eyeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: radii.md || 10,
    padding: spacing.sm + 2,
  },
  errorText: {
    color: colors.dangerText,
    fontSize: 13,
    fontWeight: '600',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg || 12,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    ...shadows.sm,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{scale: 0.99}],
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  link: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  linkText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
});
