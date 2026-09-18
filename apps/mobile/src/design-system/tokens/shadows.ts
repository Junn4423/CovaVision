import {Platform, StyleSheet} from 'react-native';
import {colors} from './colors';

/**
 * Design System - Shadow / Elevation Tokens
 *
 * Pre-built StyleSheet objects for cross-platform shadows.
 */

export const shadows = StyleSheet.create({
  none: Platform.select({
    ios: {
      shadowColor: 'transparent',
      shadowOffset: {width: 0, height: 0},
      shadowOpacity: 0,
      shadowRadius: 0,
    },
    android: {elevation: 0},
    default: {},
  }),
  sm: Platform.select({
    ios: {
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.06,
      shadowRadius: 3,
    },
    android: {elevation: 2},
    default: {},
  }),
  md: Platform.select({
    ios: {
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.08,
      shadowRadius: 6,
    },
    android: {elevation: 4},
    default: {},
  }),
  lg: Platform.select({
    ios: {
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.10,
      shadowRadius: 12,
    },
    android: {elevation: 8},
    default: {},
  }),
});
