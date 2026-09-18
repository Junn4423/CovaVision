import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {api} from '../../services/api';
import {
  deleteMobileAttendanceRecord,
  getLocalTodayAttendancePage,
  initializeMobileLocalDataStore,
  isMobileAttendanceErpSynced,
  recordMobileLocalFaceAttendance,
  recordMobileServerAttendanceResponse,
} from '../../services/nativeLocalAttendance';
import {colors} from '../../theme';
import {spacing, radii} from '../../design-system';
import {Icon} from '../../components/Icon';
import {Badge, StatusMessage} from '../../components/ui';
import {FaceAttendancePanel} from '../../components/attendance/FaceAttendancePanel';
import {ensureAttendanceTtsReady, speakAttendanceOutcome} from '../../services/attendanceTts';
import {formatAnyToLocalDateTime} from '../../utils/date';

type AttendanceMode = 'auto_record';
type AttendanceType = 'checkin' | 'checkout';

type AttendanceActionScreenProps = {
  adminUser?: any;
  onBack: () => void;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const SIDEBAR_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 380);

function normalizeAttendanceMode(_value: unknown): AttendanceMode {
  return 'auto_record';
}

export function AttendanceActionScreen({
  adminUser,
  onBack,
}: AttendanceActionScreenProps) {
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [_attendanceMode, setAttendanceMode] = useState<AttendanceMode>('auto_record');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [feedback, setFeedback] = useState<any>(null);
  const [statusText, setStatusText] = useState('');
  const [cameraList, setCameraList] = useState<any[]>([]);
  const [selectedCameraSource, setSelectedCameraSource] = useState('__device__');
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [pendingRecords, setPendingRecords] = useState<any[]>([]);
  const [syncingPending, setSyncingPending] = useState(false);

  const loadPendingRecords = useCallback(async () => {
    try {
      const res = await getLocalTodayAttendancePage({ page: 1, pageSize: 100 });
      const items = (Array.isArray(res?.items) ? res.items : [])
        .filter(item => !isMobileAttendanceErpSynced(item));
      setPendingRecords(items);
    } catch {
      setPendingRecords([]);
    }
  }, []);

  const handleManualSyncRecord = useCallback(async (record: any) => {
    let employeeId = String(
      record?.employee_id ||
      record?.user_id ||
      record?.code ||
      record?.user?.employee_id ||
      '',
    ).trim();

    if (!employeeId) {
      const keyStr = String(record?.record_key || record?.id || '');
      if (keyStr.includes('|')) {
        const parts = keyStr.split('|');
        if (parts.length >= 2 && parts[1]) {
          employeeId = parts[1].trim();
        }
      }
    }

    if (!employeeId) {
      Alert.alert(
        'Bản ghi không hợp lệ',
        'Bản ghi cũ này thiếu mã nhân viên. Bạn có muốn xóa bản ghi lỗi này khỏi hàng chờ không?',
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Xóa bản ghi lỗi',
            style: 'destructive',
            onPress: async () => {
              const key = record?.id || record?.record_key;
              if (key) {
                await deleteMobileAttendanceRecord(key);
                await loadPendingRecords();
              }
            },
          },
        ],
      );
      return;
    }

    setSyncingPending(true);
    try {
      const timeVal = formatAnyToLocalDateTime(
        record?.attendance_time || record?.check_in_time || record?.time || record?.created_at,
      );

      const res = await api.pushAttendanceToErp({
        employee_id: employeeId,
        record_key: record?.record_key || record?.attendance_id || record?.id,
        attendance_date: record?.attendance_date || record?.date,
        attendance_time: timeVal,
        attendance_type: record?.attendance_type || 'IN',
        source: 'Manual Sync Slide Drawer',
      });

      if (res?.success || res?.erp_pushed) {
        await deleteMobileAttendanceRecord(record?.record_key, record?.id, record?.attendance_id);
        if (Platform.OS === 'android') {
          ToastAndroid.show('Đã đồng bộ ERP thành công!', ToastAndroid.SHORT);
        } else {
          Alert.alert('Thành công', 'Đã đồng bộ dữ liệu lên ERP.');
        }
        await loadPendingRecords();
      } else {
        Alert.alert('Thất bại', res?.message || 'Không thể gửi dữ liệu lên ERP.');
      }
    } catch {
      Alert.alert('Lỗi kết nối', 'Không kết nối được tới máy chủ ERP.');
    } finally {
      setSyncingPending(false);
    }
  }, [loadPendingRecords]);

  const sidebarTranslate = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const openSidebar = useCallback(() => {
    loadPendingRecords().catch(() => {});
    setSidebarVisible(true);
    Animated.parallel([
      Animated.timing(sidebarTranslate, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [loadPendingRecords, overlayOpacity, sidebarTranslate]);

  const closeSidebar = useCallback(() => {
    Animated.parallel([
      Animated.timing(sidebarTranslate, {
        toValue: SIDEBAR_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setSidebarVisible(false));
  }, [overlayOpacity, sidebarTranslate]);

  const loadAttendanceSettings = useCallback(async () => {
    const response = await api.getSystemSettings();
    if (!response?.success) {
      return undefined;
    }
    const settings = response.settings?.attendance_settings || {};
    const mode = normalizeAttendanceMode(settings.mode);
    const hours = Number(settings.cooldown_hours || 0);
    const minutes = Number(settings.cooldown_minutes || 0);
    const seconds = Number(settings.cooldown_seconds || 0);
    const totalSeconds = Math.max(0, hours * 3600 + minutes * 60 + seconds);
    setAttendanceMode(mode);
    setCooldownSeconds(totalSeconds);
    return {mode, cooldownSeconds: totalSeconds};
  }, []);

  const loadCameras = useCallback(async () => {
    try {
      const res = await api.getCameras();
      if (res?.success) {
        setCameraList(Array.isArray(res.cameras) ? res.cameras : []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    initializeMobileLocalDataStore().catch(() => {});
    Promise.all([loadAttendanceSettings(), loadCameras()])
      .finally(() => setLoadingSettings(false));
    // Warm up TTS engine for voice announcements
    ensureAttendanceTtsReady().catch(() => {});
  }, [loadAttendanceSettings, loadCameras]);

  const recordSubmitSuccess = useCallback(async (response?: any) => {
    if (response) {
      // If server returned COOLDOWN, speak cooldown and DO NOT create a pending/ERP record!
      if (response?.cooldown || response?.cooldown_remaining_seconds) {
        const remain = Number(response.cooldown_remaining_seconds || 30);
        speakAttendanceOutcome({
          cooldown: true,
          cooldown_remaining_seconds: remain,
          message: response.message,
        }).catch(() => {});

        setFeedback({
          type: 'warning',
          message: response.message || `Vui lòng chờ ${remain} giây giữa các lần chấm công.`,
          user: response?.user || response?.detected_user,
        });
        setStatusText('');
        setTimeout(() => setFeedback(null), 5000);
        return;
      }

      const storedRow = await recordMobileServerAttendanceResponse(response).catch(() => null);

      if (storedRow && isMobileAttendanceErpSynced(response)) {
        await deleteMobileAttendanceRecord(
          storedRow.record_key,
          storedRow.id,
          storedRow.attendance_id,
        ).catch(() => {});
      }
      await loadPendingRecords().catch(() => {});
    }
    setFeedback(response);
    setStatusText('');
    setTimeout(() => setFeedback(null), 5000);
  }, [loadPendingRecords]);

  const backupLocalAttendance = useCallback(async (payload: any) => {
    try {
      const localResult = await recordMobileLocalFaceAttendance({
        user: payload.user,
        attendanceMode: payload.attendanceMode || 'auto_record',
        attendanceType: 'auto',
        similarityPercent: payload.similarityPercent,
        cooldownSeconds: payload.cooldownSeconds || cooldownSeconds || 30,
        detection: payload.detection,
      });
      await loadPendingRecords();
      const record = localResult?.record || localResult;
      return {
        success: true,
        fallback: !localResult?.skipped,
        message: localResult?.message || 'Đã lưu chấm công local để đồng bộ lại.',
        record,
        attendanceTypeLabel: localResult?.attendanceTypeLabel,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Không thể lưu bản backup local.',
      };
    }
  }, [cooldownSeconds, loadPendingRecords]);

  const recordAutoLocalAttendance = useCallback(
    async (payload: {
      user: any;
      detection: any;
      attendanceMode: AttendanceMode;
      attendanceType: AttendanceType | 'auto';
      similarityPercent: number;
      cooldownSeconds: number;
      imageBase64: string;
    }) => {
      const imageBase64 = String(payload?.imageBase64 || '').trim();
      if (!imageBase64) {
        return {success: false, message: 'Thiếu ảnh để chấm công.'};
      }

      try {
        const response = await api.attendanceImageBase64({
          image_base64: imageBase64,
          attendance_type: 'auto',
          cooldown_seconds: payload.cooldownSeconds || cooldownSeconds || 30,
          include_preview: false,
          tolerance: 0.5,
        });

        if (!response?.success) {
          if (response?.cooldown || response?.cooldown_remaining_seconds) {
            return {
              success: true,
              cooldown: true,
              cooldown_remaining_seconds: response?.cooldown_remaining_seconds,
              message: response.message,
              record: response,
            };
          }
          if (
            response?.is_spoof ||
            response?.spoof_detected ||
            String(response?.message || '').toLowerCase().includes('giả mạo') ||
            String(response?.message || '').toLowerCase().includes('không hợp lệ')
          ) {
            return {
              success: false,
              is_spoof: true,
              message: response?.message || 'Phát hiện khuôn mặt không hợp lệ hoặc giả mạo.',
            };
          }
          return backupLocalAttendance({...payload, reason: response?.message});
        }

        // Legacy gateways could report recognition success without creating
        // an attendance row. Keep the scan in mobile backup in that case.
        const attendanceId = Number(response?.attendance_id);
        const hasWriteReceipt =
          (Number.isFinite(attendanceId) && attendanceId > 0)
          || Boolean(
            String(response?.erp_sync_job_id || '').trim()
              || String(response?.erp_sync_status || response?.sync_status || '').trim()
              || String(response?.check_in_time || response?.check_out_time || '').trim(),
          );
        if (!hasWriteReceipt) {
          return backupLocalAttendance({
            ...payload,
            reason: 'Backend chỉ nhận diện, chưa trả receipt ghi chấm công.',
          });
        }

        return {
          success: true,
          message: response?.message || 'Đã ghi nhận, đang đồng bộ ERP.',
          syncPromise: Promise.resolve(response),
          attendanceTypeLabel: response?.attendance_type_label,
        };
      } catch (error) {
        return backupLocalAttendance({
          ...payload,
          reason: error instanceof Error ? error.message : 'Lỗi khi gửi dữ liệu chấm công.',
        });
      }
    },
    [backupLocalAttendance, cooldownSeconds],
  );

  if (loadingSettings) {
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.centerText}>Đang tải cấu hình chấm công...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const feedbackVariant =
    feedback?.success === false ? 'error' :
    feedback?.matched === false ? 'warning' :
    feedback?.success || feedback?.employee_id ? 'success' : 'info';

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.cameraArea}>
          <FaceAttendancePanel
            fullScreenMode={true}
            topLeftSlot={
              <Pressable
                onPress={onBack}
                style={styles.floatingActionBtn}
                accessibilityLabel="Quay lại">
                <Icon name="chevron-left" size={20} color="#f8fafc" />
              </Pressable>
            }
            topRightSlot={
              <Pressable
                onPress={() => (sidebarVisible ? closeSidebar() : openSidebar())}
                style={styles.floatingActionBtn}
                accessibilityLabel="Mở cấu hình">
                <Icon name="tune" size={18} color="#38bdf8" />
              </Pressable>
            }
            cameraTitle="Camera chấm công"
            feedbackTitle="Kết quả nhận diện"
            emptyFeedbackText="Đưa mặt vào khung, giữ máy ổn định rồi bấm điểm danh."
            showHeader={false}
            attendanceMode={'auto_record'}
            cooldownSeconds={cooldownSeconds}
            onAttendanceModeChange={mode => setAttendanceMode(mode as any)}
            loadLatestSettings={loadAttendanceSettings}
            detectImage={api.attendanceDetectFrame}
            submitImage={api.attendanceImageBase64}
            getErpSyncStatus={api.attendanceErpSyncStatus}
            onAutoDetectedAttendance={recordAutoLocalAttendance}
            onAttendanceSyncFailed={backupLocalAttendance}
            onSubmitSuccess={recordSubmitSuccess}
          />
        </View>
      </View>

      {sidebarVisible ? (
        <Animated.View
          pointerEvents="auto"
          style={[
            StyleSheet.absoluteFill,
            {opacity: overlayOpacity, backgroundColor: 'rgba(15, 23, 42, 0.40)', zIndex: 10},
          ]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSidebar} />
        </Animated.View>
      ) : null}

      <Animated.View
        style={[
          styles.sidebar,
          {transform: [{translateX: sidebarTranslate}]},
        ]}>
        <View style={styles.sidebarHeader}>
          <Text style={styles.sidebarTitle}>Cấu hình Hệ thống</Text>
          <Pressable onPress={closeSidebar} style={styles.closeButton}>
            <Icon name="close" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.sidebarContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.infoCard}>
            <Text style={styles.infoName}>
              {adminUser?.name || adminUser?.username || 'Admin'}
            </Text>
            {adminUser?.username ? (
              <Text style={styles.infoDetail}>Tài khoản: {adminUser.username}</Text>
            ) : null}
            <Text style={styles.infoDetail}>Chế độ: Ghi tự động</Text>
            {cooldownSeconds > 0 ? (
              <Text style={styles.infoDetail}>Giãn cách: {cooldownSeconds}s</Text>
            ) : null}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Chọn camera</Text>
            <View style={styles.cameraRow}>
              <Pressable
                onPress={() => setSelectedCameraSource(
                  selectedCameraSource === '__device__' ? '' : '__device__',
                )}
                style={[
                  styles.cameraChip,
                  selectedCameraSource === '__device__' && styles.cameraChipActive,
                ]}>
                <Icon
                  name="camera"
                  size={14}
                  color={selectedCameraSource === '__device__' ? colors.green[800] : colors.textSecondary}
                />
                <Text style={[
                  styles.cameraChipText,
                  selectedCameraSource === '__device__' && styles.cameraChipTextActive,
                ]}>
                  Camera thiết bị
                </Text>
              </Pressable>
              {cameraList.slice(0, 4).map(cam => {
                const camId = String(cam?.id || cam?.name || '');
                const isSelected = camId === selectedCameraSource;
                return (
                  <Pressable
                    key={camId}
                    onPress={() => setSelectedCameraSource(isSelected ? '' : camId)}
                    style={[styles.cameraChip, isSelected && styles.cameraChipActive]}>
                    <Icon
                      name="camera"
                      size={14}
                      color={isSelected ? colors.green[800] : colors.textSecondary}
                    />
                    <Text style={[
                      styles.cameraChipText,
                      isSelected && styles.cameraChipTextActive,
                    ]}>
                      {cam?.name || camId}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {statusText ? (
            <StatusMessage variant="warning" message={statusText} />
          ) : null}

          {feedback ? (
            <View style={[
              styles.feedbackBox,
              feedbackVariant === 'success' && styles.feedbackSuccess,
              feedbackVariant === 'error' && styles.feedbackError,
              feedbackVariant === 'warning' && styles.feedbackWarning,
            ]}>
              <View style={styles.feedbackHeader}>
                <Icon
                  name={feedbackVariant === 'success' ? 'success' : feedbackVariant === 'error' ? 'error' : 'info'}
                  size={20}
                  color={
                    feedbackVariant === 'success' ? colors.green[800] :
                    feedbackVariant === 'error' ? colors.red[700] : colors.amber[800]
                  }
                />
                <Text style={styles.feedbackName}>
                  {feedback?.employee_name || feedback?.name || feedback?.employee_id || '—'}
                </Text>
                {feedback?.similarity ? (
                  <Badge
                    label={`${Number(feedback.similarity).toFixed(1)}%`}
                    variant={Number(feedback.similarity) >= 70 ? 'success' : 'warning'}
                    size="sm"
                  />
                ) : null}
              </View>
              <Text style={styles.feedbackDetail}>
                {feedback?.message || feedback?.status_text || 'Đã ghi nhận chấm công'}
              </Text>
            </View>
          ) : null}

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Dữ liệu chờ đồng bộ với ERP</Text>
              <Pressable
                onPress={() => loadPendingRecords()}
                style={styles.refreshChip}>
                <Icon name="refresh" size={14} color={colors.primary} />
                <Text style={styles.refreshChipText}>Làm mới</Text>
              </Pressable>
            </View>

            {pendingRecords.length === 0 ? (
              <Text style={styles.emptyPendingText}>
                Không có bản ghi nào chờ đồng bộ. Tất cả dữ liệu đã được gửi lên ERP.
              </Text>
            ) : (
              pendingRecords.map((item, idx) => {
                let empId = item?.employee_id || item?.user_id || item?.code || item?.user?.employee_id || '';
                if (!empId) {
                  const keyStr = String(item?.record_key || item?.id || '');
                  if (keyStr.includes('|')) {
                    const parts = keyStr.split('|');
                    if (parts.length >= 2 && parts[1]) {
                      empId = parts[1].trim();
                    }
                  }
                }
                if (!empId) empId = 'Chưa xác định';

                const empName = item?.user?.name || item?.employee_name || item?.name || empId;
                const rawTime = item?.check_in_time || item?.attendance_time || item?.time || item?.created_at || item?.updated_at || '';
                const dateStr = item?.attendance_date || item?.date || '';
                const displayTime = dateStr && rawTime && !rawTime.includes(dateStr)
                  ? `${dateStr} ${rawTime}`
                  : (rawTime || dateStr || 'Mới đây');

                return (
                  <View key={item?.id || item?.record_key || idx} style={styles.pendingItemRow}>
                    <View style={{flex: 1}}>
                      <Text style={styles.pendingName}>{empName} ({empId})</Text>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                        <Icon name="schedule" size={12} color={colors.textMuted} />
                        <Text style={styles.pendingTime}>{displayTime}</Text>
                      </View>
                    </View>
                    <Pressable
                      disabled={syncingPending}
                      onPress={() => handleManualSyncRecord(item)}
                      style={styles.syncBtn}>
                      <Text style={styles.syncBtnText}>Đồng bộ ERP</Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>

          <Pressable onPress={onBack} style={styles.backAction}>
            <Icon name="chevron-left" size={16} color={colors.red[700]} />
            <Text style={styles.backActionText}>Quay lại</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
  },
  centerText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  hamburger: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  cameraArea: {
    flex: 1,
    padding: 0,
    margin: 0,
    backgroundColor: '#020617',
  },
  floatingActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.pageBackground,
    zIndex: 20,
    shadowColor: colors.shadow,
    shadowOffset: {width: -2, height: 0},
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  sidebarTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.huge,
  },
  infoCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  infoName: {
    color: colors.green[800],
    fontSize: 16,
    fontWeight: '800',
  },
  infoDetail: {
    color: colors.green[800],
    fontSize: 12,
  },
  sectionCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  cameraRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  cameraChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
  },
  cameraChipActive: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  cameraChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  cameraChipTextActive: {
    color: colors.green[800],
  },
  feedbackBox: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  feedbackSuccess: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  feedbackError: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  feedbackWarning: {
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningBg,
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  feedbackName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.slate[900],
    flex: 1,
  },
  feedbackDetail: {
    fontSize: 12,
    color: colors.slate[600],
    marginTop: 6,
  },
  noLogNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.slate[100],
    borderWidth: 1,
    borderColor: colors.border,
  },
  noLogNoticeText: {
    flex: 1,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  refreshChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs + 4,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: colors.slate[100],
  },
  refreshChipText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
  emptyPendingText: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  pendingItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pendingName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pendingTime: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  syncBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
  },
  syncBtnText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  backAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radii.md,
    backgroundColor: colors.red[100],
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  backActionText: {
    color: colors.red[700],
    fontSize: 14,
    fontWeight: '700',
  },
});
