import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {api} from '../../services/api';
import {colors, spacing, typography} from '../../design-system';
import {Icon} from '../Icon';

export type DiscoveredCamera = {
  id: string;
  name: string;
  camera_type?: string;
  model?: string;
  brand?: string;
  manufacturer?: string;
  discovery_method?: string;
  enabled?: boolean;
  is_active?: boolean;
};

export interface CameraDiscoveryModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectCamera?: (camera: DiscoveredCamera, backendSource: string) => void;
  onCameraSaved?: (camera: {id: string; name: string; source: string; enabled: boolean}) => void;
}

/** LAN discovery is requested from CovaVision; mobile never probes camera IPs. */
export function CameraDiscoveryModal({visible, onClose, onSelectCamera, onCameraSaved}: CameraDiscoveryModalProps) {
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cameras, setCameras] = useState<DiscoveredCamera[]>([]);
  const [foundCameras, setFoundCameras] = useState<DiscoveredCamera[]>([]);
  const [selected, setSelected] = useState<DiscoveredCamera | null>(null);
  const [subnetBase, setSubnetBase] = useState('');
  const [deepScan, setDeepScan] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [preset, setPreset] = useState<'main' | 'sub'>('main');
  const [name, setName] = useState('');
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
      if (!rows.length) setMessage('Chưa có camera. Bấm quét LAN để tìm camera.');
    } catch (error: any) {
      setMessage(error?.message || 'Không tải được danh sách camera.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setFoundCameras([]);
    setSelected(null);
    setPassword('');
    setPreset('main');
    load().catch(() => {});
  }, [load, visible]);

  async function discover() {
    setScanning(true);
    setMessage('Đang gửi ONVIF WS-Discovery vào mạng LAN...');
    try {
      const response = await api.discoverCameras({
        timeout_ms: 3500,
        subnet_base: subnetBase.trim() || undefined,
        enable_subnet_fallback: deepScan,
      });
      if (response?.success !== true) throw new Error(response?.message || 'Không quét được camera.');
      const rows = Array.isArray(response?.cameras) ? response.cameras : [];
      setFoundCameras(rows);
      setSelected(rows[0] || null);
      setName(rows[0]?.name || '');
      setMessage(response?.message || `Đã tìm thấy ${rows.length} camera.`);
    } catch (error: any) {
      setMessage(error?.message || 'Không thể quét camera trong LAN.');
    } finally {
      setScanning(false);
    }
  }

  function choose(camera: DiscoveredCamera) {
    onSelectCamera?.(camera, '');
    onClose();
  }

  function chooseFound(camera: DiscoveredCamera) {
    setSelected(camera);
    setName(camera.name || '');
  }

  async function saveFound() {
    if (!selected || !name.trim()) return;
    setSaving(true);
    try {
      const response = await api.saveCamera({
        name: name.trim(),
        camera_type: 'rtsp',
        discovery_id: selected.id,
        username: username.trim() || 'admin',
        password,
        stream_preset: preset,
        enabled: true,
      });
      if (response?.success !== true) throw new Error(response?.message || 'Không lưu được camera.');
      const saved: DiscoveredCamera = {
        id: String(response?.camera?.id || selected.id),
        name: String(response?.camera?.name || name.trim()),
        camera_type: 'rtsp',
        enabled: true,
      };
      onCameraSaved?.({id: saved.id, name: saved.name, source: '', enabled: true});
      onSelectCamera?.(saved, '');
      onClose();
    } catch (error: any) {
      setMessage(error?.message || 'Không thể lưu camera đã phát hiện.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Icon name="videocam" size={22} color={colors.primary} />
            <View style={styles.flex}><Text style={styles.title}>Quét camera trong LAN</Text><Text style={styles.muted}>Backend thực hiện ONVIF và giữ kín IP/RTSP.</Text></View>
            <Pressable onPress={onClose}><Icon name="close" size={20} color="#64748b" /></Pressable>
          </View>

          <View style={styles.scanBox}>
            <TextInput value={subnetBase} onChangeText={setSubnetBase} placeholder="Subnet fallback: 192.168.1" placeholderTextColor="#94a3b8" style={styles.input} autoCapitalize="none" />
            <View style={styles.scanRow}>
              <View style={styles.flex}><Text style={styles.label}>Quét thêm subnet /24</Text><Text style={styles.muted}>Chậm hơn, dùng khi ONVIF không trả kết quả.</Text></View>
              <Switch value={deepScan} onValueChange={setDeepScan} />
            </View>
            <Pressable onPress={discover} disabled={scanning || saving} style={styles.primaryButton}>
              {scanning ? <ActivityIndicator color="#fff" /> : <Icon name="search" size={17} color="#fff" />}
              <Text style={styles.primaryText}>{scanning ? 'Đang quét...' : 'Quét nhanh LAN'}</Text>
            </Pressable>
          </View>

          {message ? <Text style={styles.message}>{message}</Text> : null}
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {foundCameras.map(camera => (
              <Pressable key={camera.id} onPress={() => chooseFound(camera)} style={[styles.row, selected?.id === camera.id && styles.rowSelected]}>
                <Icon name="videocam" size={20} color={colors.primary} />
                <View style={styles.flex}><Text style={styles.cameraName}>{camera.name}</Text><Text style={styles.muted}>{camera.brand || 'ONVIF'} · {camera.model || 'Camera IP'} · {camera.discovery_method === 'onvif' ? 'ONVIF' : 'Subnet'}</Text></View>
              </Pressable>
            ))}

            {selected ? (
              <View style={styles.formBox}>
                <Text style={styles.label}>Lưu camera đã chọn</Text>
                <TextInput value={name} onChangeText={setName} placeholder="Tên camera" placeholderTextColor="#94a3b8" style={styles.input} />
                <View style={styles.formRow}>
                  <TextInput value={username} onChangeText={setUsername} placeholder="Username" placeholderTextColor="#94a3b8" style={[styles.input, styles.half]} autoCapitalize="none" />
                  <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#94a3b8" style={[styles.input, styles.half]} secureTextEntry autoCapitalize="none" />
                </View>
                <View style={styles.formRow}>
                  <Pressable onPress={() => setPreset('main')} style={[styles.preset, preset === 'main' && styles.presetSelected]}><Text style={styles.presetText}>Luồng chính</Text></Pressable>
                  <Pressable onPress={() => setPreset('sub')} style={[styles.preset, preset === 'sub' && styles.presetSelected]}><Text style={styles.presetText}>Luồng phụ</Text></Pressable>
                </View>
                <Pressable onPress={saveFound} disabled={saving || !name.trim()} style={styles.primaryButton}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Icon name="save" size={17} color="#fff" />}
                  <Text style={styles.primaryText}>{saving ? 'Đang lưu...' : 'Lưu camera'}</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Camera đã lưu</Text>
            {loading ? <ActivityIndicator color={colors.primary} /> : cameras.map(camera => (
              <Pressable key={camera.id} onPress={() => choose(camera)} style={styles.row}>
                <Icon name="check-circle" size={20} color="#16a34a" />
                <View style={styles.flex}><Text style={styles.cameraName}>{camera.name}</Text><Text style={styles.muted}>Camera ID: {camera.id}</Text></View>
                <Icon name="chevron-right" size={18} color="#94a3b8" />
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.footer}>Thông tin RTSP, IP và đăng nhập chỉ được xử lý tại backend.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(15,23,42,.45)', justifyContent: 'flex-end'},
  card: {maxHeight: '92%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg},
  header: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md},
  flex: {flex: 1},
  title: {...typography.heading3, color: '#0f172a'},
  muted: {...typography.bodySmall, color: '#64748b'},
  label: {...typography.label, color: '#334155'},
  scanBox: {borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#eff6ff', borderRadius: 12, padding: spacing.sm, gap: spacing.sm},
  input: {borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, color: '#0f172a'},
  scanRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  primaryButton: {backgroundColor: colors.primary, borderRadius: 10, padding: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8},
  primaryText: {...typography.label, color: '#fff'},
  message: {...typography.bodySmall, color: '#b45309', paddingVertical: spacing.sm},
  list: {gap: 8, paddingVertical: spacing.md},
  row: {borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 11, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10},
  rowSelected: {borderColor: colors.primary, backgroundColor: '#eff6ff'},
  cameraName: {...typography.label, color: '#0f172a'},
  formBox: {borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: spacing.md, gap: 8},
  formRow: {flexDirection: 'row', gap: 8},
  half: {flex: 1},
  preset: {flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, alignItems: 'center'},
  presetSelected: {borderColor: colors.primary, backgroundColor: '#eff6ff'},
  presetText: {...typography.labelSmall, color: '#334155'},
  sectionTitle: {...typography.label, color: '#334155', marginTop: spacing.sm},
  footer: {...typography.caption, color: '#64748b', textAlign: 'center'},
});
