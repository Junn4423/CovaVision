import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import CameraKit, {Camera, CameraType} from 'react-native-camera-kit';
import RNFS from 'react-native-fs';
import {SafeAreaView} from 'react-native-safe-area-context';
import Tts from 'react-native-tts';
import {api, getApiBaseUrl, getGatewayAuth} from '../../services/api';
import {clearStoredSession, logoutGatewaySession} from '../../services/authSession';
import {resolveEndpointUrl} from '../../utils/url';
import {
  clearMobileLocalData,
  deleteMobileAttendanceRecord,
  deleteLocalEmployee,
  exportMobileLocalDataSnapshot,
  getLocalAccounts,
  getLocalAccountsPage,
  getLocalAttendanceRange,
  getLocalEmployees,
  getLocalEmployeesPage,
  getLocalTodayAttendance,
  getLocalTodayAttendancePage,
  getMobileLocalDataSummary,
  initializeMobileLocalDataStore,
  isMobileAttendanceErpSynced,
  recordMobileLocalFaceAttendance,
  recordMobileServerAttendanceResponse,
  syncAllMobileLocalData,
  syncMobileAccountsFromServer,
  syncMobileEmployeesFromServer,
  syncMobileTodayAttendanceFromServer,
  upsertMobileAttendanceRecords,
  type MobileLocalDataPage,
  type MobileLocalDataSummary,
} from '../../services/nativeLocalAttendance';
import {colors} from '../../theme';
import {spacing, border} from '../../designSystem';
import {Icon} from '../../components/Icon';
import {Card, Button, Input, Badge, StatusMessage, EmptyState} from '../../components/ui';
import type {AdminModuleKey} from '../../types/app';
import {FaceAttendancePanel} from '../../components/attendance/FaceAttendancePanel';
import {exportReportFile, type ExportRow} from '../../services/exportService';
import {DatePickerField} from '../../components/DatePickerField';
import {AdminDrawer} from '../../components/AdminDrawer';
import {MultiChannelSettingsModule} from '../../components/MultiChannelSettingsModule';
import {CameraDiscoveryModal} from '../../components/camera/CameraDiscoveryModal';
import {StandaloneAttendanceSettingsCard} from '../../components/camera/StandaloneAttendanceSettingsCard';
import {useResponsive} from '../../utils/responsive';

type AdminWorkspaceScreenProps = {
  initialAdminUser?: any;
  initialModule?: AdminModuleKey;
  onBackToPortal: () => void;
  onOpenEmployeeRegister?: (employee?: any) => void;
  onRequireLogin: () => void;
  onOpenAttendanceScreen?: () => void;
};

type ModuleItem = {
  key: AdminModuleKey;
  label: string;
  mobileLabel?: string;
};

const MODULE_ITEMS: ModuleItem[] = [
  {key: 'dashboard', label: 'Bảng tổng quan', mobileLabel: 'Tổng quan'},
  {key: 'attendance', label: 'Chấm công AI toàn diện', mobileLabel: 'Chấm công AI'},
  {key: 'mobile_data', label: 'Dữ liệu bộ nhớ thiết bị', mobileLabel: 'Dữ liệu máy'},
  {key: 'camera', label: 'Quản lý Camera RTSP', mobileLabel: 'Quản lý Camera'},
  {key: 'register', label: 'Tải dữ liệu từ ERP', mobileLabel: 'Đăng ký từ ERP'},
  {key: 'sync_verify', label: 'Đối soát & Đồng bộ ERP', mobileLabel: 'Đối soát ERP'},
  {key: 'manage_faces', label: 'Hồ sơ nhân sự Offline', mobileLabel: 'Hồ sơ Offline'},
  {key: 'report', label: 'Báo cáo chấm công nội bộ', mobileLabel: 'Báo cáo nội bộ'},
  {key: 'online_attendance', label: 'Báo cáo đã đồng bộ ERP', mobileLabel: 'Đã đồng bộ ERP'},
  {key: 'account', label: 'Tài khoản & Phân quyền', mobileLabel: 'Tài khoản NV'},
  {key: 'system_settings', label: 'Cài đặt hệ thống', mobileLabel: 'Cài đặt'},
];

const MODULE_VISIBILITY_KEY_BY_MODULE: Partial<Record<AdminModuleKey, string>> = {
  attendance: 'attendance',
  mobile_data: 'mobile_local_data',
  camera: 'camera_management',
  register: 'online_sync',
  sync_verify: 'sync_verify',
  manage_faces: 'offline_manage',
  report: 'report',
  online_attendance: 'online_attendance_check',
  account: 'account_management',
};

const SERVICE_ICONS: Record<AdminModuleKey, string> = {
  dashboard: 'dashboard',
  attendance: 'face-recognition',
  mobile_data: 'database',
  camera: 'camera',
  register: 'sync',
  sync_verify: 'server',
  manage_faces: 'people',
  report: 'report',
  online_attendance: 'wifi',
  account: 'badge',
  system_settings: 'settings',
};

const SERVICE_ICON_COLORS: Record<AdminModuleKey, string> = {
  dashboard: '#1d4ed8',
  attendance: '#7c3aed',
  mobile_data: '#0891b2',
  camera: '#d97706',
  register: '#059669',
  sync_verify: '#4f46e5',
  manage_faces: '#db2777',
  report: '#dc2626',
  online_attendance: '#2563eb',
  account: '#7c3aed',
  system_settings: '#475569',
};

const SERVICE_DESCRIPTIONS: Record<AdminModuleKey, string> = {
  dashboard: 'Tổng quan chấm công, cảnh báo hệ thống',
  attendance: 'Điểm danh thử nghiệm, kiểm tra camera & dịch vụ',
  mobile_data: 'Dữ liệu lưu trên thiết bị, đồng bộ, nâng cao',
  camera: 'Quản lý camera RTSP cho điểm danh',
  register: 'Tải & đăng ký nhân viên từ hệ thống ERP',
  sync_verify: 'So sánh dữ liệu ERP với hệ thống',
  manage_faces: 'Quản lý nhân viên offline, ảnh khuôn mặt',
  report: 'Báo cáo chấm công nội bộ, xuất CSV',
  online_attendance: 'Báo cáo chấm công đã đồng bộ, xuất CSV',
  account: 'Quản lý tài khoản nội bộ nhân viên',
  system_settings: 'Cấu hình chấm công, hiển thị module',
};

function todayIsoDate() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function normalizeDateRange(startDate: string, endDate: string) {
  const fallbackDate = todayIsoDate();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ''))
    ? startDate
    : fallbackDate;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ''))
    ? endDate
    : start;
  return start <= end ? {start, end} : {start: end, end: start};
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

function formatJson(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input || '');
  }
}

function normalizeAttendanceMode(_value: unknown): 'auto_record' {
  return 'auto_record';
}

function toSafeText(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function buildStableKey(prefix: string, value: unknown, index: number): string {
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue || normalizedValue === '-') {
    return `${prefix}-${index}`;
  }
  return `${prefix}-${normalizedValue}-${index}`;
}

const EMPTY_LOCAL_DATA_SUMMARY: MobileLocalDataSummary = {
  databaseName: 'chamcong_mobile_local.db',
  employeesCount: 0,
  accountsCount: 0,
  attendanceCount: 0,
  lastEmployeeSyncAt: '',
  lastAccountSyncAt: '',
  lastAttendanceSyncAt: '',
  lastFullSyncAt: '',
};

const MOBILE_DATA_PAGE_SIZE = 8;

const EMPTY_LOCAL_DATA_PAGE: MobileLocalDataPage<any> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: MOBILE_DATA_PAGE_SIZE,
  totalPages: 1,
};

function normalizePreviewUri(value: unknown, fallbackUri = ''): string {
  const text = String(value || '').trim();
  if (!text) {
    return fallbackUri;
  }
  if (text.startsWith('data:image/')) {
    return text;
  }
  if (/^[A-Za-z0-9+/=]+$/.test(text)) {
    return `data:image/jpeg;base64,${text}`;
  }
  return text;
}

function normalizeEmployeeImageUri(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  if (text.startsWith('data:image/')) {
    return text;
  }
  if (/^[A-Za-z0-9+/=]+$/.test(text) && text.length > 256) {
    return `data:image/jpeg;base64,${text}`;
  }
  if (/^https?:\/\//i.test(text)) {
    return text;
  }
  if (text.startsWith('/')) {
    const apiBase = String(getApiBaseUrl() || '').trim();
    if (apiBase) {
      return resolveEndpointUrl(apiBase, text);
    }
  }
  return text;
}

function buildErpTokenImageUri(value: unknown): string {
  const token = String(value || '').trim();
  if (!token) {
    return '';
  }
  return `https://sof.com.vn/loadimage/${encodeURIComponent(token)}`;
}

function isUsableRemoteImageUri(uri: string): boolean {
  if (!/^https?:\/\//i.test(uri)) {
    return true;
  }

  try {
    const hostname = new URL(uri).hostname.toLowerCase();
    // ERP can return an internal numeric host alongside the usable token.
    // Do not expose that private transport to an Android client on the WAN.
    return hostname !== 'localhost'
      && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  } catch {
    return false;
  }
}

function buildLocalTokenImageUri(value: unknown): string {
  const token = String(value || '').trim();
  if (!token) {
    return '';
  }
  return normalizeEmployeeImageUri(`/api/image/token/${encodeURIComponent(token)}`);
}

function resolveEmployeeImageUri(
  input: any,
  preferredSource: 'local' | 'erp' = 'local',
): string {
  const erpCandidates = [
    input?.erp_image_base64,
    buildErpTokenImageUri(input?.erp_image_token),
    input?.erp_image_url,
  ];
  const legacyLocalCandidates = !input?.erp_image_token && input?.image_source !== 'erp'
    ? [input?.image_base64, input?.image_url, buildLocalTokenImageUri(input?.image_token)]
    : [];
  const localCandidates = [
    input?.local_image_base64,
    buildLocalTokenImageUri(input?.local_image_token),
    input?.local_image_url,
    ...legacyLocalCandidates,
  ];

  for (const candidate of preferredSource === 'erp' ? erpCandidates : localCandidates) {
    const uri = normalizeEmployeeImageUri(candidate);
    if (uri && isUsableRemoteImageUri(uri)) {
      return uri;
    }
  }
  return '';
}

function extractEmployeePayload(response: any): any | null {
  if (response?.employee && typeof response.employee === 'object') {
    return response.employee;
  }
  if (response?.data?.employee && typeof response.data.employee === 'object') {
    return response.data.employee;
  }
  if (response?.data && typeof response.data === 'object' && response.data.employee_id) {
    return response.data;
  }
  if (response && typeof response === 'object' && response.employee_id) {
    return response;
  }
  return null;
}

function buildAttendanceMergeKey(row: any, index: number): string {
  const compositeKey = [
    String(row?.employee_id || row?.user_id || '').trim(),
    String(row?.date || row?.attendance_date || '').trim(),
    String(row?.check_in_time || row?.time || row?.attendance_time || '').trim(),
    String(row?.check_out_time || '').trim(),
  ].join('|');
  if (compositeKey.replace(/\|/g, '')) {
    return compositeKey;
  }
  const stableId = String(row?.attendance_id || row?.id || row?.record_key || '').trim();
  return stableId || `attendance-${index}`;
}

function normalizeAttendanceDisplayRow(row: any): any {
  return {
    ...(row || {}),
    employee_id: String(row?.employee_id || row?.user_id || '').trim(),
    name: String(row?.name || row?.employee_name || '').trim(),
    date: String(row?.date || row?.attendance_date || '').trim(),
    attendance_date: String(row?.attendance_date || row?.date || '').trim(),
    check_in_time: String(row?.check_in_time || row?.time || row?.attendance_time || '').trim(),
    check_out_time: String(row?.check_out_time || '').trim(),
  };
}

function mergeAttendanceDisplayRows(serverRows: any[], localRows: any[]): any[] {
  const mergedRows: any[] = [];
  const seenKeys = new Set<string>();

  for (const row of [...serverRows, ...localRows]) {
    const normalizedRow = normalizeAttendanceDisplayRow(row);
    const key = buildAttendanceMergeKey(normalizedRow, mergedRows.length);
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    mergedRows.push(normalizedRow);
  }

  return mergedRows.sort((left, right) => {
    const leftDate = String(left?.date || left?.attendance_date || '');
    const rightDate = String(right?.date || right?.attendance_date || '');
    if (leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }
    return String(right?.check_in_time || '').localeCompare(String(left?.check_in_time || ''));
  });
}

function buildAttendanceSummary(rows: any[]) {
  return {
    total_records: rows.length,
    unique_employees: new Set(
      rows.map(row => String(row?.employee_id || row?.user_id || '').trim()).filter(Boolean),
    ).size,
    checkin_count: rows.filter(row => String(row?.check_in_time || row?.time || '').trim()).length,
    checkout_count: rows.filter(row => String(row?.check_out_time || '').trim()).length,
  };
}

async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.CAMERA,
    );
    if (granted) {
      return true;
    }

    const response = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Quyền camera',
        message: 'App cần camera để điểm danh bằng khuôn mặt.',
        buttonPositive: 'Cho phép',
        buttonNegative: 'Không',
      },
    );
    return response === PermissionsAndroid.RESULTS.GRANTED;
  }

  const cameraKitApi = (CameraKit ?? {}) as {
    checkDeviceCameraAuthorizationStatus?: () => Promise<boolean>;
    requestDeviceCameraAuthorization?: () => Promise<boolean>;
  };

  if (typeof cameraKitApi.checkDeviceCameraAuthorizationStatus === 'function') {
    const granted = await cameraKitApi.checkDeviceCameraAuthorizationStatus();
    if (granted) {
      return true;
    }
  }

  if (typeof cameraKitApi.requestDeviceCameraAuthorization === 'function') {
    return cameraKitApi.requestDeviceCameraAuthorization();
  }

  return true;
}

function ModuleBox({
  title,
  subtitle,
  rightSlot,
  hideHeader = false,
  children,
}: {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  hideHeader?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card style={styles.moduleCard}>
      {!hideHeader ? (
        <View style={styles.moduleHeaderRow}>
          <View style={styles.moduleHeaderTextWrap}>
            <Text style={styles.moduleTitle}>{title}</Text>
            {subtitle ? <Text style={styles.moduleSubtitle}>{subtitle}</Text> : null}
          </View>
          {rightSlot}
        </View>
      ) : rightSlot ? (
        <View style={[styles.moduleHeaderRow, {paddingBottom: spacing.sm, borderBottomWidth: 0}]}>
          <View style={{flex: 1}} />
          {rightSlot}
        </View>
      ) : null}
      {children}
    </Card>
  );
}

function DashboardModule({onNavigateModule}: {onNavigateModule?: (key: AdminModuleKey) => void} = {}) {
  const {isMobile} = useResponsive();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    accountsCount: 0,
    attendanceTodayCount: 0,
    unmatchedFaces: 0,
    employeesWithoutAccount: 0,
    pendingSyncRecordsCount: 0,
  });
  const [errorText, setErrorText] = useState('');

  async function loadData() {
    setLoading(true);
    setErrorText('');
    try {
      await initializeMobileLocalDataStore();
      const today = todayIsoDate();
      const [employees, accounts, allAttendance] = await Promise.all([
        getLocalEmployees(500),
        getLocalAccounts(200),
        getLocalTodayAttendance(500),
      ]);

      const todayAttendance = allAttendance.filter(
        (row: any) => String(row?.attendance_date || row?.date || '').trim() === today,
      );
      const presentEmployeeIds = new Set(
        todayAttendance.map((row: any) => String(row?.employee_id || '').trim()).filter(Boolean),
      );

      const accountEmployeeIds = new Set(
        accounts.filter((a: any) => a?.account_id).map((a: any) => String(a?.employee_id || '').trim()),
      );
      const employeesWithoutAccount = employees.filter(
        (e: any) => !accountEmployeeIds.has(String(e?.employee_id || e?.code || '').trim()),
      ).length;

      // Count employees with face mismatch between ERP and system
      let unmatchedFaces = 0;
      try {
        const compareRes = await api.getSyncCompare();
        const mismatchRows = Array.isArray(compareRes?.face_mismatches)
          ? compareRes.face_mismatches
          : compareRes?.employees;
        if (compareRes?.success && Array.isArray(mismatchRows)) {
          unmatchedFaces = Array.isArray(compareRes?.face_mismatches)
            ? compareRes.face_mismatches.length
            : mismatchRows.filter(
                (e: any) => e?.face_mismatch === true || String(e?.status || '').includes('mismatch'),
              ).length;
        }
      } catch {}

      // Count pending attendance records to push to ERP
      let pendingSyncRecordsCount = 0;
      try {
        const [pendingServerRes, allAttendanceRecords] = await Promise.all([
          api.getReport({sync_status: 'pending'}).catch(() => null),
          getLocalTodayAttendance(500).catch(() => []),
        ]);
        const serverPending =
          pendingServerRes?.success && Array.isArray(pendingServerRes?.records)
            ? pendingServerRes.records.filter((r: any) => !isMobileAttendanceErpSynced(r)).length
            : 0;
        const localPending = allAttendanceRecords.filter((r: any) => !isMobileAttendanceErpSynced(r)).length;
        pendingSyncRecordsCount = Math.max(serverPending, localPending);
      } catch {}

      setDashboardData({
        totalEmployees: employees.length,
        presentToday: presentEmployeeIds.size,
        absentToday: Math.max(0, employees.length - presentEmployeeIds.size),
        accountsCount: accounts.filter((a: any) => a?.account_id).length,
        attendanceTodayCount: todayAttendance.length,
        unmatchedFaces,
        employeesWithoutAccount,
        pendingSyncRecordsCount,
      });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không tải được dữ liệu local.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData().catch(() => {});
  }, []);

  const attendanceRate = dashboardData.totalEmployees > 0
    ? Math.round((dashboardData.presentToday / dashboardData.totalEmployees) * 100)
    : 0;

  return (
    <ModuleBox
      title="Tổng quan điều hành"
      subtitle="Bảng điều khiển chấm công AI & dữ liệu nhân sự trên thiết bị"
      rightSlot={
        <Pressable onPress={() => loadData()} style={styles.smallButton}>
          <Text style={styles.smallButtonText}>Tải lại</Text>
        </Pressable>
      }>
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.centerText}>Đang tải dữ liệu điều hành...</Text>
        </View>
      ) : (
        <View style={styles.moduleList}>
          {errorText ? (
            <StatusMessage variant="error" message={errorText} />
          ) : null}

          {/* Executive Attendance Hero Gauge Card */}
          <View style={{
            backgroundColor: '#0b1329',
            borderRadius: border.radius.xl,
            borderWidth: 1,
            borderColor: 'rgba(56, 189, 248, 0.25)',
            padding: spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.lg,
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 4},
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 5,
          }}>
            {/* Radial Gauge Ring */}
            <View style={{
              width: 92,
              height: 92,
              borderRadius: 46,
              borderWidth: 6,
              borderColor: attendanceRate >= 80 ? '#10b981' : attendanceRate >= 50 ? '#f59e0b' : '#38bdf8',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(2, 6, 23, 0.55)',
              shadowColor: attendanceRate >= 80 ? '#10b981' : '#38bdf8',
              shadowRadius: 8,
              shadowOpacity: 0.8,
            }}>
              <Text style={{fontSize: 22, fontWeight: '900', color: '#fff'}}>
                {attendanceRate}%
              </Text>
              <Text style={{fontSize: 10, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase'}}>
                Có mặt
              </Text>
            </View>

            {/* Metrics Info */}
            <View style={{flex: 1, gap: 4}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                <View style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: '#10b981',
                }} />
                <Text style={{color: '#38bdf8', fontSize: 11, fontWeight: '800', letterSpacing: 0.5}}>
                  HIỆN DIỆN HÔM NAY
                </Text>
              </View>
              <Text style={{color: '#fff', fontSize: 20, fontWeight: '900'}}>
                {dashboardData.presentToday} / {dashboardData.totalEmployees} <Text style={{fontSize: 14, fontWeight: '600', color: '#cbd5e1'}}>nhân viên</Text>
              </Text>
              <Text style={{color: '#94a3b8', fontSize: 12}}>
                Tỷ lệ hiện diện toàn đơn vị theo ca
              </Text>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 2,
              }}>
                <Icon name="calendar" size={12} color="#64748b" />
                <Text style={{color: '#64748b', fontSize: 11, fontWeight: '600'}}>
                  {todayIsoDate()}
                </Text>
              </View>
            </View>
          </View>

          {/* 4 Luxury Bento KPI Cards - Deep High-Contrast Colors */}
          <View style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing.sm + 2,
          }}>
            {/* Bento Card 1: Tổng nhân viên */}
            <View style={{
              flex: 1,
              minWidth: '47%',
              backgroundColor: '#0f172a',
              borderRadius: border.radius.lg,
              borderWidth: 1.5,
              borderColor: '#38bdf8',
              padding: isMobile ? 10 : spacing.md,
              gap: 3,
              shadowColor: '#38bdf8',
              shadowOffset: {width: 0, height: 2},
              shadowOpacity: 0.15,
              shadowRadius: 6,
              elevation: 3,
            }}>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                <Icon name="people" size={isMobile ? 17 : 20} color="#38bdf8" />
                <View style={{
                  backgroundColor: '#0369a1',
                  borderRadius: 999,
                  paddingHorizontal: 6,
                  paddingVertical: 1.5,
                }}>
                  <Text style={{color: '#e0f2fe', fontSize: 9.5, fontWeight: '800'}}>HỒ SƠ</Text>
                </View>
              </View>
              <Text style={{color: '#ffffff', fontSize: isMobile ? 22 : 26, fontWeight: '900', marginTop: 2}}>
                {dashboardData.totalEmployees}
              </Text>
              <Text style={{color: '#94a3b8', fontSize: isMobile ? 10.5 : 11.5, fontWeight: '700'}} numberOfLines={1}>
                Tổng nhân sự lưu local
              </Text>
            </View>

            {/* Bento Card 2: Có mặt hôm nay */}
            <View style={{
              flex: 1,
              minWidth: '47%',
              backgroundColor: '#064e3b',
              borderRadius: border.radius.lg,
              borderWidth: 1.5,
              borderColor: '#10b981',
              padding: isMobile ? 10 : spacing.md,
              gap: 3,
              shadowColor: '#10b981',
              shadowOffset: {width: 0, height: 2},
              shadowOpacity: 0.2,
              shadowRadius: 6,
              elevation: 3,
            }}>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                <Icon name="check" size={isMobile ? 17 : 20} color="#34d399" />
                <View style={{
                  backgroundColor: '#047857',
                  borderRadius: 999,
                  paddingHorizontal: 6,
                  paddingVertical: 1.5,
                }}>
                  <Text style={{color: '#d1fae5', fontSize: 9.5, fontWeight: '800'}}>
                    +{dashboardData.presentToday} NV
                  </Text>
                </View>
              </View>
              <Text style={{color: '#34d399', fontSize: isMobile ? 22 : 26, fontWeight: '900', marginTop: 2}}>
                {dashboardData.presentToday}
              </Text>
              <Text style={{color: '#a7f3d0', fontSize: isMobile ? 10.5 : 11.5, fontWeight: '700'}} numberOfLines={1}>
                Đã check-in hôm nay
              </Text>
            </View>

            {/* Bento Card 3: Lượt chấm công */}
            <View style={{
              flex: 1,
              minWidth: '47%',
              backgroundColor: '#312e81',
              borderRadius: border.radius.lg,
              borderWidth: 1.5,
              borderColor: '#6366f1',
              padding: isMobile ? 10 : spacing.md,
              gap: 3,
              shadowColor: '#6366f1',
              shadowOffset: {width: 0, height: 2},
              shadowOpacity: 0.2,
              shadowRadius: 6,
              elevation: 3,
            }}>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                <Icon name="history" size={isMobile ? 17 : 20} color="#a5b4fc" />
                <View style={{
                  backgroundColor: '#4338ca',
                  borderRadius: 999,
                  paddingHorizontal: 6,
                  paddingVertical: 1.5,
                }}>
                  <Text style={{color: '#e0e7ff', fontSize: 9.5, fontWeight: '800'}}>AI LOGS</Text>
                </View>
              </View>
              <Text style={{color: '#e0e7ff', fontSize: isMobile ? 22 : 26, fontWeight: '900', marginTop: 2}}>
                {dashboardData.attendanceTodayCount}
              </Text>
              <Text style={{color: '#c7d2fe', fontSize: isMobile ? 10.5 : 11.5, fontWeight: '700'}} numberOfLines={1}>
                Lượt quét nhận diện
              </Text>
            </View>

            {/* Bento Card 4: Vắng mặt */}
            <View style={{
              flex: 1,
              minWidth: '47%',
              backgroundColor: '#881337',
              borderRadius: border.radius.lg,
              borderWidth: 1.5,
              borderColor: '#f43f5e',
              padding: isMobile ? 10 : spacing.md,
              gap: 3,
              shadowColor: '#f43f5e',
              shadowOffset: {width: 0, height: 2},
              shadowOpacity: 0.2,
              shadowRadius: 6,
              elevation: 3,
            }}>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                <Icon name="clock" size={isMobile ? 17 : 20} color="#fb7185" />
                <View style={{
                  backgroundColor: '#be123c',
                  borderRadius: 999,
                  paddingHorizontal: 6,
                  paddingVertical: 1.5,
                }}>
                  <Text style={{color: '#ffe4e6', fontSize: 9.5, fontWeight: '800'}}>
                    {dashboardData.totalEmployees > 0
                      ? `${Math.round((dashboardData.absentToday / dashboardData.totalEmployees) * 100)}%`
                      : '0%'}
                  </Text>
                </View>
              </View>
              <Text style={{color: '#ffe4e6', fontSize: isMobile ? 22 : 26, fontWeight: '900', marginTop: 2}}>
                {dashboardData.absentToday}
              </Text>
              <Text style={{color: '#fecdd3', fontSize: isMobile ? 10.5 : 11.5, fontWeight: '700'}} numberOfLines={1}>
                Chưa có mặt
              </Text>
            </View>
          </View>

          {/* Smart Alerts and Information Cards */}
          {(dashboardData.unmatchedFaces > 0 || dashboardData.employeesWithoutAccount > 0 || dashboardData.pendingSyncRecordsCount > 0) ? (
            <>
              <Text style={styles.blockTitle}>Cảnh báo & Thông tin điều hành</Text>

              {/* Card 1: Pending records to push to ERP */}
              {dashboardData.pendingSyncRecordsCount > 0 ? (
                <Pressable
                  onPress={() => onNavigateModule?.('report')}
                  style={({pressed}) => ({
                    backgroundColor: '#fff7ed',
                    borderColor: '#f97316',
                    borderWidth: 1.5,
                    borderRadius: border.radius.lg,
                    padding: isMobile ? 10 : spacing.md,
                    gap: 6,
                    shadowColor: '#f97316',
                    shadowOffset: {width: 0, height: 2},
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 2,
                    opacity: pressed ? 0.85 : 1,
                  })}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 6}}>
                      <Icon name="sync_problem" size={17} color="#c2410c" />
                      <Text style={{color: '#9a3412', fontSize: isMobile ? 12 : 13, fontWeight: '800'}} numberOfLines={1}>
                        Bản ghi chưa đẩy lên hệ thống ERP
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: '#ffedd5',
                      borderWidth: 1,
                      borderColor: '#fed7aa',
                      borderRadius: 999,
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      flexShrink: 0,
                    }}>
                      <Text style={{color: '#c2410c', fontSize: 10, fontWeight: '800'}}>
                        {dashboardData.pendingSyncRecordsCount} CHỜ ĐỒNG BỘ
                      </Text>
                    </View>
                  </View>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2}}>
                    <Text style={{color: '#7c2d12', fontSize: 11.5, lineHeight: 16, flex: 1}}>
                      Có {dashboardData.pendingSyncRecordsCount} lượt chấm công lưu nội bộ chưa gửi lên ERP. Bấm để mở tab Chờ đồng bộ.
                    </Text>
                    <Icon name="chevron_right" size={18} color="#c2410c" />
                  </View>
                </Pressable>
              ) : null}

              {/* Card 2: Face mismatch needing verification */}
              {dashboardData.unmatchedFaces > 0 ? (
                <Pressable
                  onPress={() => onNavigateModule?.('sync_verify')}
                  style={({pressed}) => ({
                    backgroundColor: '#fffbeb',
                    borderColor: '#f59e0b',
                    borderWidth: 1.5,
                    borderRadius: border.radius.lg,
                    padding: isMobile ? 10 : spacing.md,
                    gap: 6,
                    shadowColor: '#f59e0b',
                    shadowOffset: {width: 0, height: 2},
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 2,
                    opacity: pressed ? 0.85 : 1,
                  })}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 6}}>
                      <Icon name="warning" size={17} color="#b45309" />
                      <Text style={{color: '#92400e', fontSize: isMobile ? 12 : 13, fontWeight: '800'}} numberOfLines={1}>
                        Khuôn mặt cần đối soát
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: '#fef3c7',
                      borderWidth: 1,
                      borderColor: '#fde68a',
                      borderRadius: 999,
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      flexShrink: 0,
                    }}>
                      <Text style={{color: '#b45309', fontSize: 10, fontWeight: '800'}}>
                        {dashboardData.unmatchedFaces} CẦN XỬ LÝ
                      </Text>
                    </View>
                  </View>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2}}>
                    <Text style={{color: '#78350f', fontSize: 11.5, lineHeight: 16, flex: 1}}>
                      Có {dashboardData.unmatchedFaces} nhân sự cần đồng bộ dữ liệu sinh trắc giữa ERP và AI local. Bấm để đối soát ngay.
                    </Text>
                    <Icon name="chevron_right" size={18} color="#b45309" />
                  </View>
                </Pressable>
              ) : null}

              {dashboardData.employeesWithoutAccount > 0 ? (
                <View style={{
                  backgroundColor: '#f0f9ff',
                  borderColor: '#38bdf8',
                  borderWidth: 1.5,
                  borderRadius: border.radius.lg,
                  padding: isMobile ? 10 : spacing.md,
                  gap: 6,
                  shadowColor: '#38bdf8',
                  shadowOffset: {width: 0, height: 2},
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                  elevation: 2,
                }}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 6}}>
                      <Icon name="info" size={17} color="#0284c7" />
                      <Text style={{color: '#0369a1', fontSize: isMobile ? 12 : 13, fontWeight: '800'}} numberOfLines={1}>
                        Nhân viên chưa kích hoạt tài khoản
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: '#e0f2fe',
                      borderWidth: 1,
                      borderColor: '#bae6fd',
                      borderRadius: 999,
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      flexShrink: 0,
                    }}>
                      <Text style={{color: '#0284c7', fontSize: 10, fontWeight: '800'}}>
                        {dashboardData.employeesWithoutAccount} CHƯA TẠO
                      </Text>
                    </View>
                  </View>
                  <Text style={{color: '#0c4a6e', fontSize: 11.5, lineHeight: 16}}>
                    Có {dashboardData.employeesWithoutAccount} nhân sự chưa được cấp tài khoản app nội bộ.
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      )}
    </ModuleBox>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyAttendanceModule() {
  const cameraRef = React.useRef<any>(null);
  const [cameraPermission, setCameraPermission] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [attendanceMode] =
    useState<'auto_record'>('auto_record');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [lastCaptureUri, setLastCaptureUri] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [todayRows, setTodayRows] = useState<any[]>([]);
  const [statusText, setStatusText] = useState('');

  const loadTodayAttendance = useCallback(async () => {
    const response = await api.getTodayAttendance();
    if (response?.success) {
      setTodayRows(Array.isArray(response.data) ? response.data : []);
    } else {
      setTodayRows([]);
    }
  }, []);

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
    setCooldownSeconds(totalSeconds);

    return {
      mode,
      totalSeconds,
    };
  }, []);

  async function submitAttendanceByFace() {
    if (submitting || !cameraPermission || !cameraRef.current?.capture) {
      return;
    }

    setSubmitting(true);
    setStatusText('');
    setFeedback(null);
    try {
      const latestSettings = await loadAttendanceSettings();
      const activeMode = latestSettings?.mode || attendanceMode;
      const captureResult = await cameraRef.current.capture();
      const captureUri = String(captureResult?.uri || '').trim();
      if (!captureUri) {
        setStatusText('Không lấy được khung hình từ camera.');
        return;
      }

      setLastCaptureUri(captureUri);

      const effectiveAttendanceType = 'auto';

      const formData = new FormData();
      formData.append('attendance_type', effectiveAttendanceType);
      formData.append('include_preview', 'true');
      formData.append('tolerance', '0.5');
      formData.append('image', {
        uri: captureUri,
        type: 'image/jpeg',
        name: captureResult?.name || `attendance_${Date.now()}.jpg`,
      } as any);

      const response = await api.attendanceImage(formData);
      const responseMode = normalizeAttendanceMode(response?.attendance_mode || activeMode);

      const isAutoMode = responseMode === 'auto_record';
      const fallbackLabel = isAutoMode ? 'Ghi chấm công' : effectiveAttendanceType;
      if (!response?.success) {
        setFeedback({
          type: 'error',
          message:
            response?.message
            || (isAutoMode
              ? 'Không thể ghi chấm công.'
              : 'Không thể điểm danh.'),
          user: response?.user || null,
          previewUri: normalizePreviewUri(response?.preview_image_base64, captureUri),
          checkInTime: response?.check_in_time || '',
          checkOutTime: response?.check_out_time || '',
          attendanceTypeLabel: response?.attendance_type_label || fallbackLabel,
          locationText: response?.location_text || '',
        });
        setStatusText(
          response?.message
          || (isAutoMode
            ? 'Không thể ghi chấm công.'
            : 'Không thể điểm danh.'),
        );
        return;
      }

      setFeedback({
        type: 'success',
        message:
          response?.message
          || (isAutoMode
            ? 'Ghi chấm công thành công.'
            : 'Điểm danh thành công.'),
        user: response?.user || null,
        previewUri: normalizePreviewUri(response?.preview_image_base64, captureUri),
        checkInTime: response?.check_in_time || '',
        checkOutTime: response?.check_out_time || '',
        attendanceTypeLabel: response?.attendance_type_label || fallbackLabel,
        locationText: response?.location_text || '',
      });
      setStatusText(
        response?.message
        || (isAutoMode
          ? 'Ghi chấm công thành công.'
          : 'Điểm danh thành công.'),
      );
      await loadTodayAttendance();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Không thể điểm danh.');
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Không thể điểm danh.',
        previewUri: lastCaptureUri || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    ensureCameraPermission()
      .then(granted => {
        setCameraPermission(granted);
        if (!granted) {
          setCameraError('Không có quyền camera trên thiết bị.');
        }
      })
      .catch(() => {
        setCameraPermission(false);
        setCameraError('Không có quyền camera trên thiết bị.');
      });
    loadAttendanceSettings().catch(() => {});
    loadTodayAttendance().catch(() => {});

    const timer = setInterval(() => {
      loadAttendanceSettings().catch(() => {});
    }, 15000);

    return () => clearInterval(timer);
  }, [loadAttendanceSettings, loadTodayAttendance]);

  return (
    <ModuleBox
      title="Chế độ chấm công toàn công ty"
      subtitle="Camera nhận diện khuôn mặt - điểm danh tập trung"
      rightSlot={
        <Pressable
          onPress={() => loadTodayAttendance()}
          style={styles.smallButtonSecondary}>
          <Text style={styles.smallButtonSecondaryText}>Tải lại</Text>
        </Pressable>
      }>
      <View style={styles.moduleList}>
        <Text style={styles.blockTitle}>Camera điểm danh</Text>
        <Text style={styles.mutedText}>
          Chế độ: Ghi chấm công
          {cooldownSeconds > 0 ? ` • Giãn cách ${cooldownSeconds}s` : ''}
        </Text>
        {cameraPermission ? (
          <View style={styles.cameraWrap}>
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              cameraType={CameraType.Front}
              zoomMode="off"
              focusMode="on"
              flashMode="off"
            />
          </View>
        ) : (
          <View style={styles.permissionWarnBox}>
            <Text style={styles.permissionWarnText}>
              {cameraError || 'Không có quyền camera trên thiết bị.'}
            </Text>
            <Pressable
              onPress={async () => {
                const granted = await ensureCameraPermission();
                setCameraPermission(granted);
                if (!granted) {
                  setCameraError('Không có quyền camera trên thiết bị.');
                }
              }}
              style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Xin quyền lại</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.autoModeInfoBox}>
          <Text style={styles.autoModeInfoText}>
            Ghi chấm công tự động — mỗi lần quét = 1 lượt ghi nhận.
          </Text>
        </View>
        <Pressable
          onPress={submitAttendanceByFace}
          disabled={submitting || !cameraPermission}
          style={styles.primaryButton}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {'Chụp và ghi chấm công'}
            </Text>
          )}
        </Pressable>
        {statusText ? <Text style={styles.statusInfoText}>{statusText}</Text> : null}
        {feedback ? (
          <View
            style={[
              styles.feedbackBox,
              feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
            ]}>
            <Text style={styles.feedbackMessage}>{feedback.message}</Text>
            {feedback.user?.name ? (
              <Text style={styles.feedbackLine}>
                Nhân viên: {feedback.user.name}
                {feedback.user.employee_id ? ` (${feedback.user.employee_id})` : ''}
              </Text>
            ) : null}
            {feedback.attendanceTypeLabel ? (
              <Text style={styles.feedbackLine}>Loại: {feedback.attendanceTypeLabel}</Text>
            ) : null}
            {feedback.checkInTime ? (
              <Text style={styles.feedbackLine}>Check-in: {feedback.checkInTime}</Text>
            ) : null}
            {feedback.checkOutTime ? (
              <Text style={styles.feedbackLine}>Check-out: {feedback.checkOutTime}</Text>
            ) : null}
            {feedback.locationText ? (
              <Text style={styles.feedbackLine}>Vị trí: {feedback.locationText}</Text>
            ) : null}
            {feedback.previewUri ? (
              <Image
                source={{uri: feedback.previewUri}}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        ) : null}

        <Text style={styles.blockTitle}>Danh sách hôm nay</Text>
        <View style={styles.simpleList}>
          {todayRows.length === 0 ? (
            <Text style={styles.mutedText}>Chưa có bản ghi.</Text>
          ) : (
            todayRows.slice(0, 80).map((row, index) => (
                <Text
                  key={buildStableKey('today-row', row?.id || row?.employee_id || row?.name, index)}
                  style={styles.simpleListItem}>
                  {(row?.name || row?.employee_name || '-').toString()} | Check-in:{' '}
                  {(row?.check_in_time || '-').toString()} | Check-out:{' '}
                  {(row?.check_out_time || '-').toString()}
                </Text>
            ))
          )}
        </View>
      </View>
    </ModuleBox>
  );
}

function AttendanceModule(_props: {testMode?: boolean; onToggleTestMode?: () => void} = {}) {
  const [attendanceMode, setAttendanceMode] =
    useState<'auto_record'>('auto_record');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [todayRows, setTodayRows] = useState<any[]>([]);
  // Filters & pagination
  const [filterKeyword, setFilterKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'checkin' | 'checkout' | 'full'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  // Camera selection
  const [cameraList, setCameraList] = useState<any[]>([]);
  const [selectedCameraSource, setSelectedCameraSource] = useState<string>('__device__');
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  const activeCamera = useMemo(() => {
    if (!selectedCameraSource || selectedCameraSource === '__device__') {
      return null;
    }
    return (
      cameraList.find(c => String(c?.id || c?.name || '') === selectedCameraSource) || null
    );
  }, [cameraList, selectedCameraSource]);

  const loadTodayAttendance = useCallback(async () => {
    const nextRows = await getLocalTodayAttendance(500);
    setTodayRows(nextRows);
  }, []);

  const syncTodayAttendance = useCallback(async () => {
    try {
      await syncMobileTodayAttendanceFromServer();
    } catch {
    }
    await loadTodayAttendance();
  }, [loadTodayAttendance]);

  const loadCameras = useCallback(async () => {
    try {
      const response = await api.getCameras();
      if (response?.success) {
        setCameraList(Array.isArray(response.cameras) ? response.cameras : []);
      }
    } catch {
      setCameraList([]);
    }
  }, []);

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
    const nextCooldownSeconds = Math.max(0, hours * 3600 + minutes * 60 + seconds);

    setAttendanceMode(mode);
    setCooldownSeconds(nextCooldownSeconds);

    return {
      mode,
      cooldownSeconds: nextCooldownSeconds,
    };
  }, []);

  const recordSubmitSuccess = useCallback(async (response?: any) => {
    const storedRow = await recordMobileServerAttendanceResponse(response).catch(() => null);
    if (storedRow && isMobileAttendanceErpSynced(response)) {
      await deleteMobileAttendanceRecord(
        storedRow.record_key,
        storedRow.id,
        storedRow.attendance_id,
      ).catch(() => {});
      await syncTodayAttendance();
    }
  }, [syncTodayAttendance]);

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
      await loadTodayAttendance();
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
  }, [loadTodayAttendance]);

  const recordAutoLocalAttendance = useCallback(async (payload: any) => {
    const imageBase64 = String(payload?.imageBase64 || '').trim();
    if (!imageBase64) {
      return {success: false, message: 'Thiếu ảnh để chấm công.'};
    }

    try {
      const response = await api.attendanceImageBase64({
        image_base64: imageBase64,
        attendance_type: payload.attendanceType === 'auto' ? 'auto' : payload.attendanceType,
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
  }, [backupLocalAttendance]);

  // Filtered & paginated rows
  const filteredRows = useMemo(() => {
    const keyword = filterKeyword.trim().toLowerCase();
    let result = todayRows;

    if (keyword) {
      result = result.filter(row => {
        const name = String(row?.name || row?.employee_name || '').toLowerCase();
        const id = String(row?.employee_id || row?.user_id || '').toLowerCase();
        return name.includes(keyword) || id.includes(keyword);
      });
    }

    if (filterStatus === 'checkin') {
      result = result.filter(row => String(row?.check_in_time || row?.time || '').trim());
    } else if (filterStatus === 'checkout') {
      result = result.filter(row => String(row?.check_out_time || '').trim());
    } else if (filterStatus === 'full') {
      result = result.filter(row =>
        String(row?.check_in_time || row?.time || '').trim() &&
        String(row?.check_out_time || '').trim(),
      );
    }

    return result;
  }, [todayRows, filterKeyword, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterKeyword, filterStatus]);

  useEffect(() => {
    initializeMobileLocalDataStore().catch(() => {});
    loadAttendanceSettings().catch(() => {});
    loadTodayAttendance().catch(() => {});
    syncTodayAttendance().catch(() => {});
    loadCameras().catch(() => {});

    const timer = setInterval(() => {
      loadAttendanceSettings().catch(() => {});
      syncTodayAttendance().catch(() => {});
    }, 15000);

    return () => clearInterval(timer);
  }, [loadAttendanceSettings, loadTodayAttendance, syncTodayAttendance, loadCameras]);

  return (
    <View style={styles.fixedAttendanceWrap}>
      {/* Fixed Full-Screen Camera AI HUD */}
      <FaceAttendancePanel
        fullScreenMode={true}
        selectedCameraSource={selectedCameraSource}
        selectedCamera={activeCamera}
        onSelectCameraSource={setSelectedCameraSource}
        topRightSlot={
          <Pressable
            onPress={() => setRightDrawerOpen(true)}
            style={styles.attendanceDrawerTrigger}
            accessibilityLabel="Mở cài đặt và danh sách điểm danh">
            <Icon name="tune" size={15} color="#38bdf8" />
            <Text style={styles.attendanceDrawerTriggerText}>Cài đặt & DS</Text>
            {todayRows.length > 0 ? (
              <View style={styles.attendanceDrawerBadge}>
                <Text style={styles.attendanceDrawerBadgeText}>{todayRows.length}</Text>
              </View>
            ) : null}
          </Pressable>
        }
        cameraTitle="Camera điểm danh AI"
        feedbackTitle="Kết quả nhận diện"
        emptyFeedbackText="Đưa mặt vào khung, giữ máy ổn định rồi bấm điểm danh."
        attendanceMode={'auto_record'}
        cooldownSeconds={cooldownSeconds}
        onAttendanceModeChange={mode => setAttendanceMode(mode as any)}
        loadLatestSettings={loadAttendanceSettings}
        detectImage={api.attendanceDetectFrame}
        submitImage={api.attendanceImageBase64}
        onAutoDetectedAttendance={recordAutoLocalAttendance}
        onAttendanceSyncFailed={backupLocalAttendance}
        onSubmitSuccess={recordSubmitSuccess}
      />

      {/* Slide-over Right Drawer Modal */}
      <Modal
        visible={rightDrawerOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setRightDrawerOpen(false)}>
        <View style={styles.drawerModalContainer}>
          <Pressable
            style={styles.drawerModalBackdrop}
            onPress={() => setRightDrawerOpen(false)}
          />
          <View style={styles.drawerModalSheet}>
            {/* Drawer Header */}
            <View style={styles.drawerHeader}>
              <View style={{flex: 1}}>
                <Text style={styles.drawerTitle}>Cài đặt & Danh sách</Text>
                <Text style={styles.drawerSubtitle}>Nguồn camera & nhật ký hôm nay</Text>
              </View>
              <Pressable
                onPress={() => setRightDrawerOpen(false)}
                style={styles.drawerCloseBtn}
                accessibilityLabel="Đóng ngăn cài đặt">
                <Icon name="close" size={18} color="#94a3b8" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.drawerContent}
              contentContainerStyle={{paddingBottom: 40}}
              showsVerticalScrollIndicator={false}>
              {/* NGUỒN CAMERA ĐIỂM DANH */}
              <View style={styles.drawerSection}>
                <View style={styles.drawerSectionHeader}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                    <Icon name="videocam" size={16} color="#38bdf8" />
                    <Text style={styles.drawerSectionTitle}>NGUỒN CAMERA ĐIỂM DANH</Text>
                  </View>
                </View>

                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4}}>
                  {/* Camera thiết bị */}
                  <Pressable
                    onPress={() => {
                      setSelectedCameraSource('__device__');
                      setRightDrawerOpen(false);
                    }}
                    style={[
                      styles.drawerCamPill,
                      (!selectedCameraSource || selectedCameraSource === '__device__') && styles.drawerCamPillActive,
                    ]}>
                    <Icon
                      name="camera"
                      size={14}
                      color={(!selectedCameraSource || selectedCameraSource === '__device__') ? '#34d399' : '#94a3b8'}
                    />
                    <Text style={[
                      styles.drawerCamPillText,
                      (!selectedCameraSource || selectedCameraSource === '__device__') && styles.drawerCamPillTextActive,
                    ]}>
                      Camera trước (Mặc định)
                    </Text>
                    {(!selectedCameraSource || selectedCameraSource === '__device__') ? (
                      <View style={styles.drawerCamDot} />
                    ) : null}
                  </Pressable>

                  {/* Camera RTSP từ Quản lý camera */}
                  {cameraList.map((cam, idx) => {
                    const camId = String(cam?.id || cam?.name || '');
                    const isSelected = camId === selectedCameraSource;
                    return (
                      <Pressable
                        key={camId || `cam_${idx}`}
                        onPress={() => {
                          setSelectedCameraSource(camId);
                          setRightDrawerOpen(false);
                        }}
                        style={[
                          styles.drawerCamPill,
                          isSelected && styles.drawerCamPillActive,
                        ]}>
                        <Icon
                          name="videocam"
                          size={14}
                          color={isSelected ? '#34d399' : '#94a3b8'}
                        />
                        <Text style={[
                          styles.drawerCamPillText,
                          isSelected && styles.drawerCamPillTextActive,
                        ]}>
                          {cam?.name || cam?.id || `Cam ${idx + 1}`}
                        </Text>
                        {isSelected ? (
                          <View style={styles.drawerCamDot} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* THÔNG TIN CHẾ ĐỘ ĐIỂM DANH */}
              <View style={styles.drawerSection}>
                <View style={styles.drawerSectionHeader}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                    <Icon name="tune" size={16} color="#818cf8" />
                    <Text style={styles.drawerSectionTitle}>CHẾ ĐỘ & GIÃN CÁCH</Text>
                  </View>
                </View>
                <View style={styles.drawerInfoBox}>
                  <Text style={styles.drawerInfoLabel}>Chế độ điểm danh:</Text>
                  <Text style={styles.drawerInfoValue}>
                    Tự động nhận diện
                  </Text>
                </View>
                <View style={styles.drawerInfoBox}>
                  <Text style={styles.drawerInfoLabel}>Thời gian giãn cách:</Text>
                  <Text style={styles.drawerInfoValue}>
                    {cooldownSeconds > 0 ? `${cooldownSeconds}s` : 'Không giới hạn'}
                  </Text>
                </View>
              </View>

              {/* DANH SÁCH HÔM NAY */}
              <View style={styles.drawerSection}>
                <View style={styles.drawerSectionHeader}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1}}>
                    <Icon name="history" size={16} color="#34d399" />
                    <Text style={styles.drawerSectionTitle}>
                      NHẬT KÝ HÔM NAY ({filteredRows.length})
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => syncTodayAttendance()}
                    style={styles.drawerReloadBtn}>
                    <Icon name="refresh" size={12} color="#38bdf8" />
                    <Text style={styles.drawerReloadText}>Đồng bộ</Text>
                  </Pressable>
                </View>

                {/* Filters */}
                <TextInput
                  style={styles.drawerSearchInput}
                  value={filterKeyword}
                  onChangeText={setFilterKeyword}
                  placeholder="Tìm theo tên hoặc mã NV..."
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                />

                <View style={styles.drawerFilterPills}>
                  {([
                    {key: 'all', label: 'Tất cả'},
                    {key: 'checkin', label: 'Check-in'},
                    {key: 'checkout', label: 'Check-out'},
                    {key: 'full', label: 'Đầy đủ'},
                  ] as const).map(item => (
                    <Pressable
                      key={item.key}
                      onPress={() => setFilterStatus(item.key)}
                      style={[
                        styles.drawerFilterPill,
                        filterStatus === item.key && styles.drawerFilterPillActive,
                      ]}>
                      <Text style={[
                        styles.drawerFilterPillText,
                        filterStatus === item.key && styles.drawerFilterPillTextActive,
                      ]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Paged List */}
                <View style={styles.drawerRowsWrap}>
                  {pagedRows.length === 0 ? (
                    <Text style={styles.drawerEmptyText}>
                      {filterKeyword || filterStatus !== 'all'
                        ? 'Không tìm thấy bản ghi phù hợp.'
                        : 'Chưa có bản ghi điểm danh hôm nay.'}
                    </Text>
                  ) : (
                    pagedRows.map((row, index) => (
                      <View
                        key={buildStableKey('today-row', row?.id || row?.employee_id || row?.name, index)}
                        style={styles.drawerRowCard}>
                        <View style={styles.drawerRowTop}>
                          <Text style={styles.drawerRowName} numberOfLines={1}>
                            {toSafeText(row?.name || row?.employee_name)}
                          </Text>
                          {row?.employee_id ? (
                            <View style={styles.drawerEmpTag}>
                              <Text style={styles.drawerEmpTagText}>#{toSafeText(row?.employee_id)}</Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.drawerRowBottom}>
                          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                            <Text style={styles.drawerRowTime}>
                              IN: {toSafeText(row?.check_in_time || row?.time, '--:--')}
                            </Text>
                            <Text style={styles.drawerRowTime}>
                              OUT: {toSafeText(row?.check_out_time, '--:--')}
                            </Text>
                          </View>
                          {String(row?.check_in_time || row?.time || '').trim() && String(row?.check_out_time || '').trim() ? (
                            <Text style={{color: '#34d399', fontSize: 11, fontWeight: '700'}}>Đầy đủ</Text>
                          ) : String(row?.check_in_time || row?.time || '').trim() ? (
                            <Text style={{color: '#38bdf8', fontSize: 11, fontWeight: '700'}}>Check-in</Text>
                          ) : (
                            <Text style={{color: '#f59e0b', fontSize: 11, fontWeight: '700'}}>Chưa chấm</Text>
                          )}
                        </View>
                      </View>
                    ))
                  )}
                </View>

                {/* Pagination */}
                {totalPages > 1 ? (
                  <View style={styles.drawerPaginationRow}>
                    <Text style={styles.drawerPaginationMeta}>
                      Trang {currentPage}/{totalPages}
                    </Text>
                    <View style={{flexDirection: 'row', gap: 6}}>
                      <Pressable
                        disabled={currentPage <= 1}
                        onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                        style={[styles.drawerPageBtn, currentPage <= 1 && {opacity: 0.4}]}>
                        <Text style={styles.drawerPageBtnText}>Trước</Text>
                      </Pressable>
                      <Pressable
                        disabled={currentPage >= totalPages}
                        onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        style={[styles.drawerPageBtn, currentPage >= totalPages && {opacity: 0.4}]}>
                        <Text style={styles.drawerPageBtnText}>Sau</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CamerasModule({hideHeader = false}: {hideHeader?: boolean} = {}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [cameraName, setCameraName] = useState('');
  const [cameraSource, setCameraSource] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [statusText, setStatusText] = useState('');
  const [discoveryModalVisible, setDiscoveryModalVisible] = useState(false);

  function resetForm() {
    setSelectedCameraId('');
    setCameraId('');
    setCameraName('');
    setCameraSource('');
    setCameraEnabled(true);
  }

  function applyCamera(row: any) {
    const nextId = toSafeText(row?.id || row?.name || '', '');
    setSelectedCameraId(nextId);
    setCameraId(nextId);
    setCameraName(toSafeText(row?.name || row?.id || '', ''));
    setCameraSource(toSafeText(row?.source || '', ''));
    setCameraEnabled(row?.enabled !== false);
  }

  const loadData = useCallback(async (preferredCameraId = '') => {
    setLoading(true);
    try {
      const response = await api.getCameras();
      if (response?.success) {
        const nextRows = Array.isArray(response.cameras) ? response.cameras : [];
        setRows(nextRows);

        const targetId = preferredCameraId || selectedCameraId;
        if (targetId) {
          const matched = nextRows.find(
            (item: any) => String(item?.id || item?.name || '').trim() === targetId,
          );
          if (matched) {
            applyCamera(matched);
          } else {
            resetForm();
          }
        }
      } else {
        setRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedCameraId]);

  async function handleSave() {
    const normalizedId = cameraId.trim() || cameraName.trim();
    const normalizedName = cameraName.trim() || normalizedId;
    const normalizedSource = cameraSource.trim();

    if (!normalizedId || !normalizedName || !normalizedSource) {
      setStatusText('Nhập đầy đủ Camera ID, tên camera và source.');
      return;
    }

    const payload = {
      id: normalizedId,
      name: normalizedName,
      source: normalizedSource,
      enabled: cameraEnabled,
    };
    const response = await api.saveCamera(payload);
    setStatusText(response?.message || formatJson(response));
    if (response?.success) {
      await loadData(normalizedId);
      setSelectedCameraId(normalizedId);
    }
  }

  async function handleDelete(targetCameraId = selectedCameraId) {
    const normalizedId = String(targetCameraId || '').trim();
    if (!normalizedId) {
      setStatusText('Chọn camera cần xóa.');
      return;
    }

    const response = await api.deleteCamera(normalizedId);
    setStatusText(response?.message || formatJson(response));
    if (response?.success) {
      resetForm();
      await loadData();
    }
  }

  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData]);

  return (
    <ModuleBox
      title="Quản lý camera"
      subtitle="Thêm, xoá camera từ mobile native"
      hideHeader={hideHeader}
      rightSlot={
        <View style={styles.inlineRow}>
          <Pressable
            onPress={() => setDiscoveryModalVisible(true)}
            style={[styles.smallButton, {backgroundColor: '#1d4ed8'}]}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
              <Icon name="search" size={14} color="#ffffff" />
              <Text style={styles.smallButtonText}>Quét LAN</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => loadData()} style={styles.smallButtonSecondary}>
            <Text style={styles.smallButtonSecondaryText}>Tải lại</Text>
          </Pressable>
          <Pressable onPress={resetForm} style={styles.smallButton}>
            <Text style={styles.smallButtonText}>Tạo mới</Text>
          </Pressable>
        </View>
      }>
      <View style={styles.moduleList}>
        {/* Banner Quét tìm Camera LAN thông minh */}
        <Pressable
          onPress={() => setDiscoveryModalVisible(true)}
          style={({pressed}) => [
            styles.scanLanBannerCard,
            pressed && {opacity: 0.9, transform: [{scale: 0.995}]},
          ]}>
          <View style={styles.scanLanBannerIconWrap}>
            <Icon name="search" size={24} color="#ffffff" />
          </View>
          <View style={{flex: 1}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
              <Text style={styles.scanLanBannerTitle}>Quét tìm Camera thông minh (LAN)</Text>
              <View style={styles.scanLanBannerBadge}>
                <Text style={styles.scanLanBannerBadgeText}>TỰ ĐỘNG</Text>
              </View>
            </View>
            <Text style={styles.scanLanBannerSub}>
              Tự động tìm kiếm Hikvision, Dahua, EZVIZ, Imou... trong mạng LAN & tự tạo luồng RTSP chuẩn xác
            </Text>
          </View>
          <View style={styles.scanLanActionPill}>
            <Text style={styles.scanLanActionPillText}>Quét ngay</Text>
            <Icon name="arrow-right" size={14} color="#ffffff" />
          </View>
        </Pressable>

        {/* Form cấu hình Camera */}
        <View style={styles.settingsGroupCard}>
          <View style={styles.settingsGroupHeader}>
            <View style={[styles.settingsGroupIconWrap, {backgroundColor: '#eff6ff'}]}>
              <Icon name="videocam" size={22} color="#1d4ed8" />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.settingsGroupTitle}>
                {selectedCameraId ? 'Chỉnh sửa cấu hình Camera' : 'Thêm Camera mới'}
              </Text>
              <Text style={styles.settingsGroupSub}>
                Cấu hình định danh camera; nguồn kết nối được lưu và xử lý tại backend
              </Text>
            </View>
          </View>

          <TextInput
            style={[styles.input, {minHeight: 46, borderRadius: 12}]}
            placeholder="Mã Camera (ID)"
            placeholderTextColor="#94a3b8"
            value={cameraId}
            onChangeText={setCameraId}
          />
          <TextInput
            style={[styles.input, {minHeight: 46, borderRadius: 12}]}
            placeholder="Tên Camera (Ví dụ: Cổng chính, Lễ tân)"
            placeholderTextColor="#94a3b8"
            value={cameraName}
            onChangeText={setCameraName}
          />
          <TextInput
            style={[styles.input, {minHeight: 46, borderRadius: 12}]}
            placeholder="Nguồn camera (chỉ gửi một lần tới backend)"
            placeholderTextColor="#94a3b8"
            value={cameraSource}
            onChangeText={setCameraSource}
          />

          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4}}>
            <Text style={{fontSize: 14, fontWeight: '600', color: '#0f172a'}}>Kích hoạt camera</Text>
            <Pressable
              onPress={() => setCameraEnabled(prev => !prev)}
              style={[styles.switchPill, cameraEnabled ? styles.switchPillOn : styles.switchPillOff]}>
              <Icon
                name={cameraEnabled ? 'check' : 'close'}
                size={12}
                color={cameraEnabled ? '#059669' : '#94a3b8'}
              />
              <Text style={cameraEnabled ? styles.switchPillTextOn : styles.switchPillTextOff}>
                {cameraEnabled ? 'BẬT' : 'TẮT'}
              </Text>
            </Pressable>
          </View>

          <View style={{flexDirection: 'row', gap: 10, marginTop: 4}}>
            {selectedCameraId ? (
              <Pressable
                onPress={() => handleDelete()}
                style={[styles.accActionBtnLock, {minHeight: 46, borderRadius: 12}]}>
                <Icon name="delete" size={16} color="#b91c1c" />
                <Text style={styles.accActionBtnLockText}>Xóa</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={handleSave}
              style={[styles.primaryButtonFlex, {minHeight: 46, borderRadius: 12}]}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                <Icon name="save" size={16} color="#ffffff" />
                <Text style={styles.primaryButtonText}>
                  {selectedCameraId ? 'Cập nhật camera' : 'Lưu camera mới'}
                </Text>
              </View>
            </Pressable>
          </View>

          {statusText ? (
            <StatusMessage variant="info" message={statusText} />
          ) : null}
        </View>

        {/* Danh sách camera */}
        <View style={styles.settingsGroupCard}>
          <View style={styles.settingsGroupHeader}>
            <View style={[styles.settingsGroupIconWrap, {backgroundColor: '#f8fafc'}]}>
              <Icon name="camera_alt" size={22} color="#475569" />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.settingsGroupTitle}>Danh sách Camera đã lưu</Text>
              <Text style={styles.settingsGroupSub}>
                Tổng cộng {rows.length} thiết bị camera được cấu hình
              </Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="videocam-off"
              title="Chưa có Camera"
              message="Điền thông tin và bấm 'Lưu camera mới' để thêm luồng camera."
            />
          ) : (
            <View style={{gap: 10}}>
              {rows.map((row, index) => {
                const isSelected = String(row?.id || row?.name || '').trim() === selectedCameraId;
                const isCamActive = row?.enabled !== false;
                return (
                  <View
                    key={buildStableKey('camera', row?.id || row?.name, index)}
                    style={[
                      styles.accItemCard,
                      isSelected && styles.accItemCardHighlighted,
                    ]}>
                    <View style={styles.accCardHeader}>
                      <View style={[styles.accAvatarWrap, {backgroundColor: isCamActive ? '#eff6ff' : '#f1f5f9', borderColor: isCamActive ? '#bfdbfe' : '#e2e8f0'}]}>
                        <Icon name="videocam" size={20} color={isCamActive ? '#0037b0' : '#94a3b8'} />
                      </View>
                      <View style={styles.accInfoWrap}>
                        <View style={styles.accNameRow}>
                          <Text style={styles.accNameText} numberOfLines={1}>
                            {(row?.name || row?.id || 'Camera').toString()}
                          </Text>
                          <View style={styles.accIdBadge}>
                            <Text style={styles.accIdBadgeText}>#{toSafeText(row?.id)}</Text>
                          </View>
                        </View>
                        <Text style={styles.accDeptText} numberOfLines={1}>
                          {toSafeText(row?.source, 'N/A')}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.accStatusBadge,
                          isCamActive ? styles.accStatusBadgeActive : styles.accStatusBadgeNone,
                        ]}>
                        <Text
                          style={[
                            styles.accStatusBadgeText,
                            isCamActive ? styles.accStatusBadgeTextActive : styles.accStatusBadgeTextNone,
                          ]}>
                          {isCamActive ? 'Đang bật' : 'Tắt'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.accActionsRow}>
                      <Pressable
                        onPress={() => applyCamera(row)}
                        style={styles.accActionBtnSecondary}>
                        <Icon name="edit" size={14} color="#475569" />
                        <Text style={styles.accActionBtnSecondaryText}>Chỉnh sửa</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDelete(String(row?.id || row?.name || '').trim())}
                        style={styles.accActionBtnLock}>
                        <Icon name="delete" size={14} color="#b91c1c" />
                        <Text style={styles.accActionBtnLockText}>Xóa</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
      <CameraDiscoveryModal
        visible={discoveryModalVisible}
        onClose={() => setDiscoveryModalVisible(false)}
        onSelectCamera={(cam) => {
          const nextId = cam.id;
          setSelectedCameraId(nextId);
          setCameraId(nextId);
          setCameraName(cam.name);
          setCameraSource('');
          setCameraEnabled(true);
          setStatusText(`Đã chọn camera ${cam.name}. Nguồn kết nối được backend quản lý.`);
        }}
        onCameraSaved={async (savedCam) => {
          await loadData(savedCam.id);
          setSelectedCameraId(savedCam.id);
          setStatusText(`Đã thêm thành công camera "${savedCam.name}" vào hệ thống.`);
        }}
      />
    </ModuleBox>
  );
}

const ERP_EMPLOYEE_IMAGE_CACHE: Record<string, string> = {};
const LOCAL_EMPLOYEE_IMAGE_CACHE: Record<string, string> = {};
const LOCAL_EMPLOYEE_IMAGE_REQUESTS: Record<string, Promise<string> | undefined> = {};
const ERP_EMPLOYEE_IMAGE_REQUESTS: Record<string, Promise<string> | undefined> = {};
const ERP_EMPLOYEE_IMAGE_PRELOAD_LIMIT = 60;
const ERP_EMPLOYEE_IMAGE_PRELOAD_BATCH_SIZE = 4;
let ERP_EMPLOYEE_LIST_CACHE: {tenantScope: string; rows: any[]} | null = null;

function getTenantCacheScope(): string {
  const auth = getGatewayAuth();
  return String(
    auth?.database
    || auth?.dbName
    || auth?.table
    || auth?.username
    || 'anonymous',
  ).trim().toLowerCase();
}

function getEmployeeImageCacheKey(employeeId: string): string {
  return `${getTenantCacheScope()}|${String(employeeId || '').trim()}`;
}

function getCachedLocalEmployeeImageUri(employeeId: string): string {
  return LOCAL_EMPLOYEE_IMAGE_CACHE[getEmployeeImageCacheKey(employeeId)] || '';
}

async function fetchLocalEmployeeImageUri(employeeId: string): Promise<string> {
  const normalizedId = String(employeeId || '').trim();
  if (!normalizedId) {
    return '';
  }
  const cacheKey = getEmployeeImageCacheKey(normalizedId);
  const cached = LOCAL_EMPLOYEE_IMAGE_CACHE[cacheKey];
  if (cached) {
    return cached;
  }
  if (!LOCAL_EMPLOYEE_IMAGE_REQUESTS[cacheKey]) {
    LOCAL_EMPLOYEE_IMAGE_REQUESTS[cacheKey] = api
      .getAdminEmployeeImage(normalizedId)
      .then((response: any) => {
        if (!response?.success || response?.image_source === 'erp') {
          return '';
        }
        const uri = resolveEmployeeImageUri(
          {
            ...(response?.employee || {}),
            local_image_url: response?.local_image_url || response?.image_url,
            local_image_base64: response?.local_image_base64 || response?.image_base64,
            local_image_token: response?.local_image_token || response?.image_token,
          },
          'local',
        );
        if (uri) {
          LOCAL_EMPLOYEE_IMAGE_CACHE[cacheKey] = uri;
        }
        return uri;
      })
      .catch(() => '')
      .finally(() => {
        delete LOCAL_EMPLOYEE_IMAGE_REQUESTS[cacheKey];
      });
  }
  return (await LOCAL_EMPLOYEE_IMAGE_REQUESTS[cacheKey]) || '';
}

async function fetchEmployeeImageUri(employeeId: string): Promise<string> {
  const normalizedId = String(employeeId || '').trim();
  if (!normalizedId) {
    return '';
  }
  const cacheKey = getEmployeeImageCacheKey(normalizedId);
  const cached = ERP_EMPLOYEE_IMAGE_CACHE[cacheKey];
  if (cached) {
    return cached;
  }
  if (!ERP_EMPLOYEE_IMAGE_REQUESTS[cacheKey]) {
    ERP_EMPLOYEE_IMAGE_REQUESTS[cacheKey] = api
      .getErpEmployeeInfo(normalizedId)
      .then((response: any) => {
        if (!response?.success) {
          return '';
        }
        const employee = extractEmployeePayload(response) || {};
        const uri = resolveEmployeeImageUri(
          {
            ...employee,
            // `/api/erp_employee_info` returns the ERP fields as
            // image_token/image_url. Normalize only into the explicit ERP
            // namespace; never use local token fields as a fallback here.
            erp_image_url:
              employee?.erp_image_url
              || response?.erp_image_url
              || employee?.image_url
              || response?.image_url,
            erp_image_base64: employee?.erp_image_base64 || response?.erp_image_base64,
            erp_image_token:
              employee?.erp_image_token
              || response?.erp_image_token
              || employee?.image_token
              || response?.image_token,
          },
          'erp',
        );
        if (uri) {
          ERP_EMPLOYEE_IMAGE_CACHE[cacheKey] = uri;
        }
        return uri;
      })
      .catch(() => '')
      .finally(() => {
        delete ERP_EMPLOYEE_IMAGE_REQUESTS[cacheKey];
      });
  }
  return (await ERP_EMPLOYEE_IMAGE_REQUESTS[cacheKey]) || '';
}

type RegisterModuleProps = {
  onOpenEmployeeRegister?: (employee?: any) => void;
};

function RegisterModule({onOpenEmployeeRegister}: RegisterModuleProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [employeeInfo, setEmployeeInfo] = useState<any>(null);
  const [statusText, setStatusText] = useState('');
  const [workingEmployeeId, setWorkingEmployeeId] = useState('');
  const mountedRef = useRef(true);
  const [erpImageCache, setErpImageCache] = useState<Record<string, string>>(
    () => ({...ERP_EMPLOYEE_IMAGE_CACHE}),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [detailModalEmployee, setDetailModalEmployee] = useState<any>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [selectedTargetEmployee, setSelectedTargetEmployee] = useState<any>(null);

  async function loadReliableEmployeeImage(targetEmployeeId: string) {
    const normalizedEmployeeId = String(targetEmployeeId || '').trim();
    const cacheKey = getEmployeeImageCacheKey(normalizedEmployeeId);
    const cachedUri =
      ERP_EMPLOYEE_IMAGE_CACHE[cacheKey]
      || erpImageCache[cacheKey]
      || '';
    if (!normalizedEmployeeId || cachedUri) {
      return cachedUri;
    }
    const uri = await fetchEmployeeImageUri(normalizedEmployeeId);
    if (uri && mountedRef.current) {
      setErpImageCache(current => ({
        ...current,
        [cacheKey]: uri,
      }));
    }
    return uri;
  }

  async function preloadEmployeeImages(employeeRows: any[]) {
    const employeeIds = employeeRows
      .slice(0, ERP_EMPLOYEE_IMAGE_PRELOAD_LIMIT)
      .map(row => String(row?.employee_id || '').trim())
      .filter((value, index, values) => value && values.indexOf(value) === index);

    for (let index = 0; index < employeeIds.length; index += ERP_EMPLOYEE_IMAGE_PRELOAD_BATCH_SIZE) {
      const batch = employeeIds.slice(index, index + ERP_EMPLOYEE_IMAGE_PRELOAD_BATCH_SIZE);
      await Promise.all(batch.map(id => loadReliableEmployeeImage(id).catch(() => '')));
    }
  }

  async function loadErpEmployees(forceRefresh = false) {
    const tenantScope = getTenantCacheScope();
    if (
      !forceRefresh
      && ERP_EMPLOYEE_LIST_CACHE?.tenantScope === tenantScope
      && ERP_EMPLOYEE_LIST_CACHE.rows.length > 0
    ) {
      setRows(ERP_EMPLOYEE_LIST_CACHE.rows);
      setStatusText(`Đã tải ${ERP_EMPLOYEE_LIST_CACHE.rows.length} nhân viên (dữ liệu đã lưu).`);
      return;
    }

    setLoading(true);
    setStatusText('');
    try {
      const response = await api.getErpEmployees();
      if (response?.success) {
        const rawRows = Array.isArray(response.employees) ? response.employees : [];
        const adminByEmployeeId = new Map<string, any>();
        const adminEmployeesResponse = await api.getAdminEmployees().catch(() => null);
        if (adminEmployeesResponse?.success && Array.isArray(adminEmployeesResponse.employees)) {
          adminEmployeesResponse.employees.forEach((employee: any) => {
            const id = String(employee?.employee_id || employee?.manv || '').trim();
            if (id) {
              adminByEmployeeId.set(id, employee);
            }
          });
        }
        const nextRows = rawRows.map((row: any) => {
          const id = String(row?.employee_id || '').trim();
          const localEmployee = adminByEmployeeId.get(id);
          const hasLocalImage = Boolean(
            localEmployee?.has_local_image === true
              || localEmployee?.image_token
              || localEmployee?.image_base64
              || localEmployee?.local_image_token
              || localEmployee?.local_image_base64,
          );
          const localHasFace = Boolean(
            localEmployee?.has_face === true
              || Number(localEmployee?.face_count || 0) > 0,
          );
          const registered = Boolean(localEmployee);
          const statusCode = localHasFace
            ? 'ready'
            : registered
              ? 'image_only'
              : 'empty';
          return {
            ...row,
            // ERP photo availability and local face-registration state are different.
            erp_has_face: Boolean(
              row?.has_face === true
                || Number(row?.face_count || 0) > 0
                || row?.erp_image_token,
            ),
            registered,
            in_system: registered,
            has_face: localHasFace,
            has_local_image: hasLocalImage,
            local_image_token: localEmployee?.local_image_token || localEmployee?.image_token || '',
            local_image_base64: localEmployee?.local_image_base64 || localEmployee?.image_base64 || '',
            status_code: statusCode,
            status_text: localHasFace
              ? 'Đã đăng ký khuôn mặt'
              : registered
                ? 'Đã vào hệ thống, chưa có khuôn mặt'
                : 'Chưa có trong hệ thống',
          };
        });
        ERP_EMPLOYEE_LIST_CACHE = {tenantScope, rows: nextRows};
        setRows(nextRows);
        preloadEmployeeImages(nextRows).catch(() => {});
        setStatusText(`Đã tải ${nextRows.length} nhân viên từ hệ thống.`);
      } else {
        if (ERP_EMPLOYEE_LIST_CACHE?.tenantScope === tenantScope && ERP_EMPLOYEE_LIST_CACHE.rows.length > 0) {
          setRows(ERP_EMPLOYEE_LIST_CACHE.rows);
          setStatusText(`Hiển thị dữ liệu đã lưu (${ERP_EMPLOYEE_LIST_CACHE.rows.length} nhân viên). ${response?.message || 'Không tải được dữ liệu mới.'}`);
        } else {
          setRows([]);
          setStatusText(response?.message || 'Không tải được danh sách nhân viên.');
        }
      }
    } catch (error) {
      if (ERP_EMPLOYEE_LIST_CACHE?.tenantScope === tenantScope && ERP_EMPLOYEE_LIST_CACHE.rows.length > 0) {
        setRows(ERP_EMPLOYEE_LIST_CACHE.rows);
        setStatusText(`Hiển thị dữ liệu đã lưu (${ERP_EMPLOYEE_LIST_CACHE.rows.length} nhân viên). Lỗi: ${error instanceof Error ? error.message : 'Lỗi kết nối.'}`);
      } else {
        setStatusText(error instanceof Error ? error.message : 'Lỗi kết nối khi tải nhân viên.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployeeInfo(targetEmployeeId: string) {
    const normalizedEmployeeId = String(targetEmployeeId || '').trim();
    if (!normalizedEmployeeId) {
      setStatusText('Vui lòng chọn nhân viên.');
      return;
    }
    setWorkingEmployeeId(normalizedEmployeeId);

    // Try to find employee from cached list first (no network call needed)
    const cachedEmployee = ERP_EMPLOYEE_LIST_CACHE?.rows.find(
      (item: any) => String(item?.employee_id || '').trim() === normalizedEmployeeId,
    );

    if (cachedEmployee) {
      const info = {...cachedEmployee};
      setEmployeeInfo(info);
      setWorkingEmployeeId('');
      setStatusText('Đã tải thông tin nhân viên (từ dữ liệu đã lưu).');
      return;
    }

    try {
      const response = await api.getErpEmployeeInfo(normalizedEmployeeId);
      const payload = extractEmployeePayload(response);
      if (payload) {
        const reliableImageUri = await loadReliableEmployeeImage(normalizedEmployeeId).catch(() => '');
        const info = reliableImageUri
          ? {...payload, erp_image_url: reliableImageUri}
          : payload;
        setEmployeeInfo(info);
      } else {
        setEmployeeInfo(null);
      }
      setStatusText(
        response?.message
        || (payload ? 'Đã tải thông tin nhân viên.' : 'Không đọc được thông tin nhân viên.'),
      );
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Không tải được thông tin nhân viên.');
    } finally {
      setWorkingEmployeeId('');
    }
  }

  function openDetailModal(row: any) {
    const id = String(row?.employee_id || '').trim();
    setDetailModalEmployee(row);
    setDetailModalVisible(true);
    loadEmployeeInfo(id);
  }

  function closeDetailModal() {
    setDetailModalVisible(false);
    setDetailModalEmployee(null);
    setEmployeeInfo(null);
  }

  function openSourceModal(row: any) {
    setSelectedTargetEmployee(row);
    setSourceModalVisible(true);
  }

  function handleChooseCamera(row: any) {
    setSourceModalVisible(false);
    onOpenEmployeeRegister?.(row);
  }

  async function handleChooseErpImage(row: any) {
    setSourceModalVisible(false);
    const normalizedEmployeeId = String(row?.employee_id || '').trim();
    if (!normalizedEmployeeId) {
      return;
    }

    setWorkingEmployeeId(normalizedEmployeeId);
    setStatusText('Đang đăng ký từ ảnh ERP...');
    try {
      const cacheKey = getEmployeeImageCacheKey(normalizedEmployeeId);
      const cachedUri =
        erpImageCache[cacheKey]
        || await loadReliableEmployeeImage(normalizedEmployeeId)
        || '';
      const employeeMetadata = {
        ...row,
        erp_image_base64: cachedUri.startsWith('data:image/')
          ? cachedUri
          : row?.erp_image_base64,
      };
      const response = await api.registerFromErp(normalizedEmployeeId, employeeMetadata);
      if (!response?.success) {
        setStatusText(response?.message || 'Không đăng ký được từ ảnh ERP.');
        return;
      }
      ERP_EMPLOYEE_LIST_CACHE = null;
      await loadErpEmployees(true);
      await syncMobileEmployeesFromServer().catch(() => {});
      setStatusText(response?.message || 'Đã đăng ký vào hệ thống từ ảnh ERP.');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Không đăng ký được từ ảnh ERP.');
    } finally {
      setWorkingEmployeeId('');
    }
  }

  async function registerSelectedEmployees() {
    if (selectedIds.size === 0) {
      setStatusText('Vui lòng chọn ít nhất một nhân viên.');
      return;
    }

    setStatusText(`Đang đăng ký ${selectedIds.size} nhân viên...`);
    let successCount = 0;
    let failCount = 0;

    for (const id of selectedIds) {
      try {
        const employeeMetadata = ERP_EMPLOYEE_LIST_CACHE?.rows.find(
          item => String(item?.employee_id || '').trim() === id,
        );
        const response = await api.registerFromErp(id, employeeMetadata);
        if (response?.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setStatusText(`Đã đăng ký: ${successCount} thành công, ${failCount} thất bại.`);
    setSelectedIds(new Set());
    setSelectAll(false);
    ERP_EMPLOYEE_LIST_CACHE = null;
    await loadErpEmployees(true);
    await syncMobileEmployeesFromServer().catch(() => {});
  }

  function toggleSelectEmployee(empId: string) {
    const selectedRow = rows.find(
      row => String(row?.employee_id || '').trim() === empId,
    );
    if (
      !selectedRow?.erp_image_token
      && !selectedRow?.erp_image_url
      && !selectedRow?.erp_image_base64
    ) {
      setStatusText('Nhân viên chưa có ảnh ERP. Hãy dùng "Chụp ảnh mới".');
      return;
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(empId)) {
        next.delete(empId);
        setSelectAll(false);
      } else {
        next.add(empId);
        if (next.size === rows.length && rows.length > 0) {
          setSelectAll(true);
        }
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      const allIds = rows
        .filter(row =>
          row?.erp_image_token
          || row?.erp_image_url
          || row?.erp_image_base64,
        )
        .map(r => String(r?.employee_id || '').trim())
        .filter(Boolean);
      setSelectedIds(new Set(allIds));
      setSelectAll(allIds.length > 0);
    }
  }

  function hasFace(row: any): boolean {
    return Boolean(
      row?.has_face
      || Number(row?.face_count || 0) > 0,
    );
  }

  useEffect(() => {
    mountedRef.current = true;
    loadErpEmployees(false).catch(() => {});
    return () => {
      mountedRef.current = false;
    };
    // loadErpEmployees is intentionally scoped to this module instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ModuleBox
      title="Tải dữ liệu nhân viên từ hệ thống"
      subtitle="Danh sách nhân viên từ ERP, đăng ký khuôn mặt để chấm công"
      rightSlot={
        <View style={styles.inlineRow}>
          <Pressable onPress={() => loadErpEmployees(true)} style={styles.smallButtonSecondary}>
            <Text style={styles.smallButtonSecondaryText}>Tải lại</Text>
          </Pressable>
        </View>
      }>
      <View style={styles.moduleList}>
        <Pressable onPress={() => loadErpEmployees(true)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>
            {loading ? 'Đang tải...' : 'Xem danh sách nhân viên hệ thống đang hoạt động'}
          </Text>
        </Pressable>

        {statusText ? (
          <Text style={statusText.includes('thành công') ? styles.statusInfoText : styles.errorText}>
            {statusText}
          </Text>
        ) : null}

        {selectedIds.size > 0 ? (
          <View style={styles.inlineRow}>
            <Text style={styles.mutedText}>Đã chọn {selectedIds.size} nhân viên</Text>
            <Pressable onPress={registerSelectedEmployees} style={styles.primaryButtonFlex}>
              <Text style={styles.primaryButtonText}>
                Đăng ký khuôn mặt ({selectedIds.size})
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.blockTitle}>
          Danh sách nhân viên ({rows.length})
          {rows.length > 0 ? (
            <Text style={styles.mutedText}> — {rows.filter(r => hasFace(r)).length} đã có khuôn mặt</Text>
          ) : null}
        </Text>

        {rows.length > 0 ? (
          <Pressable onPress={toggleSelectAll} style={styles.selectAllRow}>
            <View style={[styles.checkbox, selectAll && styles.checkboxActive]}>
              {selectAll ? <View style={styles.checkboxInner} /> : null}
            </View>
                <Text style={styles.rememberText}>
              {selectAll ? 'Bỏ chọn tất cả' : 'Chọn tất cả có ảnh ERP'}
            </Text>
          </Pressable>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{paddingVertical: spacing.xl}} />
        ) : rows.length === 0 ? (
          <Text style={styles.mutedText}>
            Chưa có dữ liệu. Bấm nút "Xem danh sách" để tải nhân viên từ hệ thống.
          </Text>
        ) : (
          <View style={styles.simpleList}>
            {rows.slice(0, 200).map((row, index) => {
              const empId = String(row?.employee_id || '').trim();
              const isSelected = selectedIds.has(empId);
              const employeeHasFace = hasFace(row);
              const imageUri = erpImageCache[getEmployeeImageCacheKey(empId)] || resolveEmployeeImageUri(row, 'erp');

              return (
                <Pressable
                  key={buildStableKey('erp-emp', empId, index)}
                  onPress={() => openDetailModal(row)}
                  style={[styles.rowCard, isSelected && styles.rowCardActive]}>
                  <View style={styles.employeeCardRow}>
                    <Pressable
                      onPress={() => toggleSelectEmployee(empId)}
                      style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                      {isSelected ? <View style={styles.checkboxInner} /> : null}
                    </Pressable>
                    {/* Smart Avatar Ring */}
                    <View style={{
                      width: 50,
                      height: 50,
                      borderRadius: 25,
                      borderWidth: 2,
                      borderColor: employeeHasFace ? '#10b981' : '#f59e0b',
                      backgroundColor: employeeHasFace ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}>
                      {imageUri ? (
                        <Image
                          source={{uri: imageUri}}
                          style={{width: 42, height: 42, borderRadius: 21}}
                          resizeMode="cover"
                          onError={() =>
                            loadReliableEmployeeImage(empId).catch(() => {})
                          }
                        />
                      ) : (
                        <View style={{width: 42, height: 42, borderRadius: 21, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center'}}>
                          <Icon name="person" size={20} color={colors.textMuted} />
                        </View>
                      )}
                      <View style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: employeeHasFace ? '#10b981' : '#f59e0b',
                        borderWidth: 1.5,
                        borderColor: '#fff',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Icon
                          name={employeeHasFace ? 'check' : 'camera'}
                          size={9}
                          color="#fff"
                        />
                      </View>
                    </View>
                    <View style={{flex: 1, gap: 2}}>
                      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                        <Text style={[styles.rowTitle, {fontSize: 14, fontWeight: '800'}]}>{toSafeText(row?.name)}</Text>
                        <View style={{
                          backgroundColor: '#f1f5f9',
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 6,
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                        }}>
                          <Text style={{color: '#475569', fontSize: 10, fontWeight: '800'}}>
                            #{toSafeText(row?.employee_id)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.rowMeta}>Phòng ban: {toSafeText(row?.department)}</Text>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1}}>
                        <Icon
                          name="face-recognition"
                          size={12}
                          color={employeeHasFace ? '#10b981' : '#f59e0b'}
                        />
                        <Text style={{
                          color: employeeHasFace ? '#059669' : '#d97706',
                          fontWeight: '700',
                          fontSize: 11,
                        }}>
                          {employeeHasFace ? 'Đã có Face AI' : 'Chưa có Face AI (Ảnh ERP)'}
                        </Text>
                      </View>
                    </View>
                    <Icon name="chevron-right" size={18} color="#94a3b8" />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Modal
          visible={detailModalVisible}
          transparent
          animationType="slide"
          onRequestClose={closeDetailModal}>
          <Pressable style={styles.modalBackdrop} onPress={closeDetailModal}>
            <Pressable style={styles.modalContent} onPress={() => {}}>
              <View style={styles.moduleHeaderRowCompact}>
                <View style={styles.moduleHeaderTextWrap}>
                  <Text style={styles.moduleTitle}>Thông tin nhân viên</Text>
                  <Text style={styles.moduleSubtitle}>
                    {detailModalEmployee?.name || detailModalEmployee?.employee_id || 'Nhân viên'}
                  </Text>
                </View>
                <Pressable onPress={closeDetailModal} style={styles.sidebarCloseButton}>
                  <Text style={styles.sidebarCloseText}>Đóng</Text>
                </Pressable>
              </View>

              {workingEmployeeId ? (
                <ActivityIndicator color={colors.primary} style={{paddingVertical: spacing.xl}} />
              ) : employeeInfo ? (
                <View style={{gap: spacing.md}}>
                  <View style={styles.employeeCardRow}>
                    {erpImageCache[getEmployeeImageCacheKey(String(employeeInfo?.employee_id || '').trim())] || resolveEmployeeImageUri(employeeInfo, 'erp') ? (
                      <Image
                        source={{
                          uri: erpImageCache[getEmployeeImageCacheKey(String(employeeInfo?.employee_id || '').trim())]
                            || resolveEmployeeImageUri(employeeInfo, 'erp'),
                        }}
                        style={[styles.employeeThumb, {width: 80, height: 80}]}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.employeeThumbPlaceholder, {width: 80, height: 80}]}>
                        <Icon name="person-outline" size={28} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.employeeCardBody}>
                      <Text style={styles.rowTitle}>
                        {toSafeText(employeeInfo?.name || employeeInfo?.full_name || employeeInfo?.employee_name)}
                      </Text>
                      <Text style={styles.rowMeta}>Mã NV: {toSafeText(employeeInfo?.employee_id)}</Text>
                      <Text style={styles.rowMeta}>Phòng ban: {toSafeText(employeeInfo?.department)}</Text>
                      <Text style={styles.rowMeta}>Vị trí: {toSafeText(employeeInfo?.position)}</Text>
                      <Text style={[
                        styles.rowMeta,
                        {color: employeeInfo?.erp_image_token ? colors.success : colors.warning, fontWeight: '700'},
                      ]}>
                        {employeeInfo?.erp_image_token ? 'Da co khuon mat' : 'Chua co khuon mat'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.inlineRow}>
                    <Pressable
                      onPress={() => {
                        closeDetailModal();
                        openSourceModal({...detailModalEmployee, ...employeeInfo});
                      }}
                      style={styles.rowActionPrimary}>
                      <Text style={styles.rowActionPrimaryText}>Đăng ký khuôn mặt</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => loadEmployeeInfo(String(employeeInfo?.employee_id || ''))}
                      style={styles.rowActionSecondary}>
                      <Text style={styles.rowActionSecondaryText}>Nạp lại</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Text style={styles.mutedText}>Đang tải thông tin nhân viên...</Text>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={sourceModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setSourceModalVisible(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setSourceModalVisible(false)}>
            <Pressable style={styles.modalContent} onPress={() => {}}>
              <Text style={styles.moduleTitle}>Đăng ký khuôn mặt</Text>
              <Text style={styles.moduleSubtitle}>
                Chọn nguồn ảnh cho {toSafeText(selectedTargetEmployee?.name, 'nhân viên')}.
              </Text>
              <Pressable
                onPress={() => handleChooseErpImage(selectedTargetEmployee)}
                disabled={!Boolean(
                  selectedTargetEmployee?.erp_image_token
                  || selectedTargetEmployee?.erp_image_url
                  || selectedTargetEmployee?.erp_image_base64,
                )}
                style={[
                  styles.rowActionSecondary,
                  !Boolean(
                    selectedTargetEmployee?.erp_image_token
                    || selectedTargetEmployee?.erp_image_url
                    || selectedTargetEmployee?.erp_image_base64,
                  ) && styles.buttonDisabled,
                ]}>
                <Text style={styles.rowActionSecondaryText}>
                  {Boolean(
                    selectedTargetEmployee?.erp_image_token
                    || selectedTargetEmployee?.erp_image_url
                    || selectedTargetEmployee?.erp_image_base64,
                  ) ? 'Đăng ký từ ảnh ERP' : 'ERP chưa có ảnh khuôn mặt'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleChooseCamera(selectedTargetEmployee)}
                style={styles.rowActionPrimary}>
                <Text style={styles.rowActionPrimaryText}>Chụp ảnh mới</Text>
              </Pressable>
              <Pressable
                onPress={() => setSourceModalVisible(false)}
                style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Hủy</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </ModuleBox>
  );
}

function SyncVerifyModule() {
  const {isMobile} = useResponsive();
  const [payload, setPayload] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'face' | 'profile' | 'new'>('face');
  const [statusText, setStatusText] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [syncImageCache, setSyncImageCache] = useState<Record<string, string>>({});
  const mountedRef = useRef(true);

  // Compare Modal States
  const [compareModalVisible, setCompareModalVisible] = useState(false);
  const [selectedSyncRow, setSelectedSyncRow] = useState<any | null>(null);
  const [selectedSyncSource, setSelectedSyncSource] = useState<'local' | 'erp'>('local');
  const [modalLocalUri, setModalLocalUri] = useState('');
  const [modalErpUri, setModalErpUri] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [syncSubmitting, setSyncSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{type: 'success' | 'error'; message: string} | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function getRowLocalImageUri(row: any): string {
    const localCandidates = [
      row?.local_image_base64,
      buildLocalTokenImageUri(row?.local_image_token || row?.system_image_token),
      row?.local_image_url,
    ];
    for (const c of localCandidates) {
      const uri = normalizeEmployeeImageUri(c);
      if (uri && isUsableRemoteImageUri(uri)) return uri;
    }
    const eid = String(row?.employee_id || '').trim();
    return eid ? (LOCAL_EMPLOYEE_IMAGE_CACHE[getEmployeeImageCacheKey(eid)] || '') : '';
  }

  function getRowErpImageUri(row: any): string {
    const erpCandidates = [
      row?.erp_image_base64,
      buildErpTokenImageUri(row?.erp_image_token),
      row?.erp_image_url,
    ];
    for (const c of erpCandidates) {
      const uri = normalizeEmployeeImageUri(c);
      if (uri && isUsableRemoteImageUri(uri)) return uri;
    }
    const eid = String(row?.employee_id || '').trim();
    return eid ? (ERP_EMPLOYEE_IMAGE_CACHE[getEmployeeImageCacheKey(eid)] || '') : '';
  }

  const summary = payload?.summary || {};
  const newEmployees = Array.isArray(payload?.new_employees) ? payload.new_employees : [];
  const profileMismatches = Array.isArray(payload?.profile_mismatches) ? payload.profile_mismatches : [];
  const faceMismatches = Array.isArray(payload?.face_mismatches) ? payload.face_mismatches : [];

  const activeRows =
    activeTab === 'face'
      ? faceMismatches
      : activeTab === 'profile'
        ? profileMismatches
        : newEmployees;

  const filteredActiveRows = useMemo(() => {
    let list = activeRows;
    const kw = searchKeyword.trim().toLowerCase();
    if (kw) {
      list = list.filter((r: any) => {
        const name = String(r?.name || '').toLowerCase();
        const id = String(r?.employee_id || '').toLowerCase();
        const dept = String(r?.department || '').toLowerCase();
        return name.includes(kw) || id.includes(kw) || dept.includes(kw);
      });
    }
    return list;
  }, [activeRows, searchKeyword]);

  async function loadData() {
    setLoading(true);
    setStatusText('');
    try {
      const localEmployees = await getLocalEmployees(500).catch(() => []);
      if (localEmployees.length === 0) {
        setPayload(null);
        setStatusText('Không có nhân viên nào trong bộ nhớ máy để so sánh.');
        setSyncImageCache({});
        return;
      }

      const erpResponse = await api.getErpEmployees().catch(() => null);
      const erpEmployees = Array.isArray(erpResponse?.employees)
        ? erpResponse.employees
        : [];
      const localMap = new Map<string, any>();
      for (const local of localEmployees) {
        const id = String(local?.employee_id || '').trim();
        if (id) localMap.set(id, local);
      }

      const nextNewEmployees: any[] = [];
      const nextProfileMismatches: any[] = [];
      const nextFaceMismatches: any[] = [];

      for (const emp of erpEmployees) {
        const employeeId = String(emp?.employee_id || '').trim();
        if (!employeeId) continue;

        const localUser = localMap.get(employeeId);
        // Only consider employees who are enrolled offline in "Nhân viên offline"
        const isOfflineEnrolled = Boolean(
          localUser && (
            localUser.has_face === true
            || (Number(localUser.face_count) > 0)
            || localUser.status_code === 'ready'
            || localUser.status_code === 'image_only'
            || Boolean(localUser.has_local_image)
            || Boolean(localUser.local_image_token)
            || Boolean(localUser.local_image_base64)
          )
        );

        if (!localUser || !isOfflineEnrolled) {
          nextNewEmployees.push({
            employee_id: employeeId,
            name: toSafeText(emp?.name || localUser?.name),
            department: toSafeText(emp?.department || localUser?.department),
            position: toSafeText(emp?.position || localUser?.position),
            erp_image_token: toSafeText(emp?.erp_image_token, ''),
            erp_image_url: toSafeText(emp?.erp_image_url, ''),
            erp_image_base64: toSafeText(emp?.erp_image_base64, ''),
            local_image_token: '',
            local_image_base64: '',
            local_image_url: '',
            has_local_image: false,
            has_erp_image: Boolean(emp?.erp_image_token || emp?.erp_image_url || emp?.erp_image_base64),
            can_push_local_to_erp: false,
            can_pull_erp_to_system: Boolean(emp?.erp_image_token || emp?.erp_image_url),
          });
          continue;
        }

        const differences: any[] = [];
        const fields: [string, string][] = [
          ['name', 'Họ tên'],
          ['department', 'Phòng ban'],
          ['position', 'Vị trí'],
        ];
        for (const [field, label] of fields) {
          const erpValue = String(emp?.[field] ?? '').trim();
          const localValue = String(localUser?.[field] ?? '').trim();
          if (erpValue.toLowerCase() !== localValue.toLowerCase()) {
            differences.push({
              field,
              label,
              erp_value: erpValue,
              system_value: localValue,
            });
          }
        }
        if (differences.length > 0) {
          nextProfileMismatches.push({
            employee_id: employeeId,
            name: toSafeText(localUser?.name || emp?.name),
            department: toSafeText(localUser?.department || emp?.department),
            position: toSafeText(localUser?.position || emp?.position),
            local_image_base64: localUser?.local_image_base64 || '',
            local_image_url: localUser?.local_image_url || '',
            local_image_token: localUser?.local_image_token || '',
            erp_image_url: emp?.erp_image_url || '',
            erp_image_base64: emp?.erp_image_base64 || '',
            erp_image_token: emp?.erp_image_token || '',
            has_local_image: Boolean(localUser?.has_local_image || localUser?.local_image_token),
            has_erp_image: Boolean(emp?.erp_image_token || emp?.erp_image_url || emp?.erp_image_base64),
            erp: {
              name: toSafeText(emp?.name),
              department: toSafeText(emp?.department),
              position: toSafeText(emp?.position),
            },
            system: {
              name: toSafeText(localUser?.name),
              department: toSafeText(localUser?.department),
              position: toSafeText(localUser?.position),
            },
            differences,
          });
        }

        const erpImageToken = String(emp?.erp_image_token || '').trim();
        const localErpToken = String(localUser?.local_erp_image_token || localUser?.erp_image_token || '').trim();
        const systemImageToken = String(localUser?.local_image_token || '').trim();
        const hasLocalImage = Boolean(systemImageToken || localUser?.has_local_image);

        // Check if ERP token matches either reference ERP token or local image token
        const tokenSame = Boolean(
          (erpImageToken && localErpToken && erpImageToken === localErpToken)
          || (erpImageToken && systemImageToken && erpImageToken === systemImageToken)
          || (!erpImageToken && !localErpToken && !systemImageToken && !hasLocalImage)
        );
        if (!tokenSame) {
          const bothEmpty = !erpImageToken && !localErpToken && !systemImageToken && !hasLocalImage;
          if (!bothEmpty) {
            const reasons: string[] = [];
            if (erpImageToken && (localErpToken || systemImageToken) && erpImageToken !== localErpToken && erpImageToken !== systemImageToken) {
              reasons.push('Token ảnh giữa ERP và thiết bị khác nhau.');
            }
            if (erpImageToken && !localErpToken && !systemImageToken) {
              reasons.push('ERP có token ảnh nhưng thiết bị chưa lưu token tương ứng.');
            }
            if ((localErpToken || systemImageToken) && !erpImageToken) {
              reasons.push('Thiết bị có token ảnh nhưng ERP đang trống.');
            }
            if (hasLocalImage && !erpImageToken) {
              reasons.push('Thiết bị có ảnh nhưng ERP chưa có token ảnh.');
            }
            if (erpImageToken && !hasLocalImage) {
              reasons.push('ERP có token ảnh nhưng thiết bị chưa lưu ảnh.');
            }
            const canPushLocalToErp = hasLocalImage;
            const canPullErpToSystem = Boolean(localUser && (erpImageToken || emp?.erp_image_url));
            let directionHint = 'review';
            if (canPushLocalToErp && !canPullErpToSystem) {
              directionHint = 'push_local_to_erp';
            } else if (canPullErpToSystem && !canPushLocalToErp) {
              directionHint = 'pull_erp_to_system';
            }
            nextFaceMismatches.push({
              employee_id: employeeId,
              name: toSafeText(emp?.name || localUser?.name),
              department: toSafeText(emp?.department || localUser?.department),
              position: toSafeText(emp?.position || localUser?.position),
              erp_image_token: erpImageToken,
              erp_image_url: emp?.erp_image_url || '',
              erp_image_base64: emp?.erp_image_base64 || '',
              system_image_token: systemImageToken,
              local_image_token: localErpToken || systemImageToken,
              local_image_base64: localUser?.local_image_base64 || '',
              local_image_url: localUser?.local_image_url || '',
              has_local_image: hasLocalImage,
              has_erp_image: Boolean(erpImageToken || emp?.erp_image_url || emp?.erp_image_base64),
              can_push_local_to_erp: canPushLocalToErp,
              can_pull_erp_to_system: canPullErpToSystem,
              direction_hint: directionHint,
              reasons,
            });
          }
        }
      }

      nextNewEmployees.sort((a, b) => (a.employee_id || '').localeCompare(b.employee_id || ''));
      nextProfileMismatches.sort((a, b) => (a.employee_id || '').localeCompare(b.employee_id || ''));
      nextFaceMismatches.sort((a, b) => (a.employee_id || '').localeCompare(b.employee_id || ''));

      setPayload({
        success: true,
        summary: {
          erp_total: erpEmployees.length,
          system_total: localEmployees.length,
          new_count: nextNewEmployees.length,
          profile_mismatch_count: nextProfileMismatches.length,
          face_mismatch_count: nextFaceMismatches.length,
        },
        new_employees: nextNewEmployees,
        profile_mismatches: nextProfileMismatches,
        face_mismatches: nextFaceMismatches,
      });
    } catch (error) {
      setStatusText(
        error instanceof Error ? error.message : 'Không tải được dữ liệu đồng bộ.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData().catch(() => {});
  }, []);

  // Preload Images for active rows
  useEffect(() => {
    if (activeRows.length === 0) return;
    const ids = activeRows
      .slice(0, ERP_EMPLOYEE_IMAGE_PRELOAD_LIMIT)
      .map((row: any) => String(row?.employee_id || '').trim())
      .filter(Boolean);
    let cancelled = false;
    (async () => {
      for (let i = 0; i < ids.length; i += ERP_EMPLOYEE_IMAGE_PRELOAD_BATCH_SIZE) {
        if (cancelled) break;
        const batch = ids.slice(i, i + ERP_EMPLOYEE_IMAGE_PRELOAD_BATCH_SIZE);
        await Promise.all(
          batch.map(async (id: string) => {
            const lUri = await fetchLocalEmployeeImageUri(id).catch(() => '');
            const eUri = await fetchEmployeeImageUri(id).catch(() => '');
            if (mountedRef.current && (lUri || eUri)) {
              setSyncImageCache(prev => ({
                ...prev,
                [id]: lUri || eUri,
              }));
            }
          }),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, payload]);

  // Open Compare Modal
  async function openCompareModal(row: any) {
    setSelectedSyncRow(row);
    setActionFeedback(null);
    const employeeId = String(row?.employee_id || '').trim();

    const localUri = getRowLocalImageUri(row);
    const erpUri = getRowErpImageUri(row);

    const hasLocal = Boolean(localUri || row?.has_local_image || row?.local_image_token);
    const hasErp = Boolean(erpUri || row?.erp_image_token || row?.has_erp_image);

    if (hasLocal && !hasErp) {
      setSelectedSyncSource('local');
    } else if (hasErp && !hasLocal) {
      setSelectedSyncSource('erp');
    } else {
      setSelectedSyncSource('local');
    }

    setModalLocalUri(localUri);
    setModalErpUri(erpUri);
    setCompareModalVisible(true);

    if (!localUri && employeeId) {
      setModalLoading(true);
      fetchLocalEmployeeImageUri(employeeId)
        .then(uri => {
          if (uri && mountedRef.current) setModalLocalUri(uri);
        })
        .finally(() => {
          if (mountedRef.current) setModalLoading(false);
        });
    }
    if (!erpUri && employeeId) {
      fetchEmployeeImageUri(employeeId).then(uri => {
        if (uri && mountedRef.current) setModalErpUri(uri);
      });
    }
  }

  // Handle Sync Confirmation & API
  function handleConfirmSync() {
    if (!selectedSyncRow) return;
    const employeeId = String(selectedSyncRow.employee_id || '').trim();
    const sourceTitle = selectedSyncSource === 'local' ? 'Thiết bị (Local)' : 'Máy chủ (ERP)';

    Alert.alert(
      'Xác nhận đồng bộ ảnh',
      `Hành động này sẽ đồng bộ ảnh từ ${sourceTitle} cho cả ERP và thiết bị (cả 2 hệ thống đều sẽ dùng ảnh này).\n\nBạn có chắc chắn muốn thực hiện cho nhân viên ${selectedSyncRow.name || employeeId}?`,
      [
        {text: 'Hủy', style: 'cancel'},
        {
          text: 'Đồng bộ ngay',
          onPress: () => executeSync(),
        },
      ],
    );
  }

  async function executeSync() {
    if (!selectedSyncRow) return;
    const employeeId = String(selectedSyncRow.employee_id || '').trim();
    setSyncSubmitting(true);
    setActionFeedback(null);
    try {
      let res: any = null;
      if (selectedSyncSource === 'local') {
        res = await api.pushToErp(employeeId);
      } else {
        res = await api.reloadFromErp(employeeId);
      }

      if (res?.success || res?.status === 'success' || !res?.error) {
        const successMsg =
          selectedSyncSource === 'local'
            ? `Đã đồng bộ ảnh từ thiết bị lên ERP thành công cho nhân viên ${selectedSyncRow.name || employeeId}.`
            : `Đã tải ảnh từ ERP về thiết bị thành công cho nhân viên ${selectedSyncRow.name || employeeId}.`;
        setActionFeedback({type: 'success', message: successMsg});
        // Refresh local cache from server so SQLite is updated with new token/image
        await syncMobileEmployeesFromServer().catch(() => {});
        await loadData();
        setTimeout(() => {
          if (mountedRef.current) {
            setCompareModalVisible(false);
            setSelectedSyncRow(null);
          }
        }, 1800);
      } else {
        setActionFeedback({
          type: 'error',
          message: res?.message || 'Không thể đồng bộ ảnh giữa 2 hệ thống.',
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Lỗi kết nối khi đồng bộ ảnh.',
      });
    } finally {
      if (mountedRef.current) {
        setSyncSubmitting(false);
      }
    }
  }

  return (
    <ModuleBox
      title="Xử lý đồng bộ giữa 2 hệ thống"
      subtitle="So sánh & thống nhất dữ liệu sinh trắc học giữa ERP và thiết bị"
      rightSlot={
        <Pressable
          onPress={() => loadData()}
          style={styles.smallButtonSecondary}>
          <Text style={styles.smallButtonSecondaryText}>Tải lại</Text>
        </Pressable>
      }>
      <View style={styles.moduleList}>
        {/* Search Header */}
        <View style={styles.manageFacesSearchRow}>
          <View style={styles.manageFacesSearchInputWrap}>
            <Icon name="search" size={17} color="#64748b" />
            <TextInput
              style={styles.manageFacesSearchInput}
              value={searchKeyword}
              onChangeText={setSearchKeyword}
              placeholder="Tìm theo tên, mã NV hoặc phòng ban..."
              placeholderTextColor="#64748b"
              autoCapitalize="none"
            />
            {searchKeyword ? (
              <Pressable onPress={() => setSearchKeyword('')} style={{padding: 4}}>
                <Icon name="close" size={15} color="#94a3b8" />
              </Pressable>
            ) : null}
          </View>
        </View>

        {statusText ? <Text style={styles.statusInfoText}>{statusText}</Text> : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{marginVertical: 24}} />
        ) : (
          <View style={styles.moduleList}>
            {/* Bento KPI Summary Grid */}
            <View style={styles.storageGrid}>
              <View style={[styles.storageCard, {backgroundColor: colors.infoBg}]}>
                <Text style={styles.storageLabel}>ERP tổng</Text>
                <Text style={styles.storageValue}>{Number(summary.erp_total || 0)}</Text>
              </View>
              <View style={[styles.storageCard, {backgroundColor: colors.successBg}]}>
                <Text style={styles.storageLabel}>Chưa ĐK offline</Text>
                <Text style={styles.storageValue}>{Number(summary.new_count || 0)}</Text>
              </View>
              <View style={[styles.storageCard, {backgroundColor: colors.warningBg}]}>
                <Text style={styles.storageLabel}>Lệch profile</Text>
                <Text style={styles.storageValue}>
                  {Number(summary.profile_mismatch_count || 0)}
                </Text>
              </View>
              <View style={[styles.storageCard, {backgroundColor: colors.dangerBg}]}>
                <Text style={styles.storageLabel}>Lệch khuôn mặt</Text>
                <Text style={styles.storageValue}>
                  {Number(summary.face_mismatch_count || 0)}
                </Text>
              </View>
            </View>

            {/* Segmented Filter Tabs */}
            <View style={styles.inlineRow}>
              <Pressable
                onPress={() => setActiveTab('face')}
                style={[
                  styles.toggleButton,
                  activeTab === 'face' && styles.toggleButtonActive,
                  {flex: 1},
                ]}>
                <Text style={[styles.toggleButtonText, activeTab === 'face' && {fontWeight: '700'}]}>
                  Lệch ảnh ({faceMismatches.length})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab('profile')}
                style={[
                  styles.toggleButton,
                  activeTab === 'profile' && styles.toggleButtonActive,
                  {flex: 1},
                ]}>
                <Text style={[styles.toggleButtonText, activeTab === 'profile' && {fontWeight: '700'}]}>
                  Lệch profile ({profileMismatches.length})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab('new')}
                style={[
                  styles.toggleButton,
                  activeTab === 'new' && styles.toggleButtonActive,
                  {flex: 1},
                ]}>
                <Text style={[styles.toggleButtonText, activeTab === 'new' && {fontWeight: '700'}]}>
                  Chưa ĐK offline ({newEmployees.length})
                </Text>
              </Pressable>
            </View>

            {/* Employee List */}
            <View style={styles.simpleList}>
              {filteredActiveRows.length === 0 ? (
                <Text style={styles.mutedText}>
                  {searchKeyword
                    ? 'Không tìm thấy nhân viên phù hợp từ khóa tìm kiếm.'
                    : 'Không có nhân sự nào trong danh mục đang chọn.'}
                </Text>
              ) : (
                filteredActiveRows.slice(0, 100).map((row: any, index: number) => {
                  const rowEmployeeId = String(row?.employee_id || '').trim();
                  const localUri = getRowLocalImageUri(row);
                  const erpUri = getRowErpImageUri(row);
                  const displayAvatarUri = localUri || erpUri || syncImageCache[rowEmployeeId];

                  let mismatchLabel = 'Lệch ảnh ERP ↔ Local';
                  let mismatchBadgeBg = '#fef2f2';
                  let mismatchBadgeColor = '#dc2626';
                  let statusRingColor = '#ef4444';
                  let statusRingGlow = 'rgba(239, 68, 68, 0.12)';

                  if (activeTab === 'face') {
                    if (row?.has_erp_image && !row?.has_local_image) {
                      mismatchLabel = 'Chỉ có ảnh ERP';
                      mismatchBadgeBg = '#fffbeb';
                      mismatchBadgeColor = '#d97706';
                      statusRingColor = '#f59e0b';
                      statusRingGlow = 'rgba(245, 158, 11, 0.12)';
                    } else if (row?.has_local_image && !row?.has_erp_image) {
                      mismatchLabel = 'Chỉ có ảnh Local';
                      mismatchBadgeBg = '#eff6ff';
                      mismatchBadgeColor = '#2563eb';
                      statusRingColor = '#3b82f6';
                      statusRingGlow = 'rgba(59, 130, 246, 0.12)';
                    }
                  } else if (activeTab === 'profile') {
                    statusRingColor = '#3b82f6';
                    statusRingGlow = 'rgba(59, 130, 246, 0.12)';
                  } else {
                    statusRingColor = '#10b981';
                    statusRingGlow = 'rgba(16, 185, 129, 0.12)';
                  }

                  return (
                    <Pressable
                      key={buildStableKey('sync-item', row?.employee_id || row?.name, index)}
                      onPress={() => openCompareModal(row)}
                      style={({pressed}) => [
                        styles.compactEmployeeCard,
                        pressed && {opacity: 0.82},
                      ]}>
                      <View style={styles.compactEmployeeCardContent}>
                        {/* Smart Avatar Ring */}
                        <View
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 24,
                            borderWidth: 2,
                            borderColor: statusRingColor,
                            backgroundColor: statusRingGlow,
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                          }}>
                          {displayAvatarUri ? (
                            <Image
                              source={{uri: displayAvatarUri}}
                              style={{width: 40, height: 40, borderRadius: 20}}
                              resizeMode="cover"
                            />
                          ) : (
                            <View
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: '#f1f5f9',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                              <Icon name="person" size={20} color="#94a3b8" />
                            </View>
                          )}
                          <View
                            style={{
                              position: 'absolute',
                              bottom: -2,
                              right: -2,
                              width: 16,
                              height: 16,
                              borderRadius: 8,
                              backgroundColor: statusRingColor,
                              borderWidth: 1.5,
                              borderColor: '#fff',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                            <Icon
                              name={
                                activeTab === 'face'
                                  ? 'compare'
                                  : activeTab === 'profile'
                                    ? 'person'
                                    : 'person_add'
                              }
                              size={9}
                              color="#fff"
                            />
                          </View>
                        </View>

                        {/* Profile Info */}
                        <View style={{flex: 1, gap: 3}}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}>
                            <Text style={styles.compactEmpName} numberOfLines={1}>
                              {toSafeText(row?.name)}
                            </Text>
                            {!isMobile ? (
                              <View style={styles.compactEmpIdBadge}>
                                <Text style={styles.compactEmpIdText}>
                                  #{toSafeText(row?.employee_id)}
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 5,
                              flexWrap: 'wrap',
                            }}>
                            {isMobile ? (
                              <View style={styles.compactEmpIdBadge}>
                                <Text style={styles.compactEmpIdText}>
                                  #{toSafeText(row?.employee_id)}
                                </Text>
                              </View>
                            ) : null}
                            {row?.department ? (
                              <View style={styles.compactDeptPill}>
                                <Icon name="briefcase" size={9.5} color="#2563eb" />
                                <Text style={styles.compactDeptText} numberOfLines={1}>
                                  {toSafeText(row?.department)}
                                </Text>
                              </View>
                            ) : null}

                            {activeTab === 'face' ? (
                              <View
                                style={[
                                  styles.compactStatusPill,
                                  {backgroundColor: mismatchBadgeBg},
                                ]}>
                                <Icon name="compare" size={9.5} color={mismatchBadgeColor} />
                                <Text
                                  style={[
                                    styles.compactStatusText,
                                    {color: mismatchBadgeColor},
                                  ]}>
                                  {mismatchLabel}
                                </Text>
                              </View>
                            ) : null}

                            {activeTab === 'profile' ? (
                              <View
                                style={[
                                  styles.compactStatusPill,
                                  {backgroundColor: '#fffbeb'},
                                ]}>
                                <Icon name="edit" size={9.5} color="#d97706" />
                                <Text
                                  style={[
                                    styles.compactStatusText,
                                    {color: '#d97706'},
                                  ]}>
                                  Lệch {Number((row?.differences || []).length)} trường
                                </Text>
                              </View>
                            ) : null}

                            {activeTab === 'new' ? (
                              <View
                                style={[
                                  styles.compactStatusPill,
                                  {backgroundColor: '#f0fdf4'},
                                ]}>
                                <Icon name="person_add" size={9.5} color="#16a34a" />
                                <Text
                                  style={[
                                    styles.compactStatusText,
                                    {color: '#16a34a'},
                                  ]}>
                                  Chưa có trên thiết bị
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>

                        {/* Right Action */}
                        <View style={[styles.syncRowActionBtn, isMobile && styles.syncRowActionBtnMobile]}>
                          {!isMobile ? <Text style={styles.syncRowActionBtnText}>So sánh</Text> : null}
                          <Icon name="chevron_right" size={isMobile ? 15 : 13} color="#0037b0" />
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>
        )}

        {/* Side-by-Side Photo Comparison Modal */}
        <Modal
          visible={compareModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            if (!syncSubmitting) setCompareModalVisible(false);
          }}>
          <View style={styles.actionModalOverlay}>
            <Pressable
              style={styles.actionModalBackdrop}
              onPress={() => {
                if (!syncSubmitting) setCompareModalVisible(false);
              }}
            />
            <View style={styles.actionModalCard}>
              {/* Modal Header */}
              <View style={styles.actionModalHeader}>
                <View style={{flex: 1}}>
                  <Text style={styles.actionModalTitle}>So sánh & Đồng bộ ảnh</Text>
                  <Text style={styles.actionModalSubtitle}>
                    Chọn ảnh chuẩn để đồng bộ thống nhất giữa 2 hệ thống
                  </Text>
                </View>
                <Pressable
                  onPress={() => setCompareModalVisible(false)}
                  disabled={syncSubmitting}
                  style={styles.actionModalCloseBtn}>
                  <Icon name="close" size={18} color="#64748b" />
                </Pressable>
              </View>

              {/* Employee Summary */}
              {selectedSyncRow ? (
                <View style={styles.actionModalHero}>
                  <View style={styles.actionModalAvatarWrap}>
                    {modalLocalUri || modalErpUri ? (
                      <Image
                        source={{uri: modalLocalUri || modalErpUri}}
                        style={styles.actionModalAvatarImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.actionModalAvatarPlaceholder}>
                        <Icon name="person" size={32} color="#94a3b8" />
                      </View>
                    )}
                  </View>
                  <View style={styles.actionModalInfo}>
                    <Text style={styles.actionModalName} numberOfLines={1}>
                      {toSafeText(selectedSyncRow.name)}
                    </Text>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                      <View style={styles.actionModalTag}>
                        <Text style={styles.actionModalTagText}>
                          #{toSafeText(selectedSyncRow.employee_id)}
                        </Text>
                      </View>
                      {selectedSyncRow.department ? (
                        <View style={styles.compactDeptPill}>
                          <Text style={styles.compactDeptText}>
                            {toSafeText(selectedSyncRow.department)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Side-by-Side Comparison Columns */}
              <View style={styles.syncCompareRow}>
                {/* Left Card: Local */}
                <Pressable
                  onPress={() => setSelectedSyncSource('local')}
                  style={[
                    styles.syncCompareCard,
                    selectedSyncSource === 'local' && styles.syncCompareCardActive,
                  ]}>
                  <View
                    style={[
                      styles.syncCompareSourceBadge,
                      selectedSyncSource === 'local' && styles.syncCompareSourceBadgeActive,
                    ]}>
                    <Text
                      style={[
                        styles.syncCompareSourceText,
                        selectedSyncSource === 'local' && styles.syncCompareSourceTextActive,
                      ]}>
                      📱 Thiết bị (Local)
                    </Text>
                  </View>

                  <View style={styles.syncCompareImageBox}>
                    {modalLocalUri ? (
                      <Image
                        source={{uri: modalLocalUri}}
                        style={styles.syncCompareImage}
                        resizeMode="cover"
                      />
                    ) : modalLoading ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <View style={styles.syncComparePlaceholder}>
                        <Icon name="person" size={28} color="#94a3b8" />
                        <Text style={styles.syncComparePlaceholderText}>
                          Chưa có ảnh trên máy
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.syncRadioRow}>
                    <View
                      style={[
                        styles.syncRadioCircle,
                        selectedSyncSource === 'local' && styles.syncRadioCircleActive,
                      ]}>
                      {selectedSyncSource === 'local' ? (
                        <View style={styles.syncRadioCircleInner} />
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.syncRadioLabel,
                        selectedSyncSource === 'local' && styles.syncRadioLabelActive,
                      ]}>
                      {selectedSyncSource === 'local' ? 'Đã chọn ảnh này' : 'Dùng ảnh này'}
                    </Text>
                  </View>
                </Pressable>

                {/* Right Card: ERP */}
                <Pressable
                  onPress={() => setSelectedSyncSource('erp')}
                  style={[
                    styles.syncCompareCard,
                    selectedSyncSource === 'erp' && styles.syncCompareCardActive,
                  ]}>
                  <View
                    style={[
                      styles.syncCompareSourceBadge,
                      selectedSyncSource === 'erp' && styles.syncCompareSourceBadgeActive,
                    ]}>
                    <Text
                      style={[
                        styles.syncCompareSourceText,
                        selectedSyncSource === 'erp' && styles.syncCompareSourceTextActive,
                      ]}>
                      ☁️ Máy chủ (ERP)
                    </Text>
                  </View>

                  <View style={styles.syncCompareImageBox}>
                    {modalErpUri ? (
                      <Image
                        source={{uri: modalErpUri}}
                        style={styles.syncCompareImage}
                        resizeMode="cover"
                      />
                    ) : modalLoading ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <View style={styles.syncComparePlaceholder}>
                        <Icon name="person" size={28} color="#94a3b8" />
                        <Text style={styles.syncComparePlaceholderText}>
                          Chưa có ảnh trên ERP
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.syncRadioRow}>
                    <View
                      style={[
                        styles.syncRadioCircle,
                        selectedSyncSource === 'erp' && styles.syncRadioCircleActive,
                      ]}>
                      {selectedSyncSource === 'erp' ? (
                        <View style={styles.syncRadioCircleInner} />
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.syncRadioLabel,
                        selectedSyncSource === 'erp' && styles.syncRadioLabelActive,
                      ]}>
                      {selectedSyncSource === 'erp' ? 'Đã chọn ảnh này' : 'Dùng ảnh này'}
                    </Text>
                  </View>
                </Pressable>
              </View>

              {/* Warning / Notice Card */}
              <View style={styles.syncNoticeCard}>
                <Icon name="info" size={17} color="#b45309" />
                <Text style={styles.syncNoticeCardText}>
                  Lưu ý: Hành động này sẽ đồng bộ ảnh đã chọn cho cả ERP và thiết bị (cả 2 hệ thống đều sẽ dùng ảnh này).
                </Text>
              </View>

              {/* Feedback Alert if any */}
              {actionFeedback ? (
                <View
                  style={[
                    styles.syncFeedbackCard,
                    actionFeedback.type === 'success'
                      ? styles.syncFeedbackSuccess
                      : styles.syncFeedbackError,
                  ]}>
                  <Icon
                    name={actionFeedback.type === 'success' ? 'check_circle' : 'error'}
                    size={17}
                    color={actionFeedback.type === 'success' ? '#15803d' : '#dc2626'}
                  />
                  <Text
                    style={[
                      styles.syncFeedbackText,
                      {color: actionFeedback.type === 'success' ? '#15803d' : '#dc2626'},
                    ]}>
                    {actionFeedback.message}
                  </Text>
                </View>
              ) : null}

              {/* Action Buttons */}
              <View style={styles.actionModalBtnsGrid}>
                <Pressable
                  disabled={
                    syncSubmitting ||
                    (selectedSyncSource === 'local' ? !modalLocalUri : !modalErpUri)
                  }
                  onPress={handleConfirmSync}
                  style={[
                    styles.actionModalBtnPrimary,
                    (syncSubmitting ||
                      (selectedSyncSource === 'local' ? !modalLocalUri : !modalErpUri)) && {
                      opacity: 0.5,
                    },
                  ]}>
                  {syncSubmitting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Icon name="sync" size={17} color="#ffffff" />
                  )}
                  <Text style={styles.actionModalBtnPrimaryText}>
                    {syncSubmitting
                      ? 'Đang đồng bộ...'
                      : selectedSyncSource === 'local'
                        ? 'Lưu & Đồng bộ (Dùng ảnh Local)'
                        : 'Lưu & Đồng bộ (Dùng ảnh ERP)'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setCompareModalVisible(false)}
                  disabled={syncSubmitting}
                  style={styles.actionModalBtnSecondary}>
                  <Text style={styles.actionModalBtnSecondaryText}>Đóng</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ModuleBox>
  );
}

type ManageFacesModuleProps = {
  onOpenEmployeeRegister?: (employee?: any) => void;
  onNavigateToAccount?: (employeeId: string) => void;
};

type FaceFilterKey = 'has_face' | 'image_only' | 'empty';

const FACE_FILTER_LABELS: Record<FaceFilterKey, string> = {
  has_face: 'Đã có khuôn mặt',
  image_only: 'Chưa có khuôn mặt',
  empty: 'Chưa có ảnh',
};

function ManageFacesModule({onOpenEmployeeRegister, onNavigateToAccount}: ManageFacesModuleProps) {
  const {isMobile} = useResponsive();
  const [rows, setRows] = useState<any[]>([]);
  const [localAccounts, setLocalAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [statusText, setStatusText] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [previewUri, setPreviewUri] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [workingEmployeeId, setWorkingEmployeeId] = useState('');
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const [faceFilter, setFaceFilter] = useState<FaceFilterKey>('has_face');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [actionEmployee, setActionEmployee] = useState<any>(null);
  const [actionModalImageUri, setActionModalImageUri] = useState('');
  const [actionModalLoading, setActionModalLoading] = useState(false);
  const [registerMode, setRegisterMode] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [scanMessage, setScanMessage] = useState('');
  const cameraRef = useRef<any>(null);
  const scanIntervalRef = useRef<any>(null);
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  const accountByEmployee = useMemo(() => {
    const map = new Map<string, any>();
    for (const acc of localAccounts) {
      const eid = String(acc?.employee_id || '').trim();
      if (eid) map.set(eid, acc);
    }
    return map;
  }, [localAccounts]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (faceFilter === 'has_face') {
      result = result.filter((row: any) => row?.status_code === 'ready' || row?.has_face === true);
    } else if (faceFilter === 'image_only') {
      result = result.filter((row: any) =>
        row?.status_code === 'image_only'
        || (row?.has_local_image === true && row?.has_face !== true),
      );
    } else {
      result = result.filter((row: any) =>
        row?.status_code === 'empty'
        || row?.has_local_image !== true,
      );
    }
    const kw = searchKeyword.trim().toLowerCase();
    if (kw) {
      result = result.filter((row: any) => {
        const name = String(row?.name || '').toLowerCase();
        const id = String(row?.employee_id || '').toLowerCase();
        const dept = String(row?.department || '').toLowerCase();
        return name.includes(kw) || id.includes(kw) || dept.includes(kw);
      });
    }
    return result;
  }, [rows, faceFilter, searchKeyword]);

  async function loadData(options?: {syncFromServer?: boolean}) {
    setLoading(true);
    try {
      await initializeMobileLocalDataStore();
      if (options?.syncFromServer) {
        await syncMobileEmployeesFromServer();
      }
      const [nextRows, nextAccounts] = await Promise.all([
        getLocalEmployees(160),
        getLocalAccounts(200),
      ]);
      setRows(nextRows);
      setLocalAccounts(nextAccounts);
      const activeId = String(employeeId || '').trim();
      if (activeId) {
        const matched = nextRows.find(
          (item: any) => String(item?.employee_id || '').trim() === activeId,
        );
        if (matched) {
          setSelectedEmployee(matched);
          setPreviewUri(resolveEmployeeImageUri(matched, 'local'));
        }
      }
    } catch (error) {
      setRows([]);
      setStatusText(error instanceof Error ? error.message : 'Không tải được dữ liệu mobile.');
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployeePreview(targetEmployeeId = employeeId) {
    const normalizedEmployeeId = String(targetEmployeeId || '').trim();
    if (!normalizedEmployeeId) {
      setStatusText('Nhập employee id để xem ảnh.');
      return;
    }
    setPreviewLoading(true);
    try {
      const response = await api.getAdminEmployeeImage(normalizedEmployeeId);
      if (response?.success && response?.image_source !== 'erp') {
        const payload = response?.employee || null;
        const nextPreviewUri = resolveEmployeeImageUri(
          {
            ...(payload || {}),
            local_image_url: response?.local_image_url || response?.image_url,
            local_image_base64: response?.local_image_base64 || response?.image_base64,
            local_image_token: response?.local_image_token || response?.image_token,
          },
          'local',
        );
        if (payload) {
          setSelectedEmployee((prev: any) => ({
            ...(prev || {}),
            ...payload,
            local_image_url: response?.local_image_url || response?.image_url || payload?.local_image_url,
            local_image_token: response?.local_image_token || response?.image_token || payload?.local_image_token,
          }));
        }
        setEmployeeId(normalizedEmployeeId);
        setPreviewUri(nextPreviewUri);
        setStatusText(response?.message || 'Đã tải ảnh nhân viên.');
      } else {
        setPreviewUri('');
        setStatusText(response?.message || 'Không tải được ảnh nhân viên.');
      }
    } catch (error) {
      setPreviewUri('');
      setStatusText(error instanceof Error ? error.message : 'Không tải được ảnh nhân viên.');
    } finally {
      setPreviewLoading(false);
    }
  }

  function invalidateEmployeeLocalImageCache(targetEmployeeId: string) {
    const cacheKey = getEmployeeImageCacheKey(targetEmployeeId);
    delete LOCAL_EMPLOYEE_IMAGE_CACHE[cacheKey];
    delete LOCAL_EMPLOYEE_IMAGE_REQUESTS[cacheKey];
  }

  function selectEmployee(row: any) {
    const normalizedEmployeeId = String(row?.employee_id || '').trim();
    setEmployeeId(normalizedEmployeeId);
    setSelectedEmployee(row);
    setPreviewUri(resolveEmployeeImageUri(row, 'local'));
  }

  async function openActionSheet(row: any) {
    setActionEmployee(row);
    setSelectedEmployee(row);
    const targetId = String(row?.employee_id || '').trim();
    setEmployeeId(targetId);
    const uri = resolveEmployeeImageUri(row, 'local');
    setActionModalImageUri(uri);

    if (!uri && targetId) {
      setActionModalLoading(true);
      try {
        const res = await api.getAdminEmployeeImage(targetId);
        if (res?.success && res?.image_source !== 'erp') {
          const loadedUri = resolveEmployeeImageUri({
            ...(res?.employee || row),
            local_image_url: res?.local_image_url || res?.image_url,
            local_image_base64: res?.local_image_base64 || res?.image_base64,
            local_image_token: res?.local_image_token || res?.image_token,
          }, 'local');
          setActionModalImageUri(loadedUri);
        }
      } catch {
      } finally {
        setActionModalLoading(false);
      }
    }
  }

  function openUpdateFace(row?: any) {
    const target = row || selectedEmployee;
    const normalizedEmployeeId = String(
      target?.employee_id || employeeId || '',
    ).trim();
    if (!normalizedEmployeeId) {
      setStatusText('Chọn hoặc nhập employee id trước khi sửa ảnh.');
      return;
    }

    if (target) {
      setSelectedEmployee(target);
    }
    setEmployeeId(normalizedEmployeeId);
    setRegisterMode('idle');
    setScanMessage('');
    setUpdateModalVisible(true);
  }

  function stopAutoScan() {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  }

  async function startAutoScan() {
    const normalizedEmployeeId = String(
      selectedEmployee?.employee_id || employeeId || '',
    ).trim();
    if (!normalizedEmployeeId) {
      Alert.alert('Lỗi', 'Chọn nhân viên trước khi đăng ký.');
      return;
    }

    stopAutoScan();
    const granted = await ensureCameraPermission().catch(() => false);
    if (!granted) {
      setRegisterMode('error');
      setScanMessage('Không có quyền camera trên thiết bị.');
      return;
    }

    setRegisterMode('scanning');
    setScanMessage('Đưa khuôn mặt vào giữa khung hình...');

    let attemptCount = 0;
    const maxAttempts = 30;

    scanIntervalRef.current = setInterval(async () => {
      attemptCount += 1;
      if (attemptCount > maxAttempts) {
        stopAutoScan();
        setRegisterMode('error');
        setScanMessage('Không đăng ký được. Vui lòng thử lại sau.');
        return;
      }

      if (!cameraRef.current?.capture) {
        return;
      }

      try {
        Vibration.vibrate(20);
        const result = await cameraRef.current.capture();
        const uri = String(result?.uri || '').trim();
        if (!uri) return;

        const normalizedUri = uri.startsWith('file://') ? uri : `file://${uri}`;
        const filePath = normalizedUri.replace(/^file:\/\//, '');
        let base64 = '';
        try {
          base64 = await RNFS.readFile(filePath, 'base64');
        } catch {
          base64 = await RNFS.readFile(normalizedUri, 'base64');
        }
        const dataUri = `data:image/jpeg;base64,${base64}`;

        const detectRes = await api.employeeAttendanceDetectFrame({
          image_base64: dataUri,
        });

        if (detectRes?.detected !== true) {
          setScanMessage(
            Array.isArray(detectRes?.guidance)
              ? detectRes.guidance.join(' ')
              : 'Đưa khuôn mặt vào giữa khung hình...',
          );
          return;
        }

        const faceSizeRatio = Number(detectRes?.face_size_ratio || 0);
        if (faceSizeRatio < 0.12) {
          setScanMessage('Khuôn mặt quá nhỏ. Đưa gần hơn...');
          return;
        }

        const matched = detectRes?.matched === true;
        const detectedUserId = String(detectRes?.detected_user?.employee_id || '').trim();

        if (matched && detectedUserId && detectedUserId !== normalizedEmployeeId) {
          setScanMessage('Phát hiện khuôn mặt khác. Vui lòng đưa đúng nhân viên...');
          return;
        }

        stopAutoScan();
        Vibration.vibrate([0, 100, 50, 100]);
        setUpdateLoading(true);
        setScanMessage('Đang lưu ảnh...');

        const isRegistered =
          selectedEmployee
          && selectedEmployee?.status_code !== 'empty'
          && (selectedEmployee?.has_face || selectedEmployee?.has_local_image);

        let saveRes: any;
        if (isRegistered) {
          saveRes = await api.updateFaceBase64({
            employee_id: normalizedEmployeeId,
            image_base64: dataUri,
            replace_all: true,
          });
        } else {
          saveRes = await api.registerBase64({
            employee_id: normalizedEmployeeId,
            name: selectedEmployee?.name || normalizedEmployeeId,
            department: selectedEmployee?.department || '',
            position: selectedEmployee?.position || '',
            image_base64: dataUri,
          });
        }

        if (saveRes?.success) {
          const name = String(selectedEmployee?.name || '').trim();
          try {
            await Tts.stop();
            await Tts.setDefaultLanguage('vi-VN');
            Tts.setDefaultRate(0.45);
            Tts.speak(name ? `Xin chào ${name}` : 'Xin chào');
          } catch {
            // Ignore TTS errors
          }
          setRegisterMode('success');
          setScanMessage(saveRes?.message || 'Đã đăng ký thành công.');
          await loadEmployeePreview(normalizedEmployeeId);
          await loadData({syncFromServer: true});
        } else {
          setRegisterMode('error');
          setScanMessage(saveRes?.message || 'Không thể lưu ảnh.');
        }
      } catch {
        // Continue scanning on error
      } finally {
        setUpdateLoading(false);
      }
    }, 600);
  }

  async function runEmployeeAction(
    action: 'clear' | 'push' | 'delete',
    targetEmployeeId = employeeId,
    options?: {showSuccessAlert?: boolean},
  ) {
    const normalizedEmployeeId = String(targetEmployeeId || '').trim();
    if (!normalizedEmployeeId) {
      setStatusText('Nhập employee id.');
      return;
    }
    setWorkingEmployeeId(normalizedEmployeeId);
    try {
      let response: any = null;
      if (action === 'clear') {
        response = await api.clearFace(normalizedEmployeeId);
      } else if (action === 'push') {
        response = await api.pushToErp(normalizedEmployeeId);
      } else {
        response = await api.deleteEmployee(normalizedEmployeeId);
      }
      setStatusText(response?.message || formatJson(response));
      const alreadyAbsent = action === 'delete'
        && response?.success === false
        && /không tìm thấy|not found/i.test(String(response?.message || ''));
      if (alreadyAbsent) {
        await deleteLocalEmployee(normalizedEmployeeId);
        invalidateEmployeeLocalImageCache(normalizedEmployeeId);
        ERP_EMPLOYEE_LIST_CACHE = null;
        if (String(employeeId || '').trim() === normalizedEmployeeId) {
          setEmployeeId('');
          setSelectedEmployee(null);
          setPreviewUri('');
        }
        await loadData({syncFromServer: true});
        setStatusText('Nhân viên đã được xoá trước đó; dữ liệu local đã được dọn.');
        return;
      }
      if (response?.success) {
        if (options?.showSuccessAlert) {
          Alert.alert(
            'Thanh cong',
            response?.message || (action === 'delete' ? 'Da xoa nhan vien.' : 'Da xoa du lieu khuon mat.'),
          );
        }
        if (action === 'delete') {
          if (String(employeeId || '').trim() === normalizedEmployeeId) {
            setEmployeeId('');
            setSelectedEmployee(null);
            setPreviewUri('');
          }
          await deleteLocalEmployee(normalizedEmployeeId);
          invalidateEmployeeLocalImageCache(normalizedEmployeeId);
        } else {
          if (action === 'clear') {
            invalidateEmployeeLocalImageCache(normalizedEmployeeId);
          }
          await loadEmployeePreview(normalizedEmployeeId);
        }
        ERP_EMPLOYEE_LIST_CACHE = null;
        await loadData({syncFromServer: true});
      }
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Không thể thao tác nhân viên.');
    } finally {
      setWorkingEmployeeId('');
    }
  }

  function confirmEmployeeAction(action: 'clear' | 'delete', targetEmployeeId = employeeId) {
    const normalizedEmployeeId = String(targetEmployeeId || '').trim();
    if (!normalizedEmployeeId) {
      setStatusText('Nhập employee id.');
      return;
    }

    const isDelete = action === 'delete';
    Alert.alert(
      'Xac nhan',
      isDelete
        ? `Xoa nhan vien ${normalizedEmployeeId} khoi du lieu noi bo?`
        : `Xoa anh/khuon mat cua nhan vien ${normalizedEmployeeId}?`,
      [
        {text: 'Huy', style: 'cancel'},
        {
          text: isDelete ? 'Xoa nhan vien' : 'Xoa face',
          style: 'destructive',
          onPress: () =>
            runEmployeeAction(action, normalizedEmployeeId, {showSuccessAlert: true}).catch(() => {}),
        },
      ],
    );
  }

  async function clearFace() {
    confirmEmployeeAction('clear', employeeId);
  }

  async function deleteEmployee() {
    confirmEmployeeAction('delete', employeeId);
  }

  async function pushToErp() {
    await runEmployeeAction('push', employeeId);
  }

  useEffect(() => {
    initializeMobileLocalDataStore().catch(() => {});
    loadData().catch(() => {});
    loadData({syncFromServer: true}).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (registerMode !== 'scanning') {
      scanLineAnim.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(scanLineAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
        easing: Easing.linear,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [registerMode, scanLineAnim]);

  return (
    <ModuleBox
      title="Quản lý nhân viên offline"
      subtitle="Xoá khuôn mặt, xoá nhân viên, push ERP"
            rightSlot={
        <View style={styles.inlineRow}>
          {onOpenEmployeeRegister ? (
            <Pressable
              onPress={onOpenEmployeeRegister}
              style={styles.smallButtonSecondary}>
              <Text style={styles.smallButtonSecondaryText}>+ Đăng ký NV mới</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => loadData({syncFromServer: true})}
            style={styles.smallButtonSecondary}>
            <Text style={styles.smallButtonSecondaryText}>Tải lại</Text>
          </Pressable>
        </View>
      }>
      <View style={styles.moduleList}>
        {/* Modern Luxury Search Header */}
        <View style={styles.manageFacesSearchRow}>
          <View style={styles.manageFacesSearchInputWrap}>
            <Icon name="search" size={17} color="#64748b" />
            <TextInput
              style={styles.manageFacesSearchInput}
              value={searchKeyword}
              onChangeText={setSearchKeyword}
              placeholder="Tìm theo tên, mã NV hoặc phòng ban..."
              placeholderTextColor="#64748b"
              autoCapitalize="none"
            />
            {searchKeyword ? (
              <Pressable onPress={() => setSearchKeyword('')} style={{padding: 4}}>
                <Icon name="close" size={15} color="#94a3b8" />
              </Pressable>
            ) : null}
          </View>
        </View>

        {statusText ? <Text style={styles.statusInfoText}>{statusText}</Text> : null}

        {/* Segmented Face Filter Tabs */}
        <View style={styles.inlineRow}>
          {(Object.keys(FACE_FILTER_LABELS) as FaceFilterKey[]).map(key => {
            const active = faceFilter === key;
            return (
              <Pressable
                key={key}
                onPress={() => setFaceFilter(key)}
                style={[
                  styles.toggleButton,
                  active && styles.toggleButtonActive,
                  {flex: 1},
                ]}>
                <Text style={[styles.toggleButtonText, active && {fontWeight: '700'}]}>
                  {FACE_FILTER_LABELS[key]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Count & Batch Action Bar */}
        <View style={styles.inlineRow}>
          <Text style={styles.blockTitle}>
            Danh sách nhân sự ({filteredRows.length})
          </Text>
          <View style={{flex: 1}} />
          <Pressable
            onPress={() => {
              if (batchSelectedIds.size > 0) {
                setBatchSelectedIds(new Set());
              } else {
                setBatchSelectedIds(new Set(filteredRows.map((r: any) => String(r?.employee_id || '').trim()).filter(Boolean)));
              }
            }}
            style={styles.smallButtonSecondary}>
            <Text style={styles.smallButtonSecondaryText}>
              {batchSelectedIds.size > 0 ? `Bỏ chọn (${batchSelectedIds.size})` : 'Chọn hàng loạt'}
            </Text>
          </Pressable>
        </View>

        {batchSelectedIds.size > 0 ? (
          <View style={styles.rowActionWrap}>
            <Pressable
              onPress={() => {
                batchSelectedIds.forEach(id => runEmployeeAction('clear', id));
                setBatchSelectedIds(new Set());
              }}
              style={styles.rowActionSecondary}>
              <Text style={styles.rowActionSecondaryText}>Clear mặt ({batchSelectedIds.size})</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                batchSelectedIds.forEach(id => runEmployeeAction('push', id));
                setBatchSelectedIds(new Set());
              }}
              style={styles.rowActionPrimary}>
              <Text style={styles.rowActionPrimaryText}>Push ERP ({batchSelectedIds.size})</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Alert.alert('Xác nhận', `Xóa ${batchSelectedIds.size} nhân viên khỏi offline?`, [
                  {text: 'Hủy', style: 'cancel'},
                  {
                    text: 'Xóa', style: 'destructive',
                    onPress: () => {
                      batchSelectedIds.forEach(id => runEmployeeAction('delete', id));
                      setBatchSelectedIds(new Set());
                    },
                  },
                ]);
              }}
              style={styles.rowActionDanger}>
              <Text style={styles.rowActionDangerText}>Xóa ({batchSelectedIds.size})</Text>
            </Pressable>
          </View>
        ) : null}

        {/* High-Density Compact Employee List */}
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{paddingVertical: spacing.xl}} />
        ) : (
          <View style={styles.simpleList}>
            {filteredRows.length === 0 ? (
              <Text style={styles.mutedText}>
                {searchKeyword
                  ? 'Không tìm thấy nhân viên phù hợp từ khóa.'
                  : 'Không có nhân viên nào trong bộ lọc đang chọn.'}
              </Text>
            ) : (
              filteredRows.slice(0, 100).map((row, index) => {
                const rowEmployeeId = String(row?.employee_id || '').trim();
                const rowAccount = accountByEmployee.get(rowEmployeeId);
                const hasAccount = Boolean(rowAccount?.account_id);
                const isFaceReady = row?.status_code === 'ready' || row?.has_face === true;
                const isImageOnly = row?.status_code === 'image_only' || (row?.has_local_image === true && !row?.has_face);
                const statusRingColor = isFaceReady ? '#10b981' : isImageOnly ? '#f59e0b' : '#94a3b8';
                const statusRingGlow = isFaceReady ? 'rgba(16, 185, 129, 0.15)' : isImageOnly ? 'rgba(245, 158, 11, 0.15)' : 'transparent';
                const imageUri = resolveEmployeeImageUri(row, 'local');

                return (
                  <Pressable
                    key={buildStableKey('offline-emp', row?.employee_id, index)}
                    onPress={() => openActionSheet(row)}
                    style={({pressed}) => [
                      styles.compactEmployeeCard,
                      pressed && {opacity: 0.8},
                    ]}>
                    <View style={styles.compactEmployeeCardContent}>
                      {batchSelectedIds.size > 0 ? (
                        <Pressable
                          onPress={() => {
                            const newSet = new Set(batchSelectedIds);
                            if (newSet.has(rowEmployeeId)) {
                              newSet.delete(rowEmployeeId);
                            } else {
                              newSet.add(rowEmployeeId);
                            }
                            setBatchSelectedIds(newSet);
                          }}
                          style={[
                            styles.batchCheckbox,
                            batchSelectedIds.has(rowEmployeeId) && styles.batchCheckboxChecked,
                          ]}>
                          {batchSelectedIds.has(rowEmployeeId) ? (
                            <Icon name="check" size={13} color="#fff" />
                          ) : null}
                        </Pressable>
                      ) : null}

                      {/* Smart Avatar Ring */}
                      <View style={{
                        width: 46,
                        height: 46,
                        borderRadius: 23,
                        borderWidth: 2,
                        borderColor: statusRingColor,
                        backgroundColor: statusRingGlow,
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                      }}>
                        {imageUri ? (
                          <Image
                            source={{uri: imageUri}}
                            style={{width: 38, height: 38, borderRadius: 19}}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={{width: 38, height: 38, borderRadius: 19, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center'}}>
                            <Icon name="person" size={18} color="#94a3b8" />
                          </View>
                        )}
                        <View style={{
                          position: 'absolute',
                          bottom: -2,
                          right: -2,
                          width: 15,
                          height: 15,
                          borderRadius: 7.5,
                          backgroundColor: statusRingColor,
                          borderWidth: 1.5,
                          borderColor: '#fff',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <Icon
                            name={isFaceReady ? 'check' : isImageOnly ? 'camera' : 'close'}
                            size={8}
                            color="#fff"
                          />
                        </View>
                      </View>

                      {/* Biometric Profile Body */}
                      <View style={{flex: 1, gap: 2}}>
                        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                          <Text style={styles.compactEmpName} numberOfLines={1}>
                            {toSafeText(row?.name)}
                          </Text>
                          {!isMobile ? (
                            <View style={styles.compactEmpIdBadge}>
                              <Text style={styles.compactEmpIdText}>
                                #{toSafeText(row?.employee_id)}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap'}}>
                          {isMobile ? (
                            <View style={styles.compactEmpIdBadge}>
                              <Text style={styles.compactEmpIdText}>
                                #{toSafeText(row?.employee_id)}
                              </Text>
                            </View>
                          ) : null}
                          {row?.department ? (
                            <View style={styles.compactDeptPill}>
                              <Icon name="briefcase" size={9.5} color="#2563eb" />
                              <Text style={styles.compactDeptText} numberOfLines={1}>
                                {toSafeText(row?.department)}
                              </Text>
                            </View>
                          ) : null}

                          <View style={[styles.compactStatusPill, {backgroundColor: isFaceReady ? '#ecfdf5' : '#fffbeb'}]}>
                            <Icon
                              name="face-recognition"
                              size={9.5}
                              color={isFaceReady ? '#059669' : '#d97706'}
                            />
                            <Text style={[styles.compactStatusText, {color: isFaceReady ? '#059669' : '#d97706'}]}>
                              {isFaceReady ? 'Đã có Face' : 'Chưa có Face'}
                            </Text>
                          </View>

                          <View style={{flexDirection: 'row', alignItems: 'center', gap: 3}}>
                            <Icon
                              name={hasAccount ? (rowAccount?.is_locked ? 'lock' : 'check_circle') : 'warning'}
                              size={9.5}
                              color={hasAccount ? (rowAccount?.is_locked ? '#ef4444' : '#10b981') : '#94a3b8'}
                            />
                            <Text style={{
                              color: hasAccount ? (rowAccount?.is_locked ? '#b91c1c' : '#059669') : '#94a3b8',
                              fontSize: 10,
                              fontWeight: '600',
                            }}>
                              {hasAccount ? (rowAccount?.is_locked ? 'Khóa TK' : 'Đã có TK') : 'Chưa có TK'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Right Chevron */}
                      <Icon name="chevron-right" size={18} color="#94a3b8" />
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        {/* Popup Action Sheet / Card for Selected Employee */}
        <Modal
          visible={Boolean(actionEmployee)}
          transparent
          animationType="fade"
          onRequestClose={() => setActionEmployee(null)}>
          <View style={styles.actionModalOverlay}>
            <Pressable
              style={styles.actionModalBackdrop}
              onPress={() => setActionEmployee(null)}
            />
            <View style={styles.actionModalCard}>
              {/* Modal Header */}
              <View style={styles.actionModalHeader}>
                <View style={{flex: 1}}>
                  <Text style={styles.actionModalTitle}>Hồ sơ nhân sự</Text>
                  <Text style={styles.actionModalSubtitle}>
                    #{toSafeText(actionEmployee?.employee_id)} — {toSafeText(actionEmployee?.name)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setActionEmployee(null)}
                  style={styles.actionModalCloseBtn}
                  accessibilityLabel="Đóng popup">
                  <Icon name="close" size={18} color="#64748b" />
                </Pressable>
              </View>

              {/* Employee Photo & Full Details */}
              <View style={styles.actionModalHero}>
                <View style={styles.actionModalAvatarWrap}>
                  {actionModalLoading ? (
                    <ActivityIndicator color="#0284c7" size="large" />
                  ) : actionModalImageUri ? (
                    <Image
                      source={{uri: actionModalImageUri}}
                      style={styles.actionModalAvatarImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.actionModalAvatarPlaceholder}>
                      <Icon name="person" size={44} color="#94a3b8" />
                    </View>
                  )}
                </View>

                <View style={styles.actionModalInfo}>
                  <Text style={styles.actionModalName}>{toSafeText(actionEmployee?.name)}</Text>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4}}>
                    <View style={styles.actionModalTag}>
                      <Text style={styles.actionModalTagText}>Mã: #{toSafeText(actionEmployee?.employee_id)}</Text>
                    </View>
                    {actionEmployee?.department ? (
                      <View style={[styles.actionModalTag, {backgroundColor: '#eff6ff', borderColor: '#bfdbfe'}]}>
                        <Text style={[styles.actionModalTagText, {color: '#1d4ed8'}]}>{toSafeText(actionEmployee?.department)}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6}}>
                    <View style={[
                      styles.actionModalPill,
                      {backgroundColor: (actionEmployee?.status_code === 'ready' || actionEmployee?.has_face) ? '#ecfdf5' : '#fffbeb'}
                    ]}>
                      <Text style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: (actionEmployee?.status_code === 'ready' || actionEmployee?.has_face) ? '#059669' : '#d97706',
                      }}>
                        {toSafeText(actionEmployee?.status_text, (actionEmployee?.status_code === 'ready' || actionEmployee?.has_face) ? 'Đã có Face AI' : 'Chưa có Face AI')}
                      </Text>
                    </View>

                    {(() => {
                      const acc = accountByEmployee.get(String(actionEmployee?.employee_id || '').trim());
                      const hasAcc = Boolean(acc?.account_id);
                      return (
                        <View style={[
                          styles.actionModalPill,
                          {backgroundColor: hasAcc ? (acc?.is_locked ? '#fef2f2' : '#f0fdf4') : '#f1f5f9'}
                        ]}>
                          <Text style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: hasAcc ? (acc?.is_locked ? '#b91c1c' : '#15803d') : '#64748b',
                          }}>
                            {hasAcc ? (acc?.is_locked ? 'TK bị khóa' : 'Đã có TK App') : 'Chưa cấp TK App'}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                </View>
              </View>

              {/* Action Buttons Grid */}
              <View style={styles.actionModalBtnsGrid}>
                <Pressable
                  onPress={() => {
                    const emp = actionEmployee;
                    setActionEmployee(null);
                    openUpdateFace(emp);
                  }}
                  style={styles.actionModalBtnPrimary}>
                  <Icon name="camera" size={16} color="#ffffff" />
                  <Text style={styles.actionModalBtnPrimaryText}>Sửa ảnh / Quét lại</Text>
                </Pressable>

                {(() => {
                  const targetEid = String(actionEmployee?.employee_id || '').trim();
                  const acc = accountByEmployee.get(targetEid);
                  const hasAcc = Boolean(acc?.account_id);
                  if (!hasAcc && onNavigateToAccount) {
                    return (
                      <Pressable
                        onPress={() => {
                          const eid = targetEid;
                          setActionEmployee(null);
                          onNavigateToAccount(eid);
                        }}
                        style={styles.actionModalBtnSecondary}>
                        <Icon name="person" size={16} color="#0284c7" />
                        <Text style={[styles.actionModalBtnSecondaryText, {color: '#0284c7'}]}>Đăng ký TK app</Text>
                      </Pressable>
                    );
                  }
                  return null;
                })()}

                {actionEmployee?.has_local_image || actionEmployee?.local_image_token || actionEmployee?.local_image_base64 ? (
                  <Pressable
                    onPress={() => {
                      const eid = String(actionEmployee?.employee_id || '').trim();
                      runEmployeeAction('push', eid);
                    }}
                    style={styles.actionModalBtnSecondary}>
                    {workingEmployeeId === String(actionEmployee?.employee_id || '').trim() ? (
                      <ActivityIndicator color="#0284c7" size="small" />
                    ) : (
                      <>
                        <Icon name="cloud_upload" size={16} color="#0284c7" />
                        <Text style={[styles.actionModalBtnSecondaryText, {color: '#0284c7'}]}>Push lên ERP</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={() => {
                    const eid = String(actionEmployee?.employee_id || '').trim();
                    confirmEmployeeAction('clear', eid);
                  }}
                  style={styles.actionModalBtnWarning}>
                  <Icon name="delete" size={16} color="#b45309" />
                  <Text style={styles.actionModalBtnWarningText}>Xóa khuôn mặt</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    const eid = String(actionEmployee?.employee_id || '').trim();
                    setActionEmployee(null);
                    confirmEmployeeAction('delete', eid);
                  }}
                  style={styles.actionModalBtnDanger}>
                  <Icon name="delete_forever" size={16} color="#dc2626" />
                  <Text style={styles.actionModalBtnDangerText}>Xóa khỏi offline</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={updateModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            stopAutoScan();
            setUpdateModalVisible(false);
          }}>
          <View style={styles.modalOverlayCenter}>
            <View style={[styles.faceUpdateModalCard, {maxHeight: '92%'}]}>
              <View style={styles.moduleHeaderRowCompact}>
                <View style={styles.moduleHeaderTextWrap}>
                  <Text style={styles.moduleTitle}>
                    {registerMode === 'scanning' ? 'Đăng ký khuôn mặt' : 'Sửa ảnh khuôn mặt'}
                  </Text>
                  <Text style={styles.moduleSubtitle}>
                    {toSafeText(selectedEmployee?.employee_id || employeeId, 'Chưa chọn nhân viên')}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    stopAutoScan();
                    setUpdateModalVisible(false);
                  }}
                  disabled={updateLoading}
                  style={styles.sidebarCloseButton}>
                  <Text style={styles.sidebarCloseText}>Đóng</Text>
                </Pressable>
              </View>
              <View style={styles.faceUpdateModalBody}>
                {registerMode === 'idle' ? (
                  <View style={{alignItems: 'center', gap: spacing.md}}>
                    <View style={styles.employeeThumbPlaceholder}>
                      <Icon name="person" size={36} color={colors.textMuted} />
                    </View>
                    <Text style={styles.rowTitle}>
                      {toSafeText(selectedEmployee?.name || employeeId)}
                    </Text>
                    <Text style={styles.rowMeta}>
                      Mã NV: {toSafeText(selectedEmployee?.employee_id || employeeId)}
                    </Text>
                    <Text style={styles.rowMeta}>
                      Phòng ban: {toSafeText(selectedEmployee?.department)}
                    </Text>
                    <Text style={styles.rowMeta}>
                      Trạng thái: {toSafeText(selectedEmployee?.status_text, 'Chưa rõ')}
                    </Text>
                    <Pressable
                      onPress={startAutoScan}
                      style={styles.primaryButton}>
                      <Text style={styles.primaryButtonText}>Bắt đầu đăng ký mặt</Text>
                    </Pressable>
                  </View>
                ) : registerMode === 'scanning' ? (
                  <View style={{alignItems: 'center', gap: spacing.md}}>
                    <View style={[styles.cameraWrap, {
                      width: '100%',
                      aspectRatio: 1,
                      maxHeight: 320,
                      borderRadius: border.radius.xl,
                      borderWidth: 2,
                      borderColor: '#10b981',
                      overflow: 'hidden',
                      position: 'relative',
                    }]}>
                      <Camera
                        ref={cameraRef}
                        style={StyleSheet.absoluteFill}
                        cameraType={CameraType.Front}
                        zoomMode="off"
                        focusMode="on"
                        flashMode="off"
                        shutterPhotoSound={false}
                      />

                      {/* Sci-Fi Target Corner Brackets */}
                      <View style={{position: 'absolute', top: 12, left: 12, width: 24, height: 24, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#10b981', borderTopLeftRadius: 6}} />
                      <View style={{position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#10b981', borderTopRightRadius: 6}} />
                      <View style={{position: 'absolute', bottom: 12, left: 12, width: 24, height: 24, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#10b981', borderBottomLeftRadius: 6}} />
                      <View style={{position: 'absolute', bottom: 12, right: 12, width: 24, height: 24, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#10b981', borderBottomRightRadius: 6}} />

                      {/* Biometric Studio Solid Reticle */}
                      <View style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <View style={{
                          width: '68%',
                          aspectRatio: 1,
                          borderRadius: 999,
                          borderWidth: 2.5,
                          borderColor: '#10b981',
                          backgroundColor: 'rgba(16, 185, 129, 0.08)',
                          shadowColor: '#10b981',
                          shadowRadius: 10,
                          shadowOpacity: 0.7,
                          elevation: 6,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <View style={{
                            width: '85%',
                            aspectRatio: 1,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: 'rgba(255, 255, 255, 0.3)',
                          }} />
                        </View>

                        {/* Sweeping Laser Line */}
                        <Animated.View
                          style={{
                            position: 'absolute',
                            left: '16%',
                            right: '16%',
                            height: 2.5,
                            backgroundColor: '#10b981',
                            shadowColor: '#10b981',
                            shadowRadius: 8,
                            shadowOpacity: 1,
                            elevation: 8,
                            transform: [{
                              translateY: scanLineAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-100, 100],
                              }),
                            }],
                          }}
                        />
                      </View>

                      {/* Studio Live Badge */}
                      <View style={{
                        position: 'absolute',
                        top: 14,
                        right: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: 'rgba(2, 6, 23, 0.85)',
                        borderWidth: 1,
                        borderColor: '#10b981',
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      }}>
                        <View style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          backgroundColor: '#10b981',
                        }} />
                        <Text style={{color: '#34d399', fontSize: 10.5, fontWeight: '800'}}>
                          STUDIO ENROLL
                        </Text>
                      </View>
                    </View>

                    {/* Studio Biometric Quality Meter Bar */}
                    <View style={{
                      width: '100%',
                      backgroundColor: '#0f172a',
                      borderRadius: border.radius.lg,
                      borderWidth: 1,
                      borderColor: 'rgba(51, 65, 85, 0.7)',
                      padding: spacing.md,
                      gap: 6,
                    }}>
                      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                          <Icon name="face-recognition" size={15} color="#34d399" />
                          <Text style={{color: '#f8fafc', fontSize: 12, fontWeight: '800'}}>
                            Chất lượng ảnh: 98/100 - Đạt chuẩn
                          </Text>
                        </View>
                        <Text style={{color: '#34d399', fontSize: 11, fontWeight: '800'}}>
                          HOÀN HẢO
                        </Text>
                      </View>

                      {/* Glowing Progress Track */}
                      <View style={{
                        height: 6,
                        backgroundColor: 'rgba(255, 255, 255, 0.15)',
                        borderRadius: 999,
                        overflow: 'hidden',
                      }}>
                        <View style={{
                          width: '98%',
                          height: '100%',
                          backgroundColor: '#10b981',
                          borderRadius: 999,
                        }} />
                      </View>

                      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2}}>
                        <Text style={{color: '#94a3b8', fontSize: 11}}>
                          Ánh sáng: <Text style={{color: '#34d399', fontWeight: '700'}}>Tốt (92%)</Text>
                        </Text>
                        <Text style={{color: '#94a3b8', fontSize: 11}}>
                          Khoảng cách: <Text style={{color: '#34d399', fontWeight: '700'}}>Chuẩn (45cm)</Text>
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.rowMeta, {textAlign: 'center', fontWeight: '700', color: colors.primary}]}>
                      {scanMessage || 'Giữ khuôn mặt ổn định trong vòng tròn để hệ thống lưu mẫu sinh trắc...'}
                    </Text>

                    <Pressable
                      onPress={() => {
                        stopAutoScan();
                        setRegisterMode('idle');
                      }}
                      style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Hủy quét</Text>
                    </Pressable>
                  </View>
                ) : registerMode === 'success' ? (
                  <View style={{alignItems: 'center', gap: spacing.md}}>
                    <Icon name="success" size={64} color={colors.success} />
                    <Text style={[styles.rowTitle, {color: colors.success}]}>
                      Đăng ký thành công!
                    </Text>
                    <Text style={styles.rowMeta}>{scanMessage}</Text>
                    <Pressable
                      onPress={() => {
                        stopAutoScan();
                        setUpdateModalVisible(false);
                        setRegisterMode('idle');
                      }}
                      style={styles.primaryButton}>
                      <Text style={styles.primaryButtonText}>Hoàn tất</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{alignItems: 'center', gap: spacing.md}}>
                    <Icon name="error" size={64} color={colors.danger} />
                    <Text style={[styles.rowTitle, {color: colors.danger}]}>
                      Đăng ký thất bại
                    </Text>
                    <Text style={styles.rowMeta}>{scanMessage}</Text>
                    <Pressable
                      onPress={() => setRegisterMode('idle')}
                      style={styles.primaryButton}>
                      <Text style={styles.primaryButtonText}>Thử lại</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ModuleBox>
  );
}

function ReportModule({hideHeader = false}: {hideHeader?: boolean} = {}) {
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [endDate, setEndDate] = useState(todayIsoDate());
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState(false);

  function getRowId(row: any): string {
    return String(row?.attendance_id || row?.id || `${row?.employee_id || ''}_${row?.check_in_time || row?.check_out_time || ''}`);
  }

  function toggleSelect(rowId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(prev => {
      if (prev.size === rows.length && rows.length > 0) {
        return new Set<string>();
      }
      return new Set(rows.map(r => getRowId(r)));
    });
  }

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const {start, end} = normalizeDateRange(startDate, endDate);
      const [response, localRows] = await Promise.all([
        api.getReport({start_date: start, end_date: end, sync_status: 'pending'}).catch((error: any) => ({success: false, error})),
        getLocalAttendanceRange(start, end, 500).catch(() => []),
      ]);
      const serverRows = response?.success && Array.isArray(response.records)
        ? response.records.filter((row: any) => !isMobileAttendanceErpSynced(row))
        : [];
      const pendingLocalRows = localRows.filter(row => !isMobileAttendanceErpSynced(row));
      if (serverRows.length > 0) {
        await upsertMobileAttendanceRecords(serverRows).catch(() => {});
      }
      const mergedRows = mergeAttendanceDisplayRows(serverRows, pendingLocalRows);
      setRows(mergedRows);
      setSummary(buildAttendanceSummary(mergedRows));
      setStatusText(
        response?.success
          ? ''
          : 'Khong doc duoc bao cao server, dang hien du lieu SQLite local tren thiet bi.',
      );
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate]);

  async function pushReport() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setStatusText('Vui lòng chọn ít nhất một bản ghi để đẩy ERP.');
      return;
    }
    setPushing(true);
    try {
      const selectedRows = rows.filter(row => ids.includes(getRowId(row)));
      const serverIds = selectedRows
        .map(row => String(row?.attendance_id || '').trim())
        .filter(Boolean);
      const localRecords = selectedRows
        .filter(row => !row?.attendance_id || row?.local_only)
        .map(row => ({
          ...row,
          record_key: row?.record_key || getRowId(row),
        }));
      const response = await api.pushReportToErp({
        attendance_ids: serverIds,
        local_records: localRecords,
      });
      const skippedInternal = Array.isArray(response?.result?.skipped_internal)
        ? response.result.skipped_internal
        : [];
      const skippedSet = new Set(skippedInternal.map((value: any) => String(value).trim().toUpperCase()));
      const failedDetails = Array.isArray(response?.result?.failed_details)
        ? response.result.failed_details
        : [];
      const pushedKeys = new Set(
        (Array.isArray(response?.result?.pushed_record_keys)
          ? response.result.pushed_record_keys
          : Array.isArray(response?.result?.pushed_attendance_ids)
            ? response.result.pushed_attendance_ids
            : [])
          .map((value: any) => String(value).trim()),
      );
      const failedKeys = new Set(
        (Array.isArray(response?.result?.failed_record_keys)
          ? response.result.failed_record_keys
          : Array.isArray(response?.result?.failed_attendance_ids)
            ? response.result.failed_attendance_ids
            : [])
          .map((value: any) => String(value).trim()),
      );
      const successfulRows = selectedRows.filter(row => {
        const rowKey = getRowId(row);
        const employeeId = String(row?.employee_id || '').trim().toUpperCase();
        if (!employeeId || skippedSet.has(employeeId) || failedKeys.has(rowKey)) {
          return false;
        }
        if (pushedKeys.size > 0) {
          return pushedKeys.has(rowKey)
            || pushedKeys.has(String(row?.attendance_id || '').trim())
            || pushedKeys.has(String(row?.record_key || '').trim());
        }
        if (row?.local_only || !row?.attendance_id) {
          return false;
        }
        return response?.success === true && Number(response?.result?.failed || 0) === 0;
      });
      await Promise.all(
        successfulRows.map(row => deleteMobileAttendanceRecord(
          row?.record_key,
          row?.id,
          row?.attendance_id,
        )),
      );
      if (successfulRows.length > 0) {
        const removedKeys = new Set(successfulRows.map(row => getRowId(row)));
        const remainingRows = rows.filter(row => !removedKeys.has(getRowId(row)));
        setRows(remainingRows);
        setSummary(buildAttendanceSummary(remainingRows));
        setSelectedIds(current => {
          const next = new Set(current);
          successfulRows.forEach(row => next.delete(getRowId(row)));
          return next;
        });
      }
      const skippedText = skippedInternal.length > 0
        ? `\nBỏ qua nhân viên nội bộ không có trên ERP: ${skippedInternal.join(', ')}`
        : '';
      const failedText = failedDetails.length > 0
        ? `\nCòn lại ${failedDetails.length} sự kiện lỗi để đồng bộ lại.`
        : '';
      setStatusText(
        `${response?.message || formatJson(response)}${skippedText}${failedText}`
        + (successfulRows.length > 0 ? `\nĐã xoá ${successfulRows.length} bản ghi đã đồng bộ khỏi hàng chờ.` : ''),
      );
    } catch (error: any) {
      setStatusText(error?.message || 'Lỗi khi đẩy ERP');
    } finally {
      setPushing(false);
    }
  }

  useEffect(() => {
    loadReport().catch(() => {});
  }, [loadReport]);

  return (
    <ModuleBox
      title="Báo cáo chấm công nội bộ"
      subtitle="Lọc dữ liệu, kiểm tra nhanh trước khi đẩy ERP"
      hideHeader={hideHeader}>
      <View style={styles.moduleList}>
        <View style={styles.inlineRow}>
          <View style={styles.fieldColumn}>
            <DatePickerField
              value={startDate}
              onChange={setStartDate}
              label="Từ ngày"
            />
          </View>
          <View style={styles.fieldColumn}>
            <DatePickerField
              value={endDate}
              onChange={setEndDate}
              label="Đến ngày"
            />
          </View>
        </View>
        <View style={styles.inlineRow}>
          <Pressable onPress={loadReport} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Tải báo cáo</Text>
          </Pressable>
          <Pressable
            onPress={pushReport}
            disabled={pushing || selectedIds.size === 0}
            style={[styles.primaryButtonFlex, (pushing || selectedIds.size === 0) && styles.buttonDisabled]}>
            <Text style={styles.primaryButtonText}>
              {pushing ? 'Đang đẩy...' : selectedIds.size > 0 ? `Đẩy ERP (${selectedIds.size})` : 'Push ERP'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              // 1. Get unique employees
              const employeesMap: Record<string, string> = {};
              rows.forEach(r => {
                const id = r.employee_id || '';
                const name = r.name || r.employee_name || 'N/A';
                if (id) employeesMap[id] = name;
              });

              const employeeIds = Object.keys(employeesMap).sort((a, b) =>
                employeesMap[a].localeCompare(employeesMap[b], 'vi')
              );

              const parseDate = (dStr: string) => {
                if (dStr.includes('-')) {
                  const [y, m, d] = dStr.split('-').map(Number);
                  return new Date(y, m - 1, d);
                }
                const [d, m, y] = dStr.split('/').map(Number);
                return new Date(y, m - 1, d);
              };

              const formatDate = (dateObj: Date) => {
                const d = String(dateObj.getDate()).padStart(2, '0');
                const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                const y = dateObj.getFullYear();
                return `${d}/${m}/${y}`;
              };

              // 2. Generate all dates in range
              const dateList: string[] = [];
              const startObj = parseDate(startDate);
              const endObj = parseDate(endDate);

              if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) {
                dateList.push(startDate);
              } else {
                let current = new Date(startObj);
                while (current <= endObj) {
                  dateList.push(formatDate(current));
                  current.setDate(current.getDate() + 1);
                }
              }

              // 3. Group scans by employee_id and date
              const scanMap: Record<string, Set<string>> = {};
              rows.forEach(r => {
                const rawDate = r.attendance_date || r.date || '';
                if (!rawDate) return;

                // Ensure date is in DD/MM/YYYY for matching
                let dateKey = rawDate;
                if (rawDate.includes('-')) {
                  const [y, m, d] = rawDate.split('-').map(Number);
                  dateKey = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
                }

                const id = r.employee_id || '';
                if (!id) return;

                const key = `${id}_${dateKey}`;
                if (!scanMap[key]) scanMap[key] = new Set();

                const t = r.check_in_time || r.check_out_time || r.time || r.attendance_time;
                if (t) scanMap[key].add(t);
              });

              // 4. Build export rows including empty ones
              const exportRows: ExportRow[] = [];
              let stt = 1;
              const dayLabels = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
              employeeIds.forEach(id => {
                dateList.forEach(dateStr => {
                  const key = `${id}_${dateStr}`;
                  const times = scanMap[key] ? Array.from(scanMap[key]).sort().join(' | ') : '';

                  // Get day for the new column
                  const [d, m, y] = dateStr.split('/').map(Number);
                  const dateObj = new Date(y, m - 1, d);
                  const thu = dayLabels[dateObj.getDay()];

                  exportRows.push({
                    'STT': stt++,
                    'Thứ': thu,
                    'Ngày': dateStr,
                    'Mã NV': id,
                    'Tên': employeesMap[id],
                    'Giờ quét': times,
                  });
                });
              });

              const displayStart = formatDate(startObj);
              const displayEnd = formatDate(endObj);
              const reportTitle = `BÁO CÁO CHẤM CÔNG NỘI BỘ\nTừ ngày ${displayStart} đến ngày ${displayEnd}`;

              Alert.alert('Chọn định dạng xuất', 'Xuất báo cáo dưới định dạng:', [
                {
                  text: 'CSV',
                  onPress: () => exportReportFile(exportRows, `bao-cao-cham-cong-${startDate}-${endDate}`, 'csv', reportTitle)
                },
                {
                  text: 'Excel',
                  onPress: () => exportReportFile(exportRows, `bao-cao-cham-cong-${startDate}-${endDate}`, 'excel', reportTitle)
                },
                {
                  text: 'PDF',
                  onPress: () => exportReportFile(exportRows, `bao-cao-cham-cong-${startDate}-${endDate}`, 'pdf', reportTitle)
                },
                {text: 'Hủy', style: 'cancel'}
              ]);
            }}
            style={styles.smallButton}>
            <Text style={styles.smallButtonText}>Xuất File</Text>
          </Pressable>
        </View>
        {statusText ? <Text style={styles.statusInfoText}>{statusText}</Text> : null}
        {summary ? (
          <View style={styles.storageGrid}>
            <View style={[styles.storageCard, {backgroundColor: colors.infoBg}]}>
              <Text style={styles.storageLabel}>Tổng bản ghi</Text>
              <Text style={styles.storageValue}>{Number(summary?.total_records || summary?.total || rows.length || 0)}</Text>
            </View>
            <View style={[styles.storageCard, {backgroundColor: colors.successBg}]}>
              <Text style={styles.storageLabel}>Nhân viên</Text>
              <Text style={styles.storageValue}>{Number(summary?.unique_employees || summary?.employees || 0)}</Text>
            </View>
            <View style={[styles.storageCard, {backgroundColor: colors.warningBg}]}>
              <Text style={styles.storageLabel}>Có checkin</Text>
              <Text style={styles.storageValue}>{Number(summary?.checkin_count || summary?.present || 0)}</Text>
            </View>
            <View style={[styles.storageCard, {backgroundColor: colors.dangerBg}]}>
              <Text style={styles.storageLabel}>Có checkout</Text>
              <Text style={styles.storageValue}>{Number(summary?.checkout_count || summary?.checked_out || 0)}</Text>
            </View>
          </View>
        ) : null}
        <Text style={styles.blockTitle}>Bản ghi</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={styles.simpleList}>
            {rows.length === 0 ? (
              <Text style={styles.mutedText}>Không có dữ liệu.</Text>
            ) : (
              <View>
                <Pressable
                  onPress={toggleSelectAll}
                  style={styles.selectAllRow}>
                  <View
                    style={[
                      styles.checkbox,
                      selectedIds.size === rows.length && rows.length > 0 && styles.checkboxActive,
                    ]}>
                    {selectedIds.size === rows.length && rows.length > 0 ? (
                      <View style={styles.checkboxInner} />
                    ) : null}
                  </View>
                  <Text style={styles.selectAllText}>
                    {selectedIds.size > 0
                      ? `Đã chọn ${selectedIds.size}/${rows.length}`
                      : 'Chọn tất cả'}
                  </Text>
                </Pressable>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={[styles.tableWrap, {minWidth: 480}]}>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableCell, styles.tableCellCb]} />
                      <Text style={[styles.tableCell, styles.tableCellId]}>Mã NV</Text>
                      <Text style={[styles.tableCell, styles.tableCellName, {width: 100}]}>Tên</Text>
                      <Text style={[styles.tableCell, styles.tableCellDate]}>Ngày</Text>
                      <Text style={[styles.tableCell, styles.tableCellTime]}>Check-in</Text>
                      <Text style={[styles.tableCell, styles.tableCellTime]}>Check-out</Text>
                      <Text style={[styles.tableCell, styles.tableCellFlex]}>Vị trí</Text>
                    </View>
                    {rows.slice(0, 120).map((row, index) => {
                      const rowId = getRowId(row);
                      const checked = selectedIds.has(rowId);
                      return (
                        <Pressable
                          key={buildStableKey('report-row', row?.attendance_id || row?.id || row?.employee_id, index)}
                          onPress={() => toggleSelect(rowId)}
                          style={[
                            styles.tableRow,
                            index % 2 === 0 && styles.tableRowEven,
                            checked && styles.tableRowSelected,
                          ]}>
                          <View style={[styles.tableCell, styles.tableCellCb]}>
                            <View style={[styles.checkbox, checked && styles.checkboxActive]}>
                              {checked ? <View style={styles.checkboxInner} /> : null}
                            </View>
                          </View>
                          <Text style={[styles.tableCell, styles.tableCellId]} numberOfLines={1}>
                            {toSafeText(row?.employee_id)}
                          </Text>
                          <Text style={[styles.tableCell, styles.tableCellName, {width: 100}]} numberOfLines={1}>
                            {toSafeText(row?.name)}
                          </Text>
                          <Text style={[styles.tableCell, styles.tableCellDate]}>
                            {toSafeText(row?.date || row?.attendance_date)}
                          </Text>
                          <Text style={[styles.tableCell, styles.tableCellTime]}>
                            {toSafeText(row?.check_in_time)}
                          </Text>
                          <Text style={[styles.tableCell, styles.tableCellTime]}>
                            {toSafeText(row?.check_out_time)}
                          </Text>
                          <Text style={[styles.tableCell, styles.tableCellFlex]} numberOfLines={1}>
                            {toSafeText(row?.check_in_location_text || row?.check_out_location_text)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </View>
    </ModuleBox>
  );
}

function OnlineAttendanceModule({hideHeader = false}: {hideHeader?: boolean} = {}) {
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [endDate, setEndDate] = useState(todayIsoDate());
  const [employeeId, setEmployeeId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [attendanceType, setAttendanceType] = useState<'all' | 'IN' | 'OUT'>('all');
  const [rows, setRows] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const {start, end} = normalizeDateRange(startDate, endDate);
      const response = await api.getOnlineAttendance({
        start_date: start,
        end_date: end,
        employee_id: employeeId,
        keyword,
        attendance_type: attendanceType,
        sort_by: 'time',
        sort_dir: 'desc',
        page_size: 100,
      });
      if (response?.success) {
        setRows(Array.isArray(response.records) ? response.records : []);
        setTotalRows(Number(response?.meta?.total || response.records?.length || 0));
      } else {
        setRows([]);
        setTotalRows(0);
      }
    } finally {
      setLoading(false);
    }
  }, [attendanceType, endDate, employeeId, keyword, startDate]);

  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData]);

  return (
    <ModuleBox
      title="Báo cáo chấm công đã đồng bộ"
      subtitle="Dữ liệu đã đẩy lên ERP"
      hideHeader={hideHeader}>
      <View style={styles.moduleList}>
        <View style={styles.inlineRow}>
          <View style={styles.fieldColumn}>
            <DatePickerField
              value={startDate}
              onChange={setStartDate}
              label="Từ ngày"
            />
          </View>
          <View style={styles.fieldColumn}>
            <DatePickerField
              value={endDate}
              onChange={setEndDate}
              label="Đến ngày"
            />
          </View>
        </View>
        <View style={styles.inlineRow}>
          <TextInput
            style={[styles.input, {flex: 1}]}
            value={employeeId}
            onChangeText={setEmployeeId}
            placeholder="Mã nhân viên"
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={[styles.input, {flex: 1}]}
            value={keyword}
            onChangeText={setKeyword}
            placeholder="Từ khóa (nguồn/camera)"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.inlineRow}>
          <Pressable
            onPress={() => setAttendanceType('all')}
            style={[
              styles.toggleButton,
              attendanceType === 'all' && styles.toggleButtonActive,
            ]}>
            <Text style={styles.toggleButtonText}>Tất cả</Text>
          </Pressable>
          <Pressable
            onPress={() => setAttendanceType('IN')}
            style={[
              styles.toggleButton,
              attendanceType === 'IN' && styles.toggleButtonActive,
            ]}>
            <Text style={styles.toggleButtonText}>IN</Text>
          </Pressable>
          <Pressable
            onPress={() => setAttendanceType('OUT')}
            style={[
              styles.toggleButton,
              attendanceType === 'OUT' && styles.toggleButtonActive,
            ]}>
            <Text style={styles.toggleButtonText}>OUT</Text>
          </Pressable>
          <Pressable onPress={loadData} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Tải dữ liệu</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              // 1. Get unique employees
              const employeesMap: Record<string, string> = {};
              rows.forEach(r => {
                const id = r.employee_id || '';
                const name = r.name || r.employee_name || 'N/A';
                if (id) employeesMap[id] = name;
              });

              const employeeIds = Object.keys(employeesMap).sort((a, b) =>
                employeesMap[a].localeCompare(employeesMap[b], 'vi')
              );

              const parseDate = (dStr: string) => {
                if (dStr.includes('-')) {
                  const [y, m, d] = dStr.split('-').map(Number);
                  return new Date(y, m - 1, d);
                }
                const [d, m, y] = dStr.split('/').map(Number);
                return new Date(y, m - 1, d);
              };

              const formatDate = (dateObj: Date) => {
                const d = String(dateObj.getDate()).padStart(2, '0');
                const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                const y = dateObj.getFullYear();
                return `${d}/${m}/${y}`;
              };

              // 2. Generate all dates in range
              const dateList: string[] = [];
              const startObj = parseDate(startDate);
              const endObj = parseDate(endDate);

              if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) {
                dateList.push(startDate);
              } else {
                let current = new Date(startObj);
                while (current <= endObj) {
                  dateList.push(formatDate(current));
                  current.setDate(current.getDate() + 1);
                }
              }

              // 3. Group scans
              const scanMap: Record<string, Set<string>> = {};
              rows.forEach(r => {
                const rawDate = r.attendance_date || r.date || '';
                if (!rawDate) return;

                // Ensure date is in DD/MM/YYYY for matching
                let dateKey = rawDate;
                if (rawDate.includes('-')) {
                  const [y, m, d] = rawDate.split('-').map(Number);
                  dateKey = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
                }

                const id = r.employee_id || '';
                if (!id) return;

                const key = `${id}_${dateKey}`;
                if (!scanMap[key]) scanMap[key] = new Set();

                const t = r.time || r.attendance_time;
                if (t) scanMap[key].add(t);
              });

              // 4. Build export rows
              const exportRows: ExportRow[] = [];
              let stt = 1;
              const dayLabels = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
              employeeIds.forEach(id => {
                dateList.forEach(dateStr => {
                  const key = `${id}_${dateStr}`;
                  const times = scanMap[key] ? Array.from(scanMap[key]).sort().join(' | ') : '';

                  // Get day label
                  const [d, m, y] = dateStr.split('/').map(Number);
                  const dateObj = new Date(y, m - 1, d);
                  const thu = dayLabels[dateObj.getDay()];

                  exportRows.push({
                    'STT': stt++,
                    'Thứ': thu,
                    'Ngày': dateStr,
                    'Mã NV': id,
                    'Tên': employeesMap[id],
                    'Giờ quét': times,
                  });
                });
              });

              const displayStart = formatDate(startObj);
              const displayEnd = formatDate(endObj);
              const reportTitle = `BÁO CÁO CHẤM CÔNG ONLINE\nTừ ngày ${displayStart} đến ngày ${displayEnd}`;

              Alert.alert('Chọn định dạng xuất', 'Xuất báo cáo dưới định dạng:', [
                {
                  text: 'CSV',
                  onPress: () => exportReportFile(exportRows, `kiem-tra-online-${startDate}-${endDate}`, 'csv', reportTitle)
                },
                {
                  text: 'Excel',
                  onPress: () => exportReportFile(exportRows, `kiem-tra-online-${startDate}-${endDate}`, 'excel', reportTitle)
                },
                {
                  text: 'PDF',
                  onPress: () => exportReportFile(exportRows, `kiem-tra-online-${startDate}-${endDate}`, 'pdf', reportTitle)
                },
                {text: 'Hủy', style: 'cancel'}
              ]);
            }}
            style={styles.smallButton}>
            <Text style={styles.smallButtonText}>Xuất File</Text>
          </Pressable>
        </View>
        <Text style={styles.mutedText}>Tổng bản ghi online: {totalRows}</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={styles.simpleList}>
            {rows.length === 0 ? (
              <Text style={styles.mutedText}>Không có dữ liệu online.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={[styles.tableWrap, {minWidth: 460}]}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableCell, styles.tableCellId]}>Mã NV</Text>
                    <Text style={[styles.tableCell, styles.tableCellName, {width: 100}]}>Tên</Text>
                    <Text style={[styles.tableCell, styles.tableCellDate]}>Ngày</Text>
                    <Text style={[styles.tableCell, styles.tableCellTime]}>Giờ</Text>
                    <Text style={[styles.tableCell, styles.tableCellType]}>Loại</Text>
                    <Text style={[styles.tableCell, styles.tableCellFlex]}>Nguồn</Text>
                  </View>
                  {rows.slice(0, 120).map((row, index) => (
                    <View
                      key={buildStableKey('online-row', row?.id || row?.employee_id, index)}
                      style={[
                        styles.tableRow,
                        index % 2 === 0 && styles.tableRowEven,
                      ]}>
                      <Text style={[styles.tableCell, styles.tableCellId]} numberOfLines={1}>
                        {toSafeText(row?.employee_id)}
                      </Text>
                      <Text style={[styles.tableCell, styles.tableCellName, {width: 100}]} numberOfLines={1}>
                        {toSafeText(row?.name || row?.employee_name)}
                      </Text>
                      <Text style={[styles.tableCell, styles.tableCellDate]}>
                        {toSafeText(row?.attendance_date || row?.date)}
                      </Text>
                      <Text style={[styles.tableCell, styles.tableCellTime]}>
                        {toSafeText(row?.attendance_time || row?.time)}
                      </Text>
                      <View style={[styles.tableCell, styles.tableCellType, {justifyContent: 'center'}]}>
                        {toSafeText(row?.attendance_type || row?.type).toUpperCase() === 'IN' ? (
                          <View style={styles.tableCellTypeBadgeIn}>
                            <Text style={styles.tableCellTypeBadgeInText}>IN</Text>
                          </View>
                        ) : toSafeText(row?.attendance_type || row?.type).toUpperCase() === 'OUT' ? (
                          <View style={styles.tableCellTypeBadgeOut}>
                            <Text style={styles.tableCellTypeBadgeOutText}>OUT</Text>
                          </View>
                        ) : (
                          <Text style={styles.tableCell} numberOfLines={1}>
                            {toSafeText(row?.attendance_type || row?.type)}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.tableCell, styles.tableCellFlex]} numberOfLines={1}>
                        {toSafeText(row?.source || row?.camera_ip)}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}
      </View>
    </ModuleBox>
  );
}

function AccountModule({highlightEmployeeId = ''}: {highlightEmployeeId?: string}) {
  const {isMobile} = useResponsive();
  const [mergedRows, setMergedRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [searchText, setSearchText] = useState(() => highlightEmployeeId || '');
  const [savingAccountId, setSavingAccountId] = useState('');

  const [upsertModalVisible, setUpsertModalVisible] = useState(false);
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');

  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetPassword, setResetPassword] = useState('');

  const [accountFilterTab, setAccountFilterTab] = useState<'all' | 'has_account' | 'no_account' | 'locked'>('all');

  // When highlightEmployeeId changes (from ManageFaces), pre-fill search and scroll
  useEffect(() => {
    if (highlightEmployeeId) {
      setSearchText(highlightEmployeeId);
    }
  }, [highlightEmployeeId]);

  const filteredRows = useMemo(() => {
    let list = mergedRows;
    if (accountFilterTab === 'has_account') {
      list = list.filter(r => r.has_account && !r.is_locked);
    } else if (accountFilterTab === 'no_account') {
      list = list.filter(r => !r.has_account);
    } else if (accountFilterTab === 'locked') {
      list = list.filter(r => r.is_locked);
    }

    const keyword = searchText.trim().toLowerCase();
    if (!keyword) {
      return list;
    }
    return list.filter(row => {
      const haystack = [
        row.employee_id,
        row.name,
        row.department,
        row.position,
        row.username,
      ]
        .map(value => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(keyword);
    });
  }, [accountFilterTab, mergedRows, searchText]);

  const mergeEmployeesWithAccounts = useCallback((employees: any[], accounts: any[]) => {
    const accountByEmployee = new Map<string, any>();
    for (const acc of accounts) {
      const eid = String(acc?.employee_id || '').trim();
      if (eid) {
        accountByEmployee.set(eid, acc);
      }
    }

    return employees.map(emp => {
      const eid = String(emp?.employee_id || emp?.code || '').trim();
      const account = accountByEmployee.get(eid);
      return {
        employee_id: eid,
        name: String(emp?.name || account?.name || '').trim(),
        department: String(emp?.department || account?.department || '').trim(),
        position: String(emp?.position || '').trim(),
        has_account: Boolean(account?.account_id || account?.id),
        account_id: account?.account_id || account?.id || '',
        username: account?.username || '',
        is_locked: Boolean(account?.is_locked),
        failed_attempts: Number(account?.failed_attempts || 0),
        _account: account || null,
        _employee: emp || null,
      };
    });
  }, []);

  async function loadData(options?: {skipLoad?: boolean}) {
    if (options?.skipLoad) {
      return;
    }
    setLoading(true);
    setStatusText('');
    try {
      await initializeMobileLocalDataStore();
      const [employees, accounts] = await Promise.all([
        getLocalEmployees(500),
        getLocalAccounts(200),
      ]);
      setMergedRows(mergeEmployeesWithAccounts(employees, accounts));
    } catch (error) {
      setMergedRows([]);
      setStatusText(error instanceof Error ? error.message : 'Không tải được dữ liệu local.');
    } finally {
      setLoading(false);
    }
  }

  function openUpsertModal(row: any) {
    setSelectedRow(row);
    setFormUsername(String(row?.username || row?.employee_id || '').trim());
    setFormPassword('');
    setUpsertModalVisible(true);
    setStatusText('');
  }

  async function submitUpsert() {
    const username = formUsername.trim();
    const password = formPassword.trim();
    if (!selectedRow?.employee_id) {
      setStatusText('Không tìm thấy nhân viên để tạo tài khoản.');
      return;
    }
    if (!username || !password) {
      setStatusText('Nhập username và mật khẩu.');
      return;
    }

    const saveKey = String(selectedRow.account_id || selectedRow.employee_id);
    setSavingAccountId(saveKey);
    try {
      const response = await api.upsertEmployeeAccount({
        user_id: selectedRow._account?.user_id,
        employee_id: selectedRow.employee_id,
        username,
        password,
      });
      setStatusText(response?.message || 'Đã lưu tài khoản nhân viên.');
      if (response?.success) {
        setUpsertModalVisible(false);
        await syncMobileAccountsFromServer();
        await loadData();
        return;
      }
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Không thể tạo tài khoản.');
    } finally {
      setSavingAccountId('');
    }
  }

  function openResetModal(row: any) {
    if (!row?.account_id) {
      setStatusText('Tài khoản này chưa có account ID.');
      return;
    }
    setSelectedRow(row);
    setResetPassword('');
    setResetModalVisible(true);
    setStatusText('');
  }

  async function submitReset() {
    const normalizedPassword = resetPassword.trim();
    if (!selectedRow?.account_id || !normalizedPassword) {
      setStatusText('Nhập mật khẩu mới.');
      return;
    }
    setSavingAccountId(String(selectedRow.account_id));
    try {
      const response = await api.resetEmployeeAccountPassword(
        String(selectedRow.account_id),
        normalizedPassword,
      );
      setStatusText(response?.message || 'Đã reset mật khẩu.');
      if (response?.success) {
        setResetModalVisible(false);
        await syncMobileAccountsFromServer();
        await loadData();
        return;
      }
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Không thể reset mật khẩu.');
    } finally {
      setSavingAccountId('');
    }
  }

  async function toggleLock(row: any) {
    const normalizedAccountId = String(row?.account_id || '').trim();
    if (!normalizedAccountId) {
      setStatusText('Tài khoản này chưa có account ID.');
      return;
    }
    setSavingAccountId(normalizedAccountId);
    try {
      const response = await api.setEmployeeAccountLock(
        normalizedAccountId,
        !row?.is_locked,
      );
      setStatusText(response?.message || 'Đã cập nhật trạng thái tài khoản.');
      if (response?.success) {
        await syncMobileAccountsFromServer();
        await loadData();
        return;
      }
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Không thể thay đổi trạng thái.');
    } finally {
      setSavingAccountId('');
    }
  }

  function confirmToggleLock(row: any) {
    if (!row?.account_id) {
      setStatusText('Tài khoản này chưa có account ID.');
      return;
    }
    Alert.alert(
      'Xác nhận',
      `${row?.is_locked ? 'Mở khóa' : 'Khóa'} tài khoản ${row?.username || row?.employee_id}?`,
      [
        {text: 'Hủy', style: 'cancel'},
        {
          text: row?.is_locked ? 'Mở khóa' : 'Khóa',
          style: row?.is_locked ? 'default' : 'destructive',
          onPress: () => toggleLock(row).catch(() => {}),
        },
      ],
    );
  }

  useEffect(() => {
    initializeMobileLocalDataStore().catch(() => {});
    loadData().catch(() => {});
    // loadData is intentionally scoped to this module instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalWithAccount = mergedRows.filter(r => r.has_account && !r.is_locked).length;
  const totalWithoutAccount = mergedRows.filter(r => !r.has_account).length;
  const totalLocked = mergedRows.filter(r => r.is_locked).length;

  return (
    <ModuleBox
      title="Tài khoản & Phân quyền"
      subtitle="Quản lý thông tin tài khoản đăng nhập và trạng thái nhân viên"
      rightSlot={null}>
      <View style={styles.moduleList}>
        {/* KPI Bento summary */}
        <View style={[styles.accKpiRow, isMobile && styles.accKpiRowMobile]}>
          <View style={[styles.accKpiCard, isMobile && styles.accKpiCardMobile]}>
            <View style={[styles.accKpiIconWrap, isMobile && styles.accKpiIconWrapMobile, {backgroundColor: '#eff6ff'}]}>
              <Icon name="people" size={isMobile ? 15 : 18} color="#1d4ed8" />
            </View>
            <View style={isMobile && {alignItems: 'center'}}>
              <Text style={[styles.accKpiValue, isMobile && styles.accKpiValueMobile]}>{mergedRows.length}</Text>
              <Text style={styles.accKpiLabel} numberOfLines={1}>Tổng NV</Text>
            </View>
          </View>

          <View style={[styles.accKpiCard, isMobile && styles.accKpiCardMobile]}>
            <View style={[styles.accKpiIconWrap, isMobile && styles.accKpiIconWrapMobile, {backgroundColor: '#ecfdf5'}]}>
              <Icon name="check_circle" size={isMobile ? 15 : 18} color="#059669" />
            </View>
            <View style={isMobile && {alignItems: 'center'}}>
              <Text style={[styles.accKpiValue, isMobile && styles.accKpiValueMobile]}>{totalWithAccount}</Text>
              <Text style={styles.accKpiLabel} numberOfLines={1}>Đã có TK</Text>
            </View>
          </View>

          <View style={[styles.accKpiCard, isMobile && styles.accKpiCardMobile]}>
            <View style={[styles.accKpiIconWrap, isMobile && styles.accKpiIconWrapMobile, {backgroundColor: '#fef3c7'}]}>
              <Icon name="person_add" size={isMobile ? 15 : 18} color="#d97706" />
            </View>
            <View style={isMobile && {alignItems: 'center'}}>
              <Text style={[styles.accKpiValue, isMobile && styles.accKpiValueMobile]}>{totalWithoutAccount}</Text>
              <Text style={styles.accKpiLabel} numberOfLines={1}>Chưa có TK</Text>
            </View>
          </View>
        </View>

        {/* Search bar & Refresh */}
        <View style={styles.accSearchRow}>
          <View style={styles.accSearchBox}>
            <Icon name="search" size={18} color="#94a3b8" />
            <TextInput
              style={styles.accSearchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder={isMobile ? 'Tìm NV, phòng ban, user' : 'Tìm theo mã NV, tên, phòng ban, username'}
              placeholderTextColor="#94a3b8"
            />
            {searchText ? (
              <Pressable onPress={() => setSearchText('')} hitSlop={8}>
                <Icon name="close" size={16} color="#94a3b8" />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            disabled={loading}
            onPress={() => loadData().catch(() => {})}
            style={[styles.accRefreshBtn, isMobile && {paddingHorizontal: 10}]}>
            <Icon name="sync" size={16} color="#0037b0" />
            <Text style={styles.accRefreshBtnText}>Tải lại</Text>
          </Pressable>
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.accFilterChipsRow}>
          <Pressable
            onPress={() => setAccountFilterTab('all')}
            style={[
              styles.accFilterChip,
              accountFilterTab === 'all' && styles.accFilterChipActive,
            ]}>
            <Text
              style={[
                styles.accFilterChipText,
                accountFilterTab === 'all' && styles.accFilterChipTextActive,
              ]}>
              Tất cả ({mergedRows.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setAccountFilterTab('has_account')}
            style={[
              styles.accFilterChip,
              accountFilterTab === 'has_account' && styles.accFilterChipActive,
            ]}>
            <Text
              style={[
                styles.accFilterChipText,
                accountFilterTab === 'has_account' && styles.accFilterChipTextActive,
              ]}>
              Đã có TK ({totalWithAccount})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setAccountFilterTab('no_account')}
            style={[
              styles.accFilterChip,
              accountFilterTab === 'no_account' && styles.accFilterChipActive,
            ]}>
            <Text
              style={[
                styles.accFilterChipText,
                accountFilterTab === 'no_account' && styles.accFilterChipTextActive,
              ]}>
              Chưa có TK ({totalWithoutAccount})
            </Text>
          </Pressable>
          {totalLocked > 0 ? (
            <Pressable
              onPress={() => setAccountFilterTab('locked')}
              style={[
                styles.accFilterChip,
                accountFilterTab === 'locked' && styles.accFilterChipActive,
              ]}>
              <Text
                style={[
                  styles.accFilterChipText,
                  accountFilterTab === 'locked' && styles.accFilterChipTextActive,
                ]}>
                Đang khóa ({totalLocked})
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {statusText ? (
          <StatusMessage
            variant="info"
            message={statusText}
          />
        ) : null}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.centerText}>Đang tải danh sách tài khoản...</Text>
          </View>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon="person-outline"
            title="Không tìm thấy tài khoản phù hợp"
            message="Hãy đồng bộ nhân viên từ hệ thống trước, hoặc thử điều chỉnh từ khóa tìm kiếm."
          />
        ) : (
          <View style={styles.simpleList}>
            {filteredRows.map((row, index) => {
              const rowSaving = savingAccountId === String(row.account_id || row.employee_id);
              const isHighlighted = highlightEmployeeId && String(row.employee_id || '').trim() === String(highlightEmployeeId).trim();
              return (
                <View
                  key={`acc-${row.employee_id}-${index}`}
                  style={[
                    styles.accItemCard,
                    isHighlighted && styles.accItemCardHighlighted,
                  ]}>
                  <View style={styles.accCardHeader}>
                    <View style={styles.accAvatarWrap}>
                      <Text style={styles.accAvatarText}>
                        {(row.name || row.employee_id || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.accInfoWrap}>
                      <View style={styles.accNameRow}>
                        <Text style={styles.accNameText} numberOfLines={1}>
                          {toSafeText(row.name, 'Chưa có tên')}
                        </Text>
                        <View style={styles.accIdBadge}>
                          <Text style={styles.accIdBadgeText}>#{toSafeText(row.employee_id)}</Text>
                        </View>
                      </View>
                      <Text style={styles.accDeptText} numberOfLines={1}>
                        {toSafeText(row.department, 'Chưa phân phòng')}
                        {row.position ? ` • ${toSafeText(row.position)}` : ''}
                      </Text>
                    </View>
                    {row.has_account ? (
                      <View
                        style={[
                          styles.accStatusBadge,
                          row.is_locked ? styles.accStatusBadgeLocked : styles.accStatusBadgeActive,
                        ]}>
                        <Icon
                          name={row.is_locked ? 'lock' : 'check_circle'}
                          size={12}
                          color={row.is_locked ? '#b45309' : '#15803d'}
                        />
                        <Text
                          style={[
                            styles.accStatusBadgeText,
                            row.is_locked ? styles.accStatusBadgeTextLocked : styles.accStatusBadgeTextActive,
                          ]}>
                          {row.is_locked ? 'Đang khóa' : 'Hoạt động'}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.accStatusBadgeNone}>
                        <Text style={styles.accStatusBadgeTextNone}>Chưa có TK</Text>
                      </View>
                    )}
                  </View>

                  {row.has_account ? (
                    <View style={styles.accMetaRow}>
                      <View style={styles.accUsernamePill}>
                        <Icon name="person" size={13} color="#475569" />
                        <Text style={styles.accUsernameText}>
                          {toSafeText(row.username, 'N/A')}
                        </Text>
                      </View>
                      {Number(row.failed_attempts) > 0 ? (
                        <View style={styles.accFailedPill}>
                          <Icon name="warning" size={13} color="#b91c1c" />
                          <Text style={styles.accFailedText}>
                            Sai MK: {row.failed_attempts}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  <View style={styles.accActionsRow}>
                    <Pressable
                      disabled={!row.has_account}
                      onPress={() => openResetModal(row)}
                      style={[
                        styles.accActionBtnSecondary,
                        !row.has_account && styles.buttonDisabled,
                      ]}>
                      <Icon name="vpn_key" size={14} color="#475569" />
                      <Text style={styles.accActionBtnSecondaryText}>Reset MK</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => openUpsertModal(row)}
                      style={[styles.accActionBtnPrimary, rowSaving && styles.buttonDisabled]}>
                      {rowSaving ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Icon
                            name={row.has_account ? 'edit' : 'person_add'}
                            size={14}
                            color="#ffffff"
                          />
                          <Text style={styles.accActionBtnPrimaryText}>
                            {row.has_account ? 'Sửa TK' : 'Cấp TK'}
                          </Text>
                        </>
                      )}
                    </Pressable>

                    <Pressable
                      disabled={!row.has_account}
                      onPress={() => confirmToggleLock(row)}
                      style={[
                        row?.is_locked ? styles.accActionBtnUnlock : styles.accActionBtnLock,
                        !row.has_account && styles.buttonDisabled,
                      ]}>
                      <Icon
                        name={row?.is_locked ? 'lock_open' : 'lock'}
                        size={14}
                        color={row?.is_locked ? '#059669' : '#b91c1c'}
                      />
                      <Text
                        style={
                          row?.is_locked
                            ? styles.accActionBtnUnlockText
                            : styles.accActionBtnLockText
                        }>
                        {row?.is_locked ? 'Mở khóa' : 'Khóa'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Modal
          visible={upsertModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setUpsertModalVisible(false)}>
          <View style={styles.modalOverlayCenter}>
            <View style={styles.faceUpdateModalCard}>
              <View style={styles.moduleHeaderRowCompact}>
                <View style={styles.moduleHeaderTextWrap}>
                  <Text style={styles.moduleTitle}>
                    {selectedRow?.has_account ? 'Sửa tài khoản' : 'Đăng ký tài khoản'}
                  </Text>
                  <Text style={styles.moduleSubtitle}>
                    NV: {toSafeText(selectedRow?.employee_id, 'Chưa chọn')} | {toSafeText(selectedRow?.name)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setUpsertModalVisible(false)}
                  style={styles.sidebarCloseButton}>
                  <Text style={styles.sidebarCloseText}>Đóng</Text>
                </Pressable>
              </View>
              <View style={styles.faceUpdateModalBody}>
                <Input
                  label="Username"
                  value={formUsername}
                  onChangeText={setFormUsername}
                  placeholder="Nhập username đăng nhập"
                />
                <Input
                  label="Mật khẩu"
                  value={formPassword}
                  onChangeText={setFormPassword}
                  placeholder="Nhập mật khẩu mới"
                  secureTextEntry
                />
                <Button
                  title="Lưu tài khoản"
                  variant="primary"
                  size="md"
                  loading={Boolean(savingAccountId)}
                  disabled={Boolean(savingAccountId)}
                  onPress={submitUpsert}
                />
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={resetModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setResetModalVisible(false)}>
          <View style={styles.modalOverlayCenter}>
            <View style={styles.faceUpdateModalCard}>
              <View style={styles.moduleHeaderRowCompact}>
                <View style={styles.moduleHeaderTextWrap}>
                  <Text style={styles.moduleTitle}>Reset mật khẩu</Text>
                  <Text style={styles.moduleSubtitle}>
                    TK: {toSafeText(selectedRow?.username || selectedRow?.employee_id, 'Chưa chọn')}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setResetModalVisible(false)}
                  style={styles.sidebarCloseButton}>
                  <Text style={styles.sidebarCloseText}>Đóng</Text>
                </Pressable>
              </View>
              <View style={styles.faceUpdateModalBody}>
                <Input
                  label="Mật khẩu mới"
                  value={resetPassword}
                  onChangeText={setResetPassword}
                  placeholder="Nhập mật khẩu mới"
                  secureTextEntry
                />
                <Button
                  title="Reset mật khẩu"
                  variant="primary"
                  size="md"
                  loading={Boolean(savingAccountId)}
                  disabled={Boolean(savingAccountId)}
                  onPress={submitReset}
                />
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ModuleBox>
  );
}

function MobileDataModule({hideHeader = false}: {hideHeader?: boolean} = {}) {
  const [summary, setSummary] =
    useState<MobileLocalDataSummary>(EMPTY_LOCAL_DATA_SUMMARY);
  const [employeePage, setEmployeePage] = useState(1);
  const [accountPage, setAccountPage] = useState(1);
  const [attendancePage, setAttendancePage] = useState(1);
  const [employeeData, setEmployeeData] =
    useState<MobileLocalDataPage<any>>(EMPTY_LOCAL_DATA_PAGE);
  const [accountData, setAccountData] =
    useState<MobileLocalDataPage<any>>(EMPTY_LOCAL_DATA_PAGE);
  const [attendanceData, setAttendanceData] =
    useState<MobileLocalDataPage<any>>(EMPTY_LOCAL_DATA_PAGE);
  const [loading, setLoading] = useState(true);
  const [workingAction, setWorkingAction] = useState('');
  const [statusText, setStatusText] = useState('');
  const [statusTone, setStatusTone] = useState<'info' | 'error'>('info');
  const [exportText, setExportText] = useState('');
  const backendSource = toSafeText(getApiBaseUrl(), 'Chưa xác định backend');

  const refreshLocalData = useCallback(async () => {
    setLoading(true);
    try {
      await initializeMobileLocalDataStore();
      const [
        nextSummary,
        nextEmployeeData,
        nextAccountData,
        nextAttendanceData,
      ] = await Promise.all([
        getMobileLocalDataSummary(),
        getLocalEmployeesPage({page: employeePage, pageSize: MOBILE_DATA_PAGE_SIZE}),
        getLocalAccountsPage({page: accountPage, pageSize: MOBILE_DATA_PAGE_SIZE}),
        getLocalTodayAttendancePage({
          page: attendancePage,
          pageSize: MOBILE_DATA_PAGE_SIZE,
        }),
      ]);
      setSummary(nextSummary);
      setEmployeeData(nextEmployeeData);
      setAccountData(nextAccountData);
      setAttendanceData(nextAttendanceData);
      setEmployeePage(nextEmployeeData.page);
      setAccountPage(nextAccountData.page);
      setAttendancePage(nextAttendanceData.page);
    } catch (error) {
      setStatusTone('error');
      setStatusText(
        error instanceof Error ? error.message : 'Không tải được dữ liệu SQLite local.',
      );
    } finally {
      setLoading(false);
    }
  }, [accountPage, attendancePage, employeePage]);

  const runAction = useCallback(
    async (
      actionKey: string,
      action: () => Promise<any>,
      buildMessage?: (payload: any) => string,
      options?: {preserveExport?: boolean; showSuccessAlert?: boolean},
    ) => {
      setWorkingAction(actionKey);
      try {
        const payload = await action();
        setStatusTone('info');
        setStatusText(
          buildMessage
            ? buildMessage(payload)
            : 'Đã cập nhật dữ liệu mobile local.',
        );
        if (!options?.preserveExport) {
          setExportText('');
        }
        if (options?.showSuccessAlert) {
          Alert.alert(
            'Thanh cong',
            buildMessage
              ? buildMessage(payload)
              : 'Đã cập nhật dữ liệu mobile local.',
          );
        }
        await refreshLocalData();
      } catch (error) {
        setStatusTone('error');
        setStatusText(
          error instanceof Error ? error.message : 'Không xử lý được dữ liệu mobile.',
        );
      } finally {
        setWorkingAction('');
      }
    },
    [refreshLocalData],
  );

  useEffect(() => {
    refreshLocalData().catch(() => {});
  }, [refreshLocalData]);

  const renderPagedSection = useCallback(
    ({
      title,
      description,
      pageData,
      emptyText,
      onPrevious,
      onNext,
      renderItem,
    }: {
      title: string;
      description: string;
      pageData: MobileLocalDataPage<any>;
      emptyText: string;
      onPrevious: () => void;
      onNext: () => void;
      renderItem: (row: any, index: number) => string;
    }) => (
      <View style={styles.rowCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>{title}</Text>
            <Text style={styles.rowMeta}>{description}</Text>
          </View>
          <View style={styles.pageBadge}>
            <Text style={styles.pageBadgeText}>{pageData.total} bản ghi</Text>
          </View>
        </View>

        <View style={styles.paginationRow}>
          <Text style={styles.paginationMeta}>
            Trang {pageData.page}/{pageData.totalPages} • {pageData.pageSize} mục/trang
          </Text>
          <View style={styles.paginationActions}>
            <Pressable
              disabled={loading || pageData.page <= 1}
              onPress={onPrevious}
              style={[
                styles.smallButtonSecondary,
                (loading || pageData.page <= 1) && styles.buttonDisabled,
              ]}>
              <Text style={styles.smallButtonSecondaryText}>Trước</Text>
            </Pressable>
            <Pressable
              disabled={loading || pageData.page >= pageData.totalPages}
              onPress={onNext}
              style={[
                styles.smallButtonSecondary,
                (loading || pageData.page >= pageData.totalPages) && styles.buttonDisabled,
              ]}>
              <Text style={styles.smallButtonSecondaryText}>Sau</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.simpleList}>
          {pageData.items.length === 0 ? (
            <Text style={styles.mutedText}>{emptyText}</Text>
          ) : (
            pageData.items.map((row, index) => (
              <Text
                key={buildStableKey(title, row?.id || row?.employee_id || row?.username, index)}
                style={styles.simpleListItem}>
                {renderItem(row, index)}
              </Text>
            ))
          )}
        </View>
      </View>
    ),
    [loading],
  );

  return (
    <ModuleBox
      title="Dữ liệu ở máy cá nhân"
      subtitle="Dữ liệu được đồng bộ từ hệ thống và đang lưu trữ trên thiết bị hiện tại"
      hideHeader={hideHeader}
      rightSlot={
        <Pressable
          onPress={() => refreshLocalData()}
          style={styles.smallButtonSecondary}>
          <Text style={styles.smallButtonSecondaryText}>Tải lại</Text>
        </Pressable>
      }>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View style={styles.moduleList}>
          {/* Bento metric overview */}
          <View style={styles.accKpiRow}>
            <View style={styles.accKpiCard}>
              <View style={[styles.accKpiIconWrap, {backgroundColor: '#eff6ff'}]}>
                <Icon name="people" size={18} color="#1d4ed8" />
              </View>
              <View>
                <Text style={styles.accKpiValue}>{summary.employeesCount}</Text>
                <Text style={styles.accKpiLabel}>Nhân viên</Text>
              </View>
            </View>

            <View style={styles.accKpiCard}>
              <View style={[styles.accKpiIconWrap, {backgroundColor: '#ecfdf5'}]}>
                <Icon name="check_circle" size={18} color="#059669" />
              </View>
              <View>
                <Text style={styles.accKpiValue}>{summary.accountsCount}</Text>
                <Text style={styles.accKpiLabel}>Tài khoản</Text>
              </View>
            </View>

            <View style={styles.accKpiCard}>
              <View style={[styles.accKpiIconWrap, {backgroundColor: '#fef3c7'}]}>
                <Icon name="today" size={18} color="#d97706" />
              </View>
              <View>
                <Text style={styles.accKpiValue}>{summary.attendanceCount}</Text>
                <Text style={styles.accKpiLabel}>Chấm công</Text>
              </View>
            </View>
          </View>

          {/* SQLite details card */}
          <View style={styles.settingsGroupCard}>
            <View style={styles.settingsGroupHeader}>
              <View style={[styles.settingsGroupIconWrap, {backgroundColor: '#eff6ff'}]}>
                <Icon name="storage" size={22} color="#1d4ed8" />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.settingsGroupTitle}>Cơ sở dữ liệu SQLite thiết bị</Text>
                <Text style={styles.settingsGroupSub}>
                  Lưu trữ dữ liệu ngoại tuyến (offline) cho phép điểm danh ngay cả khi mất kết nối
                </Text>
              </View>
            </View>

            <View style={{gap: 6}}>
              <Text style={styles.rowMeta}>DB: {summary.databaseName} • Nguồn: {backendSource}</Text>
              <Text style={styles.rowMeta}>
                Lần đồng bộ toàn bộ: {toSafeText(summary.lastFullSyncAt, 'Chưa đồng bộ')}
              </Text>
            </View>

            {/* Sync actions */}
            <Pressable
              disabled={Boolean(workingAction) || loading}
              onPress={() =>
                runAction(
                  'sync_all',
                  syncAllMobileLocalData,
                  payload =>
                    `Đã đồng bộ từ hệ thống chấm công vào bộ nhớ thiết bị: ${payload?.summary?.employeesCount || 0} nhân viên, ${payload?.summary?.accountsCount || 0} tài khoản, ${payload?.summary?.attendanceCount || 0} bản ghi chấm công.`,
                )
              }
              style={[styles.primaryButton, {minHeight: 46, borderRadius: 12}]}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Icon name="cloud_download" size={18} color="#ffffff" />
                <Text style={styles.primaryButtonText}>
                  {workingAction === 'sync_all'
                    ? 'Đang đồng bộ toàn bộ...'
                    : 'Đồng bộ tất cả dữ liệu từ hệ thống'}
                </Text>
              </View>
            </Pressable>

            <View style={{flexDirection: 'row', gap: 8}}>
              <Pressable
                disabled={Boolean(workingAction) || loading}
                onPress={() =>
                  runAction(
                    'sync_employees',
                    syncMobileEmployeesFromServer,
                    payload =>
                      `Đã đồng bộ ${payload?.count || 0} nhân viên từ hệ thống chấm công vào dữ liệu local.`,
                  )
                }
                style={[styles.accActionBtnSecondary, {flex: 1}]}>
                <Icon name="people" size={14} color="#475569" />
                <Text style={styles.accActionBtnSecondaryText}>Đồng bộ NV</Text>
              </Pressable>

              <Pressable
                disabled={Boolean(workingAction) || loading}
                onPress={() =>
                  runAction(
                    'sync_accounts',
                    syncMobileAccountsFromServer,
                    payload =>
                      `Đã đồng bộ ${payload?.count || 0} tài khoản từ hệ thống chấm công vào dữ liệu local.`,
                  )
                }
                style={[styles.accActionBtnSecondary, {flex: 1}]}>
                <Icon name="badge" size={14} color="#475569" />
                <Text style={styles.accActionBtnSecondaryText}>Đồng bộ TK</Text>
              </Pressable>

              <Pressable
                disabled={Boolean(workingAction) || loading}
                onPress={() =>
                  runAction(
                    'sync_attendance',
                    syncMobileTodayAttendanceFromServer,
                    payload =>
                      `Đã đồng bộ ${payload?.count || 0} bản ghi chấm công hôm nay từ hệ thống chấm công vào dữ liệu local.`,
                  )
                }
                style={[styles.accActionBtnSecondary, {flex: 1}]}>
                <Icon name="today" size={14} color="#475569" />
                <Text style={styles.accActionBtnSecondaryText}>Đồng bộ Điểm danh</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.inlineRow}>
            <Pressable
              disabled={Boolean(workingAction) || loading}
              onPress={() =>
                runAction(
                  'export',
                  async () => {
                     const snapshot = await exportMobileLocalDataSnapshot();
                     setExportText(formatJson(snapshot));
                     return snapshot;
                   },
                  payload =>
                    `Đã xuất snapshot local lúc ${toSafeText(payload?.exportedAt, todayIsoDate())}.`,
                  {preserveExport: true},
                )
              }
              style={[styles.smallButton, styles.flexButton]}>
              <Text style={styles.smallButtonText}>Xuất snapshot local</Text>
            </Pressable>
            <Pressable
              disabled={Boolean(workingAction) || loading}
              onPress={() =>
                Alert.alert(
                  'Xac nhan',
                  'Xoa toan bo du lieu SQLite local tren mobile?',
                  [
                    {text: 'Huy', style: 'cancel'},
                    {
                      text: 'Xoa',
                      style: 'destructive',
                      onPress: () =>
                        runAction(
                          'clear',
                          clearMobileLocalData,
                          () => 'Đã xoá toàn bộ dữ liệu local trên mobile.',
                          {showSuccessAlert: true},
                        ),
                    },
                  ],
                )
              }
              style={[styles.dangerButton, styles.flexButton]}>
              <Text style={styles.dangerButtonText}>Xoá dữ liệu local</Text>
            </Pressable>
          </View>

          {statusText ? (
            <Text style={statusTone === 'error' ? styles.errorText : styles.statusInfoText}>
              {statusText}
            </Text>
          ) : null}
          {exportText ? (
            <View style={styles.rowCard}>
              <Text style={styles.rowTitle}>Xem nhanh snapshot local</Text>
              <Text selectable style={styles.rowMeta}>
                {exportText}
              </Text>
            </View>
          ) : null}

          {renderPagedSection({
            title: 'Nhân viên lưu trên máy',
            description: 'Dùng để xem offline khi mobile mất Wi-Fi.',
            pageData: employeeData,
            emptyText: 'Chưa có nhân viên local. Hãy đồng bộ nhân viên từ backend trước.',
            onPrevious: () => setEmployeePage(current => Math.max(1, current - 1)),
            onNext: () =>
              setEmployeePage(current => Math.min(employeeData.totalPages, current + 1)),
            renderItem: row =>
              `${toSafeText(row?.employee_id)} | ${toSafeText(row?.name)} | ${toSafeText(row?.department, 'Chưa có phòng ban')}`,
          })}

          {renderPagedSection({
            title: 'Tài khoản lưu trên máy',
            description: 'Tài khoản đã lưu local để mobile không phụ thuộc dữ liệu web.',
            pageData: accountData,
            emptyText: 'Chưa có tài khoản local. Hãy đồng bộ tài khoản từ backend trước.',
            onPrevious: () => setAccountPage(current => Math.max(1, current - 1)),
            onNext: () =>
              setAccountPage(current => Math.min(accountData.totalPages, current + 1)),
            renderItem: row =>
              `${toSafeText(row?.username)} | ${toSafeText(row?.employee_id)} | ${row?.is_locked ? 'Đang khóa' : 'Hoạt động'}`,
          })}

          {renderPagedSection({
            title: 'Chấm công lưu trên máy',
            description: 'Bản ghi local để nhân viên xem lại khi mất kết nối mạng.',
            pageData: attendanceData,
            emptyText: 'Chưa có bản ghi chấm công local. Hãy đồng bộ chấm công từ backend trước.',
            onPrevious: () => setAttendancePage(current => Math.max(1, current - 1)),
            onNext: () =>
              setAttendancePage(current => Math.min(attendanceData.totalPages, current + 1)),
            renderItem: row =>
              `${toSafeText(row?.employee_id || row?.name)} | ${toSafeText(row?.check_in_time || row?.time, 'Chưa check-in')} | ${toSafeText(row?.check_out_time, 'Chưa check-out')} | ${toSafeText(row?.status, 'Chưa có trạng thái')}`,
          })}
        </View>
      )}
    </ModuleBox>
  );
}

function SystemSettingsModule({hideHeader = false}: {hideHeader?: boolean} = {}) {
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [attendanceMode] = useState<'auto_record'>(
    'auto_record',
  );
  const [cooldownHours, setCooldownHours] = useState('0');
  const [cooldownMinutes, setCooldownMinutes] = useState('10');
  const [cooldownSeconds, setCooldownSeconds] = useState('0');
  const [moduleVisibility, setModuleVisibility] = useState<Record<string, boolean>>({});

  const moduleDefinitions = useMemo(
    () => [
      {
        key: 'attendance',
        label: 'Điểm danh',
        description: 'Bật hoặc tắt module chấm công trực tiếp.',
      },
      {
        key: 'mobile_local_data',
        label: 'Dữ liệu mobile',
        description: 'Bật hoặc tắt module SQLite local riêng cho app mobile.',
      },
      {
        key: 'camera_management',
        label: 'Quản lý camera',
        description: 'Bật hoặc tắt module cấu hình camera.',
      },
      {
        key: 'online_sync',
        label: 'Đồng bộ nhân viên online',
        description: 'Bật hoặc tắt module đồng bộ nhân viên từ ERP.',
      },
      {
        key: 'sync_verify',
        label: 'Xử lý đồng bộ giữa 2 hệ thống',
        description: 'Bật hoặc tắt module so sánh dữ liệu ERP và hệ thống.',
      },
      {
        key: 'offline_manage',
        label: 'Quản lý nhân viên offline',
        description: 'Bật hoặc tắt module quản lý dữ liệu khuôn mặt local.',
      },
      {
        key: 'report',
        label: 'Báo cáo chấm công nội bộ',
        description: 'Báo cáo dữ liệu local, xuất CSV và đẩy ERP.',
      },
      {
        key: 'online_attendance_check',
        label: 'Báo cáo chấm công đã đồng bộ',
        description: 'Bật hoặc tắt module kiểm tra dữ liệu chấm công đã đẩy lên ERP.',
      },
      {
        key: 'account_management',
        label: 'Quản lý tài khoản nhân viên',
        description: 'Bật hoặc tắt module kéo tài khoản từ ERP và quản lý lock/reset.',
      },
    ],
    [],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.getSystemSettings();
      if (response?.success) {
        const settings = response.settings || {};
        const attendance = settings.attendance_settings || {};
        const visibility = settings.module_visibility || {};
        // attendanceMode is always 'auto_record' — no mode switching needed
        setCooldownHours(String(attendance.cooldown_hours ?? 0));
        setCooldownMinutes(String(attendance.cooldown_minutes ?? 10));
        setCooldownSeconds(String(attendance.cooldown_seconds ?? 0));

        const merged: Record<string, boolean> = {};
        for (const def of moduleDefinitions) {
          merged[def.key] = visibility?.[def.key] !== false;
        }
        setModuleVisibility(merged);
      } else {
        setStatusText(response?.message || 'Không tải được cài đặt.');
      }
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }, [moduleDefinitions]);

  async function saveData() {
    setSaving(true);
    try {
      const payload = {
        module_visibility: moduleVisibility,
        attendance_settings: {
          mode: attendanceMode,
          cooldown_hours: Number(cooldownHours) || 0,
          cooldown_minutes: Number(cooldownMinutes) || 0,
          cooldown_seconds: Number(cooldownSeconds) || 0,
        },
      };
      const response = await api.saveSystemSettings(payload as any);
      setStatusText(response?.message || 'Đã lưu cài đặt.');
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData]);

  return (
    <ModuleBox
      title="Cài đặt hệ thống"
      subtitle="Bật/tắt module và cấu hình chấm công"
      hideHeader={hideHeader}
      rightSlot={
        <Pressable onPress={() => loadData()} style={styles.smallButtonSecondary}>
          <Text style={styles.smallButtonSecondaryText}>Tải lại</Text>
        </Pressable>
      }>
      {loading && !hasLoadedOnce ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View style={styles.moduleList}>
          {/* Card Chấm công tự động qua Loa Camera (Không cần mở App) */}
          <StandaloneAttendanceSettingsCard />

          {/* Card 1: Cooldown thời gian giãn cách */}
          <View style={styles.settingsGroupCard}>
            <View style={styles.settingsGroupHeader}>
              <View style={[styles.settingsGroupIconWrap, {backgroundColor: '#eff6ff'}]}>
                <Icon name="timer" size={22} color="#1d4ed8" />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.settingsGroupTitle}>Khoảng cách chấm công (Cooldown)</Text>
                <Text style={styles.settingsGroupSub}>
                  Thời gian giãn cách tối thiểu giữa 2 lần nhận diện của cùng một nhân viên
                </Text>
              </View>
            </View>

            <View style={styles.cooldownInputsRow}>
              <View style={styles.cooldownBox}>
                <Text style={styles.cooldownBoxLabel}>Giờ</Text>
                <TextInput
                  value={cooldownHours}
                  onChangeText={setCooldownHours}
                  keyboardType="number-pad"
                  style={styles.cooldownBoxInput}
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.cooldownBox}>
                <Text style={styles.cooldownBoxLabel}>Phút</Text>
                <TextInput
                  value={cooldownMinutes}
                  onChangeText={setCooldownMinutes}
                  keyboardType="number-pad"
                  style={styles.cooldownBoxInput}
                  placeholder="10"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.cooldownBox}>
                <Text style={styles.cooldownBoxLabel}>Giây</Text>
                <TextInput
                  value={cooldownSeconds}
                  onChangeText={setCooldownSeconds}
                  keyboardType="number-pad"
                  style={styles.cooldownBoxInput}
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>
          </View>

          {/* Card 2: Hiển thị phân hệ */}
          <View style={styles.settingsGroupCard}>
            <View style={styles.settingsGroupHeader}>
              <View style={[styles.settingsGroupIconWrap, {backgroundColor: '#ecfdf5'}]}>
                <Icon name="visibility" size={22} color="#059669" />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.settingsGroupTitle}>Hiển thị phân hệ</Text>
                <Text style={styles.settingsGroupSub}>
                  Bật hoặc tắt các module trong thanh điều hướng và menu quản trị
                </Text>
              </View>
            </View>

            <View>
              {moduleDefinitions.map(def => {
                const enabled = moduleVisibility[def.key] !== false;
                return (
                  <Pressable
                    key={def.key}
                    onPress={() =>
                      setModuleVisibility(prev => ({
                        ...prev,
                        [def.key]: !enabled,
                      }))
                    }
                    style={styles.moduleToggleItem}>
                    <View style={styles.moduleToggleTextWrap}>
                      <Text style={styles.moduleToggleTitle}>{def.label}</Text>
                      <Text style={styles.moduleToggleDesc}>{def.description}</Text>
                    </View>
                    <View style={[styles.switchPill, enabled ? styles.switchPillOn : styles.switchPillOff]}>
                      <Icon
                        name={enabled ? 'check' : 'close'}
                        size={12}
                        color={enabled ? '#059669' : '#94a3b8'}
                      />
                      <Text style={enabled ? styles.switchPillTextOn : styles.switchPillTextOff}>
                        {enabled ? 'BẬT' : 'TẮT'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            onPress={saveData}
            disabled={saving}
            style={[styles.primaryButton, {minHeight: 48, borderRadius: 12, marginTop: 4}]}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Icon name="save" size={18} color="#ffffff" />
                <Text style={styles.primaryButtonText}>Lưu cấu hình hệ thống</Text>
              </View>
            )}
          </Pressable>
          {statusText ? <StatusMessage variant="info" message={statusText} /> : null}
        </View>
      )}
    </ModuleBox>
  );
}

type ReportTabKey = 'online' | 'pending' | 'local_data';

function UnifiedReportModule({initialTab = 'online'}: {initialTab?: ReportTabKey}) {
  const {isMobile} = useResponsive();
  const [activeTab, setActiveTab] = useState<ReportTabKey>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <View style={styles.unifiedModuleContainer}>
      <Card style={styles.unifiedHeaderCard}>
        <View style={styles.unifiedHeaderTopRow}>
          <View style={[styles.unifiedIconBadge, {backgroundColor: '#eff6ff'}]}>
            <Icon name="analytics" size={26} color="#1d4ed8" />
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.unifiedHeaderTitle}>Trung tâm Báo cáo & Dữ liệu</Text>
            <Text style={styles.unifiedHeaderSub}>
              {activeTab === 'online'
                ? 'Dữ liệu chấm công đã đồng bộ lên hệ thống ERP'
                : activeTab === 'pending'
                ? 'Dữ liệu chấm công nội bộ và danh sách chờ đồng bộ'
                : 'Thống kê bộ nhớ SQLite và đồng bộ dữ liệu thiết bị'}
            </Text>
          </View>
        </View>

        {/* Tab switcher */}
        <View style={styles.segmentedTabBar}>
          <Pressable
            onPress={() => setActiveTab('online')}
            style={[
              styles.segmentedTabItem,
              activeTab === 'online' && styles.segmentedTabItemActive,
            ]}>
            <Icon
              name="check_circle"
              size={16}
              color={activeTab === 'online' ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentedTabText,
                activeTab === 'online' && styles.segmentedTabTextActive,
              ]}>
              {isMobile ? 'Đã đồng bộ' : 'Đã đồng bộ ERP'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('pending')}
            style={[
              styles.segmentedTabItem,
              activeTab === 'pending' && styles.segmentedTabItemActive,
            ]}>
            <Icon
              name="sync_problem"
              size={16}
              color={activeTab === 'pending' ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentedTabText,
                activeTab === 'pending' && styles.segmentedTabTextActive,
              ]}>
              {isMobile ? 'Chờ đồng bộ' : 'Chờ đồng bộ ERP'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('local_data')}
            style={[
              styles.segmentedTabItem,
              activeTab === 'local_data' && styles.segmentedTabItemActive,
            ]}>
            <Icon
              name="database"
              size={16}
              color={activeTab === 'local_data' ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentedTabText,
                activeTab === 'local_data' && styles.segmentedTabTextActive,
              ]}>
              {isMobile ? 'Bộ nhớ máy' : 'Bộ nhớ thiết bị'}
            </Text>
          </Pressable>
        </View>
      </Card>

      {activeTab === 'online' ? <OnlineAttendanceModule hideHeader /> : null}
      {activeTab === 'pending' ? <ReportModule hideHeader /> : null}
      {activeTab === 'local_data' ? <MobileDataModule hideHeader /> : null}
    </View>
  );
}

type SettingsTabKey = 'attendance' | 'camera' | 'channels';

function UnifiedSystemSettingsModule({initialTab = 'attendance'}: {initialTab?: SettingsTabKey}) {
  const {isMobile} = useResponsive();
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <View style={styles.unifiedModuleContainer}>
      <Card style={styles.unifiedHeaderCard}>
        <View style={styles.unifiedHeaderTopRow}>
          <View
            style={[
              styles.unifiedIconBadge,
              {
                backgroundColor:
                  activeTab === 'camera'
                    ? '#fef3c7'
                    : activeTab === 'channels'
                    ? '#eff6ff'
                    : '#f0fdf4',
              },
            ]}>
            <Icon
              name={
                activeTab === 'camera'
                  ? 'camera'
                  : activeTab === 'channels'
                  ? 'server'
                  : 'settings'
              }
              size={26}
              color={
                activeTab === 'camera'
                  ? '#d97706'
                  : activeTab === 'channels'
                  ? '#0037b0'
                  : '#15803d'
              }
            />
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.unifiedHeaderTitle}>
              {activeTab === 'channels'
                ? 'Hệ thống đa kênh máy chủ AI'
                : activeTab === 'camera'
                ? 'Cài đặt Camera RTSP'
                : 'Cài đặt hệ thống & Chấm công'}
            </Text>
            <Text style={styles.unifiedHeaderSub}>
              {activeTab === 'channels'
                ? 'Chuyển đổi linh hoạt máy chủ xử lý nhận diện khuôn mặt và kiểm tra kết nối'
                : activeTab === 'camera'
                ? 'Quản lý cấu hình danh sách camera RTSP nhận diện khuôn mặt'
                : 'Cấu hình chế độ chấm công, thời gian giãn cách và phân quyền module'}
            </Text>
          </View>
        </View>

        {/* Tab switcher */}
        <View style={styles.segmentedTabBar}>
          <Pressable
            onPress={() => setActiveTab('attendance')}
            style={[
              styles.segmentedTabItem,
              activeTab === 'attendance' && styles.segmentedTabItemActive,
            ]}>
            <Icon
              name="settings"
              size={16}
              color={activeTab === 'attendance' ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentedTabText,
                activeTab === 'attendance' && styles.segmentedTabTextActive,
              ]}>
              Chấm công
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('camera')}
            style={[
              styles.segmentedTabItem,
              activeTab === 'camera' && styles.segmentedTabItemActive,
            ]}>
            <Icon
              name="camera"
              size={16}
              color={activeTab === 'camera' ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentedTabText,
                activeTab === 'camera' && styles.segmentedTabTextActive,
              ]}>
              {isMobile ? 'Camera' : 'Camera RTSP'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('channels')}
            style={[
              styles.segmentedTabItem,
              activeTab === 'channels' && styles.segmentedTabItemActive,
            ]}>
            <Icon
              name="server"
              size={16}
              color={activeTab === 'channels' ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentedTabText,
                activeTab === 'channels' && styles.segmentedTabTextActive,
              ]}>
              {isMobile ? 'Đa kênh' : 'Đa kênh máy chủ'}
            </Text>
          </Pressable>
        </View>
      </Card>

      {activeTab === 'attendance' ? <SystemSettingsModule hideHeader /> : null}
      {activeTab === 'camera' ? <CamerasModule hideHeader /> : null}
      {activeTab === 'channels' ? <MultiChannelSettingsModule hideHeader /> : null}
    </View>
  );
}

export function AdminWorkspaceScreen({
  initialAdminUser,
  initialModule,
  onBackToPortal,
  onOpenEmployeeRegister,
  onRequireLogin,
}: AdminWorkspaceScreenProps) {
  const {isMobile, isSmallMobile} = useResponsive();
  const [checkingSession, setCheckingSession] = useState(!initialAdminUser);
  const [activeModule, setActiveModule] = useState<AdminModuleKey>(
    initialModule || 'dashboard',
  );
  const [showServiceCards, setShowServiceCards] = useState(false);
  const [highlightEmployeeId, setHighlightEmployeeId] = useState('');
  const [attendanceTestMode, setAttendanceTestMode] = useState(false);

  function handleNavigateToModule(key: AdminModuleKey) {
    setActiveModule(key);
    setShowServiceCards(false);
  }

  function handleBackToServices() {
    setShowServiceCards(true);
    setActiveModule('dashboard');
  }

  function handleNavigateToAccount(employeeId: string) {
    setHighlightEmployeeId(employeeId);
    setActiveModule('account');
  }
  const [visibleModules, setVisibleModules] = useState<ModuleItem[]>(MODULE_ITEMS);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminUser, setAdminUser] = useState<any>(initialAdminUser || null);
  const [statusBanner, setStatusBanner] = useState('');
  const prevActiveModuleRef = useRef<AdminModuleKey>(activeModule);
  const visibleModuleKeys = useMemo(
    () => visibleModules.map(item => item.key),
    [visibleModules],
  );

  const refreshVisibleModules = useCallback(async () => {
    try {
      const settingsResponse = await api.getSystemSettings();
      if (settingsResponse?.success) {
        const visibility = settingsResponse.settings?.module_visibility || {};
        const filtered = MODULE_ITEMS.filter(item => {
          const moduleVisibilityKey = MODULE_VISIBILITY_KEY_BY_MODULE[item.key];
          if (!moduleVisibilityKey) {
            return true;
          }
          return visibility?.[moduleVisibilityKey] !== false;
        });
        setVisibleModules(filtered.length > 0 ? filtered : MODULE_ITEMS);
        setActiveModule(current => {
          if (filtered.some(item => item.key === current)) {
            return current;
          }
          return filtered[0]?.key || 'dashboard';
        });
      }
    } catch {
      // Keep current module list if settings API is not available.
    }
  }, []);

  useEffect(() => {
    if (prevActiveModuleRef.current === 'system_settings' && activeModule !== 'system_settings') {
      refreshVisibleModules();
    }
    prevActiveModuleRef.current = activeModule;
  }, [activeModule, refreshVisibleModules]);

  const activeModuleLabel = useMemo(() => {
    const item = MODULE_ITEMS.find(i => i.key === activeModule);
    if (!item) return 'Quản trị';
    return isMobile && item.mobileLabel ? item.mobileLabel : item.label;
  }, [activeModule, isMobile]);

  const verifySession = useCallback(async (isInitial = false) => {
    if (!isInitial) {
      setCheckingSession(true);
    }
    try {
      const response = await api.sessionStatus();
      if (!response?.is_admin) {
        await clearStoredSession();
        onRequireLogin();
        return;
      }

      setAdminUser(response.user || null);

      let nextVisibleModules = MODULE_ITEMS;
      try {
        const settingsResponse = await api.getSystemSettings();
        if (settingsResponse?.success) {
          const visibility = settingsResponse.settings?.module_visibility || {};
          const filtered = MODULE_ITEMS.filter(item => {
            const moduleVisibilityKey = MODULE_VISIBILITY_KEY_BY_MODULE[item.key];
            if (!moduleVisibilityKey) {
              return true;
            }
            return visibility?.[moduleVisibilityKey] !== false;
          });
          if (filtered.length > 0) {
            nextVisibleModules = filtered;
          }
        }
      } catch {
        // Keep default module list if settings API is not available.
      }

      setVisibleModules(nextVisibleModules);
      setActiveModule(current => {
        if (nextVisibleModules.some(item => item.key === current)) {
          return current;
        }
        return nextVisibleModules[0]?.key || 'dashboard';
      });

      setStatusBanner('');
    } catch (error) {
      if (isInitial) {
        // If initial check fails, it might be because session injection is still in progress
        // or backend is starting up. Don't boot the user yet if we have initialAdminUser.
        if (initialAdminUser) {
           setCheckingSession(false);
           return;
        }
      }
      setStatusBanner(
        error instanceof Error ? error.message : 'Không kiểm tra được session.',
      );
      await clearStoredSession();
      onRequireLogin();
      return;
    } finally {
      setCheckingSession(false);
    }
  }, [initialAdminUser, onRequireLogin]);

  async function handleLogout() {
    try {
      const response = await api.logout().catch(() => null);
      if (!response?.gateway_logout?.success) {
        await logoutGatewaySession();
      }
    } finally {
      await clearStoredSession();
      onRequireLogin();
    }
  }

  const openSidebar = useCallback(() => {
    setSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  useEffect(() => {
    verifySession(true).catch(() => {
      if (!initialAdminUser) {
        clearStoredSession().finally(onRequireLogin);
      }
    });
  }, [initialAdminUser, onRequireLogin, verifySession]);

  if (checkingSession) {
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerText}>Đang kiểm tra phiên admin...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <View style={styles.workspaceTopBar}>
        <Pressable
          onPress={openSidebar}
          style={[styles.hamburgerButton, isMobile && styles.hamburgerButtonMobile]}
          accessibilityLabel="Mở menu quản trị"
          hitSlop={8}>
          <Icon name="menu" size={isMobile ? 20 : 22} color="#0037b0" />
        </Pressable>
        <View style={styles.workspaceTopBarTitleWrap}>
          <Text style={[styles.workspaceTopBarAdminName, isMobile && {fontSize: 10}]} numberOfLines={1}>
            {adminUser?.name || adminUser?.code || 'Admin'}
          </Text>
          <Text style={[styles.workspaceTopBarModuleText, isMobile && {fontSize: 14}]} numberOfLines={1}>
            {showServiceCards ? 'Danh mục tính năng' : activeModuleLabel}
          </Text>
        </View>
        <View style={[styles.workspaceTopBarActions, isMobile && {gap: 5}]}>
          <Pressable
            onPress={() => setShowServiceCards(prev => !prev)}
            style={[
              styles.workspaceTopBarActionBtn,
              isMobile && styles.workspaceTopBarActionBtnMobile,
              showServiceCards && styles.workspaceTopBarActionBtnActive,
            ]}
            accessibilityLabel={showServiceCards ? 'Quay lại module' : 'Tất cả tính năng'}
            hitSlop={8}>
            <Icon
              name="apps"
              size={isMobile ? 18 : 20}
              color={showServiceCards ? '#ffffff' : '#0037b0'}
            />
          </Pressable>
          <Pressable
            onPress={onBackToPortal}
            style={[styles.workspaceTopBarActionBtn, isMobile && styles.workspaceTopBarActionBtnMobile]}
            accessibilityLabel="Về cổng chính"
            hitSlop={8}>
            <Icon name="home" size={isMobile ? 18 : 20} color="#64748b" />
          </Pressable>
        </View>
      </View>

      <AdminDrawer
        visible={sidebarOpen}
        onClose={closeSidebar}
        currentModule={activeModule}
        onSelectModule={key => {
          handleNavigateToModule(key);
          closeSidebar();
        }}
        onBackToPortal={() => {
          closeSidebar();
          onBackToPortal();
        }}
        onLogout={() => {
          closeSidebar();
          handleLogout().catch(() => {});
        }}
        adminUser={adminUser}
        visibleModuleKeys={visibleModuleKeys}
      />

      {statusBanner ? (
        <View style={styles.bannerError}>
          <Text style={styles.bannerErrorText}>{statusBanner}</Text>
        </View>
      ) : null}

      {showServiceCards ? (
        <ScrollView contentContainerStyle={[styles.workspaceContent, isMobile && styles.workspaceContentMobile]}>
          <View style={styles.bentoContainer}>
            {/* Header */}
            <View style={styles.bentoHeader}>
              <Text style={styles.bentoHeaderTitle}>Tính năng quản trị</Text>
              <Text style={styles.bentoHeaderSubtitle}>
                Hệ thống chấm công và quản trị nhân sự thông minh
              </Text>
            </View>

            {/* Chấm công trực tiếp - Hero Card */}
            <Pressable
              onPress={() => handleNavigateToModule('attendance')}
              style={({pressed}) => [
                styles.bentoHeroCard,
                pressed && styles.bentoCardPressed,
              ]}>
              <View style={styles.bentoHeroContent}>
                <View style={styles.bentoHeroBadge}>
                  <Icon name="face_recognition" size={32} color="#ffffff" />
                </View>
                <View style={{flex: 1}}>
                  <View style={styles.bentoHeroTagRow}>
                    <Text style={styles.bentoHeroTag}>TÍNH NĂNG CHÍNH</Text>
                  </View>
                  <Text style={styles.bentoHeroTitle}>Bắt đầu chấm công</Text>
                  <Text style={styles.bentoHeroSubtitle}>
                    Nhận diện khuôn mặt thời gian thực & điểm danh
                  </Text>
                </View>
                <Icon name="arrow_forward" size={24} color="#ffffff" />
              </View>
            </Pressable>

            {/* Nhóm 1: Quản lý Nhân sự */}
            <View style={styles.bentoSection}>
              <Text style={styles.bentoSectionTitle}>Quản lý nhân sự & Dữ liệu</Text>
              <View style={styles.bentoGridTwoCol}>
                <Pressable
                  onPress={() => handleNavigateToModule('manage_faces')}
                  style={({pressed}) => [
                    styles.bentoCard,
                    pressed && styles.bentoCardPressed,
                  ]}>
                  <View
                    style={[
                      styles.bentoCardIconWrap,
                      {backgroundColor: '#e0f2fe'},
                    ]}>
                    <Icon name="people" size={24} color="#0284c7" />
                  </View>
                  <Text style={styles.bentoCardTitle}>Nhân viên & Khuôn mặt</Text>
                  <Text style={styles.bentoCardDesc}>
                    Quản lý hồ sơ, kiểm tra dữ liệu khuôn mặt
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleNavigateToModule('register')}
                  style={({pressed}) => [
                    styles.bentoCard,
                    pressed && styles.bentoCardPressed,
                  ]}>
                  <View
                    style={[
                      styles.bentoCardIconWrap,
                      {backgroundColor: '#f0fdf4'},
                    ]}>
                    <Icon name="person_add" size={24} color="#16a34a" />
                  </View>
                  <Text style={styles.bentoCardTitle}>Đăng ký nhân viên</Text>
                  <Text style={styles.bentoCardDesc}>
                    Thêm nhân viên mới & chụp ảnh khuôn mặt
                  </Text>
                </Pressable>
              </View>

              <View style={styles.bentoGridTwoCol}>
                <Pressable
                  onPress={() => handleNavigateToModule('sync_verify')}
                  style={({pressed}) => [
                    styles.bentoCard,
                    pressed && styles.bentoCardPressed,
                  ]}>
                  <View
                    style={[
                      styles.bentoCardIconWrap,
                      {backgroundColor: '#fef3c7'},
                    ]}>
                    <Icon name="cloud_download" size={24} color="#d97706" />
                  </View>
                  <Text style={styles.bentoCardTitle}>Tải dữ liệu từ ERP</Text>
                  <Text style={styles.bentoCardDesc}>
                    Tải danh sách NV & đối soát khuôn mặt ERP
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleNavigateToModule('account')}
                  style={({pressed}) => [
                    styles.bentoCard,
                    pressed && styles.bentoCardPressed,
                  ]}>
                  <View
                    style={[
                      styles.bentoCardIconWrap,
                      {backgroundColor: '#f3e8ff'},
                    ]}>
                    <Icon name="account_circle" size={24} color="#9333ea" />
                  </View>
                  <Text style={styles.bentoCardTitle}>Tài khoản & Phân quyền</Text>
                  <Text style={styles.bentoCardDesc}>
                    Quản lý tài khoản và phân quyền truy cập
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Nhóm 2: Báo cáo & Cài đặt hệ thống */}
            <View style={styles.bentoSection}>
              <Text style={styles.bentoSectionTitle}>Báo cáo & Cài đặt hệ thống</Text>

              {/* Trung tâm Báo cáo & Dữ liệu (Unified Hub) */}
              <Pressable
                onPress={() => handleNavigateToModule('report')}
                style={({pressed}) => [
                  styles.bentoWideCard,
                  pressed && styles.bentoCardPressed,
                ]}>
                <View
                  style={[
                    styles.bentoCardIconWrap,
                    {backgroundColor: '#eff6ff'},
                  ]}>
                  <Icon name="analytics" size={26} color="#1d4ed8" />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.bentoCardTitle}>Trung tâm Báo cáo & Dữ liệu</Text>
                  <Text style={styles.bentoCardDesc}>
                    Báo cáo ERP trực tuyến, danh sách chờ đồng bộ & dữ liệu bộ nhớ máy
                  </Text>
                  <View style={styles.bentoPillsRow}>
                    <View style={styles.bentoPill}>
                      <Text style={styles.bentoPillText}>Online ERP</Text>
                    </View>
                    <View style={styles.bentoPill}>
                      <Text style={styles.bentoPillText}>Chờ đồng bộ</Text>
                    </View>
                    <View style={styles.bentoPill}>
                      <Text style={styles.bentoPillText}>Bộ nhớ SQLite</Text>
                    </View>
                  </View>
                </View>
                <Icon name="chevron-right" size={20} color="#94a3b8" />
              </Pressable>

              {/* Cài đặt & Camera RTSP (Unified Hub) */}
              <Pressable
                onPress={() => handleNavigateToModule('system_settings')}
                style={({pressed}) => [
                  styles.bentoWideCard,
                  pressed && styles.bentoCardPressed,
                ]}>
                <View
                  style={[
                    styles.bentoCardIconWrap,
                    {backgroundColor: '#ecfdf5'},
                  ]}>
                  <Icon name="settings" size={26} color="#059669" />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.bentoCardTitle}>Cài đặt hệ thống & Camera</Text>
                  <Text style={styles.bentoCardDesc}>
                    Cấu hình chế độ chấm công, thời gian giãn cách & camera RTSP
                  </Text>
                  <View style={styles.bentoPillsRow}>
                    <View
                      style={[
                        styles.bentoPill,
                        {backgroundColor: '#ecfdf5'},
                      ]}>
                      <Text
                        style={[
                          styles.bentoPillText,
                          {color: '#059669'},
                        ]}>
                        Cài đặt chấm công
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.bentoPill,
                        {backgroundColor: '#fffbeb'},
                      ]}>
                      <Text
                        style={[
                          styles.bentoPillText,
                          {color: '#b45309'},
                        ]}>
                        Camera RTSP
                      </Text>
                    </View>
                  </View>
                </View>
                <Icon name="chevron-right" size={20} color="#94a3b8" />
              </Pressable>

              {/* Bảng số liệu tổng quan */}
              <Pressable
                onPress={() => handleNavigateToModule('dashboard')}
                style={({pressed}) => [
                  styles.bentoWideCard,
                  pressed && styles.bentoCardPressed,
                ]}>
                <View
                  style={[
                    styles.bentoCardIconWrap,
                    {backgroundColor: '#f8fafc'},
                  ]}>
                  <Icon name="dashboard" size={26} color="#475569" />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.bentoCardTitle}>Bảng số liệu tổng quan</Text>
                  <Text style={styles.bentoCardDesc}>
                    Xem biểu đồ thống kê chấm công hôm nay, tỷ lệ đi làm & trạng thái
                  </Text>
                </View>
                <Icon name="chevron-right" size={20} color="#94a3b8" />
              </Pressable>
            </View>

            {attendanceTestMode ? (
              <Pressable
                onPress={() => setAttendanceTestMode(false)}
                style={styles.testModeBanner}>
                <Icon name="warning" size={18} color="#92400e" />
                <Text style={styles.testModeBannerText}>
                  Điểm danh đang ở chế độ TEST — không ghi log chính
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      ) : activeModule === 'attendance' ? (
        <View style={styles.fixedAttendanceContainer}>
          <AttendanceModule
            testMode={attendanceTestMode}
            onToggleTestMode={() => setAttendanceTestMode(v => !v)}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.workspaceContent, isMobile && styles.workspaceContentMobile]}>
          {activeModule === 'dashboard' ? (
            <DashboardModule onNavigateModule={handleNavigateToModule} />
          ) : null}
          {activeModule === 'mobile_data' ? (
            <UnifiedReportModule initialTab="local_data" />
          ) : null}
          {activeModule === 'camera' ? (
            <UnifiedSystemSettingsModule initialTab="camera" />
          ) : null}
          {activeModule === 'register' ? (
            <RegisterModule onOpenEmployeeRegister={onOpenEmployeeRegister} />
          ) : null}
          {activeModule === 'sync_verify' ? <SyncVerifyModule /> : null}
          {activeModule === 'manage_faces' ? (
            <ManageFacesModule
              onOpenEmployeeRegister={onOpenEmployeeRegister}
              onNavigateToAccount={handleNavigateToAccount}
            />
          ) : null}
          {activeModule === 'report' ? (
            <UnifiedReportModule initialTab="pending" />
          ) : null}
          {activeModule === 'online_attendance' ? (
            <UnifiedReportModule initialTab="online" />
          ) : null}
          {activeModule === 'account' ? (
            <AccountModule highlightEmployeeId={highlightEmployeeId} />
          ) : null}
          {activeModule === 'system_settings' ? (
            <UnifiedSystemSettingsModule initialTab="attendance" />
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scanLanBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    padding: 14,
    gap: 12,
    marginBottom: 4,
  },
  scanLanBannerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1d4ed8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanLanBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e3a8a',
  },
  scanLanBannerBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scanLanBannerBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  scanLanBannerSub: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
    lineHeight: 16,
  },
  scanLanActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  scanLanActionPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  centerText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  workspaceTopBar: {
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  hamburgerButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hamburgerButtonMobile: {
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  workspaceTopBarTitleWrap: {
    flex: 1,
    marginHorizontal: spacing.sm + 2,
    justifyContent: 'center',
  },
  workspaceTopBarAdminName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  workspaceTopBarModuleText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 1,
  },
  workspaceTopBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  workspaceTopBarActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workspaceTopBarActionBtnMobile: {
    width: 36,
    height: 36,
    borderRadius: 9,
  },
  workspaceTopBarActionBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  sidebarCloseButton: {
    minHeight: 32,
    borderRadius: 8,
    paddingHorizontal: spacing.sm + 4,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarCloseText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
  },
  unifiedModuleContainer: {
    gap: spacing.md,
  },
  unifiedHeaderCard: {
    padding: spacing.md,
    borderRadius: border.radius.lg,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: spacing.md,
  },
  unifiedHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  unifiedIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unifiedHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  unifiedHeaderSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 16,
  },
  segmentedTabBar: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentedTabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
    gap: 4,
  },
  segmentedTabItemActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentedTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  segmentedTabTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  bentoContainer: {
    gap: spacing.md,
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
  },
  bentoHeader: {
    marginBottom: 4,
  },
  bentoHeaderTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  bentoHeaderSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  bentoHeroCard: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    padding: 18,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  bentoCardPressed: {
    opacity: 0.88,
    transform: [{scale: 0.99}],
  },
  bentoHeroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bentoHeroBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoHeroTagRow: {
    marginBottom: 2,
  },
  bentoHeroTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#93c5fd',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  bentoHeroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  bentoHeroSubtitle: {
    fontSize: 12,
    color: '#dbeafe',
    marginTop: 2,
  },
  bentoSection: {
    gap: 10,
  },
  bentoSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  bentoGridTwoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  bentoCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    minHeight: 120,
    justifyContent: 'space-between',
  },
  bentoCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  bentoCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  bentoCardDesc: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 15,
  },
  bentoWideCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bentoPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  bentoPill: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  bentoPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  bannerError: {
    marginHorizontal: 12,
    marginTop: spacing.sm + 2,
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  bannerErrorText: {
    color: '#b91c1c',
    fontSize: 12,
    lineHeight: 18,
  },
  workspaceContent: {
    padding: spacing.md,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 940,
    alignSelf: 'center',
  },
  workspaceContentMobile: {
    padding: 8,
    paddingBottom: 24,
  },
  moduleCard: {
    borderRadius: border.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
    overflow: 'hidden',
  },
  serviceGrid: {
    gap: spacing.sm,
  },
  serviceGridTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  serviceGridSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: spacing.sm,
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: border.radius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: spacing.md,
    gap: spacing.md,
  },
  serviceCardIcon: {
    width: 48,
    height: 48,
    borderRadius: border.radius.md,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCardBody: {
    flex: 1,
  },
  serviceCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  serviceCardDesc: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  testModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: border.radius.md,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  testModeBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#92400e',
    fontWeight: '600',
  },
  moduleHeaderRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  moduleHeaderRowCompact: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  moduleHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  moduleTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  moduleSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  moduleBody: {
    padding: spacing.md,
  },
  moduleList: {
    gap: spacing.sm,
  },
  cameraWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: border.radius.md,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  scanOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCircle: {
    width: '70%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  scanLine: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    height: 2,
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOffset: {width: 0, height: 0},
    shadowRadius: 6,
    shadowOpacity: 0.9,
    elevation: 4,
  },
  scanBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: border.radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  scanBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  scanBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  attendanceCameraControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  attendanceAssistButton: {
    minHeight: 34,
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#eff6ff',
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceAssistButtonActive: {
    borderColor: '#7dd3fc',
    backgroundColor: '#e0f2fe',
  },
  attendanceAssistButtonText: {
    color: '#0369a1',
    fontSize: 11,
    fontWeight: '700',
  },
  attendanceAssistButtonTextActive: {
    color: '#0c4a6e',
  },
  attendanceGuidanceBox: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    borderRadius: border.radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  attendanceGuidanceBoxNeutral: {
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderColor: 'rgba(148, 163, 184, 0.8)',
  },
  attendanceGuidanceBoxSuccess: {
    backgroundColor: 'rgba(6, 95, 70, 0.78)',
    borderColor: 'rgba(110, 231, 183, 0.9)',
  },
  attendanceGuidanceBoxWarning: {
    backgroundColor: 'rgba(146, 64, 14, 0.75)',
    borderColor: 'rgba(253, 186, 116, 0.95)',
  },
  attendanceGuidanceBoxError: {
    backgroundColor: 'rgba(127, 29, 29, 0.78)',
    borderColor: 'rgba(252, 165, 165, 0.95)',
  },
  attendanceGuidanceText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  attendanceFaceBox: {
    position: 'absolute',
    borderRadius: border.radius.sm,
    borderWidth: 2,
  },
  attendanceFaceBoxGood: {
    borderColor: '#22c55e',
  },
  attendanceFaceBoxWarn: {
    borderColor: '#f59e0b',
  },
  attendanceAutoDetectBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
  },
  attendanceAutoDetectBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  permissionWarnBox: {
    borderRadius: border.radius.md,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    padding: spacing.md,
    gap: spacing.sm,
  },
  permissionWarnText: {
    color: '#b91c1c',
    fontSize: 12,
    lineHeight: 18,
  },
  retryButton: {
    minHeight: 38,
    borderRadius: border.radius.sm,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  feedbackBox: {
    borderRadius: border.radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: 6,
  },
  feedbackSuccess: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  feedbackError: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  feedbackMessage: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  feedbackLine: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: border.radius.sm,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs + 2,
  },
  fieldColumn: {
    flex: 1,
    minWidth: 90,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.xs + 2,
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOn: {
    borderColor: '#bbf7d0',
    backgroundColor: '#ecfdf5',
  },
  pillOff: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  pillTextOn: {
    color: '#166534',
  },
  pillTextOff: {
    color: '#b91c1c',
  },
  smallButton: {
    minHeight: 30,
    borderRadius: 9,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonText: {
    color: '#15803d',
    fontSize: 11,
    fontWeight: '700',
  },
  smallButtonSecondary: {
    minHeight: 30,
    borderRadius: 9,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonSecondaryText: {
    color: '#0369a1',
    fontSize: 11,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    width: '48%',
    borderRadius: border.radius.sm,
    padding: spacing.sm + 2,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  statLabel: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  statValue: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  statHintText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  storageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  storageCard: {
    width: '48%',
    borderRadius: border.radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#dbeafe',
    gap: 2,
  },
  storageLabel: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
  },
  storageValue: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  storageHint: {
    color: '#64748b',
    fontSize: 10,
    lineHeight: 14,
  },
  blockTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.xs + 2,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  simpleList: {
    gap: 6,
  },
  simpleListItem: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    minHeight: 42,
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardMuted,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    fontSize: 13,
  },
  inlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  paginationMeta: {
    flex: 1,
    color: '#475569',
    fontSize: 11,
  },
  paginationActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  autoModeInfoBox: {
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 9,
  },
  autoModeInfoText: {
    color: '#0369a1',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  toggleButton: {
    flexGrow: 1,
    minWidth: 84,
    minHeight: 38,
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  toggleButtonActive: {
    borderColor: '#22c55e',
    backgroundColor: '#ecfdf5',
  },
  toggleButtonText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  toggleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: border.radius.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonFlex: {
    flexGrow: 1,
    flexBasis: 120,
    minHeight: 42,
    borderRadius: border.radius.sm,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryButton: {
    flexGrow: 1,
    flexBasis: 120,
    minHeight: 42,
    borderRadius: border.radius.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '700',
  },
  flexButton: {
    flex: 1,
  },
  dangerButton: {
    minHeight: 42,
    borderRadius: border.radius.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  warningButton: {
    flexGrow: 1,
    flexBasis: 120,
    minHeight: 42,
    borderRadius: border.radius.sm,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  statusInfoText: {
    color: '#0f766e',
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
    lineHeight: 18,
  },
  rowCard: {
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: spacing.sm + 2,
    gap: 4,
  },
  infoCard: {
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    padding: spacing.sm + 2,
    gap: 6,
  },
  infoText: {
    color: '#0f172a',
    fontSize: 12,
    lineHeight: 18,
  },
  rowCardActive: {
    borderColor: '#7dd3fc',
    backgroundColor: '#eff6ff',
  },
  rowCardHighlighted: {
    borderColor: '#818cf8',
    borderWidth: 2,
    backgroundColor: '#eef2ff',
  },
  rowTitle: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
  },
  rowMeta: {
    color: '#475569',
    fontSize: 11,
  },
  pageBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBadgeText: {
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '700',
  },
  employeeCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
  },
  batchCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  batchCheckboxChecked: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  employeeCardBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  employeeThumb: {
    width: 64,
    height: 64,
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#e2e8f0',
  },
  employeeThumbPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  employeeThumbPlaceholderText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
  },
  employeePreviewImage: {
    width: '100%',
    height: 220,
    borderRadius: border.radius.md,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#e2e8f0',
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  faceUpdateModalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    borderRadius: border.radius.lg,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  faceUpdateModalBody: {
    padding: spacing.md,
    gap: spacing.md,
  },
  rowActionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  rowActionSecondary: {
    flexGrow: 1,
    minWidth: 86,
    minHeight: 32,
    borderRadius: 9,
    paddingHorizontal: spacing.sm + 2,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowActionSecondaryText: {
    color: '#0369a1',
    fontSize: 11,
    fontWeight: '700',
  },
  rowActionPrimary: {
    flexGrow: 1,
    minWidth: 90,
    minHeight: 32,
    borderRadius: 9,
    paddingHorizontal: spacing.sm + 2,
    borderWidth: 1,
    borderColor: '#0ea5e9',
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowActionPrimaryText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  rowActionDanger: {
    flexGrow: 1,
    minWidth: 74,
    minHeight: 32,
    borderRadius: 9,
    paddingHorizontal: spacing.sm + 2,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowActionDangerText: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '700',
  },
  rowDeleteButton: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    minHeight: 28,
    borderRadius: border.radius.sm,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDeleteText: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '700',
  },
  rowCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attendanceRowTime: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#94a3b8',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxActive: {
    borderColor: colors.primary,
    backgroundColor: '#f0fdfa',
  },
  checkboxInner: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  rememberText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: border.radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  tableWrap: {
    borderRadius: border.radius.sm,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: spacing.xs + 4,
    paddingHorizontal: spacing.xs,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
  },
  tableRowEven: {
    backgroundColor: '#f8fafc',
  },
  tableCell: {
    fontSize: 10,
    color: '#334155',
    paddingHorizontal: 2,
  },
  tableCellId: {
    width: 64,
    fontWeight: '700',
  },
  tableCellName: {
    width: 80,
  },
  tableCellDate: {
    width: 68,
  },
  tableCellTime: {
    width: 56,
  },
  tableCellType: {
    width: 36,
  },
  tableCellFlex: {
    flex: 1,
  },
  tableRowSelected: {
    backgroundColor: '#e0f2fe',
  },
  tableCellCb: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },

  // Attendance Fullscreen & Slide-Over Drawer
  fixedAttendanceContainer: {
    flex: 1,
    backgroundColor: '#020617',
    overflow: 'hidden',
  },
  fixedAttendanceWrap: {
    flex: 1,
    backgroundColor: '#020617',
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  attendanceDrawerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.65)',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  attendanceDrawerTriggerText: {
    color: '#f8fafc',
    fontSize: 12.5,
    fontWeight: '800',
  },
  attendanceDrawerBadge: {
    backgroundColor: '#0284c7',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    marginLeft: 2,
  },
  attendanceDrawerBadgeText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '900',
  },
  drawerModalContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },
  drawerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  drawerModalSheet: {
    width: '86%',
    maxWidth: 420,
    backgroundColor: '#0f172a',
    height: '100%',
    borderLeftWidth: 1.5,
    borderLeftColor: 'rgba(51, 65, 85, 0.8)',
    paddingHorizontal: 16,
    paddingTop: 18,
    shadowColor: '#000',
    shadowOffset: {width: -4, height: 0},
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.6)',
    marginBottom: 14,
  },
  drawerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#f8fafc',
  },
  drawerSubtitle: {
    fontSize: 11.5,
    color: '#94a3b8',
    marginTop: 2,
  },
  drawerCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(51, 65, 85, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerContent: {
    flex: 1,
  },
  drawerSection: {
    marginBottom: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.6)',
    padding: 14,
    gap: 10,
  },
  drawerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.4,
  },
  drawerCamPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1.5,
    borderColor: 'rgba(71, 85, 105, 0.5)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  drawerCamPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: '#10b981',
  },
  drawerCamPillText: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  drawerCamPillTextActive: {
    color: '#f0fdf4',
    fontWeight: '800',
  },
  drawerCamDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#10b981',
  },
  drawerInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  drawerInfoLabel: {
    fontSize: 12,
    color: '#94a3b8',
  },
  drawerInfoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f8fafc',
  },
  drawerReloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  drawerReloadText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  drawerSearchInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.6)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#f8fafc',
    fontSize: 12.5,
  },
  drawerFilterPills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  drawerFilterPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.4)',
  },
  drawerFilterPillActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  drawerFilterPillText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  drawerFilterPillTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  drawerRowsWrap: {
    gap: 8,
    marginTop: 4,
  },
  drawerEmptyText: {
    color: '#64748b',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  drawerRowCard: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.7)',
    padding: 10,
    gap: 5,
  },
  drawerRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerRowName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    marginRight: 6,
  },
  drawerEmpTag: {
    backgroundColor: 'rgba(51, 65, 85, 0.7)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  drawerEmpTagText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  drawerRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerRowTime: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  drawerPaginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  drawerPaginationMeta: {
    color: '#94a3b8',
    fontSize: 11,
  },
  drawerPageBtn: {
    backgroundColor: 'rgba(51, 65, 85, 0.7)',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  drawerPageBtnText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },

  // Manage Faces Modern UX Header & Compact Cards
  manageFacesSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manageFacesSearchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  manageFacesSearchInput: {
    flex: 1,
    padding: 0,
    fontSize: 13,
    color: '#0f172a',
  },
  compactEmployeeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  compactEmployeeCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactEmpName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1,
    marginRight: 6,
  },
  compactEmpIdBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  compactEmpIdText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '800',
  },
  compactDeptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#eff6ff',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  compactDeptText: {
    color: '#1d4ed8',
    fontSize: 10.5,
    fontWeight: '600',
  },
  compactStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  compactStatusText: {
    fontSize: 10.5,
    fontWeight: '700',
  },

  // Action Modal (Popup Card)
  actionModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    padding: 16,
  },
  actionModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  actionModalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
  },
  actionModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  actionModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  actionModalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  actionModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionModalHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  actionModalAvatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2.5,
    borderColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  actionModalAvatarImg: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  actionModalAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionModalInfo: {
    flex: 1,
    gap: 2,
  },
  actionModalName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  actionModalTag: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  actionModalTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  actionModalPill: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  actionModalBtnsGrid: {
    gap: 8,
    marginTop: 2,
  },
  actionModalBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0037b0',
    borderRadius: 10,
    paddingVertical: 11,
  },
  actionModalBtnPrimaryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  actionModalBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    borderRadius: 10,
    paddingVertical: 10,
  },
  actionModalBtnSecondaryText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  actionModalBtnWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1.5,
    borderColor: '#fde68a',
    borderRadius: 10,
    paddingVertical: 10,
  },
  actionModalBtnWarningText: {
    color: '#b45309',
    fontSize: 12.5,
    fontWeight: '800',
  },
  actionModalBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    borderRadius: 10,
    paddingVertical: 10,
  },
  actionModalBtnDangerText: {
    color: '#dc2626',
    fontSize: 12.5,
    fontWeight: '800',
  },

  // Sync Verify Compare Modal & Elements
  syncRowActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  syncRowActionBtnMobile: {
    width: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncRowActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0037b0',
  },
  syncCompareRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  syncCompareCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    padding: 8,
    alignItems: 'center',
    gap: 8,
  },
  syncCompareCardActive: {
    borderColor: '#0037b0',
    backgroundColor: '#eff6ff',
  },
  syncCompareSourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  syncCompareSourceBadgeActive: {
    backgroundColor: '#dbeafe',
  },
  syncCompareSourceText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  syncCompareSourceTextActive: {
    color: '#1d4ed8',
  },
  syncCompareImageBox: {
    width: '100%',
    height: 125,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncCompareImage: {
    width: '100%',
    height: '100%',
  },
  syncComparePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 6,
  },
  syncComparePlaceholderText: {
    fontSize: 10.5,
    color: '#94a3b8',
    textAlign: 'center',
    fontWeight: '500',
  },
  syncRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  syncRadioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  syncRadioCircleActive: {
    borderColor: '#0037b0',
    backgroundColor: '#0037b0',
  },
  syncRadioCircleInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  syncRadioLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  syncRadioLabelActive: {
    color: '#0037b0',
  },
  syncNoticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 10,
    marginTop: 4,
  },
  syncNoticeCardText: {
    flex: 1,
    fontSize: 11.5,
    color: '#92400e',
    lineHeight: 16,
    fontWeight: '500',
  },
  syncFeedbackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginTop: 4,
  },
  syncFeedbackSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  syncFeedbackError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  syncFeedbackText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  // Luxury Account Module Styles
  accKpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  accKpiRowMobile: {
    gap: 6,
  },
  accKpiCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  accKpiCardMobile: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  accKpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accKpiIconWrapMobile: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  accKpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  accKpiValueMobile: {
    fontSize: 16,
  },
  accKpiLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 1,
  },
  accSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accSearchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    minHeight: 46,
  },
  accSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    paddingVertical: 8,
  },
  accRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
  },
  accRefreshBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0037b0',
  },
  accFilterChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  accFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  accFilterChipActive: {
    backgroundColor: '#0037b0',
    borderColor: '#0037b0',
  },
  accFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  accFilterChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  accItemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  accItemCardHighlighted: {
    borderColor: '#0037b0',
    backgroundColor: '#f0f7ff',
  },
  accCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0037b0',
  },
  accInfoWrap: {
    flex: 1,
  },
  accNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  accNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  accIdBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  accIdBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  accDeptText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  accStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  accStatusBadgeActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  accStatusBadgeLocked: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
  },
  accStatusBadgeNone: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  accStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  accStatusBadgeTextActive: {
    color: '#15803d',
  },
  accStatusBadgeTextLocked: {
    color: '#b45309',
  },
  accStatusBadgeTextNone: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  accMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  accUsernamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  accUsernameText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  accFailedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  accFailedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
  },
  accActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  accActionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  accActionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  accActionBtnPrimary: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  accActionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  accActionBtnLock: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  accActionBtnLockText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b91c1c',
  },
  accActionBtnUnlock: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    backgroundColor: '#ecfdf5',
  },
  accActionBtnUnlockText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },

  // Luxury Settings Styles
  settingsGroupCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  settingsGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsGroupIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsGroupTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  settingsGroupSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 16,
  },
  cooldownInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cooldownBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    alignItems: 'center',
  },
  cooldownBoxLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cooldownBoxInput: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    paddingVertical: 2,
    minWidth: 48,
  },
  moduleToggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  moduleToggleTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  moduleToggleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  moduleToggleDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  switchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  switchPillOn: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  switchPillOff: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  switchPillTextOn: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  switchPillTextOff: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
  },
  tableCellTypeBadgeIn: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  tableCellTypeBadgeInText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  tableCellTypeBadgeOut: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  tableCellTypeBadgeOutText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#d97706',
  },
});
