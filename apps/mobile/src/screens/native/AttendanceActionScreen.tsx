import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View} from 'react-native';
import {FaceAttendancePanel} from '../../components/attendance/FaceAttendancePanel';
import {api} from '../../services/api';
import {colors, radii, spacing} from '../../design-system';

type Props = {adminUser?: any; onBack: () => void};

export function AttendanceActionScreen({adminUser, onBack}: Props) {
  const [loading, setLoading] = useState(true);
  const [cooldownSeconds, setCooldownSeconds] = useState(30);
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraSource, setSelectedCameraSource] = useState('__device__');
  const [status, setStatus] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const response = await api.getEmployeeAttendanceSettings();
      const raw = response?.settings?.attendance_settings || response?.settings || {};
      const next = Math.max(0, Number(raw.cooldown_seconds || 30));
      setCooldownSeconds(Number.isFinite(next) ? next : 30);
      return {mode: 'auto_record' as const, cooldownSeconds: Number.isFinite(next) ? next : 30};
    } catch {
      return {mode: 'auto_record' as const, cooldownSeconds: 30};
    }
  }, []);

  useEffect(() => {
    Promise.all([loadSettings(), api.getCameras().catch(() => ({}))]).then(([, cameraResponse]) => {
      setCameras(Array.isArray(cameraResponse?.cameras) ? cameraResponse.cameras : []);
    }).finally(() => setLoading(false));
  }, [loadSettings]);

  async function submitAttendance(payload: Record<string, unknown>) {
    const response = await api.attendanceImageBase64({
      ...payload,
      attendance_type: payload.attendance_type || 'auto',
      attendance_cooldown_seconds: cooldownSeconds,
      camera_id: selectedCameraSource === '__device__' ? undefined : selectedCameraSource,
      include_preview: false,
    });
    setStatus(response?.message || (response?.success ? 'Đã ghi nhận điểm danh.' : 'Chưa ghi nhận được điểm danh.'));
    return response;
  }

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.muted}>Đang tải cấu hình camera...</Text></View></SafeAreaView>;

  const selectedCamera = cameras.find(camera => String(camera?.id || camera?.name || '') === selectedCameraSource);
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><View style={styles.headerText}><Text style={styles.title}>Điểm danh</Text><Text style={styles.muted}>{adminUser?.name || adminUser?.username || 'CovaVision'}</Text></View></View>
      <View style={styles.cameraArea}>
        <FaceAttendancePanel
          fullScreenMode={false}
          showHeader={true}
          cameraTitle="Camera điểm danh"
          feedbackTitle="Kết quả nhận diện"
          emptyFeedbackText="Đưa mặt vào khung và giữ máy ổn định."
          selectedCameraSource={selectedCameraSource}
          selectedCamera={selectedCamera}
          onSelectCameraSource={setSelectedCameraSource}
          attendanceMode="auto_record"
          cooldownSeconds={cooldownSeconds}
          loadLatestSettings={loadSettings}
          detectImage={api.attendanceDetectFrame}
          submitImage={api.attendanceImageBase64}
          onAutoDetectedAttendance={async payload => submitAttendance({image_base64: payload.imageBase64, attendance_type: payload.attendanceType, attendance_cooldown_seconds: payload.cooldownSeconds})}
          onSubmitSuccess={async response => setStatus(response?.message || 'Đã ghi nhận điểm danh.')}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cameraPicker}>
        <CameraChip title="Camera thiết bị" active={selectedCameraSource === '__device__'} onPress={() => setSelectedCameraSource('__device__')} />
        {cameras.map(camera => { const id = String(camera?.id || camera?.name || ''); return <CameraChip key={id} title={camera?.name || id} active={selectedCameraSource === id} onPress={() => setSelectedCameraSource(id)} />; })}
      </ScrollView>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </SafeAreaView>
  );
}

function CameraChip({title, active, onPress}: {title: string; active: boolean; onPress: () => void}) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{title}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.pageBackground},
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12},
  header: {height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: 10},
  back: {width: 40, height: 40, borderRadius: radii.lg || 12, backgroundColor: colors.slate[100], alignItems: 'center', justifyContent: 'center'},
  backText: {fontSize: 28, lineHeight: 30, color: colors.textPrimary},
  headerText: {gap: 2},
  title: {fontSize: 20, fontWeight: '900', color: colors.textPrimary},
  muted: {fontSize: 12, color: colors.textSecondary},
  cameraArea: {flex: 1, minHeight: 0},
  cameraPicker: {paddingHorizontal: spacing.md, paddingVertical: 10, gap: 8},
  chip: {maxWidth: 190, borderRadius: radii.md || 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 9},
  chipActive: {borderColor: colors.primary, backgroundColor: colors.primaryBg},
  chipText: {fontSize: 12, fontWeight: '700', color: colors.textSecondary},
  chipTextActive: {color: colors.primary},
  status: {marginHorizontal: spacing.md, marginBottom: 12, borderRadius: radii.md || 10, backgroundColor: colors.primaryBg, borderColor: colors.primaryBorder, borderWidth: 1, color: colors.primary, padding: 10, fontSize: 12, fontWeight: '600'},
});
