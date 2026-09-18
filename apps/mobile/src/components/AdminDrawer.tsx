import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {colors, spacing, shadows} from '../design-system';
import {Icon, type IconName} from './Icon';
import type {AdminModuleKey} from '../types/app';
import {getGatewayAuth} from '../services/api';

export type AdminDrawerProps = {
  visible: boolean;
  onClose: () => void;
  currentModule?: AdminModuleKey;
  onSelectModule: (moduleKey: AdminModuleKey) => void;
  onBackToPortal: () => void;
  onLogout: () => void;
  adminUser?: any;
  visibleModuleKeys?: AdminModuleKey[];
};

export type DrawerNavGroup = {
  key: string;
  label: string;
  icon: IconName;
  modules: Array<{
    key: AdminModuleKey;
    label: string;
    icon: IconName;
  }>;
};

export const DRAWER_NAV_GROUPS: DrawerNavGroup[] = [
  {
    key: 'overview_group',
    label: 'Tổng quan',
    icon: 'dashboard',
    modules: [
      {key: 'dashboard', label: 'Tổng quan chức năng', icon: 'dashboard'},
    ],
  },
  {
    key: 'attendance_group',
    label: 'Chấm công',
    icon: 'camera_front',
    modules: [
      {key: 'attendance', label: 'Bắt đầu chấm công toàn công ty', icon: 'camera_front'},
    ],
  },
  {
    key: 'employees_group',
    label: 'Quản lý Nhân sự',
    icon: 'badge',
    modules: [
      {key: 'manage_faces', label: 'Nhân viên & Khuôn mặt', icon: 'face'},
      {key: 'register', label: 'Tải dữ liệu từ ERP', icon: 'download'},
      {key: 'sync_verify', label: 'Đối soát dữ liệu ERP', icon: 'compare'},
      {key: 'account', label: 'Tài khoản nhân viên', icon: 'account_circle'},
    ],
  },
  {
    key: 'reports_group',
    label: 'Báo cáo & Dữ liệu',
    icon: 'analytics',
    modules: [
      {key: 'report', label: 'Trung tâm Báo cáo & Dữ liệu', icon: 'analytics'},
    ],
  },
  {
    key: 'settings_group',
    label: 'Cài đặt & Camera',
    icon: 'settings',
    modules: [
      {key: 'system_settings', label: 'Cài đặt & Quản lý Camera', icon: 'settings'},
    ],
  },
];

export function AdminDrawer({
  visible,
  onClose,
  currentModule,
  onSelectModule,
  onBackToPortal,
  onLogout,
  adminUser,
  visibleModuleKeys,
}: AdminDrawerProps) {
  const {width: screenWidth} = useWindowDimensions();
  const drawerWidth = Math.min(screenWidth * 0.85, 380);
  const [modalVisible, setModalVisible] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const closingRef = useRef(false);

  const animateOpen = useCallback(() => {
    closingRef.current = false;
    progress.stopAnimation();
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 230,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const animateClose = useCallback((callback?: () => void) => {
    if (closingRef.current) {
      return;
    }
    closingRef.current = true;
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: 210,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({finished}) => {
      closingRef.current = false;
      if (!finished) {
        return;
      }
      setModalVisible(false);
      onClose();
      callback?.();
    });
  }, [onClose, progress]);

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
    } else if (modalVisible && !closingRef.current) {
      animateClose();
    }
  }, [animateClose, modalVisible, visible]);

  const handleClose = (callback?: () => void) => {
    animateClose(callback);
  };

  const userName = adminUser?.name || adminUser?.username || 'Admin User';
  const tenantDb = String(
    adminUser?.database ||
      getGatewayAuth()?.database ||
      getGatewayAuth()?.dbName ||
      'SOF ERP System',
  ).trim();

  const handleSelect = (moduleKey: AdminModuleKey) => {
    handleClose(() => onSelectModule(moduleKey));
  };

  const handleBackToPortal = () => {
    handleClose(() => onBackToPortal());
  };

  const handleLogout = () => {
    handleClose(() => onLogout());
  };

  const visibleGroups = useMemo(() => {
    if (!visibleModuleKeys?.length) {
      return DRAWER_NAV_GROUPS;
    }
    const visibleKeys = new Set(visibleModuleKeys);
    return DRAWER_NAV_GROUPS.map(group => ({
      ...group,
      modules: group.modules.filter(module => visibleKeys.has(module.key)),
    })).filter(group => group.modules.length > 0);
  }, [visibleModuleKeys]);

  if (!modalVisible && !visible) {
    return null;
  }

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onShow={animateOpen}
      onRequestClose={() => handleClose()}>
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, {opacity: progress}]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng menu"
            style={styles.backdropPressable}
            onPress={() => handleClose()}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawerPanel,
            {
              width: drawerWidth,
              transform: [{
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-drawerWidth, 0],
                }),
              }],
            },
          ]}>
          {/* Header User Profile Info */}
          <View style={styles.headerSection}>
            <View style={styles.userInfoRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {userName.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={styles.userTextWrap}>
                <Text style={styles.userNameText} numberOfLines={1}>
                  {userName}
                </Text>
                <Text style={styles.userRoleText} numberOfLines={1}>
                  Quản trị viên - {tenantDb}
                </Text>
              </View>
            </View>
            <View style={styles.onlineBadge}>
              <View style={styles.greenDot} />
              <Text style={styles.onlineText}>Online</Text>
            </View>
          </View>

          {/* Navigation Tree List */}
          <ScrollView
            style={styles.navScrollView}
            contentContainerStyle={styles.navContentContainer}
            showsVerticalScrollIndicator={false}>
            {visibleGroups.map(group => {
              const hasSingleModule = group.modules.length === 1;

              if (hasSingleModule) {
                const singleMod = group.modules[0];
                const isActive =
                  currentModule === singleMod.key ||
                  (singleMod.key === 'report' &&
                    (currentModule === 'online_attendance' ||
                      currentModule === 'mobile_data')) ||
                  (singleMod.key === 'system_settings' &&
                    currentModule === 'camera');
                return (
                  <Pressable
                    key={group.key}
                    onPress={() => handleSelect(singleMod.key)}
                    style={({pressed}) => [
                      styles.singleGroupItem,
                      isActive && styles.activeItem,
                      pressed && styles.pressedItem,
                    ]}>
                    <Icon
                      name={group.icon}
                      size={22}
                      color={isActive ? colors.primary : colors.textPrimary}
                    />
                    <Text
                      style={[
                        styles.groupTitleText,
                        isActive && styles.activeText,
                      ]}>
                      {singleMod.label}
                    </Text>
                  </Pressable>
                );
              }

              return (
                <View key={group.key} style={styles.groupContainer}>
                  {/* Group Parent Title Header */}
                  <View style={styles.groupHeaderRow}>
                    <Icon
                      name={group.icon}
                      size={20}
                      color={colors.primary}
                    />
                    <Text style={styles.groupHeaderText}>{group.label}</Text>
                  </View>

                  {/* Sub-modules Children */}
                  <View style={styles.subModulesList}>
                    {group.modules.map(mod => {
                      const isActive = currentModule === mod.key;
                      return (
                        <Pressable
                          key={mod.key}
                          onPress={() => handleSelect(mod.key)}
                          style={({pressed}) => [
                            styles.subModuleItem,
                            isActive && styles.activeSubModuleItem,
                            pressed && styles.pressedItem,
                          ]}>
                          <View style={styles.subModuleTreeLine} />
                          <Icon
                            name={mod.icon}
                            size={18}
                            color={
                              isActive ? colors.primary : colors.textSecondary
                            }
                          />
                          <Text
                            style={[
                              styles.subModuleText,
                              isActive && styles.activeText,
                            ]}
                            numberOfLines={1}>
                            {mod.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Footer Action Buttons */}
          <View style={styles.footerSection}>
            <Pressable
              onPress={handleBackToPortal}
              style={({pressed}) => [
                styles.footerButton,
                pressed && styles.pressedItem,
              ]}>
              <Icon name="arrow_back" size={20} color={colors.textPrimary} />
              <Text style={styles.footerButtonText}>
                Quay lại cổng quản trị
              </Text>
            </Pressable>

            <Pressable
              onPress={handleLogout}
              style={({pressed}) => [
                styles.footerButton,
                styles.logoutButton,
                pressed && styles.pressedItem,
              ]}>
              <Icon name="logout" size={20} color={colors.danger} />
              <Text style={styles.logoutButtonText}>Đăng xuất</Text>
            </Pressable>
          </View>
        </Animated.View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  backdropPressable: {
    flex: 1,
  },
  drawerPanel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.card,
    height: '100%',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    ...shadows.lg,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 10,
  },
  headerSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: spacing.sm,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  userTextWrap: {
    flex: 1,
  },
  userNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  userRoleText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  onlineText: {
    fontSize: 11,
    color: '#15803d',
    fontWeight: '600',
  },
  navScrollView: {
    flex: 1,
  },
  navContentContainer: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  singleGroupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    minHeight: 50,
  },
  groupContainer: {
    marginBottom: spacing.xs,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  groupHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupTitleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  subModulesList: {
    marginTop: 4,
    paddingLeft: spacing.sm,
    gap: 4,
  },
  subModuleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    minHeight: 46,
  },
  subModuleTreeLine: {
    width: 2,
    height: 18,
    backgroundColor: '#cbd5e1',
    borderRadius: 1,
  },
  subModuleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    flex: 1,
  },
  activeItem: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
  },
  activeSubModuleItem: {
    backgroundColor: '#eff6ff',
  },
  activeText: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
  pressedItem: {
    opacity: 0.75,
  },
  footerSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: spacing.sm,
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 10,
    minHeight: 48,
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  logoutButton: {
    backgroundColor: '#fef2f2',
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
});
