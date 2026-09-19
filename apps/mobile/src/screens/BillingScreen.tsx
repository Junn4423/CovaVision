import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {api} from '../services/api';
import {colors, radii, shadows, spacing} from '../design-system';

type Plan = {
  code: string;
  name: string;
  max_employees?: number | null;
  max_face_templates?: number | null;
  monthly_price_vnd?: number;
  contact_only?: boolean;
};

type Props = {onBack: () => void};

const money = (value: unknown) => `${Number(value || 0).toLocaleString('vi-VN')}đ / tháng`;

export function BillingScreen({onBack}: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [planResponse, summaryResponse] = await Promise.all([
        api.getBillingPlans(),
        api.getBillingSummary(),
      ]);
      if (Array.isArray(planResponse?.plans)) setPlans(planResponse.plans);
      if (summaryResponse?.success) setSummary(summaryResponse);
      if (!planResponse?.success || !summaryResponse?.success) {
        setError(planResponse?.message || summaryResponse?.message || 'Không tải được thông tin gói.');
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Không thể kết nối máy chủ thanh toán.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!payment?.order_code || payment.status === 'PAID') return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await api.getPaymentStatus(payment.order_code);
        if (response?.payment) {
          setPayment(response.payment);
          if (response.payment.status === 'PAID') load();
        }
      } catch {
        // Keep the QR state visible; a temporary poll failure must not erase it.
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [load, payment?.order_code, payment?.status]);

  const activeCode = String(summary?.plan?.code || '').toLowerCase();
  const usage = summary?.usage || {};
  const employeeLimit = summary?.plan?.max_employees;
  const usagePercent = useMemo(() => {
    if (!employeeLimit) return 0;
    return Math.min(100, Math.round((Number(usage.employees || 0) / Number(employeeLimit)) * 100));
  }, [employeeLimit, usage.employees]);

  async function buy(plan: Plan) {
    if (plan.contact_only) {
      setError('Gói Business cần liên hệ kinh doanh. Hãy dùng kênh liên hệ chính thức của CovaVision.');
      return;
    }
    setBusyPlan(plan.code);
    setError('');
    try {
      const response = await api.createBillingCheckout(plan.code);
      if (!response?.success) setError(response?.message || 'Không tạo được đơn thanh toán.');
      else setPayment(response.payment);
    } catch (checkoutError: any) {
      setError(checkoutError?.message || 'Không tạo được đơn thanh toán.');
    } finally {
      setBusyPlan('');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>WORKSPACE</Text>
            <Text style={styles.title}>Gói nhân sự</Text>
          </View>
          <Pressable onPress={load} style={styles.refreshButton}>
            <Text style={styles.refreshText}>Làm mới</Text>
          </Pressable>
        </View>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={styles.loader} />
        ) : (
          <>
            {summary ? (
              <View style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <View>
                    <Text style={styles.label}>GÓI HIỆN TẠI</Text>
                    <Text style={styles.currentPlan}>{summary.plan?.name || 'Dùng thử'}</Text>
                  </View>
                  <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>{summary.subscription?.status || 'ACTIVE'}</Text></View>
                </View>
                <Text style={styles.muted}>Hết hạn: {summary.subscription?.ends_at ? new Date(summary.subscription.ends_at).toLocaleDateString('vi-VN') : 'Theo hợp đồng'}</Text>
                <View style={styles.usageRow}>
                  <Text style={styles.usageText}>Nhân viên</Text>
                  <Text style={styles.usageValue}>{usage.employees || 0} / {employeeLimit ?? '∞'}</Text>
                </View>
                <View style={styles.progressTrack}><View style={[styles.progressFill, {width: `${usagePercent}%`}]} /></View>
                <Text style={styles.muted}>Khuôn mặt: {usage.face_templates || 0} / {summary.plan?.max_face_templates ?? '∞'}</Text>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Chọn gói phù hợp</Text>
            {plans.map(plan => {
              const current = activeCode === plan.code;
              return (
                <View key={plan.code} style={[styles.planCard, current && styles.planCardActive]}>
                  <View style={styles.planTopLine}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    {current ? <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>Đang dùng</Text></View> : null}
                  </View>
                  <Text style={styles.price}>{plan.contact_only ? 'Liên hệ' : Number(plan.monthly_price_vnd || 0) === 0 ? 'Miễn phí' : money(plan.monthly_price_vnd)}</Text>
                  <Text style={styles.planDetail}>{plan.max_employees ?? 'Không giới hạn'} nhân viên • {plan.max_face_templates ?? 'Không giới hạn'} khuôn mặt</Text>
                  <Pressable
                    disabled={current || busyPlan === plan.code}
                    onPress={() => buy(plan)}
                    style={({pressed}) => [styles.buyButton, current && styles.buyButtonDisabled, pressed && styles.pressed]}
                  >
                    {busyPlan === plan.code ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.buyText}>{current ? 'Gói hiện tại' : plan.contact_only ? 'Liên hệ tư vấn' : 'Chọn gói'}</Text>}
                  </Pressable>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {payment ? (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Pressable onPress={() => setPayment(null)} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable>
            {payment.status === 'PAID' ? (
              <>
                <Text style={styles.modalTitle}>Thanh toán thành công</Text>
                <Text style={styles.muted}>Gói {payment.plan_code} đã được kích hoạt.</Text>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Quét QR để thanh toán</Text>
                <Text style={styles.muted}>Mã đơn: {payment.order_code}</Text>
                {payment.qr_code_url ? <Image source={{uri: payment.qr_code_url}} style={styles.qr} /> : <View style={styles.warningBox}><Text style={styles.warningText}>Backend chưa cấu hình tài khoản SePay để tạo QR.</Text></View>}
                <Text style={styles.modalAmount}>{Number(payment.amount_vnd || 0).toLocaleString('vi-VN')}đ</Text>
                <Text style={styles.muted}>Ứng dụng tự kiểm tra trạng thái mỗi 3 giây.</Text>
              </>
            )}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.pageBackground},
  content: {padding: spacing.md + 4, gap: spacing.md, paddingBottom: spacing.xl * 2},
  header: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  backButton: {width: 40, height: 40, borderRadius: radii.lg, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border},
  backText: {fontSize: 30, lineHeight: 32, color: colors.primaryDark},
  headerText: {flex: 1},
  eyebrow: {fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: colors.primary},
  title: {fontSize: 24, fontWeight: '900', color: colors.textPrimary},
  refreshButton: {paddingHorizontal: spacing.sm, paddingVertical: spacing.xs},
  refreshText: {fontSize: 12, fontWeight: '800', color: colors.primary},
  loader: {marginTop: spacing.xl},
  errorBox: {borderRadius: radii.md, padding: spacing.sm, backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3'},
  errorText: {color: '#be123c', fontSize: 13, lineHeight: 19},
  summaryCard: {backgroundColor: colors.card, borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadows.sm},
  summaryHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'},
  label: {fontSize: 10, letterSpacing: 1, fontWeight: '900', color: colors.textMuted},
  currentPlan: {fontSize: 22, fontWeight: '900', color: colors.textPrimary, marginTop: 3},
  activeBadge: {borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 5, backgroundColor: colors.successBg},
  activeBadgeText: {fontSize: 10, fontWeight: '900', color: colors.success},
  muted: {fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: 5},
  usageRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md},
  usageText: {fontSize: 13, color: colors.textSecondary},
  usageValue: {fontSize: 13, fontWeight: '900', color: colors.textPrimary},
  progressTrack: {height: 8, backgroundColor: colors.slate[100], borderRadius: radii.full, overflow: 'hidden', marginVertical: spacing.xs},
  progressFill: {height: '100%', backgroundColor: colors.primary, borderRadius: radii.full},
  sectionTitle: {fontSize: 18, fontWeight: '900', color: colors.textPrimary, marginTop: spacing.xs},
  planCard: {backgroundColor: colors.card, borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadows.sm},
  planCardActive: {borderColor: colors.primary, borderWidth: 2},
  planTopLine: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  planName: {fontSize: 16, fontWeight: '900', color: colors.primaryDark},
  currentBadge: {borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: colors.primaryBg},
  currentBadgeText: {fontSize: 10, fontWeight: '900', color: colors.primary},
  price: {fontSize: 20, fontWeight: '900', color: colors.textPrimary, marginTop: spacing.xs},
  planDetail: {fontSize: 12, color: colors.textSecondary, marginTop: 4},
  buyButton: {marginTop: spacing.md, minHeight: 42, borderRadius: radii.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center'},
  buyButtonDisabled: {backgroundColor: colors.slate[200]},
  buyText: {color: '#fff', fontSize: 13, fontWeight: '900'},
  pressed: {opacity: 0.8},
  modalOverlay: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(13,27,42,0.55)', justifyContent: 'center', padding: spacing.lg},
  modal: {backgroundColor: colors.card, borderRadius: radii.xl, padding: spacing.lg, alignItems: 'center', ...shadows.lg},
  closeButton: {alignSelf: 'flex-end', width: 32, height: 32, alignItems: 'center', justifyContent: 'center'},
  closeText: {fontSize: 26, lineHeight: 26, color: colors.textSecondary},
  modalTitle: {fontSize: 20, fontWeight: '900', color: colors.textPrimary, textAlign: 'center'},
  qr: {width: 240, height: 240, marginVertical: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border},
  modalAmount: {fontSize: 20, fontWeight: '900', color: colors.primaryDark, marginTop: spacing.md},
  warningBox: {padding: spacing.md, marginVertical: spacing.md, borderRadius: radii.md, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a'},
  warningText: {fontSize: 13, lineHeight: 19, color: '#92400e', textAlign: 'center'},
});
