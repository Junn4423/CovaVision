import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View} from 'react-native';
import {api} from '../services/api';
import {colors} from '../theme';

type Props = {
  adminUser?: any;
  onOpenAttendance: () => void;
  onOpenEmployeeRegister: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
};

export function CovaVisionAdminHomeScreen({
  adminUser,
  onOpenAttendance,
  onOpenEmployeeRegister,
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
      setStats({today: Number(statsResponse?.today || 0), total: Number(statsResponse?.total || 0)});
      setEmployees(Array.isArray(employeeResponse?.employees) ? employeeResponse.employees.length : 0);
      setCameras(Array.isArray(cameraResponse?.cameras) ? cameraResponse.cameras.length : 0);
    } catch (loadError: any) {
      setError(loadError?.message || 'Không tải được dữ liệu hệ thống.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>COVAVISION</Text><Text style={styles.title}>Tổng quan</Text><Text style={styles.subtitle}>Xin chào {adminUser?.name || adminUser?.username || 'quản trị viên'}.</Text></View>
          <Pressable onPress={onLogout} style={styles.logout}><Text style={styles.logoutText}>Đăng xuất</Text></Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.statsGrid}>
          <Stat label="Điểm danh hôm nay" value={loading ? '—' : stats.today} />
          <Stat label="Tổng lượt" value={loading ? '—' : stats.total} />
          <Stat label="Nhân viên" value={loading ? '—' : employees} />
          <Stat label="Camera" value={loading ? '—' : cameras} />
        </View>
        <Pressable onPress={onOpenAttendance} style={styles.primaryAction}><Text style={styles.primaryActionTitle}>Bắt đầu điểm danh</Text><Text style={styles.primaryActionText}>Mở camera và nhận diện khuôn mặt</Text></Pressable>
        <View style={styles.actionGrid}>
          <Action title="Đăng ký khuôn mặt" detail="Thêm nhân viên và mẫu mặt" onPress={onOpenEmployeeRegister} />
          <Action title="Cấu hình kết nối" detail="Thay đổi API CovaVision" onPress={onOpenSettings} />
          <Action title="Làm mới dữ liệu" detail="Đồng bộ trạng thái hiện tại" onPress={load} />
        </View>
        <View style={styles.note}><Text style={styles.noteTitle}>Bảo mật camera</Text><Text style={styles.noteText}>Camera RTSP chỉ được backend mở và proxy. Ứng dụng mobile không nhận URL RTSP, tài khoản hoặc IP nội bộ.</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({label, value}: {label: string; value: number | string}) {
  return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>;
}

function Action({title, detail, onPress}: {title: string; detail: string; onPress: () => void}) {
  return <Pressable onPress={onPress} style={({pressed}) => [styles.action, pressed && styles.pressed]}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionText}>{detail}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.pageBackground},
  content: {padding: 20, gap: 16},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'},
  eyebrow: {fontSize: 12, fontWeight: '800', letterSpacing: 2, color: '#2563eb'},
  title: {fontSize: 30, fontWeight: '900', color: '#0f172a', marginTop: 5},
  subtitle: {color: '#64748b', marginTop: 4},
  logout: {paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: '#fee2e2'},
  logoutText: {fontSize: 12, fontWeight: '800', color: '#b91c1c'},
  error: {color: '#b91c1c', backgroundColor: '#fef2f2', borderRadius: 10, padding: 12},
  statsGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  stat: {width: '48%', backgroundColor: '#fff', borderRadius: 14, padding: 14, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2},
  statLabel: {fontSize: 12, color: '#64748b'},
  statValue: {fontSize: 25, fontWeight: '900', color: '#0f172a', marginTop: 6},
  primaryAction: {backgroundColor: '#2563eb', borderRadius: 16, padding: 18},
  primaryActionTitle: {fontSize: 18, fontWeight: '900', color: '#fff'},
  primaryActionText: {fontSize: 13, color: '#dbeafe', marginTop: 5},
  actionGrid: {gap: 10},
  action: {backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0'},
  pressed: {opacity: 0.75},
  actionTitle: {fontWeight: '800', fontSize: 15, color: '#0f172a'},
  actionText: {fontSize: 12, color: '#64748b', marginTop: 4},
  note: {backgroundColor: '#eff6ff', borderRadius: 14, padding: 14},
  noteTitle: {fontWeight: '800', color: '#1d4ed8'},
  noteText: {color: '#1e40af', fontSize: 12, lineHeight: 18, marginTop: 5},
});
