import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Switch, Text, View} from 'react-native';
import {colors, spacing, typography} from '../../design-system';
import {Icon} from '../Icon';
import {CameraDiscoveryModal} from './CameraDiscoveryModal';
import {VolumeSlider} from '../ui/VolumeSlider';
import {
  CAMERA_SPEAKER_PROFILES,
  DEFAULT_STANDALONE_CONFIG,
  StandaloneAttendanceConfig,
} from '../../types/cameraSpeaker';
import {
  loadStandaloneAttendanceConfig,
  saveStandaloneAttendanceConfig,
} from '../../services/standaloneAttendanceStorage';
import {checkCameraConnectivity, CameraHealthResult} from '../../services/cameraHealthCheck';
import {api} from '../../services/api';

export interface StandaloneAttendanceSettingsCardProps {
  currentCamera?: any;
  availableCameras?: any[];
  onSelectCameraId?: (id: string) => void;
  onConfigChanged?: (cfg: StandaloneAttendanceConfig) => void;
}

/**
 * Camera speaker/attendance settings. The mobile client only receives camera
 * metadata and an opaque id; RTSP credentials and LAN addresses stay in API.
 */
export function StandaloneAttendanceSettingsCard({
  currentCamera,
  availableCameras,
  onSelectCameraId,
  onConfigChanged,
}: StandaloneAttendanceSettingsCardProps) {
  const [config, setConfig] = useState(DEFAULT_STANDALONE_CONFIG);
  const [cameras, setCameras] = useState<any[]>(availableCameras || []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<CameraHealthResult | null>(null);
  const [message, setMessage] = useState('');
  const [discoveryVisible, setDiscoveryVisible] = useState(false);

  const cameraId = String(config.cameraId || '').trim();
  const camera = useMemo(
    () => cameras.find(item => String(item?.id || item?.name || '') === cameraId),
    [cameras, cameraId],
  );

  const verifyCamera = useCallback(async (targetId = cameraId, showMessage = true) => {
    if (!targetId) {
      setHealth(null);
      return;
    }
    setChecking(true);
    try {
      const result = await checkCameraConnectivity(targetId);
      setHealth(result);
      if (showMessage) setMessage(result.isOnline ? 'Backend đang nhận camera.' : (result.errorMessage || 'Camera chưa chạy.'));
    } finally {
      setChecking(false);
    }
  }, [cameraId]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const saved = await loadStandaloneAttendanceConfig();
      let nextCameras = Array.isArray(availableCameras) ? availableCameras : [];
      if (!nextCameras.length) {
        const response = await api.getCameras();
        nextCameras = Array.isArray(response?.cameras) ? response.cameras : [];
      }
      setCameras(nextCameras);

      const preferredId = String(currentCamera?.id || currentCamera?.name || saved.cameraId || '').trim();
      const selected = nextCameras.find(item => String(item?.id || item?.name || '') === preferredId);
      const next = {
        ...saved,
        cameraId: String(selected?.id || selected?.name || saved.cameraId || '').trim(),
        cameraName: String(selected?.name || saved.cameraName || '').trim(),
      };
      setConfig(next);
      onConfigChanged?.(next);
      if (next.cameraId) await verifyCamera(next.cameraId, false);
    } catch {
      setMessage('Không tải được danh sách camera từ CovaVision.');
    } finally {
      setLoading(false);
    }
  }, [availableCameras, currentCamera, onConfigChanged, verifyCamera]);

  useEffect(() => { reload().catch(() => {}); }, [reload]);

  async function save(partial: Partial<StandaloneAttendanceConfig>) {
    setSaving(true);
    try {
      const next = await saveStandaloneAttendanceConfig(partial);
      setConfig(next);
      onConfigChanged?.(next);
      setMessage('Đã lưu cấu hình CovaVision.');
    } catch {
      setMessage('Không thể lưu cấu hình.');
    } finally {
      setSaving(false);
    }
  }

  async function selectCamera(item: any) {
    const id = String(item?.id || item?.name || '').trim();
    if (!id) return;
    onSelectCameraId?.(id);
    await save({cameraId: id, cameraName: String(item?.name || id)});
    await verifyCamera(id);
  }

  async function toggle(value: boolean) {
    if (!cameraId) {
      setMessage('Hãy chọn camera trước khi bật chấm công tự động.');
      return;
    }
    setSaving(true);
    try {
      const response = value
        ? await api.startCamera({camera_id: cameraId})
        : await api.stopCamera();
      if (value && response?.success !== true) throw new Error(response?.message || 'Backend không bật được camera.');
      const next = await saveStandaloneAttendanceConfig({enabled: value});
      setConfig(next);
      onConfigChanged?.(next);
      setMessage(value ? 'Đã bật camera qua backend.' : 'Đã tắt camera backend.');
      await verifyCamera(cameraId, false);
    } catch (error: any) {
      setMessage(error?.message || 'Không thể thay đổi trạng thái camera.');
    } finally {
      setSaving(false);
    }
  }

  async function testSpeaker() {
    if (!cameraId) {
      setMessage('Hãy chọn camera trước.');
      return;
    }
    const response = await api.speakCamera(cameraId, {text: 'Xin chào, kiểm tra loa camera.'}).catch(() => null);
    setMessage(response?.success ? 'Đã phát thử loa qua backend.' : (response?.message || 'Speaker adapter chưa được bật trên backend.'));
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Đang tải camera...</Text></View>;
  }

  return (
    <>
    <View style={styles.card}>
      <View style={styles.header}>
        <Icon name="volume-up" size={22} color={colors.primary} />
        <View style={styles.flex}>
          <Text style={styles.title}>Chấm công tự động qua camera</Text>
          <Text style={styles.muted}>Luồng camera và thông tin kết nối được xử lý tại CovaVision.</Text>
        </View>
        <Pressable onPress={() => setDiscoveryVisible(true)} style={styles.scanButton}>
          <Icon name="search" size={16} color={colors.primary} />
          <Text style={styles.scanButtonText}>Quét LAN</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Camera đã cấu hình</Text>
      <View style={styles.cameraList}>
        {cameras.length ? cameras.map(item => {
          const id = String(item?.id || item?.name || '');
          const selected = id === cameraId;
          return (
            <Pressable key={id} onPress={() => selectCamera(item)} style={[styles.cameraRow, selected && styles.cameraRowSelected]}>
              <Icon name={selected ? 'check-circle' : 'check_circle'} size={18} color={selected ? colors.primary : '#94a3b8'} />
              <View style={styles.flex}>
                <Text style={styles.cameraName}>{String(item?.name || id)}</Text>
                <Text style={styles.muted}>Camera ID: {id}</Text>
              </View>
            </Pressable>
          );
        }) : <Text style={styles.muted}>Chưa có camera. Hãy thêm camera trong phần quản trị.</Text>}
      </View>

      {cameraId ? (
        <View style={styles.statusRow}>
          <View style={[styles.dot, health?.isOnline ? styles.dotOnline : styles.dotOffline]} />
          <Text style={styles.statusText}>
            {health?.isOnline ? `Backend đang nhận ${camera?.name || config.cameraName || cameraId}` : 'Backend chưa nhận frame'}
          </Text>
          <Pressable onPress={() => verifyCamera()} disabled={checking}><Text style={styles.link}>{checking ? 'Đang kiểm tra...' : 'Kiểm tra'}</Text></Pressable>
        </View>
      ) : null}

      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={styles.label}>Chấm công tự động</Text>
          <Text style={styles.muted}>Bật/tắt worker camera ở backend.</Text>
        </View>
        <Switch value={config.enabled} onValueChange={toggle} disabled={saving || !cameraId} />
      </View>

      <VolumeSlider value={config.volume} onSlidingComplete={value => save({volume: value})} disabled={saving} />
      <View style={styles.actions}>
        <Pressable onPress={testSpeaker} style={styles.secondaryButton}><Icon name="volume-up" size={16} color={colors.primary} /><Text style={styles.secondaryText}>Thử loa</Text></Pressable>
        <Text style={styles.profileText}>{CAMERA_SPEAKER_PROFILES[config.profileId]?.brand || 'Camera'} · giãn cách {config.cooldownSeconds}s</Text>
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
    <CameraDiscoveryModal
      visible={discoveryVisible}
      onClose={() => setDiscoveryVisible(false)}
      onSelectCamera={cameraItem => selectCamera(cameraItem).catch(() => {})}
      onCameraSaved={() => reload().catch(() => {})}
    />
    </>
  );
}

const styles = StyleSheet.create({
  card: {backgroundColor: '#fff', borderRadius: 16, padding: spacing.lg, marginVertical: spacing.md},
  header: {flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginBottom: spacing.md},
  scanButton: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, backgroundColor: '#eff6ff'},
  scanButtonText: {...typography.labelSmall, color: colors.primary},
  flex: {flex: 1},
  title: {...typography.heading3, color: '#0f172a'},
  label: {...typography.label, color: '#334155', marginBottom: 6},
  muted: {...typography.bodySmall, color: '#64748b'},
  loading: {padding: spacing.xl, alignItems: 'center', gap: spacing.sm},
  cameraList: {gap: 8, marginBottom: spacing.md},
  cameraRow: {flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10},
  cameraRowSelected: {borderColor: colors.primary, backgroundColor: '#eff6ff'},
  cameraName: {...typography.label, color: '#0f172a'},
  statusRow: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8},
  dot: {width: 9, height: 9, borderRadius: 5},
  dotOnline: {backgroundColor: '#16a34a'},
  dotOffline: {backgroundColor: '#f59e0b'},
  statusText: {...typography.bodySmall, color: '#475569', flex: 1},
  link: {...typography.labelSmall, color: colors.primary},
  switchRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: '#e2e8f0'},
  actions: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md},
  secondaryButton: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, backgroundColor: '#eff6ff'},
  secondaryText: {...typography.label, color: colors.primary},
  profileText: {...typography.caption, color: '#64748b', flex: 1},
  message: {...typography.bodySmall, color: '#0f766e', marginTop: spacing.sm},
});
