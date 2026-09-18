import React from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {ScreenContainer} from '../../components/Layout';
import {Icon} from '../../components/Icon';
import {colors, typography, spacing, radii, shadows} from '../../design-system';


import {useResponsive} from '../../utils/responsive';

type PortalScreenProps = {
  onOpenEmployee: () => void;
  onOpenAdmin: () => void;
};

export function PortalScreen({
  onOpenEmployee,
  onOpenAdmin,
}: PortalScreenProps) {
  const {isMobile} = useResponsive();

  const handleBuyAccount = async () => {
    const url = 'https://sof.com.vn/san-pham/nhansu/pricing';
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Lỗi', 'Không thể mở trình duyệt hoặc liên kết.');
    }
  };

  return (
    <ScreenContainer scrollable backgroundColor="#0a192f" style={styles.container} contentStyle={[styles.scrollContent, isMobile && styles.scrollContentMobile]}>
      <View style={[styles.portalContainer, isMobile && styles.portalContainerMobile]}>
        {/* Subtle Biometric Badge */}
        <View style={styles.biometricBadge}>
          <Icon name="fingerprint" size={14} color="#0284c7" />
          <Text style={styles.biometricBadgeText}>SOF BIOMETRIC CLOUD AI</Text>
        </View>

        {/* Nested Colored Centered Brand Title */}
        <Text style={[styles.brandTitle, isMobile && styles.brandTitleMobile]}>
          <Text style={styles.textRed}>SOF </Text>
          <Text style={styles.textBlue}>FACE AI</Text>
        </Text>

        <Text style={[styles.faceAiSubtitle, isMobile && styles.faceAiSubtitleMobile]}>
          Hệ sinh thái chấm công & nhận diện sinh trắc học
        </Text>

        {/* Centered Large Logo Brand Area */}
        <View style={[styles.logoWrapper, isMobile && styles.logoWrapperMobile]}>
          <View style={[styles.logoCard, shadows.sm]}>
            <Image
              source={require('../../assets/images/logo.png')}
              style={isMobile ? styles.logoImageMobile : styles.logoImage}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Config label / Subtitle */}
        <Text style={[styles.loginSystemText, isMobile && styles.loginSystemTextMobile]}>
          Chọn cổng truy cập hệ thống
        </Text>

        {/* Grid or Stacked Selection Cards */}
        <View style={isMobile ? styles.portalColumnMobile : styles.portalRow}>
          {/* Card 1: SOF FACE AI */}
          <Pressable
            onPress={onOpenEmployee}
            style={({pressed}) => [
              styles.portalCard,
              isMobile && styles.portalCardMobile,
              styles.portalEmployee,
              pressed && styles.buttonPressed,
              shadows.md,
            ]}>
            {isMobile ? (
              <View style={styles.portalCardMobileRow}>
                <View style={[styles.portalIcon, styles.portalIconMobile, styles.portalIconEmployee]}>
                  <Icon name="face-recognition" size={28} color="#10b981" />
                </View>
                <View style={styles.portalCardMobileContent}>
                  <Text style={styles.portalCardTitleEmployee}>SOF FACE AI</Text>
                  <Text style={styles.portalCardDescMobile}>Camera điểm danh khuôn mặt</Text>
                </View>
                <View style={styles.pillButtonMobileEmployee}>
                  <Text style={styles.pillBtnText}>Vào</Text>
                  <Icon name="arrow-right" size={14} color="#ffffff" style={{marginLeft: 3}} />
                </View>
              </View>
            ) : (
              <>
                <View style={[styles.portalIcon, styles.portalIconEmployee]}>
                  <Icon name="face-recognition" size={34} color="#10b981" />
                </View>
                <Text style={styles.portalCardTitleEmployee}>SOF FACE AI</Text>
                <Text style={styles.portalCardDesc}>Camera điểm danh khuôn mặt</Text>
                <View style={styles.pillButtonEmployee}>
                  <Text style={styles.pillBtnText}>Sử dụng ngay</Text>
                  <Icon
                    name="arrow-right"
                    size={15}
                    color="#ffffff"
                    style={{marginLeft: spacing.xs + 2}}
                  />
                </View>
              </>
            )}
          </Pressable>

          {/* Card 2: Cổng Quản Trị */}
          <Pressable
            onPress={onOpenAdmin}
            style={({pressed}) => [
              styles.portalCard,
              isMobile && styles.portalCardMobile,
              styles.portalAdmin,
              pressed && styles.buttonPressed,
              shadows.md,
            ]}>
            {isMobile ? (
              <View style={styles.portalCardMobileRow}>
                <View style={[styles.portalIcon, styles.portalIconMobile, styles.portalIconAdmin]}>
                  <Icon name="admin" size={28} color="#0284c7" />
                </View>
                <View style={styles.portalCardMobileContent}>
                  <Text style={styles.portalCardTitleAdmin}>CỔNG QUẢN TRỊ</Text>
                  <Text style={styles.portalCardDescMobile}>Cấu hình & Quản lý nhân sự</Text>
                </View>
                <View style={styles.pillButtonMobileAdmin}>
                  <Text style={styles.pillBtnText}>Vào</Text>
                  <Icon name="arrow-right" size={14} color="#ffffff" style={{marginLeft: 3}} />
                </View>
              </View>
            ) : (
              <>
                <View style={[styles.portalIcon, styles.portalIconAdmin]}>
                  <Icon name="admin" size={34} color="#0284c7" />
                </View>
                <Text style={styles.portalCardTitleAdmin}>CỔNG QUẢN TRỊ</Text>
                <Text style={styles.portalCardDesc}>Cấu hình & Quản lý nhân sự</Text>
                <View style={styles.pillButtonAdmin}>
                  <Text style={styles.pillBtnText}>Truy cập ngay</Text>
                  <Icon
                    name="arrow-right"
                    size={15}
                    color="#ffffff"
                    style={{marginLeft: spacing.xs + 2}}
                  />
                </View>
              </>
            )}
          </Pressable>
        </View>

        <View style={{height: isMobile ? spacing.md : spacing.lg}} />

        {/* Footer Gradient Blue Card for Mua Tài Khoản */}
        <View style={[styles.footerGradientCard, isMobile && styles.footerGradientCardMobile]}>
          <View style={styles.footerGradientLeft}>
            <View style={[styles.footerCartBadge, isMobile && styles.footerCartBadgeMobile]}>
              <Icon name="cart" size={isMobile ? 18 : 22} color="#0037b0" />
            </View>
            <View style={styles.footerTextWrap}>
              <Text style={[styles.footerGradientTitle, isMobile && {fontSize: 13}]}>MUA TÀI KHOẢN SOF</Text>
              <Text style={styles.footerGradientDesc} numberOfLines={1}>Trải nghiệm đầy đủ tính năng đám mây</Text>
              <View style={styles.footerLockRow}>
                <Icon name="lock-outline" size={11} color="#bfdbfe" style={{marginRight: 4}} />
                <Text style={[styles.footerLockText, isMobile && {fontSize: 11}]} numberOfLines={1}>
                  Bản quyền tại sof.com.vn
                </Text>
              </View>
            </View>
          </View>
          <Pressable
            onPress={handleBuyAccount}
            style={({pressed}) => [
              styles.footerBuyButton,
              isMobile && styles.footerBuyButtonMobile,
              pressed && styles.footerBuyButtonPressed,
            ]}>
            <Text style={styles.footerBuyButtonText}>Mua ngay</Text>
            <Icon name="open-in-new" size={13} color="#0037b0" style={{marginLeft: 3}} />
          </Pressable>
        </View>

        <View style={{height: spacing.sm}} />

        {/* Footer Power By */}
        <View style={styles.powerByFooter}>
          <Text style={styles.powerByText}>
            © 2026 POWERED BY <Text style={styles.textRed}>SOF.COM.VN</Text>
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0a192f',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  portalContainer: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: spacing.xl,
    shadowColor: '#000814',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 12,
    marginVertical: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  biometricBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: spacing.xs,
  },
  biometricBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
    letterSpacing: 0.8,
  },

  logoWrapper: {
    alignItems: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  logoCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  logoImage: {
    width: 140,
    height: 84,
  },
  brandTitle: {
    ...typography.display,
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginTop: spacing.sm,
  },
  textRed: {
    color: colors.danger,
  },
  textBlue: {
    color: colors.primary,
  },
  faceAiSubtitle: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.xs,
  },
  loginSystemText: {
    ...typography.heading2,
    fontSize: 20,
    fontWeight: '800',
    color: '#002b8a',
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  portalRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  portalCard: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radii.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.sm,
    borderWidth: 1.5,
    minHeight: 230,
    justifyContent: 'space-between',
  },
  portalEmployee: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  portalAdmin: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  portalIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  portalIconEmployee: {
    backgroundColor: '#dcfce7',
  },
  portalIconAdmin: {
    backgroundColor: '#dbeafe',
  },
  portalCardTitleEmployee: {
    fontSize: 17,
    fontWeight: '800',
    color: '#15803d',
    textAlign: 'center',
  },
  portalCardTitleAdmin: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0037b0',
    textAlign: 'center',
  },
  portalCardDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  pillButtonEmployee: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    width: '90%',
    minHeight: 44,
    shadowColor: '#16a34a',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  pillButtonAdmin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0037b0',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    width: '90%',
    minHeight: 44,
    shadowColor: '#0037b0',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  pillBtnText: {
    fontSize: 13,
    color: colors.textOnPrimary,
    fontWeight: '700',
  },
  footerGradientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0037b0',
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: '#2151da',
  },
  footerGradientLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  footerCartBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerTextWrap: {
    flex: 1,
  },
  footerGradientTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textOnPrimary,
    letterSpacing: 0.3,
  },
  footerGradientDesc: {
    fontSize: 12,
    color: '#dbeafe',
    marginTop: 2,
  },
  footerLockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  footerLockText: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '500',
  },
  footerBuyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    minHeight: 40,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  footerBuyButtonText: {
    fontSize: 13,
    color: '#0037b0',
    fontWeight: '800',
  },
  footerBuyButtonPressed: {
    opacity: 0.9,
    transform: [{scale: 0.96}],
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{scale: 0.98}],
  },
  powerByFooter: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  powerByText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  // Mobile responsive styles
  scrollContentMobile: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: spacing.sm,
  },
  portalContainerMobile: {
    padding: spacing.md,
    borderRadius: 18,
    marginVertical: 0,
  },
  brandTitleMobile: {
    fontSize: 27,
    marginTop: 2,
  },
  faceAiSubtitleMobile: {
    fontSize: 13,
    marginTop: 2,
  },
  logoWrapperMobile: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  logoImageMobile: {
    width: 110,
    height: 60,
  },
  loginSystemTextMobile: {
    fontSize: 16,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  portalColumnMobile: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  portalCardMobile: {
    minHeight: 0,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
  },
  portalCardMobileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: spacing.md,
  },
  portalIconMobile: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginBottom: 0,
  },
  portalCardMobileContent: {
    flex: 1,
  },
  portalCardDescMobile: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pillButtonMobileEmployee: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    minHeight: 36,
  },
  pillButtonMobileAdmin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0037b0',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    minHeight: 36,
  },
  footerGradientCardMobile: {
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  footerCartBadgeMobile: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  footerBuyButtonMobile: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    minHeight: 34,
  },
});

