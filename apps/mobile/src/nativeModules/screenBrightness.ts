import {NativeModules, Platform} from 'react-native';

type ScreenBrightnessModuleShape = {
  setTemporaryBrightness?: (level: number) => Promise<boolean> | boolean;
  restoreSystemBrightness?: () => Promise<boolean> | boolean;
};

const screenBrightnessModule =
  (NativeModules.ScreenBrightness as ScreenBrightnessModuleShape | undefined) ||
  {};

export async function setTemporaryScreenBrightness(level: number): Promise<boolean> {
  if (
    Platform.OS !== 'android' ||
    typeof screenBrightnessModule.setTemporaryBrightness !== 'function'
  ) {
    return false;
  }

  const safeLevel = Math.max(0.05, Math.min(1, Number(level) || 1));
  const result = await screenBrightnessModule.setTemporaryBrightness(safeLevel);
  return Boolean(result);
}

export async function restoreSystemScreenBrightness(): Promise<boolean> {
  if (
    Platform.OS !== 'android' ||
    typeof screenBrightnessModule.restoreSystemBrightness !== 'function'
  ) {
    return false;
  }

  const result = await screenBrightnessModule.restoreSystemBrightness();
  return Boolean(result);
}
