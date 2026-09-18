import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, typography, spacing, radii} from '../design-system';
import {Icon, type IconName} from './Icon';

// ══════════════════════════════════════════════
// ScreenContainer
// ══════════════════════════════════════════════

type ScreenContainerProps = {
  children: React.ReactNode;
  scrollable?: boolean;
  keyboardAvoid?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  padding?: boolean;
  style?: any;
  contentStyle?: any;
  backgroundColor?: string;
};

export function ScreenContainer({
  children,
  scrollable = false,
  keyboardAvoid = false,
  edges = ['top', 'left', 'right'],
  padding = true,
  style,
  contentStyle,
  backgroundColor,
}: ScreenContainerProps) {
  const innerContent = (
    <View style={[styles.flex, padding && styles.padded, style]}>
      {children}
    </View>
  );

  const scrollContent = scrollable ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, padding && styles.paddedScroll, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : null;

  const body = keyboardAvoid ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      {scrollable ? scrollContent : innerContent}
    </KeyboardAvoidingView>
  ) : scrollable ? (
    scrollContent
  ) : (
    innerContent
  );

  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, backgroundColor ? { backgroundColor } : undefined]}>
      {body}
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════
// ScreenHeader
// ══════════════════════════════════════════════

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  action?: React.ReactNode;
  style?: any;
};

export function ScreenHeader({title, subtitle, onBack, action, style}: ScreenHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={({pressed}) => [styles.backButton, pressed && styles.buttonPressed]}
          hitSlop={8}>
          <Icon name="chevron-left" size={24} color={colors.textPrimary} />
        </Pressable>
      ) : null}
      <View style={styles.headerTextWrap}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.headerAction}>{action}</View> : null}
    </View>
  );
}

// ══════════════════════════════════════════════
// LoadingOverlay
// ══════════════════════════════════════════════

type LoadingOverlayProps = {
  message?: string;
};

export function LoadingOverlay({message = 'Đang tải...'}: LoadingOverlayProps) {
  return (
    <View style={styles.loadingOverlay}>
      <Icon name="refresh" size={32} color={colors.primary} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

// ══════════════════════════════════════════════
// ListItem
// ══════════════════════════════════════════════

type ListItemProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  style?: any;
};

export function ListItem({title, subtitle, icon, onPress, rightElement, style}: ListItemProps) {
  const content = (
    <View style={[styles.listItem, style]}>
      {icon ? (
        <View style={styles.listItemIcon}>
          <Icon name={icon} size={22} color={colors.primary} />
        </View>
      ) : null}
      <View style={styles.listItemText}>
        <Text style={styles.listItemTitle}>{title}</Text>
        {subtitle ? <Text style={styles.listItemSubtitle}>{subtitle}</Text> : null}
      </View>
      {rightElement || (onPress ? (
        <Icon name="chevron-right" size={20} color={colors.textMuted} />
      ) : null)}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({pressed}) => [pressed && styles.buttonPressed]}>
        {content}
      </Pressable>
    );
  }

  return content;
}

// ══════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.page,
  },
  flex: {flex: 1},
  padded: {
    padding: spacing.xl,
  },
  paddedScroll: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  scrollContent: {
    flexGrow: 1,
  },
  buttonPressed: {opacity: 0.65},

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    ...typography.heading2,
  },
  headerSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  headerAction: {
    marginLeft: 'auto',
  },

  // Loading
  loadingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.page,
    gap: spacing.lg,
  },
  loadingText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },

  // ListItem
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listItemIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listItemText: {
    flex: 1,
  },
  listItemTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  listItemSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
});
