/**
 * Design System - Color Tokens
 *
 * Professional, calm palette with teal primary.
 * Only one accent - used with purpose, not decoration.
 */

// ── Brand ──
const teal = {
  50: '#f2f6f8',
  100: '#e6ebee',
  200: '#cbd9df',
  300: '#9fb9c5',
  400: '#4a91a8',
  500: '#1c6e8c',
  600: '#175f79',
  700: '#124e66',
  800: '#0d3c50',
  900: '#0d1b2a',
  950: '#07131d',
} as const;

// ── Neutral ──
const slate = {
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#94a3b8',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#1e293b',
  900: '#0f172a',
  950: '#020617',
} as const;

// ── Semantic ──
const red = {
  50: '#fef2f2',
  100: '#fee2e2',
  200: '#fecaca',
  300: '#fca5a5',
  400: '#f87171',
  500: '#ef4444',
  600: '#dc2626',
  700: '#b91c1c',
  800: '#991b1b',
} as const;

const amber = {
  50: '#fffbeb',
  100: '#fef3c7',
  200: '#fde68a',
  300: '#fcd34d',
  400: '#fbbf24',
  500: '#f59e0b',
  600: '#d97706',
  700: '#b45309',
  800: '#92400e',
} as const;

const blue = {
  50: '#eff6ff',
  100: '#dbeafe',
  200: '#bfdbfe',
  300: '#93c5fd',
  400: '#60a5fa',
  500: '#3b82f6',
  600: '#2563eb',
  700: '#1d4ed8',
  800: '#1e40af',
} as const;

const green = {
  50: '#f0fdf4',
  100: '#dcfce7',
  200: '#bbf7d0',
  300: '#86efac',
  400: '#4ade80',
  500: '#22c55e',
  600: '#16a34a',
  700: '#15803d',
  800: '#166534',
} as const;

// ── Public color tokens ──
export const colors = {
  // Primary & Secondary Brand
  primary: '#1c6e8c',
  primaryLight: '#4a91a8',
  primaryDark: '#124e66',
  primaryBg: '#e6ebee',
  primaryBorder: '#cbd9df',
  primaryContainer: '#124e66',
  onPrimaryContainer: '#e6ebee',

  secondary: '#2e8b57',
  secondaryContainer: '#a5b452',
  onSecondaryContainer: '#fefcff',

  // Surface & Containers
  page: '#f8f9fa',
  pageBackground: '#f8f9fa',
  card: '#ffffff',
  cardBackground: '#ffffff',
  cardMuted: '#f2f6f8',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f2f4f6',
  surfaceContainer: '#e6ebee',
  surfaceContainerHigh: '#dee2e6',
  surfaceContainerHighest: '#ced4da',
  border: '#dee2e6',
  borderPrimarySoft: '#cbd9df',

  // Text
  textPrimary: '#0d1b2a',
  textSecondary: '#495057',
  textMuted: '#6c757d',
  textOnPrimary: '#ffffff',
  textLink: '#124e66',

  // Status
  success: '#2e8b57',
  successBg: '#edf7f0',
  successBorder: '#b9dec5',
  successText: '#247346',

  warning: '#b45309',
  warningBg: '#fffbeb',
  warningBorder: '#fde68a',
  warningText: '#b45309',

  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',
  dangerText: '#dc2626',

  info: '#1d4ed8',
  infoBg: '#eff6ff',
  infoBorder: '#bfdbfe',
  infoText: '#1d4ed8',

  // Camera & Scanner frame
  faceFrame: '#22d3ee',

  // Misc
  overlay: 'rgba(15, 23, 42, 0.40)',
  shadow: slate[900],
  white: '#ffffff',
  black: slate[950],

  // Raw scales (for edge cases)
  teal,
  slate,
  red,
  amber,
  blue,
  green,
} as const;
