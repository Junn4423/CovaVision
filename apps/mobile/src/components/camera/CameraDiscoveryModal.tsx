import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {api} from '../../services/api';
import {colors, spacing, typography} from '../../design-system';
import {Icon} from '../Icon';

export type DiscoveredCamera = {
  id: string;
  name: string;
  camera_type?: string;
  enabled?: boolean;
  is_active?: boolean;
};

export interface CameraDiscoveryModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectCamera?: (camera: DiscoveredCamera, backendSource: string) => void;
  onCameraSaved?: (camera: {id: string; name: string; source: string; enabled: boolean}) => void;
}

/**
 * The old version performed ONVIF/LAN discovery on the phone and generated an
 * RTSP URL. CovaVision owns discovery and credentials now, so this dialog only
 * refreshes and selects cameras returned by the backend.
 */
export function CameraDiscoveryModal({visible, onClose, onSelectCamera, onCameraSaved}: CameraDiscoveryModalProps) {
  const [loading, setLoading] = useState(false);
  const [cameras, setCameras] = useState<DiscoveredCamera[]>([]);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await api.getCameras();
      const rows = Array.isArray(response?.cameras) ? response.cameras : [];
      setCameras(rows.map((row: any) => ({
        id: String(row?.id || row?.name || ''),
        name: String(row?.name || row?.id || 'Camera'),
        camera_type: row?.camera_type,
        enabled: row?.enabled !== false,
        is_active: row?.is_active !== false,
      })).filter((row: DiscoveredCamera) => row.id));
      if (!rows.length) setMessage('Chưa có camera trên CovaVision. Hãy cấu hình nguồn camera ở backend.');
    } catch (error: any) {
      setMessage(error?.message || 'Không tải được danh sách camera.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (visible) load().catch(() => {}); }, [load, visible]);

  function choose(camera: DiscoveredCamera) {
    onSelectCamera?.(camera, '');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Icon name="videocam" size={22} color={colors.primary} />
            <View style={styles.flex}><Text style={styles.title}>Camera trên CovaVision</Text><Text style={styles.muted}>Thiết bị nhận luồng qua backend, không quét LAN trên điện thoại.</Text></View>
            <Pressable onPress={onClose}><Icon name="close" size={20} color="#64748b" /></Pressable>
          </View>
          <Pressable onPress={() => load()} disabled={loading} style={styles.refresh}>
            {loading ? <ActivityIndicator color="#fff" /> : <Icon name="refresh" size={16} color="#fff" />}
            <Text style={styles.refreshText}>{loading ? 'Đang tải...' : 'Tải lại danh sách'}</Text>
          </Pressable>
          <ScrollView contentContainerStyle={styles.list}>
            {cameras.map(camera => (
              <Pressable key={camera.id} onPress={() => choose(camera)} style={styles.row}>
                <Icon name="videocam" size={20} color={colors.primary} />
                <View style={styles.flex}><Text style={styles.cameraName}>{camera.name}</Text><Text style={styles.muted}>Camera ID: {camera.id}</Text></View>
                <Icon name="chevron-right" size={18} color="#94a3b8" />
              </Pressable>
            ))}
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </ScrollView>
          <Text style={styles.footer}>Thông tin RTSP và thông tin đăng nhập chỉ được lưu/đọc tại backend.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(15,23,42,.45)', justifyContent: 'flex-end'},
  card: {maxHeight: '82%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg},
  header: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md},
  flex: {flex: 1},
  title: {...typography.heading3, color: '#0f172a'},
  muted: {...typography.bodySmall, color: '#64748b'},
  refresh: {backgroundColor: colors.primary, borderRadius: 10, padding: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8},
  refreshText: {...typography.label, color: '#fff'},
  list: {gap: 8, paddingVertical: spacing.md},
  row: {borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 11, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10},
  cameraName: {...typography.label, color: '#0f172a'},
  message: {...typography.bodySmall, color: '#b45309', paddingVertical: spacing.md},
  footer: {...typography.caption, color: '#64748b', textAlign: 'center'},
});
