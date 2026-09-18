import {TextStyle} from 'react-native';
import {colors} from './colors';

/**
 * Design System - Typography Tokens
 *
 * Clear hierarchy: Display → Heading → Title → Body → Label → Caption
 * Each preset is a complete TextStyle, import and spread directly.
 */

type FontWeight = TextStyle['fontWeight'];

export const typography = {
  display: {
    fontSize: 32,
    fontWeight: '700' as FontWeight,
    lineHeight: 40,
    letterSpacing: 0,
    color: colors.textPrimary,
  },
  heading1: {
    fontSize: 24,
    fontWeight: '700' as FontWeight,
    lineHeight: 32,
    color: colors.textPrimary,
  },
  heading2: {
    fontSize: 20,
    fontWeight: '700' as FontWeight,
    lineHeight: 28,
    color: colors.textPrimary,
  },
  heading3: {
    fontSize: 17,
    fontWeight: '600' as FontWeight,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as FontWeight,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: '400' as FontWeight,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as FontWeight,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  labelSmall: {
    fontSize: 11,
    fontWeight: '600' as FontWeight,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as FontWeight,
    lineHeight: 16,
    color: colors.textMuted,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700' as FontWeight,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: colors.primary,
  },
  button: {
    fontSize: 15,
    fontWeight: '600' as FontWeight,
    lineHeight: 20,
  },
  buttonSmall: {
    fontSize: 13,
    fontWeight: '600' as FontWeight,
    lineHeight: 18,
  },
} as const;

export type TypographyKey = keyof typeof typography;
