import { useWindowDimensions } from 'react-native';

export type ResponsiveInfo = {
  width: number;
  height: number;
  isTablet: boolean;
  isMobile: boolean;
  isSmallMobile: boolean;
};

/**
 * Hook to provide responsive breakpoint flags.
 * - Tablet: width >= 600
 * - Mobile: width < 600
 * - Small Mobile: width <= 375 (e.g. 360dp Android, iPhone SE)
 */
export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 600;
  const isMobile = width < 600;
  const isSmallMobile = width <= 375;

  return {
    width,
    height,
    isTablet,
    isMobile,
    isSmallMobile,
  };
}
