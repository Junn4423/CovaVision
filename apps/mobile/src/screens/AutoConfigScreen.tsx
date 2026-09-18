import React from 'react';
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

import type {DiscoveredServerOffer} from '../types/app';

type AutoConfigScreenProps = {
  discoveredServers: DiscoveredServerOffer[];
  selectedServerKey: string;
  pairingMode: 'udp' | 'qr';
  pairingCode: string;
  qrPayloadText: string;
  runningDiscovery: boolean;
  pairing: boolean;
  statusText: string;
  statusType: 'info' | 'success' | 'error';
  onSelectServer: (serverKey: string) => void;
  onChangePairingMode: (mode: 'udp' | 'qr') => void;
  onChangePairingCode: (value: string) => void;
  onRefreshDiscovery: () => void;
  onOpenQrScanner: () => void;
  onPair: () => void;
  onOpenManualConfig: () => void;
  onUseSavedConfig?: () => void;
};

export function AutoConfigScreen({
  discoveredServers,
  selectedServerKey,
  pairingMode,
  pairingCode,
  qrPayloadText,
  runningDiscovery,
  pairing,
  statusText,
  statusType,
  onSelectServer,
  onChangePairingMode,
  onChangePairingCode,
  onRefreshDiscovery,
  onOpenQrScanner,
  onPair,
  onOpenManualConfig,
  onUseSavedConfig,
}: AutoConfigScreenProps) {
  function buildOfferKey(server: DiscoveredServerOffer): string {
    return `${server.serverId}|${server.apiBaseUrl}|${server.sourceIp}`;
  }

  const selectedServer =
    discoveredServers.find(item => buildOfferKey(item) === selectedServerKey) || null;

  const hasQrPayload = Boolean(qrPayloadText && qrPayloadText.trim());

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Cấu hình tự động</Text>
          <Text style={styles.title}>Kết nối FaceCheck</Text>
          <Text style={styles.description}>
            App sẽ tự tìm server trong LAN (qua desktop app). Chọn server hoặc
            quét QR, rồi nhập mã 6 số để kết nối.
          </Text>
        </View>

        {/* ── Step 1: Discover or QR ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Bước 1: Tìm server</Text>
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => onChangePairingMode('udp')}
              style={({pressed}) => [
                styles.modeButton,
                pairingMode === 'udp' && styles.modeButtonActive,
                pressed && styles.buttonPressed,
              ]}>
              <Text
                style={[
                  styles.modeButtonLabel,
                  pairingMode === 'udp' && styles.modeButtonLabelActive,
                ]}>
                  Tìm trong LAN
              </Text>
              <Text
                style={[
                  styles.modeButtonDescription,
                  pairingMode === 'udp' && styles.modeButtonDescriptionActive,
                ]}>
                  Tự động phát hiện qua UDP.
              </Text>
            </Pressable>

            <Pressable
              onPress={() => onChangePairingMode('qr')}
              style={({pressed}) => [
                styles.modeButton,
                pairingMode === 'qr' && styles.modeButtonActive,
                pressed && styles.buttonPressed,
              ]}>
              <Text
                style={[
                  styles.modeButtonLabel,
                  pairingMode === 'qr' && styles.modeButtonLabelActive,
                ]}>
                  Quét mã QR
              </Text>
              <Text
                style={[
                  styles.modeButtonDescription,
                  pairingMode === 'qr' && styles.modeButtonDescriptionActive,
                ]}>
                Ổn định hơn khi LAN phức tạp.
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Server list (UDP mode) ── */}
        {pairingMode === 'udp' ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Server tìm được</Text>
              <Pressable
                onPress={onRefreshDiscovery}
                disabled={runningDiscovery || pairing}
                style={({pressed}) => [styles.miniButton, pressed && styles.buttonPressed]}>
                {runningDiscovery ? (
                  <ActivityIndicator color={colors.secondary} size="small" />
                ) : (
                  <Text style={styles.miniButtonText}>Quét lại</Text>
                )}
              </Pressable>
            </View>

            {discoveredServers.length === 0 ? (
              <Text style={styles.emptyText}>
                Chưa tìm thấy server. Kiểm tra desktop app đang chạy và cùng
                LAN, hoặc dùng quét QR.
              </Text>
            ) : (
              <View style={styles.serverList}>
                {discoveredServers.map(server => {
                  const selected = buildOfferKey(server) === selectedServerKey;
                  return (
                    <Pressable
                      key={buildOfferKey(server)}
                      onPress={() => onSelectServer(buildOfferKey(server))}
                      style={({pressed}) => [
                        styles.serverRow,
                        selected && styles.serverRowSelected,
                        pressed && styles.buttonPressed,
                      ]}>
                      <Text style={styles.serverName}>{server.serverName}</Text>
                      <Text style={styles.serverMeta}>API: {server.apiBaseUrl}</Text>
                      <Text style={styles.serverMeta}>
                        Pair version {server.pairVersion}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        {/* ── QR Scanner (QR mode) ── */}
        {pairingMode === 'qr' ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Quét QR từ desktop</Text>
            <Pressable
              onPress={onOpenQrScanner}
              disabled={pairing}
              style={({pressed}) => [
                styles.qrScanButton,
                pressed && styles.buttonPressed,
              ]}>
              <Text style={styles.qrScanButtonText}>Mở camera quét QR</Text>
            </Pressable>
            {hasQrPayload ? (
              <View style={styles.qrSuccessBox}>
                <Text style={styles.qrSuccessText}>
                  Đã quét QR thành công. Nhập mã 6 số ở bước 2 để kết nối.
                </Text>
              </View>
            ) : (
              <Text style={styles.hint}>
                Mở trang "Cấu hình mobile" trên desktop, tạo QR rồi quét bằng camera.
              </Text>
            )}
          </View>
        ) : null}

        {/* ── Step 2: Pairing code ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Bước 2: Nhập mã 6 số</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={onChangePairingCode}
            placeholder="Nhập mã 6 số từ desktop"
            placeholderTextColor={colors.textMuted}
            style={styles.codeInput}
            value={pairingCode}
          />
          {selectedServer ? (
            <Text style={styles.hint}>
              Server: {selectedServer.serverName}. Nhập đúng mã sẽ tự lưu kết nối.
            </Text>
          ) : pairingMode === 'qr' && hasQrPayload ? (
            <Text style={styles.hint}>
              Đã có thông tin QR. Nhập mã 6 số hiển thị trên desktop rồi bấm kết nối.
            </Text>
          ) : (
            <Text style={styles.hint}>
              Chọn server ở trên hoặc quét QR trước, rồi nhập mã 6 số.
            </Text>
          )}
        </View>

        {/* ── Status ── */}
        {statusText ? (
          <View
            style={[
              styles.statusBox,
              statusType === 'success'
                ? styles.statusSuccess
                : statusType === 'error'
                  ? styles.statusError
                  : styles.statusInfo,
            ]}>
            <Text
              style={[
                styles.statusText,
                statusType === 'success'
                  ? styles.statusTextSuccess
                  : statusType === 'error'
                    ? styles.statusTextError
                    : styles.statusTextInfo,
              ]}>
              {statusText}
            </Text>
          </View>
        ) : null}

        {/* ── Actions ── */}
        <View style={styles.actions}>
          <Pressable
            onPress={onPair}
            disabled={pairing}
            style={({pressed}) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}>
            {pairing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Kết nối và lưu cấu hình</Text>
            )}
          </Pressable>

          {onUseSavedConfig ? (
            <Pressable onPress={onUseSavedConfig} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Dùng cấu hình đã lưu</Text>
            </Pressable>
          ) : null}

          <Pressable onPress={onOpenManualConfig} style={styles.ghostButton}>
            <Text style={styles.ghostButtonText}>Nhập URL thủ công</Text>
          </Pressable>
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
    gap: spacing.sm + 2,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.slate[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: 4,
  },
  modeButtonActive: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryBg,
  },
  modeButtonLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  modeButtonLabelActive: {
    color: colors.primary,
  },
  modeButtonDescription: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  modeButtonDescriptionActive: {
    color: colors.primaryContainer,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  miniButton: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  miniButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  serverList: {
    gap: spacing.sm,
  },
  serverRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.slate[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: 2,
  },
  serverRowSelected: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  serverName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  serverMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  qrScanButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  qrScanButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  qrSuccessBox: {
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  qrSuccessText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '600',
  },
  codeInput: {
    backgroundColor: colors.slate[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  statusBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  statusInfo: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryBg,
  },
  statusSuccess: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  statusError: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  statusText: {
    fontSize: 13,
    lineHeight: 18,
  },
  statusTextInfo: {
    color: colors.primary,
  },
  statusTextSuccess: {
    color: colors.success,
  },
  statusTextError: {
    color: colors.danger,
  },
  actions: {
    gap: spacing.sm + 2,
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
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  ghostButton: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghostButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.88,
  },
});
