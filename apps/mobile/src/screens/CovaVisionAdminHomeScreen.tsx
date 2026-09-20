import React, {useCallback, useEffect, useState} from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {api} from '../services/api';
import {colors, radii, shadows, spacing} from '../design-system';

type Props = {
  adminUser?: any;
  onOpenAttendance: () => void;
  onOpenEmployeeRegister: () => void;
  onOpenBilling: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
};

export function CovaVisionAdminHomeScreen({
  adminUser,
  onOpenAttendance,
  onOpenEmployeeRegister,
  onOpenBilling,
  onOpenSettings,
  onLogout,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({today: 0, total: 0});
  const [employees, setEmployees] = useState(0);
  const [cameras, setCameras] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [statsResponse, employeeResponse, cameraResponse] = await Promise.all([
        api.getStats().catch(() => ({})),
        api.getEmployees().catch(() => ({})),
        api.getCameras().catch(() => ({})),
      ]);
      setStats({
        today: Number(statsResponse?.today || 0),
        total: Number(statsResponse?.total || 0),
      });
      setEmployees(
        Array.isArray(employeeResponse?.employees) ? employeeResponse.employees.length : 0
      );
      setCameras(
        Array.isArray(cameraResponse?.cameras) ? cameraResponse.cameras.length : 0
      );
    } catch (loadError: any) {
      setError(loadError?.message || 'Không tải được dữ liệu hệ thống.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const userName = adminUser?.name || adminUser?.username || 'Quản trị viên';
  const userInitials = (userName || 'CV').slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header with User Info & Logout */}
        <View style={styles.header}>
          <View style={styles.userInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{userInitials}</Text>
            </View>
            <View>
              <Text style={styles.eyebrow}>COVAVISION</Text>
              <Text style={styles.userName}>{userName}</Text>
            </View>
          </View>
          <Pressable
            onPress={onLogout}
            style={({pressed}) => [styles.logout, pressed && styles.pressed]}
          >
            <Text style={styles.logoutText}>Đăng xuất</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Primary CTA: Start Attendance */}
        <Pressable
          onPress={onOpenAttendance}
          style={({pressed}) => [styles.primaryAction, pressed && styles.pressed]}
        >
          <View style={styles.primaryActionContent}>
            <View style={styles.primaryActionBadge}>
              <Text style={styles.primaryActionBadgeText}>CAM</Text>
            </View>
            <View style={styles.primaryActionTextWrapper}>
              <Text style={styles.primaryActionTitle}>Bắt đầu điểm danh</Text>
              <Text style={styles.primaryActionSubtitle}>
                Quét khuôn mặt trực tiếp qua camera di động
              </Text>
            </View>
          </View>
          <View style={styles.arrowCircle}>
            <Text style={styles.arrowText}>→</Text>
          </View>
        </Pressable>

        {/* Stats 2x2 Bento Grid */}
        <View style={styles.statsGrid}>
          <Stat
            label="Hôm nay"
            value={loading ? '—' : stats.today}
            sublabel="Lượt điểm danh"
            variant="blue"
          />
          <Stat
            label="Tổng bản ghi"
            value={loading ? '—' : stats.total}
            sublabel="Trong hệ thống"
            variant="emerald"
          />
          <Stat
            label="Nhân sự"
            value={loading ? '—' : employees}
            sublabel="Hồ sơ nhân viên"
            variant="purple"
          />
          <Stat
            label="Camera"
            value={loading ? '—' : cameras}
            sublabel="Nguồn thu kết nối"
            variant="amber"
          />
        </View>

        {/* Quick Operations Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Chức năng vận hành</Text>
        </View>

        <View style={styles.actionGrid}>
          <Action
            title="Đăng ký khuôn mặt mới"
            detail="Chụp và lưu trữ mẫu nhận diện nhân sự"
            badge="Thêm mới"
            badgeColor="primary"
            onPress={onOpenEmployeeRegister}
          />
          <Action
            title="Cấu hình kết nối máy chủ"
            detail="Đổi IP máy chủ API CovaVision & port"
            badge="Hệ thống"
            badgeColor="neutral"
            onPress={onOpenSettings}
          />
          <Action
            title="Gói nhân sự & thanh toán"
            detail="Theo dõi quota và thanh toán SePay bằng QR"
            badge="Mới"
            badgeColor="primary"
            onPress={onOpenBilling}
          />
          <Action
            title="Làm mới trạng thái"
            detail="Đồng bộ số liệu và kết nối thời gian thực"
            badge="Đồng bộ"
            badgeColor="success"
            onPress={load}
          />
        </View>

        {/* Security Info Card */}
        <View style={styles.note}>
          <Text style={styles.noteTitle}>Bảo mật & Mã hóa dữ liệu</Text>
          <Text style={styles.noteText}>
            Dữ liệu sinh trắc học và ảnh chụp điểm danh được mã hóa và xác thực an toàn qua máy chủ backend CovaVision.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  sublabel,
  variant,
}: {
  label: string;
  value: number | string;
  sublabel: string;
  variant: 'blue' | 'emerald' | 'purple' | 'amber';
}) {
  const accentColors = {
    blue: colors.primary,
    emerald: colors.success,
    purple: '#7c3aed',
    amber: colors.warning,
  }[variant];

  return (
    <View style={styles.stat}>
      <View style={styles.statHeader}>
        <View style={[styles.statDot, {backgroundColor: accentColors}]} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSublabel}>{sublabel}</Text>
    </View>
  );
}

function Action({
  title,
  detail,
  badge,
  badgeColor,
  onPress,
}: {
  title: string;
  detail: string;
  badge: string;
  badgeColor: 'primary' | 'success' | 'neutral';
  onPress: () => void;
}) {
  const badgeStyles = {
    primary: {bg: colors.primaryBg, text: colors.primary},
    success: {bg: colors.successBg, text: colors.success},
    neutral: {bg: colors.slate[100], text: colors.textSecondary},
  }[badgeColor];

  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [styles.action, pressed && styles.pressed]}
    >
      <View style={styles.actionLeft}>
        <View style={styles.actionTitleRow}>
          <Text style={styles.actionTitle}>{title}</Text>
          <View style={[styles.actionBadge, {backgroundColor: badgeStyles.bg}]}>
            <Text style={[styles.actionBadgeText, {color: badgeStyles.text}]}>
              {badge}
            </Text>
          </View>
        </View>
        <Text style={styles.actionText}>{detail}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  content: {
    padding: spacing.md + 4,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.xl || 14,
    backgroundColor: colors.primaryBg,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.primary,
  },
  userName: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 1,
  },
  logout: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    borderRadius: radii.lg || 12,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.dangerText,
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: radii.lg || 12,
    padding: spacing.md,
  },
  errorText: {
    color: colors.dangerText,
    fontSize: 13,
    fontWeight: '600',
  },
  primaryAction: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl || 16,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.md,
  },
  primaryActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  primaryActionBadge: {
    width: 44,
    height: 44,
    borderRadius: radii.lg || 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionBadgeText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  primaryActionTextWrapper: {
    flex: 1,
  },
  primaryActionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#ffffff',
  },
  primaryActionSubtitle: {
    fontSize: 12,
    color: '#bfdbfe',
    marginTop: 2,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm + 2,
  },
  stat: {
    width: '48.5%',
    backgroundColor: colors.card,
    borderRadius: radii.lg || 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 6,
  },
  statSublabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  sectionHeader: {
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  actionGrid: {
    gap: spacing.sm,
  },
  action: {
    backgroundColor: colors.card,
    borderRadius: radii.lg || 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.sm,
  },
  actionLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  actionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionTitle: {
    fontWeight: '800',
    fontSize: 14,
    color: colors.textPrimary,
  },
  actionBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  actionText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
  },
  chevron: {
    fontSize: 22,
    color: colors.textMuted,
    fontWeight: '300',
  },
  pressed: {
    opacity: 0.85,
    transform: [{scale: 0.99}],
  },
  note: {
    backgroundColor: colors.primaryBg,
    borderColor: colors.primaryBorder,
    borderWidth: 1,
    borderRadius: radii.lg || 14,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  noteTitle: {
    fontWeight: '800',
    color: colors.primary,
    fontSize: 13,
  },
  noteText: {
    color: '#1e40af',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});
