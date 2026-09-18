import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Icon} from '../../components/Icon';
import RNFS from 'react-native-fs';
import {api} from '../../services/api';
import {colors, spacing, radii} from '../../design-system';
import {FaceCaptureCamera} from '../../components/attendance/FaceCaptureCamera';
import {syncMobileEmployeesFromServer, setCachedEmployeeImageUri} from '../../services/mobileLocalData';
import {useResponsive} from '../../utils/responsive';

type EmployeeRegistrationScreenProps = {
  initialEmployee?: any;
  onBack: () => void;
};

export function EmployeeRegistrationScreen({
  initialEmployee,
  onBack,
}: EmployeeRegistrationScreenProps) {
  const {isMobile} = useResponsive();
  const [employeeId, setEmployeeId] = useState(
    String(initialEmployee?.employee_id || ''),
  );
  const [name, setName] = useState(
    String(initialEmployee?.name || initialEmployee?.employee_name || ''),
  );
  const [department, setDepartment] = useState(
    String(initialEmployee?.department || ''),
  );
  const [position, setPosition] = useState(
    String(initialEmployee?.position || ''),
  );
  const [capturedUri, setCapturedUri] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const normalizedEmployeeId = employeeId.trim();
  const normalizedName = name.trim();
  const isErpEmployee = Boolean(initialEmployee?.employee_id);
  const isExistingLocalEmployee = initialEmployee?.registered === true;

  const canSubmit =
    normalizedEmployeeId.length > 0 &&
    normalizedName.length > 0 &&
    capturedUri.length > 0 &&
    !submitting;

  const handleCapture = useCallback((uri: string) => {
    setCapturedUri(uri);
    setFeedback(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      let imageBase64 = '';
      try {
        const normalizedUri = String(capturedUri || '').trim();
        const filePath = normalizedUri.replace(/^file:\/\//, '');
        const rawBase64 = await RNFS.readFile(filePath, 'base64');
        imageBase64 = `data:image/jpeg;base64,${rawBase64}`;
      } catch {
        throw new Error('Không thể đọc dữ liệu ảnh. Vui lòng thử lại.');
      }

      const payload = {
        employee_id: normalizedEmployeeId,
        name: normalizedName,
        department: department.trim(),
        position: position.trim(),
        image_base64: imageBase64,
      };

      let response = isExistingLocalEmployee
        ? await api.updateFaceBase64({...payload, replace_all: true})
        : await api.registerBase64(payload);

      if (!response?.success && isExistingLocalEmployee) {
        const errStr = String(response?.message || '').toLowerCase();
        if (
          errStr.includes('không tìm thấy') ||
          errStr.includes('not found') ||
          errStr.includes('chưa đăng ký') ||
          errStr.includes('chưa có') ||
          errStr.includes('404')
        ) {
          response = await api.registerBase64(payload);
        }
      }

      if (response?.success) {
        const successMessage = response?.warning
          ? `${response.message || 'Đã lưu khuôn mặt.'}\n${response.warning}`
          : response.message
            || (isExistingLocalEmployee
              ? `Đã cập nhật khuôn mặt cho ${normalizedEmployeeId}.`
              : `Đã đăng ký khuôn mặt cho ${normalizedEmployeeId}.`);
        setFeedback({
          type: 'success',
          message: successMessage,
        });
        Alert.alert(
          isExistingLocalEmployee ? 'Cập nhật thành công' : 'Đăng ký thành công',
          successMessage,
          [
            {
              text: 'OK',
              onPress: () => {
                if (response?.image_base64 || imageBase64) {
                  setCachedEmployeeImageUri(normalizedEmployeeId, response?.image_base64 || imageBase64);
                }
                syncMobileEmployeesFromServer().catch(() => {});
                onBack();
              },
            },
          ],
        );
      } else {
        const errorMsg = response?.message || 'Đăng ký thất bại.';
        setFeedback({
          type: 'error',
          message: errorMsg,
        });
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Lỗi kết nối khi đăng ký.',
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    capturedUri,
    normalizedEmployeeId,
    normalizedName,
    department,
    position,
    isExistingLocalEmployee,
    onBack,
  ]);

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <View style={styles.topAppBar}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Icon name="chevron-left" size={22} color="#0037b0" />
        </Pressable>
        <Text style={[styles.topBarTitle, isMobile && {fontSize: 16}]}>
          {isExistingLocalEmployee ? 'Cập nhật khuôn mặt' : 'Đăng ký khuôn mặt'}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
          keyboardShouldPersistTaps="handled">
          <View style={[styles.heroCard, isMobile && styles.heroCardMobile]}>
            <Text style={styles.eyebrow}>
              {isErpEmployee ? 'Nhân viên ERP' : 'Nhân viên mới'}
            </Text>
            <Text style={[styles.title, isMobile && {fontSize: 20}]}>
              {isExistingLocalEmployee ? 'Cập nhật khuôn mặt' : 'Đăng ký khuôn mặt'}
            </Text>
            <Text style={styles.description}>
              {isErpEmployee
                ? 'Chụp khuôn mặt trực tiếp cho nhân viên đã chọn từ ERP.'
                : 'Nhập thông tin nhân viên và chụp khuôn mặt để hoàn tất đăng ký.'}
            </Text>
          </View>

          {/* Thông tin cơ bản */}
          <View style={[styles.sectionCard, isMobile && styles.sectionCardMobile]}>
            <Text style={styles.sectionTitle}>Thông tin nhân viên</Text>

            <Text style={styles.label}>Mã nhân viên *</Text>
            <TextInput
              autoCapitalize="characters"
              placeholder="VD: NV001"
              placeholderTextColor={colors.textMuted}
              value={employeeId}
              onChangeText={setEmployeeId}
              editable={!isErpEmployee}
              style={[styles.input, isErpEmployee && styles.inputReadOnly]}
            />

            <Text style={styles.label}>Họ và tên *</Text>
            <TextInput
              autoCapitalize="words"
              placeholder="VD: Nguyễn Văn A"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              style={styles.input}
            />

            <Text style={styles.label}>Phòng ban</Text>
            <TextInput
              autoCapitalize="words"
              placeholder="VD: Kỹ thuật"
              placeholderTextColor={colors.textMuted}
              value={department}
              onChangeText={setDepartment}
              style={styles.input}
            />

            <Text style={styles.label}>Chức vụ</Text>
            <TextInput
              autoCapitalize="words"
              placeholder="VD: Nhân viên"
              placeholderTextColor={colors.textMuted}
              value={position}
              onChangeText={setPosition}
              style={styles.input}
            />
          </View>

          {/* Chụp ảnh khuôn mặt */}
          <View style={[styles.sectionCard, isMobile && styles.sectionCardMobile]}>
            <Text style={styles.sectionTitle}>Ảnh khuôn mặt *</Text>
            <Text style={styles.description}>
              Chụp ảnh khuôn mặt nhìn thẳng, rõ ràng, không bị che khuất.
            </Text>
            <FaceCaptureCamera onCapture={handleCapture} initialUri={capturedUri} />
          </View>

          {/* Feedback */}
          {feedback ? (
            <View
              style={[
                styles.feedbackBox,
                feedback.type === 'success'
                  ? styles.feedbackSuccess
                  : styles.feedbackError,
              ]}>
              <Text
                style={[
                  styles.feedbackText,
                  feedback.type === 'success'
                    ? styles.feedbackTextSuccess
                    : styles.feedbackTextError,
                ]}>
                {feedback.message}
              </Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({pressed}) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                !canSubmit && styles.buttonDisabled,
              ]}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isExistingLocalEmployee ? 'Cập nhật khuôn mặt' : 'Đăng ký khuôn mặt'}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={onBack}
              disabled={submitting}
              style={({pressed}) => [
                styles.secondaryButton,
                pressed && styles.buttonPressed,
              ]}>
              <Text style={styles.secondaryButtonText}>Quay lại</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingHorizontal: spacing.md,
    backgroundColor: colors.page,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHighest,
    gap: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  flex: {flex: 1},
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  label: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: -4,
  },
  input: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHighest,
    color: colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inputReadOnly: {
    backgroundColor: colors.surfaceContainerHighest,
    color: colors.textSecondary,
  },
  feedbackBox: {
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  feedbackSuccess: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  feedbackError: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  feedbackText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  feedbackTextSuccess: {
    color: colors.success,
  },
  feedbackTextError: {
    color: colors.danger,
  },
  actions: {
    gap: spacing.sm + 2,
    paddingBottom: 18,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHighest,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  contentMobile: {
    padding: spacing.md,
    gap: spacing.md,
  },
  heroCardMobile: {
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  sectionCardMobile: {
    padding: spacing.md,
    borderRadius: radii.lg,
  },
});
