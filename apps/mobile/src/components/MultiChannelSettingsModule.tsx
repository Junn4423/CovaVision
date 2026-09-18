import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Icon} from './Icon';
import {Card} from './ui';
import {colors} from '../theme';
import {spacing, border} from '../designSystem';
import {
  AiServerChannel,
  buildChannelsFromLv777,
  loadSelectedChannelId,
  saveSelectedChannelId,
} from '../services/connectionStorage';
import {request, setActiveAiHost} from '../services/request';
import {AUTH_STORAGE_KEY} from '../services/authSession';

interface PingState {
  loading: boolean;
  status: 'idle' | 'online' | 'offline';
  latencyMs?: number;
  error?: string;
}

const THEME_STYLES = {
  green: {
    bg: '#f0fdf4',
    border: '#86efac',
    activeBorder: '#16a34a',
    iconBg: '#dcfce7',
    accent: '#15803d',
    subText: '#166534',
    badgeBg: '#bbf7d0',
    badgeText: '#14532d',
    buttonBg: '#16a34a',
  },
  yellow: {
    bg: '#fefce8',
    border: '#fde047',
    activeBorder: '#ca8a04',
    iconBg: '#fef9c3',
    accent: '#a16207',
    subText: '#854d0e',
    badgeBg: '#fef08a',
    badgeText: '#713f12',
    buttonBg: '#ca8a04',
  },
  rose: {
    bg: '#fff1f2',
    border: '#fecdd3',
    activeBorder: '#e11d48',
    iconBg: '#ffe4e6',
    accent: '#be123c',
    subText: '#9f1239',
    badgeBg: '#fecdd3',
    badgeText: '#881337',
    buttonBg: '#e11d48',
  },
};

const CHANNEL_DESCRIPTIONS: Record<string, string> = {
  priority: 'Kênh nhận diện chính - Độ ưu tiên cao nhất',
  channel_1: 'Kênh dự phòng số 1 - Sẵn sàng chuyển đổi',
  channel_2: 'Kênh dự phòng số 2 - Phụ tải tự động',
  channel_3: 'Kênh dự phòng số 3 - Kênh sao lưu mở rộng',
};

interface MultiChannelSettingsModuleProps {
  hideHeader?: boolean;
}

export function MultiChannelSettingsModule({hideHeader = false}: MultiChannelSettingsModuleProps) {
  const [channels, setChannels] = useState<AiServerChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('priority');
  const [pingStates, setPingStates] = useState<Record<string, PingState>>({});
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Initialize channels and saved selection
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const rawAuth = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        let lv777 = '';
        if (rawAuth) {
          try {
            const parsed = JSON.parse(rawAuth);
            lv777 = parsed?.lv777 || parsed?.maServices || '';
          } catch {
            // ignore
          }
        }

        const channelList = buildChannelsFromLv777();
        const savedId = await loadSelectedChannelId();

        if (mounted) {
          setChannels(channelList);
          setSelectedChannelId(savedId);

          const matched = channelList.find(c => c.id === savedId) || channelList[0];
          if (matched) {
            setActiveAiHost(matched.url);
          }
          setInitialLoading(false);
        }
      } catch {
        if (mounted) setInitialLoading(false);
      }
    }

    init();
    return () => {
      mounted = false;
    };
  }, []);

  // Ping a single server channel through the internal proxy / Gateway with HTTP/HTTPS auto-fallback
  const testChannelConnection = useCallback(async (channel: AiServerChannel) => {
    setPingStates(prev => ({
      ...prev,
      [channel.id]: {loading: true, status: 'idle'},
    }));

    let targetUrl = channel.url;
    let isOnline = false;
    let latencyMs = 0;
    let lastError = 'Mất kết nối';

    // 1. Thử URL hiện tại (thường là HTTP)
    const startTime = Date.now();
    try {
      const res = await request(
        `/api/health?host=${encodeURIComponent(targetUrl)}`,
        {
          method: 'GET',
          headers: {
            'X-AI-Host': targetUrl,
          },
          timeout: 8000,
        },
      );

      const clientLatency = Date.now() - startTime;
      latencyMs = typeof res?.latency_ms === 'number' ? res.latency_ms : clientLatency;

      if (res?.success && (res?.ai_status === 'online' || res?.status === 'ok')) {
        isOnline = true;
      } else {
        lastError = res?.error || 'Mất kết nối';
      }
    } catch (err: any) {
      lastError = err?.message || 'Mất kết nối';
    }

    // 2. Nếu thất bại và đang dùng http://, tự động fallback thử https://
    if (!isOnline && targetUrl.startsWith('http://')) {
      const fallbackHttpsUrl = targetUrl.replace(/^http:\/\//i, 'https://');
      try {
        const httpsStartTime = Date.now();
        const resHttps = await request(
          `/api/health?host=${encodeURIComponent(fallbackHttpsUrl)}`,
          {
            method: 'GET',
            headers: {
              'X-AI-Host': fallbackHttpsUrl,
            },
            timeout: 8000,
          },
        );

        const clientLatency = Date.now() - httpsStartTime;
        const httpsLatencyMs = typeof resHttps?.latency_ms === 'number' ? resHttps.latency_ms : clientLatency;

        if (resHttps?.success && (resHttps?.ai_status === 'online' || resHttps?.status === 'ok')) {
          console.log(`[MultiChannel] Channel ${channel.id} tự động fallback HTTPS thành công: ${fallbackHttpsUrl}`);
          isOnline = true;
          latencyMs = httpsLatencyMs;
          targetUrl = fallbackHttpsUrl;

          // Cập nhật URL channel sang https
          setChannels(prev =>
            prev.map(ch => (ch.id === channel.id ? {...ch, url: fallbackHttpsUrl} : ch)),
          );
        }
      } catch {
        // Giữ nguyên trạng thái lỗi ban đầu
      }
    }

    if (isOnline) {
      console.log(`[MultiChannel] Channel ${channel.id} (${targetUrl}) ONLINE - latency: ${latencyMs}ms`);
      setPingStates(prev => ({
        ...prev,
        [channel.id]: {loading: false, status: 'online', latencyMs},
      }));
    } else {
      console.log(`[MultiChannel] Channel ${channel.id} (${targetUrl}) OFFLINE - error: ${lastError}`);
      setPingStates(prev => ({
        ...prev,
        [channel.id]: {
          loading: false,
          status: 'offline',
          error: lastError,
        },
      }));
    }
  }, []);

  // Ping all channels sequentially to avoid jamming the PHP Gateway
  const testAllChannels = useCallback(async (channelList?: AiServerChannel[]) => {
    const targetChannels = channelList || channels;
    if (targetChannels.length === 0) return;

    setIsCheckingAll(true);
    for (const ch of targetChannels) {
      await testChannelConnection(ch);
    }
    setIsCheckingAll(false);
  }, [channels, testChannelConnection]);

  // Auto test on initial load
  useEffect(() => {
    if (channels.length > 0 && !initialLoading) {
      testAllChannels(channels);
    }
  }, [channels, initialLoading, testAllChannels]);

  // Select a channel
  const handleSelectChannel = async (channel: AiServerChannel) => {
    if (channel.id === selectedChannelId) return;

    setSelectedChannelId(channel.id);
    await saveSelectedChannelId(channel.id);
    setActiveAiHost(channel.url);

    Alert.alert(
      'Kích hoạt thành công',
      `Đã chuyển sang "${channel.title}". Toàn bộ tác vụ nhận diện khuôn mặt và điểm danh sẽ ưu tiên định tuyến qua máy chủ này.`,
      [{text: 'Đã hiểu'}],
    );
  };

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Đang tải cấu hình máy chủ...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!hideHeader && (
        <View style={styles.headerBox}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerIconWrapper}>
              <Icon name="server" size={24} color="#0037b0" />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.headerTitle}>Hệ thống đa kênh máy chủ AI</Text>
              <Text style={styles.headerSub}>
                Chuyển đổi linh hoạt giữa các cụm máy chủ xử lý nhận diện. Toàn bộ dữ liệu khuôn mặt tự động đồng bộ chéo giữa các máy.
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Control bar */}
      <View style={styles.controlBar}>
        <View style={styles.activeChannelInfo}>
          <Icon name="check_circle" size={16} color="#15803d" />
          <Text style={styles.activeChannelInfoText}>
            Kênh đang kích hoạt:{' '}
            <Text style={styles.activeChannelInfoBold}>
              {channels.find(c => c.id === selectedChannelId)?.title || 'Máy chủ ưu tiên'}
            </Text>
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.checkAllButton, isCheckingAll && styles.checkAllButtonDisabled]}
          onPress={() => testAllChannels()}
          disabled={isCheckingAll}
          activeOpacity={0.7}>
          {isCheckingAll ? (
            <ActivityIndicator size="small" color="#ffffff" style={{marginRight: 6}} />
          ) : (
            <Icon name="refresh" size={15} color="#ffffff" style={{marginRight: 6}} />
          )}
          <Text style={styles.checkAllButtonText}>
            {isCheckingAll ? 'Đang kiểm tra...' : 'Kiểm tra tất cả'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Channel Cards */}
      <View style={styles.channelList}>
        {channels.map(channel => {
          const isSelected = channel.id === selectedChannelId;
          const theme = THEME_STYLES[channel.theme] || THEME_STYLES.rose;
          const ping = pingStates[channel.id] || {status: 'idle', loading: false};
          const description =
            CHANNEL_DESCRIPTIONS[channel.id] || 'Máy chủ dự phòng nhận diện';

          return (
            <Pressable
              key={channel.id}
              style={[
                styles.channelCard,
                {
                  backgroundColor: theme.bg,
                  borderColor: isSelected ? theme.activeBorder : theme.border,
                  borderWidth: isSelected ? 2 : 1.5,
                },
                isSelected && styles.channelCardSelected,
              ]}
              onPress={() => handleSelectChannel(channel)}>
              {/* Top Row: Title & Active Badge */}
              <View style={styles.cardHeaderRow}>
                <View style={styles.titleWithIcon}>
                  <View style={[styles.iconCircle, {backgroundColor: theme.iconBg}]}>
                    <Icon name="server" size={20} color={theme.accent} />
                  </View>
                  <View style={{flex: 1}}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.channelTitle, {color: theme.accent}]}>
                        {channel.title}
                      </Text>
                      {isSelected && (
                        <View style={[styles.activePill, {backgroundColor: theme.buttonBg}]}>
                          <Icon name="check" size={12} color="#ffffff" style={{marginRight: 3}} />
                          <Text style={styles.activePillText}>ĐANG CHỌN</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.channelSub, {color: theme.subText}]}>
                      {description}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Status and Latency Row */}
              <View style={styles.statusDivider} />

              <View style={styles.cardBottomRow}>
                <View style={styles.statusGroup}>
                  {ping.loading ? (
                    <View style={styles.statusItem}>
                      <ActivityIndicator size="small" color={theme.accent} style={{marginRight: 6}} />
                      <Text style={styles.statusTextPending}>Đang kiểm tra kết nối...</Text>
                    </View>
                  ) : ping.status === 'online' ? (
                    <View style={styles.statusItem}>
                      <View style={styles.dotOnline} />
                      <Text style={styles.statusTextOnline}>Đang hoạt động</Text>
                      {typeof ping.latencyMs === 'number' && (
                        <View style={styles.latencyBadge}>
                          <Icon name="bolt" size={12} color="#15803d" />
                          <Text style={styles.latencyText}>{ping.latencyMs} ms</Text>
                        </View>
                      )}
                    </View>
                  ) : ping.status === 'offline' ? (
                    <View style={styles.statusItem}>
                      <View style={styles.dotOffline} />
                      <Text style={styles.statusTextOffline}>Mất kết nối</Text>
                    </View>
                  ) : (
                    <View style={styles.statusItem}>
                      <View style={styles.dotIdle} />
                      <Text style={styles.statusTextIdle}>Chưa kiểm tra</Text>
                    </View>
                  )}
                </View>

                {/* Actions: Ping button & Select button */}
                <View style={styles.actionGroup}>
                  <TouchableOpacity
                    style={[
                      styles.pingButton,
                      {borderColor: theme.border, backgroundColor: '#ffffff'},
                    ]}
                    onPress={() => testChannelConnection(channel)}
                    disabled={ping.loading}
                    activeOpacity={0.7}>
                    {ping.loading ? (
                      <ActivityIndicator size="small" color={theme.accent} />
                    ) : (
                      <>
                        <Icon name="refresh" size={13} color={theme.accent} style={{marginRight: 4}} />
                        <Text style={[styles.pingButtonText, {color: theme.accent}]}>
                          Kiểm tra kết nối
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {!isSelected && (
                    <TouchableOpacity
                      style={[styles.selectButton, {backgroundColor: theme.buttonBg}]}
                      onPress={() => handleSelectChannel(channel)}
                      activeOpacity={0.8}>
                      <Text style={styles.selectButtonText}>Chọn máy chủ</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  headerBox: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerIconWrapper: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  headerSub: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 18,
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  activeChannelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeChannelInfoText: {
    fontSize: 13,
    color: '#475569',
  },
  activeChannelInfoBold: {
    fontWeight: '700',
    color: '#0f172a',
  },
  checkAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0037b0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  checkAllButtonDisabled: {
    opacity: 0.7,
  },
  checkAllButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  channelList: {
    gap: spacing.md,
  },
  channelCard: {
    borderRadius: 16,
    padding: spacing.lg,
    shadowColor: '#0f172a',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  channelCardSelected: {
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  channelTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  channelSub: {
    fontSize: 12.5,
    marginTop: 2,
    fontWeight: '500',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  activePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  statusDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    marginVertical: spacing.md,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotOnline: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#16a34a',
  },
  dotOffline: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#dc2626',
  },
  dotIdle: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#94a3b8',
  },
  statusTextOnline: {
    fontSize: 13,
    fontWeight: '600',
    color: '#15803d',
  },
  statusTextOffline: {
    fontSize: 13,
    fontWeight: '600',
    color: '#dc2626',
  },
  statusTextIdle: {
    fontSize: 13,
    color: '#64748b',
  },
  statusTextPending: {
    fontSize: 13,
    color: '#64748b',
  },
  latencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 2,
    marginLeft: 4,
  },
  latencyText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803d',
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  pingButtonText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  selectButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  selectButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#ffffff',
  },
});
