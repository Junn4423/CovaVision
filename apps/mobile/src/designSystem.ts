import {StyleSheet} from 'react-native';
import {colors} from './design-system';
import {spacing as sp} from './design-system';
import {radii as rd} from './design-system';
import {shadows as sh} from './design-system';
import {typography as tp} from './design-system';

/**
 * @deprecated Import directly from '../design-system' instead.
 * Kept for backward compatibility during migration.
 */

// ── Spacing (compat) ──
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// ── Typography (compat) ──
export const typography = {
  hero: {...tp.display},
  title: {...tp.heading1},
  sectionTitle: {...tp.heading3},
  subtitle: {...tp.bodySmall, fontWeight: '600' as const},
  body: {...tp.body},
  bodySmall: {...tp.bodySmall},
  label: {...tp.label},
  caption: {...tp.caption},
  eyebrow: {...tp.eyebrow},
  button: {...tp.button},
  buttonSmall: {...tp.buttonSmall},
};

// ── Borders (compat) ──
export const border = {
  radius: {
    sm: rd.sm,
    md: rd.md,
    lg: rd.lg,
    xl: rd.xl,
    full: rd.full,
  },
};

// ── Shadows (compat) ──
export const shadow = {
  sm: sh.sm,
  md: sh.md,
  lg: sh.lg,
};

// ── Shared Styles (compat) ──
export const sharedStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.page,
  },
  flex: {flex: 1},
  page: {
    flex: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: sp.xl,
    paddingVertical: sp.xl,
  },
  scrollContent: {
    padding: sp.xl,
    paddingBottom: sp.huge,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: rd.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: sp.xl,
  },
  cardAccent: {
    backgroundColor: colors.card,
    borderRadius: rd.xl,
    borderWidth: 1,
    borderColor: colors.primary,
    borderLeftWidth: 4,
    padding: sp.xl,
  },
  cardMuted: {
    backgroundColor: colors.cardMuted,
    borderRadius: rd.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: sp.lg,
  },
  input: {
    backgroundColor: colors.cardMuted,
    borderRadius: rd.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: sp.lg,
    paddingVertical: sp.lg - 1,
  },
  inputLarge: {
    backgroundColor: colors.cardMuted,
    borderRadius: rd.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    letterSpacing: 8,
    paddingHorizontal: sp.lg,
    paddingVertical: sp.xl,
  },
  buttonPrimary: {
    minHeight: 52,
    borderRadius: rd.lg,
    backgroundColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: sp.xxl,
  },
  buttonPrimaryText: {
    color: colors.textOnPrimary,
    ...tp.button,
  },
  buttonSecondary: {
    minHeight: 48,
    borderRadius: rd.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: sp.xxl,
  },
  buttonSecondaryText: {
    color: colors.textSecondary,
    ...tp.buttonSmall,
  },
  buttonOutline: {
    minHeight: 48,
    borderRadius: rd.lg,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: sp.xxl,
  },
  buttonOutlineText: {
    color: colors.primary,
    ...tp.buttonSmall,
  },
  buttonGhost: {
    minHeight: 44,
    borderRadius: rd.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: sp.xl,
  },
  buttonGhostText: {
    color: colors.textSecondary,
    ...tp.buttonSmall,
  },
  buttonSmall: {
    minHeight: 36,
    borderRadius: rd.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: sp.lg,
  },
  buttonPressed: {opacity: 0.88},
  buttonDisabled: {opacity: 0.50},
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: rd.md,
    padding: sp.lg,
  },
  errorText: {
    color: colors.dangerText,
    fontSize: 13,
    fontWeight: '600' as const,
    lineHeight: 19,
  },
  successBox: {
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: rd.md,
    padding: sp.lg,
  },
  successText: {
    color: colors.successText,
    fontSize: 13,
    fontWeight: '600' as const,
    lineHeight: 19,
  },
  warningBox: {
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: rd.md,
    padding: sp.lg,
  },
  warningText: {
    color: colors.warningText,
    fontSize: 13,
    fontWeight: '600' as const,
    lineHeight: 19,
  },
  infoBox: {
    backgroundColor: colors.infoBg,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    borderRadius: rd.md,
    padding: sp.lg,
  },
  infoText: {
    color: colors.infoText,
    fontSize: 13,
    fontWeight: '600' as const,
    lineHeight: 19,
  },
  badge: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 10,
    paddingVertical: sp.xs,
    borderRadius: rd.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
  },
  sectionTitle: {
    ...tp.heading3,
  },
  sectionSubtitle: {
    ...tp.bodySmall,
    fontWeight: '600' as const,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
});
