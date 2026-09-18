import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {colors, typography, spacing, radii} from '../design-system';
import {Icon, type IconName} from './Icon';

// ══════════════════════════════════════════════
// Button
// ══════════════════════════════════════════════

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  style?: any;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const v = BUTTON_VARIANTS[variant];
  const s = BUTTON_SIZES[size];

  const iconElement = icon ? (
    <Icon
      name={icon}
      size={(size === 'sm' ? 14 : size === 'md' ? 16 : 18)}
      color={
        variant === 'primary'
          ? colors.textOnPrimary
          : variant === 'danger'
            ? colors.dangerText
            : variant === 'outline'
              ? colors.primary
              : colors.textSecondary
      }
    />
  ) : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({pressed}) => [
        styles.buttonBase,
        s.container,
        v.container,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' || variant === 'danger' ? colors.white : colors.primary}
          size="small"
        />
      ) : (
        <View style={styles.buttonContent}>
          {icon && iconPosition === 'left' ? iconElement : null}
          <Text
            style={[
              s.text,
              v.text,
              icon ? styles.buttonTextWithIconLeft : null,
            ]}>
            {title}
          </Text>
          {icon && iconPosition === 'right' ? iconElement : null}
        </View>
      )}
    </Pressable>
  );
}

const BUTTON_VARIANTS = {
  primary: StyleSheet.create({
    container: {backgroundColor: colors.primary},
    text: {color: colors.textOnPrimary},
  }),
  secondary: StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    text: {color: colors.textSecondary},
  }),
  outline: StyleSheet.create({
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    text: {color: colors.primary},
  }),
  ghost: StyleSheet.create({
    container: {backgroundColor: 'transparent'},
    text: {color: colors.textSecondary},
  }),
  danger: StyleSheet.create({
    container: {
      backgroundColor: colors.dangerBg,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
    },
    text: {color: colors.dangerText},
  }),
};

const BUTTON_SIZES: Record<string, {container: any; text: any}> = {
  sm: {
    container: {minHeight: 36, borderRadius: radii.sm, paddingHorizontal: spacing.lg},
    text: {...typography.buttonSmall},
  },
  md: {
    container: {minHeight: 48, borderRadius: radii.md, paddingHorizontal: spacing.xxl},
    text: {...typography.button},
  },
  lg: {
    container: {minHeight: 54, borderRadius: radii.lg, paddingHorizontal: spacing.xxxl},
    text: {...typography.button, fontSize: 16},
  },
};

// ══════════════════════════════════════════════
// Card
// ══════════════════════════════════════════════

type CardProps = {
  children: React.ReactNode;
  style?: any;
  variant?: 'default' | 'muted';
  padded?: boolean;
};

export function Card({children, style, variant = 'default', padded = true}: CardProps) {
  return (
    <View
      style={[
        styles.card,
        variant === 'muted' && styles.cardMuted,
        padded && styles.cardPadded,
        style,
      ]}>
      {children}
    </View>
  );
}

// ══════════════════════════════════════════════
// Input
// ══════════════════════════════════════════════

type InputProps = {
  value: string;
  onChangeText: (value: string) => void;
  label?: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'url' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  multiline?: boolean;
  error?: string;
  icon?: IconName;
  style?: any;
  inputStyle?: any;
};

export function Input({
  value,
  onChangeText,
  label,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  maxLength,
  multiline,
  error,
  icon,
  style,
  inputStyle,
}: InputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View style={[styles.inputWrapper, style]}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <View style={styles.inputRow}>
        {icon ? (
          <View style={styles.inputIcon}>
            <Icon name={icon} size={18} color={colors.textMuted} />
          </View>
        ) : null}
        <TextInput
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          maxLength={maxLength}
          multiline={multiline}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureTextEntry && !showPassword}
          style={[
            styles.input,
            icon ? styles.inputWithIcon : null,
            error ? styles.inputError : null,
            inputStyle,
          ]}
          value={value}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setShowPassword(v => !v)}
            style={styles.eyeButton}
            hitSlop={8}>
            <Icon
              name={showPassword ? 'eye-off' : 'eye'}
              size={18}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.inputErrorText}>{error}</Text> : null}
    </View>
  );
}

// ══════════════════════════════════════════════
// Badge
// ══════════════════════════════════════════════

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default';

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  style?: any;
};

const BADGE_COLORS: Record<BadgeVariant, {bg: string; border: string; text: string}> = {
  success: {bg: colors.successBg, border: colors.successBorder, text: colors.successText},
  warning: {bg: colors.warningBg, border: colors.warningBorder, text: colors.warningText},
  error: {bg: colors.dangerBg, border: colors.dangerBorder, text: colors.dangerText},
  info: {bg: colors.infoBg, border: colors.infoBorder, text: colors.infoText},
  default: {bg: colors.cardMuted, border: colors.border, text: colors.textSecondary},
};

export function Badge({label, variant = 'default', size = 'sm', style}: BadgeProps) {
  const c = BADGE_COLORS[variant];
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: c.bg,
          borderColor: c.border,
          paddingVertical: size === 'sm' ? 2 : 4,
          paddingHorizontal: size === 'sm' ? 8 : 10,
        },
        style,
      ]}>
      <Text style={[styles.badgeText, {color: c.text, fontSize: size === 'sm' ? 11 : 12}]}>
        {label}
      </Text>
    </View>
  );
}

// ══════════════════════════════════════════════
// StatusMessage
// ══════════════════════════════════════════════

type StatusVariant = 'success' | 'error' | 'warning' | 'info';

type StatusMessageProps = {
  message: string;
  variant: StatusVariant;
  style?: any;
};

export function StatusMessage({message, variant, style}: StatusMessageProps) {
  const iconMap: Record<StatusVariant, IconName> = {
    success: 'success',
    error: 'error',
    warning: 'warning',
    info: 'info',
  };
  const boxStyles: Record<StatusVariant, any> = {
    success: styles.statusBoxSuccess,
    error: styles.statusBoxError,
    warning: styles.statusBoxWarning,
    info: styles.statusBoxInfo,
  };
  const textStyles: Record<StatusVariant, any> = {
    success: styles.statusTextSuccess,
    error: styles.statusTextError,
    warning: styles.statusTextWarning,
    info: styles.statusTextInfo,
  };

  return (
    <View style={[styles.statusBox, boxStyles[variant], style]}>
      <Icon name={iconMap[variant]} size={18} color={textStyles[variant].color} />
      <Text style={[styles.statusText, textStyles[variant]]}>{message}</Text>
    </View>
  );
}

// ══════════════════════════════════════════════
// SectionHeader
// ══════════════════════════════════════════════

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  style?: any;
};

export function SectionHeader({title, subtitle, action, style}: SectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

// ══════════════════════════════════════════════
// ToggleGroup
// ══════════════════════════════════════════════

type ToggleGroupProps<T extends string> = {
  options: Array<{value: T; label: string}>;
  value: T;
  onChange: (value: T) => void;
  style?: any;
};

export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  style,
}: ToggleGroupProps<T>) {
  return (
    <View style={[styles.toggleRow, style]}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.toggleButton, active && styles.toggleButtonActive]}>
            <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ══════════════════════════════════════════════
// EmptyState
// ══════════════════════════════════════════════

type EmptyStateProps = {
  icon?: IconName;
  title: string;
  message?: string;
  action?: {label: string; onPress: () => void};
};

export function EmptyState({icon, title, message, action}: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      {icon ? <Icon name={icon} size={48} color={colors.textMuted} /> : null}
      <Text style={styles.emptyStateTitle}>{title}</Text>
      {message ? <Text style={styles.emptyStateMessage}>{message}</Text> : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          style={({pressed}) => [
            styles.emptyStateAction,
            pressed && styles.buttonPressed,
          ]}>
          <Text style={styles.emptyStateActionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ══════════════════════════════════════════════
// Divider
// ══════════════════════════════════════════════

type DividerProps = {
  style?: any;
};

export function Divider({style}: DividerProps) {
  return <View style={[styles.divider, style]} />;
}

// ══════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════

const styles = StyleSheet.create({
  // Button
  buttonBase: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  buttonTextWithIconLeft: {},
  buttonPressed: {opacity: 0.85},
  buttonDisabled: {opacity: 0.45},

  // Card
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardMuted: {
    backgroundColor: colors.cardMuted,
  },
  cardPadded: {
    padding: spacing.xl,
  },

  // Input
  inputWrapper: {
    gap: spacing.sm,
  },
  inputLabel: {
    ...typography.label,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: spacing.lg,
    zIndex: 1,
  },
  input: {
    flex: 1,
    backgroundColor: colors.cardMuted,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    lineHeight: 20,
  },
  inputWithIcon: {
    paddingLeft: 40,
  },
  inputError: {
    borderColor: colors.dangerBorder,
  },
  inputErrorText: {
    color: colors.dangerText,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  eyeButton: {
    position: 'absolute',
    right: spacing.md,
    zIndex: 1,
    padding: 4,
  },

  // Badge
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    borderWidth: 1,
  },
  badgeText: {
    fontWeight: '700',
    lineHeight: 16,
  },

  // StatusMessage
  statusBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.lg,
  },
  statusBoxSuccess: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
  },
  statusBoxError: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  statusBoxWarning: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
  },
  statusBoxInfo: {
    backgroundColor: colors.infoBg,
    borderColor: colors.infoBorder,
  },
  statusText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  statusTextSuccess: {color: colors.successText},
  statusTextError: {color: colors.dangerText},
  statusTextWarning: {color: colors.warningText},
  statusTextInfo: {color: colors.infoText},

  // SectionHeader
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  sectionHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.heading3,
  },
  sectionSubtitle: {
    ...typography.caption,
  },

  // ToggleGroup
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  toggleButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  toggleText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: colors.primary,
  },

  // EmptyState
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  emptyStateTitle: {
    ...typography.heading3,
    textAlign: 'center',
  },
  emptyStateMessage: {
    ...typography.caption,
    textAlign: 'center',
  },
  emptyStateAction: {
    marginTop: spacing.sm,
    minHeight: 38,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyStateActionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
});
