import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  api,
  clearSessionToken,
  getSessionToken,
  getGatewayAuth,
} from '../../services/api';
import {
  clearStoredSession,
  logoutGatewaySession,
} from '../../services/authSession';
import { colors } from '../../theme';
import { spacing, radii } from '../../design-system';
import { Icon } from '../../components/Icon';
import { FaceAttendancePanel } from '../../components/attendance/FaceAttendancePanel';
import { DatePickerField } from '../../components/DatePickerField';
import {
  deleteMobileAttendanceRecord,
  getLocalAttendanceForEmployeeRange,
  isMobileAttendanceErpSynced,
  recordMobileLocalFaceAttendance,
  recordMobileServerAttendanceResponse,
} from '../../services/nativeLocalAttendance';

type EmployeeAttendanceScreenProps = {
  onBackToLogin: () => void;
};

const SCREEN_WIDTH = Dimensions.get('window').width;

const SIDEBAR_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 380);

function todayIsoDate() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function buildHistoryRecordKey(row: any, index: number) {
  return [
    row?.source || 'server',
    row?.id || row?.attendance_id || row?.record_key || index,
    row?.date || row?.attendance_date || '',
    row?.check_in_time || row?.time || '',
    row?.check_out_time || '',
  ].join('|');
}

function hasAttendanceWriteReceipt(response: any): boolean {
  if (!response || response.success !== true) {
    return false;
  }

  const attendanceId = Number(response.attendance_id);
  if (Number.isFinite(attendanceId) && attendanceId > 0) {
    return true;
  }

  return Boolean(
    String(response.erp_sync_job_id || '').trim()
      || String(response.erp_sync_status || response.sync_status || '').trim()
      || String(response.check_in_time || response.check_out_time || '').trim(),
  );
}

function mergeHistoryRecords(serverRows: any[], localRows: any[]) {
  const mergedRows: any[] = [];
  const seenKeys = new Set<string>();

  for (const row of [...localRows, ...serverRows]) {
    const key = buildHistoryRecordKey(row, mergedRows.length);
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    mergedRows.push({
      ...row,
      date: row?.date || row?.attendance_date || '',
      check_in_time:
        row?.check_in_time || row?.time || row?.attendance_time || '',
      check_out_time: row?.check_out_time || '',
      status: row?.status || (row?.local_only ? 'Đã lưu local' : ''),
    });
  }

  return mergedRows;
}

export function EmployeeAttendanceScreen({
  onBackToLogin,
}: EmployeeAttendanceScreenProps) {
  const [checking, setChecking] = useState(true);
  const [employeeUser, setEmployeeUser] = useState<any>(null);
  const [historyStartDate, setHistoryStartDate] = useState(todayIsoDate());
  const [historyEndDate, setHistoryEndDate] = useState(todayIsoDate());
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [_attendanceMode, setAttendanceMode] = useState<
    'auto_record'
  >('auto_record');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const sidebarTranslate = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const openSidebar = useCallback(() => {
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
  }, [sidebarTranslate, overlayOpacity]);

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
  }, [sidebarTranslate, overlayOpacity]);

  const loadEmployeeAttendanceSettings = useCallback(async () => {
    const response = await api.getEmployeeAttendanceSettings();
    if (!response?.success) {
      return undefined;
    }

    const settings = response.attendance_settings || {};
    const nextMode = 'auto_record' as const;
    const hours = Number(settings.cooldown_hours || 0);
    const minutes = Number(settings.cooldown_minutes || 0);
    const seconds = Number(settings.cooldown_seconds || 0);
    const nextCooldownSeconds = Math.max(
      0,
      hours * 3600 + minutes * 60 + seconds,
    );
    setAttendanceMode(nextMode);
    setCooldownSeconds(nextCooldownSeconds);
    return {
      mode: nextMode,
      cooldownSeconds: nextCooldownSeconds,
    };
  }, []);

  const loadHistory = useCallback(
    async (
      startValue = historyStartDate,
      endValue = historyEndDate,
      targetUser: any = null,
    ) => {
      setHistoryLoading(true);
      try {
        const startDate = startValue <= endValue ? startValue : endValue;
        const endDate = endValue >= startValue ? endValue : startValue;
        const employeeId = String(targetUser?.employee_id || '').trim();
        const [serverResponse, localRows] = await Promise.all([
          api
            .getEmployeeAttendanceHistory({
              start_date: startDate,
              end_date: endDate,
              limit: 150,
            })
            .catch((error: any) => ({ success: false, error })),
          employeeId
            ? getLocalAttendanceForEmployeeRange(
                employeeId,
                startDate,
                endDate,
                150,
              ).catch(() => [])
            : Promise.resolve([]),
        ]);
        const serverRows =
          serverResponse?.success && Array.isArray(serverResponse.records)
            ? serverResponse.records
            : [];
        setHistoryRecords(mergeHistoryRecords(serverRows, localRows));
      } catch {
        setHistoryRecords([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [historyEndDate, historyStartDate],
  );

  const recordSubmitSuccess = useCallback(
    async (response?: any) => {
      const storedRow = await recordMobileServerAttendanceResponse(response).catch(() => null);
      if (storedRow && isMobileAttendanceErpSynced(response)) {
        await deleteMobileAttendanceRecord(
          storedRow.record_key,
          storedRow.id,
          storedRow.attendance_id,
        ).catch(() => {});
      }
      await loadHistory(historyStartDate, historyEndDate, employeeUser);
    },
    [employeeUser, historyEndDate, historyStartDate, loadHistory],
  );

  const backupLocalAttendance = useCallback(async (payload: any) => {
    try {
      const localResult = await recordMobileLocalFaceAttendance({
        user: payload.user,
        attendanceMode: payload.attendanceMode || 'auto_record',
        attendanceType: 'auto',
        similarityPercent: payload.similarityPercent,
        cooldownSeconds: payload.cooldownSeconds,
        detection: payload.detection,
      });
      await loadHistory(historyStartDate, historyEndDate, employeeUser);
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
  }, [employeeUser, historyEndDate, historyStartDate, loadHistory]);

  const recordAutoLocalAttendance = useCallback(
    async (payload: any) => {
      const imageBase64 = String(payload?.imageBase64 || '').trim();
      if (!imageBase64) {
        return {success: false, message: 'Thiếu ảnh để chấm công.'};
      }

      try {
        const response = await api.employeeAttendanceImageBase64({
          image_base64: imageBase64,
          attendance_type: 'auto',
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

        if (!hasAttendanceWriteReceipt(response)) {
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
    [backupLocalAttendance],
  );

  const initializeEmployeePage = useCallback(async () => {
    let status: any = null;
    try {
      status = await api.employeeStatus();
    } catch {
      status = null;
    }

    if (!status?.authenticated || !status?.is_employee) {
      // If server doesn't respond to status endpoint but session token exists, do not kick user
      const existingToken = getSessionToken() || getGatewayAuth()?.token;
      if (existingToken) {
        status = {
          authenticated: true,
          is_employee: true,
          user: status?.user || { name: 'Nhân viên' },
        };
      } else {
        clearSessionToken();
        onBackToLogin();
        return;
      }
    }

    setEmployeeUser(status.user || null);

    await Promise.all([
      loadEmployeeAttendanceSettings().catch(() => null),
      loadHistory(todayIsoDate(), todayIsoDate(), status.user || null).catch(
        () => null,
      ),
    ]);

    setChecking(false);
  }, [loadEmployeeAttendanceSettings, loadHistory, onBackToLogin]);

  useEffect(() => {
    const timerId = setInterval(() => {
      loadEmployeeAttendanceSettings().catch(() => {});
    }, 15000);

    return () => clearInterval(timerId);
  }, [loadEmployeeAttendanceSettings]);

  useEffect(() => {
    initializeEmployeePage().catch(() => {
      clearSessionToken();
      onBackToLogin();
    });
  }, [initializeEmployeePage, onBackToLogin]);

  async function handleLogout() {
    try {
      const response = await api.employeeLogout().catch(() => null);
      if (!response?.gateway_logout?.success) {
        await logoutGatewaySession();
      }
    } catch {
      // ignore logout error
    } finally {
      await clearStoredSession();
      onBackToLogin();
    }
  }

  if (checking) {
    return (
      <SafeAreaView
        edges={['top', 'left', 'right', 'bottom']}
        style={styles.safeArea}
      >
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerText}>
            Đang kiểm tra phiên đăng nhập...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={styles.safeArea}
    >
      <View style={styles.container}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => (sidebarVisible ? closeSidebar() : openSidebar())}
            style={styles.hamburger}
          >
            <Icon
              name="menu"
              size={22}
              color="#0037b0"
            />
          </Pressable>
          <Text style={styles.topBarTitle}>ChamCong Mobile</Text>
          <Pressable
            onPress={() => (sidebarVisible ? closeSidebar() : openSidebar())}
            style={styles.hamburger}
          >
            <Icon
              name={sidebarVisible ? 'close' : 'history'}
              size={22}
              color="#0037b0"
            />
          </Pressable>
        </View>

        {/* Camera area - takes remaining space */}
        <View style={styles.cameraArea}>
          <FaceAttendancePanel
            cameraTitle="Camera chấm công"
            feedbackTitle="Kết quả nhận diện"
            emptyFeedbackText="Đưa mặt vào khung, giữ máy ổn định rồi bấm chấm công."
            showHeader={false}
            attendanceMode={'auto_record'}
            cooldownSeconds={cooldownSeconds}
            onAttendanceModeChange={mode => setAttendanceMode(mode as any)}
            loadLatestSettings={loadEmployeeAttendanceSettings}
            detectImage={api.employeeAttendanceDetectFrame}
            submitImage={api.employeeAttendanceImageBase64}
            getErpSyncStatus={api.attendanceErpSyncStatus}
            onAutoDetectedAttendance={recordAutoLocalAttendance}
            onAttendanceSyncFailed={backupLocalAttendance}
            onSubmitSuccess={recordSubmitSuccess}
          />
        </View>
      </View>

      {/* Sidebar overlay */}
      {sidebarVisible ? (
        <Animated.View
          pointerEvents="auto"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: overlayOpacity,
              backgroundColor: 'rgba(15, 23, 42, 0.40)',
              zIndex: 10,
            },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSidebar} />
        </Animated.View>
      ) : null}

      <Animated.View
        style={[
          styles.sidebar,
          { transform: [{ translateX: sidebarTranslate }] },
        ]}
      >
        <View style={styles.sidebarHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sidebarTitle}>Lịch sử điểm danh</Text>
            <Text style={styles.sidebarSubtitle}>Theo dõi công và hoạt động</Text>
          </View>
          <Pressable onPress={closeSidebar} style={styles.closeButton}>
            <Icon name="close" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.sidebarContent}
          showsVerticalScrollIndicator={false}
        >
          {/* User info */}
          <View style={styles.infoCard}>
            <Text style={styles.infoName}>
              {employeeUser?.name || employeeUser?.code || 'Nhân viên'}
            </Text>
            {employeeUser?.employee_id ? (
              <Text style={styles.infoDetail}>
                Mã: {employeeUser.employee_id}
              </Text>
            ) : null}
            <Text style={styles.infoDetail}>
              Chế độ: Ghi chấm công
            </Text>
            {cooldownSeconds > 0 ? (
              <Text style={styles.infoDetail}>
                Giãn cách: {cooldownSeconds}s
              </Text>
            ) : null}
          </View>

          {/* History */}
          <View style={styles.historyCard}>
            <Text style={styles.sectionTitle}>Lịch sử chấm công</Text>
            <View style={styles.historyFilterRow}>
              <View style={styles.historyDateField}>
                <DatePickerField
                  value={historyStartDate}
                  onChange={setHistoryStartDate}
                  label="Ngày lịch sử"
                />
              </View>
              <View style={styles.historyDateField}>
                <DatePickerField
                  value={historyEndDate}
                  onChange={setHistoryEndDate}
                  label="Đến ngày"
                />
              </View>
              <Pressable
                onPress={() =>
                  loadHistory(historyStartDate, historyEndDate, employeeUser)
                }
                style={styles.filterButton}
              >
                {historyLoading ? (
                  <ActivityIndicator color={colors.secondary} size="small" />
                ) : (
                  <Text style={styles.filterButtonText}>Lọc</Text>
                )}
              </Pressable>
            </View>

            {historyLoading ? (
              <Text style={styles.mutedText}>Đang tải dữ liệu...</Text>
            ) : historyRecords.length === 0 ? (
              <Text style={styles.mutedText}>
                Chưa có dữ liệu cho ngày đã chọn.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={[styles.tableWrap, { minWidth: 380 }]}>
                  <View style={styles.tableHeader}>
                    <Text style={styles.tableColDate}>Ngày</Text>
                    <Text style={styles.tableColTime}>Check-in</Text>
                    <Text style={styles.tableColTime}>Check-out</Text>
                    <Text style={styles.tableColFlex}>Vị trí</Text>
                    <Text style={styles.tableColStatus}>Trạng thái</Text>
                  </View>
                  {historyRecords.slice(0, 60).map((item, index) => (
                    <View
                      key={`${item.id || 'hist'}-${
                        item.check_in_time || ''
                      }-${index}`}
                      style={[
                        styles.tableRow,
                        index % 2 === 0 && styles.tableRowEven,
                      ]}
                    >
                      <Text style={styles.tableColDate}>{item.date || '-'}</Text>
                      <Text style={styles.tableColTime}>
                        {item.check_in_time || '-'}
                      </Text>
                      <Text style={styles.tableColTime}>
                        {item.check_out_time || '-'}
                      </Text>
                      <Text style={styles.tableColFlex} numberOfLines={1}>
                        {item.check_in_location_text ||
                          item.check_out_location_text ||
                          '-'}
                      </Text>
                      <Text style={styles.tableColStatus} numberOfLines={1}>
                        {item.status || '-'}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          {/* Logout */}
          <Pressable onPress={handleLogout} style={styles.logoutButton}>
            <Icon name="logout" size={16} color="#b91c1c" />
            <Text style={styles.logoutText}>Đăng xuất</Text>
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
    padding: spacing.sm,
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
    shadowOffset: { width: -2, height: 0 },
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
  sidebarSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
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
  historyCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
    padding: spacing.md,
    gap: spacing.sm + 2,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  historyFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  historyDateField: {
    flex: 1,
    minWidth: 120,
  },
  filterButton: {
    minWidth: 56,
    minHeight: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.blue[100],
    borderWidth: 1,
    borderColor: colors.blue[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  tableWrap: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.slate[100],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.xs + 4,
    paddingHorizontal: spacing.xs,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
  },
  tableRowEven: {
    backgroundColor: colors.slate[50],
  },
  tableColDate: {
    fontSize: 10,
    color: colors.slate[700],
    width: 72,
    fontWeight: '600',
  },
  tableColTime: {
    fontSize: 10,
    color: colors.slate[700],
    width: 60,
  },
  tableColFlex: {
    fontSize: 10,
    color: colors.slate[700],
    flex: 1,
  },
  tableColStatus: {
    fontSize: 10,
    color: colors.slate[700],
    width: 72,
  },
  logoutButton: {
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
  logoutText: {
    color: colors.red[700],
    fontSize: 14,
    fontWeight: '700',
  },
});
