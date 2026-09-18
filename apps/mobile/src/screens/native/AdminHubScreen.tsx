import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, spacing, radii, shadows, typography} from '../../design-system';
import {Icon} from '../../components/Icon';
import {AdminDrawer} from '../../components/AdminDrawer';
import {getGatewayAuth} from '../../services/api';
import type {AdminModuleKey} from '../../types/app';
import {
  getLocalEmployees,
  getLocalTodayAttendance,
  initializeMobileLocalDataStore,
} from '../../services/nativeLocalAttendance';
import {useResponsive} from '../../utils/responsive';

type AdminHubScreenProps = {
  adminUser?: any;
  onOpenAttendance: () => void;
  onOpenConfig: (targetModule?: AdminModuleKey) => void;
  onLogout: () => void;
};

function formatTodayDateString(): string {
  const now = new Date();
  const day = `${now.getDate()}`.padStart(2, '0');
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}

function todayIsoDate(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function AdminHubScreen({
  adminUser,
  onOpenAttendance,
  onOpenConfig,
  onLogout,
}: AdminHubScreenProps) {
  const {isMobile} = useResponsive();
  const tenantDatabase = String(
    adminUser?.database ||
      getGatewayAuth()?.database ||
      getGatewayAuth()?.dbName ||
      getGatewayAuth()?.table ||
      '',
  ).trim();

  const userName = adminUser?.name || adminUser?.username || 'Quản trị viên';
  const roleName = adminUser?.role || 'Quản trị viên';

  // ── Drawer state ──
  const [drawerVisible, setDrawerVisible] = useState(false);

  // ── Dynamic dashboard data ──
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashData, setDashData] = useState({
    totalEmployees: 0,
    presentToday: 0,
    lateToday: 0,
    pendingRegistrations: 0,
    pendingSyncErp: 0,
  });
  const [dashboardError, setDashboardError] = useState('');

  const loadDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setDashboardError('');
    try {
      await initializeMobileLocalDataStore();
      const today = todayIsoDate();
      const [employees, allAttendance] = await Promise.all([
        getLocalEmployees(500),
        getLocalTodayAttendance(500),
      ]);

      const todayAttendance = allAttendance.filter(
        (row: any) =>
          String(row?.attendance_date || row?.date || '').trim() === today,
      );

      const presentEmployeeIds = new Set(
        todayAttendance
          .map((row: any) => String(row?.employee_id || '').trim())
          .filter(Boolean),
      );

      const lateCount = todayAttendance.filter(
        (row: any) =>
          row?.is_late === true ||
          String(row?.status || '')
            .toLowerCase()
            .includes('late') ||
          String(row?.status || '')
            .toLowerCase()
            .includes('muộn'),
      ).length;

      const pendingRegistrations = employees.filter(
        (e: any) => !e?.registered && !e?.has_face,
      ).length;

      const pendingSyncErp = todayAttendance.filter(
        (row: any) => !row?.synced_to_erp && !row?.erp_pushed,
      ).length;

      setDashData({
        totalEmployees: employees.length,
        presentToday: presentEmployeeIds.size,
        lateToday: lateCount,
        pendingRegistrations,
        pendingSyncErp,
      });
    } catch (error) {
      setDashData({
        totalEmployees: 0,
        presentToday: 0,
        lateToday: 0,
        pendingRegistrations: 0,
        pendingSyncErp: 0,
      });
      setDashboardError(
        error instanceof Error ? error.message : 'Không tải được dữ liệu tổng quan.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleRefresh = useCallback(() => {
    loadDashboardData(true);
  }, [loadDashboardData]);

  const handleSelectModuleFromDrawer = (moduleKey: AdminModuleKey) => {
    if (moduleKey === 'attendance') {
      onOpenAttendance();
    } else {
      onOpenConfig(moduleKey);
    }
  };

  const presencePercentage = dashData.totalEmployees > 0
    ? Math.round((dashData.presentToday / dashData.totalEmployees) * 100)
    : 0;

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      {/* Top Bar Header with Hamburger Button */}
      <View style={styles.topAppBar}>
        <View style={styles.topBarLeft}>
          <Pressable
            onPress={() => setDrawerVisible(true)}
            style={styles.hamburgerButton}
            hitSlop={8}>
            <Icon name="menu" size={24} color={colors.primary} />
          </Pressable>
          <Text style={styles.topBarTitle}>SOF Face AI</Text>
        </View>

        <View style={styles.topBarRight}>
          <View style={styles.onlineBadge}>
            <View style={styles.greenDot} />
            <Text style={styles.onlineBadgeText}>Online</Text>
          </View>
          <Pressable onPress={onLogout} style={styles.logoutIconButton} hitSlop={8}>
            <Icon name="logout" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, isMobile && styles.scrollContentMobile]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }>
        {/* Greeting Section */}
        <View style={styles.greetingHeader}>
          <Text style={styles.dateText}>Hôm nay là {formatTodayDateString()}</Text>
          <Text style={[styles.greetingTitle, isMobile && {fontSize: 20}]}>
            Xin chào, {userName}{' '}
            <Text style={[styles.roleSubtext, isMobile && {fontSize: 16}]}>({roleName})</Text>
          </Text>
          {!!tenantDatabase && (
            <Text style={styles.tenantText}>Hệ thống: {tenantDatabase}</Text>
          )}
        </View>

        {dashboardError ? (
          <View style={styles.errorBanner}>
            <Icon name="error" size={18} color={colors.danger} />
            <Text style={styles.errorBannerText}>{dashboardError}</Text>
          </View>
        ) : null}

        {/* Bento Stats Summary Cards */}
        {loading ? (
          <View style={styles.statsLoadingBox}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.statsLoadingText}>Đang tải thống kê...</Text>
          </View>
        ) : (
          <View style={styles.statsGrid}>
            {/* Card 1: Present Employees */}
            <View style={[styles.statCard, isMobile && styles.statCardMobile]}>
              <View style={styles.statIconRow}>
                <Icon name="check_circle" size={isMobile ? 16 : 20} color={colors.success} />
                <Text style={[styles.statCategoryLabel, isMobile && {fontSize: 9.5}]} numberOfLines={1}>
                  CÓ MẶT
                </Text>
              </View>
              <View style={styles.statNumberRow}>
                <Text style={[styles.statNumberBig, isMobile && {fontSize: 26}]}>{dashData.presentToday}</Text>
                <Text style={styles.statNumberSub}>/{dashData.totalEmployees}</Text>
              </View>
              <View style={styles.statMetaRow}>
                <Icon name="trending_up" size={14} color={colors.success} />
                <Text style={[styles.statMetaTextSuccess, isMobile && {fontSize: 11}]} numberOfLines={1}>
                  {presencePercentage}% Hiện diện
                </Text>
              </View>
            </View>

            {/* Card 2: Late Employees */}
            <View style={[styles.statCard, isMobile && styles.statCardMobile]}>
              <View style={styles.statIconRow}>
                <Icon name="schedule" size={isMobile ? 16 : 20} color={colors.warning} />
                <Text style={[styles.statCategoryLabel, isMobile && {fontSize: 9.5}]} numberOfLines={1}>
                  ĐI MUỘN
                </Text>
              </View>
              <View style={styles.statNumberRow}>
                <Text style={[styles.statNumberWarning, isMobile && {fontSize: 26}]}>{dashData.lateToday}</Text>
              </View>
              <View style={styles.statMetaRow}>
                <Text style={[styles.statMetaTextMuted, isMobile && {fontSize: 11}]} numberOfLines={1}>Cần theo dõi</Text>
              </View>
            </View>
          </View>
        )}

        {/* Dynamic Notification Card */}
        <View style={styles.notificationCard}>
          <View style={styles.notifCardHeader}>
            <Icon name="notifications" size={22} color={colors.textOnPrimary} />
            <Text style={styles.notifCardTitle}>Thông báo chú ý</Text>
          </View>

          <View style={styles.notifList}>
            <View style={styles.notifItemBox}>
              <Icon name="person_add" size={18} color={colors.textOnPrimary} />
              <Text style={styles.notifItemText}>
                {dashData.pendingRegistrations} hồ sơ mới đang chờ đăng ký khuôn mặt.
              </Text>
            </View>

            <View style={styles.notifItemBox}>
              <Icon name="sync_problem" size={18} color={colors.textOnPrimary} />
              <Text style={styles.notifItemText}>
                {dashData.pendingSyncErp} dữ liệu chấm công chưa được đồng bộ với ERP.
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => onOpenConfig(
              dashData.pendingSyncErp > 0 ? 'report' : 'manage_faces',
            )}
            style={({pressed}) => [
              styles.notifDetailLink,
              pressed && {opacity: 0.8},
            ]}>
            <Text style={styles.notifDetailLinkText}>Xem chi tiết</Text>
            <Icon name="arrow-right" size={16} color={colors.textOnPrimary} />
          </Pressable>
        </View>

        {/* 2 Large Primary CTA Buttons */}
        <View style={styles.ctaButtonSection}>
          {/* Large Button 1: Start Attendance */}
          <Pressable
            onPress={onOpenAttendance}
            style={({pressed}) => [
              styles.bigCtaPrimaryButton,
              isMobile && styles.bigCtaPrimaryButtonMobile,
              pressed && styles.buttonPressed,
            ]}>
            <View style={styles.ctaIconBadge}>
              <Icon name="camera_front" size={24} color={colors.primary} />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.bigCtaPrimaryText}>
                Bắt đầu chấm công toàn công ty
              </Text>
              <Text style={styles.bigCtaPrimarySubtext}>
                Nhận diện khuôn mặt tự động qua camera
              </Text>
            </View>
            <Icon name="arrow-right" size={20} color={colors.textOnPrimary} />
          </Pressable>
        </View>

        {/* Section: Feature Hub Cards (To, rõ, dễ dùng) */}
        <View style={styles.featuresSection}>
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeadingTitle}>Tính năng hệ thống</Text>
            <Text style={styles.sectionHeadingSub}>
              Chạm để truy cập nhanh các phân hệ nghiệp vụ
            </Text>
          </View>

          <View style={styles.featuresGrid}>
            {/* Feature 1: Unified Reports & Data */}
            <Pressable
              onPress={() => onOpenConfig('report')}
              style={({pressed}) => [
                styles.featureCard,
                isMobile && styles.featureCardMobile,
                pressed && styles.buttonPressed,
              ]}>
              <View style={[styles.featureIconBox, {backgroundColor: '#eff6ff'}]}>
                <Icon name="analytics" size={isMobile ? 24 : 28} color="#1d4ed8" />
              </View>
              <View style={styles.featureCardBody}>
                <View style={styles.featureTitleRow}>
                  <Text style={[styles.featureTitle, isMobile && {fontSize: 14.5}]}>Báo cáo & Dữ liệu</Text>
                  {dashData.pendingSyncErp > 0 ? (
                    <View style={styles.featureBadgeWarning}>
                      <Text style={styles.featureBadgeWarningText}>
                        {dashData.pendingSyncErp} chờ gửi
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.featureBadgeSuccess}>
                      <Text style={styles.featureBadgeSuccessText}>Đầy đủ</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.featureDesc}>
                  Báo cáo đồng bộ ERP, danh sách chờ đẩy và bộ nhớ máy
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color="#94a3b8" />
            </Pressable>

            {/* Feature 2: HR & Faces */}
            <Pressable
              onPress={() => onOpenConfig('manage_faces')}
              style={({pressed}) => [
                styles.featureCard,
                isMobile && styles.featureCardMobile,
                pressed && styles.buttonPressed,
              ]}>
              <View style={[styles.featureIconBox, {backgroundColor: '#fdf2f8'}]}>
                <Icon name="people" size={isMobile ? 24 : 28} color="#db2777" />
              </View>
              <View style={styles.featureCardBody}>
                <View style={styles.featureTitleRow}>
                  <Text style={[styles.featureTitle, isMobile && {fontSize: 14.5}]}>Nhân sự & Khuôn mặt</Text>
                  {dashData.pendingRegistrations > 0 ? (
                    <View style={styles.featureBadgeWarning}>
                      <Text style={styles.featureBadgeWarningText}>
                        {dashData.pendingRegistrations} chờ ảnh
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.featureDesc}>
                  Quản lý {dashData.totalEmployees} nhân viên, đăng ký mẫu mặt và tài khoản
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color="#94a3b8" />
            </Pressable>

            {/* Feature 3: ERP Sync & Verification */}
            <Pressable
              onPress={() => onOpenConfig('register')}
              style={({pressed}) => [
                styles.featureCard,
                isMobile && styles.featureCardMobile,
                pressed && styles.buttonPressed,
              ]}>
              <View style={[styles.featureIconBox, {backgroundColor: '#ecfdf5'}]}>
                <Icon name="download" size={isMobile ? 24 : 28} color="#059669" />
              </View>
              <View style={styles.featureCardBody}>
                <Text style={[styles.featureTitle, isMobile && {fontSize: 14.5}]}>Tải dữ liệu từ ERP</Text>
                <Text style={styles.featureDesc}>
                  Đồng bộ danh sách nhân viên và đối soát khuôn mặt từ máy chủ
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color="#94a3b8" />
            </Pressable>

            {/* Feature 4: Settings & Camera Management */}
            <Pressable
              onPress={() => onOpenConfig('system_settings')}
              style={({pressed}) => [
                styles.featureCard,
                isMobile && styles.featureCardMobile,
                pressed && styles.buttonPressed,
              ]}>
              <View style={[styles.featureIconBox, {backgroundColor: '#fef3c7'}]}>
                <Icon name="settings" size={isMobile ? 24 : 28} color="#d97706" />
              </View>
              <View style={styles.featureCardBody}>
                <Text style={[styles.featureTitle, isMobile && {fontSize: 14.5}]}>Cài đặt & Camera</Text>
                <Text style={styles.featureDesc}>
                  Quản lý camera RTSP, chế độ chấm công và cấu hình hệ thống
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color="#94a3b8" />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Navigation Drawer Component */}
      <AdminDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        currentModule="dashboard"
        onSelectModule={handleSelectModuleFromDrawer}
        onBackToPortal={() => setDrawerVisible(false)}
        onLogout={onLogout}
        adminUser={adminUser}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.page,
  },
  topAppBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hamburgerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  onlineBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.successText,
  },
  logoutIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.dangerText,
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  greetingHeader: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
  },
  dateText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  greetingTitle: {
    ...typography.heading1,
    color: colors.textPrimary,
  },
  roleSubtext: {
    ...typography.heading2,
    color: colors.primary,
    fontWeight: '400',
  },
  tenantText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  statsLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  statsLoadingText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
    minHeight: 140,
    ...shadows.sm,
  },
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  statCategoryLabel: {
    ...typography.eyebrow,
    color: colors.textSecondary,
  },
  statNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statNumberBig: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statNumberSub: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: '600',
  },
  statNumberWarning: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.danger,
  },
  statMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  statMetaTextSuccess: {
    ...typography.bodySmall,
    color: colors.successText,
    fontWeight: '600',
  },
  statMetaTextMuted: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  notificationCard: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.md,
  },
  notifCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  notifCardTitle: {
    ...typography.heading3,
    color: colors.textOnPrimary,
  },
  notifList: {
    gap: spacing.sm,
  },
  notifItemBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    padding: spacing.md,
    borderRadius: radii.md,
  },
  notifItemText: {
    ...typography.body,
    color: colors.textOnPrimary,
    flex: 1,
  },
  notifDetailLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  notifDetailLinkText: {
    ...typography.buttonSmall,
    color: colors.textOnPrimary,
  },
  ctaButtonSection: {
    gap: spacing.md,
  },
  bigCtaPrimaryButton: {
    backgroundColor: colors.primaryContainer,
    minHeight: 74,
    borderRadius: radii.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadows.md,
  },
  ctaIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigCtaPrimaryText: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  bigCtaPrimarySubtext: {
    fontSize: 13,
    color: '#dbeafe',
    marginTop: 2,
  },
  featuresSection: {
    gap: spacing.md,
  },
  sectionHeaderWrap: {
    gap: 2,
    marginBottom: spacing.xs,
  },
  sectionHeadingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  sectionHeadingSub: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  featuresGrid: {
    gap: spacing.md,
  },
  featureCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 82,
    ...shadows.sm,
  },
  featureIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCardBody: {
    flex: 1,
    gap: 4,
  },
  featureTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  featureDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  featureBadgeWarning: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  featureBadgeWarningText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
  },
  featureBadgeSuccess: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  featureBadgeSuccessText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{scale: 0.98}],
  },
  scrollContentMobile: {
    padding: spacing.md,
    gap: spacing.md,
  },
  statCardMobile: {
    padding: 10,
    minHeight: 120,
    borderRadius: radii.lg,
  },
  featureCardMobile: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.lg,
  },
  bigCtaPrimaryButtonMobile: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.xl,
    minHeight: 68,
  },
});
