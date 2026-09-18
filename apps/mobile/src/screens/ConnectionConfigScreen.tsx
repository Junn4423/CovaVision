import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, spacing} from '../design-system';

import type {ConnectionConfig, ConnectionHealth} from '../types/app';

type ConnectionConfigScreenProps = {
  initialConfig: ConnectionConfig | null;
  status: ConnectionHealth | null;
  checkingConnection: boolean;
  savingConfig: boolean;
  onCheckConnection: (draft: ConnectionConfig) => Promise<void>;
  onSaveConnection: (draft: ConnectionConfig) => Promise<void>;
  onCancel?: () => void;
};

const EMPTY_CONFIG: ConnectionConfig = {
  label: 'Ket noi he thong ca nhan',
  apiBaseUrl: '',
};

export function ConnectionConfigScreen({
  initialConfig,
  status,
  checkingConnection,
  savingConfig,
  onCheckConnection,
  onSaveConnection,
  onCancel,
}: ConnectionConfigScreenProps) {
  const [draft, setDraft] = useState<ConnectionConfig>(initialConfig || EMPTY_CONFIG);

  useEffect(() => {
    setDraft(initialConfig || EMPTY_CONFIG);
  }, [initialConfig]);

  function updateField<K extends keyof ConnectionConfig>(
    key: K,
    value: ConnectionConfig[K],
  ) {
    setDraft(current => {
      const nextDraft: ConnectionConfig = {
        ...current,
        [key]: value,
      };

      return nextDraft;
    });
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Chấm công Mobile</Text>
          <Text style={styles.title}>Cấu hình kết nối hệ thống</Text>
          <Text style={styles.description}>
            Nhập thông tin kết nối để app có thể giao tiếp với hệ thống.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.label}>Tên môi trường</Text>
          <TextInput
            autoCapitalize="words"
            onChangeText={value => updateField('label', value)}
            placeholder="VD: Dev Office"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={draft.label}
          />

          <Text style={styles.label}>URL hệ thống</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="url"
            onChangeText={value => updateField('apiBaseUrl', value)}
            placeholder="https://api.example.com"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={draft.apiBaseUrl}
          />
          <Text style={styles.hint}>
            Chỉ nhập host hệ thống. App tự gọi dịch vụ.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.statusTitle}>Trạng thái kết nối</Text>
          <Text
            style={[
              styles.statusValue,
              status?.ok ? styles.statusSuccess : styles.statusPending,
            ]}>
            {status
              ? `${status.ok ? 'Sẵn sàng' : 'Cần kiểm tra'} - ${status.message}`
              : 'Chưa kiểm tra kết nối.'}
          </Text>
          {status ? <Text style={styles.metaText}>API: {status.apiStatus}</Text> : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            disabled={checkingConnection || savingConfig}
            onPress={() => onCheckConnection(draft)}
            style={({pressed}) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}>
            {checkingConnection ? (
              <ActivityIndicator color={colors.secondary} />
            ) : (
              <Text style={styles.secondaryButtonText}>Kiểm tra kết nối</Text>
            )}
          </Pressable>

          <Pressable
            disabled={checkingConnection || savingConfig}
            onPress={() => onSaveConnection(draft)}
            style={({pressed}) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}>
            {savingConfig ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Lưu và vào app</Text>
            )}
          </Pressable>

          {onCancel ? (
            <Pressable onPress={onCancel} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Quay lại</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.page,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: spacing.sm + 2,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  presetList: {
    gap: spacing.sm + 2,
    marginBottom: spacing.lg,
  },
  presetButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 4,
  },
  presetButtonActive: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryBg,
  },
  presetTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  presetDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.slate[50],
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  statusTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  statusValue: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm + 2,
  },
  statusPending: {
    color: colors.textSecondary,
  },
  statusSuccess: {
    color: colors.success,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    gap: spacing.md,
    paddingBottom: 18,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.card,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.88,
  },
});
