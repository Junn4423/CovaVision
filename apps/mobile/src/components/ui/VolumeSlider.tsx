// src/components/ui/VolumeSlider.tsx
import React, {useRef, useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import {colors, radii, spacing, typography, shadows} from '../../design-system';
import {Icon} from '../Icon';

export interface VolumeSliderProps {
  value: number; // 0 - 100
  onValueChange?: (val: number) => void;
  onSlidingComplete?: (val: number) => void;
  disabled?: boolean;
}

const PRESET_LEVELS = [30, 50, 80, 100];

export function VolumeSlider({
  value = 50,
  onValueChange,
  onSlidingComplete,
  disabled = false,
}: VolumeSliderProps) {
  const [currentVal, setCurrentVal] = useState(Math.max(0, Math.min(100, Math.round(value))));
  const trackWidthRef = useRef<number>(260);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setCurrentVal(Math.max(0, Math.min(100, Math.round(value))));
    }
  }, [value]);

  function updateFromTouch(evt: GestureResponderEvent) {
    if (disabled) return;
    const {locationX} = evt.nativeEvent;
    const width = trackWidthRef.current || 260;
    const ratio = Math.max(0, Math.min(1, locationX / width));
    const nextVal = Math.round(ratio * 100);
    setCurrentVal(nextVal);
    onValueChange?.(nextVal);
  }

  function handleCommit(nextVal: number) {
    setCurrentVal(nextVal);
    onValueChange?.(nextVal);
    onSlidingComplete?.(nextVal);
  }

  function handleStep(delta: number) {
    if (disabled) return;
    const nextVal = Math.max(0, Math.min(100, currentVal + delta));
    handleCommit(nextVal);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: evt => {
        isDraggingRef.current = true;
        updateFromTouch(evt);
      },
      onPanResponderMove: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const width = trackWidthRef.current || 260;
        // Tỷ lệ thay đổi từ dx
        const deltaPct = (gestureState.dx / width) * 100;
        const nextVal = Math.max(0, Math.min(100, Math.round(currentVal + deltaPct)));
        setCurrentVal(nextVal);
        onValueChange?.(nextVal);
      },
      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        onSlidingComplete?.(currentVal);
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        onSlidingComplete?.(currentVal);
      },
    }),
  ).current;

  // Chọn icon dựa theo mức âm lượng
  const volumeIcon =
    currentVal === 0
      ? 'volume-off'
      : currentVal < 40
      ? 'volume-mute'
      : currentVal < 75
      ? 'volume-down'
      : 'volume-up';

  return (
    <View style={[styles.container, disabled && styles.containerDisabled]}>
      {/* Header dòng thông tin âm lượng */}
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Icon
            name={volumeIcon}
            size={20}
            color={disabled ? colors.textMuted : colors.primary}
          />
          <Text style={[styles.label, disabled && styles.textDisabled]}>
            Âm lượng loa camera
          </Text>
        </View>

        <View style={styles.badgeWrap}>
          <Text style={[styles.badgeText, disabled && styles.textDisabled]}>
            {currentVal}%
          </Text>
          {currentVal === 50 && (
            <Text style={styles.defaultTag}>Mặc định</Text>
          )}
        </View>
      </View>

      {/* Thanh kéo cảm ứng */}
      <View style={styles.sliderRow}>
        {/* Nút giảm nhanh 5% */}
        <Pressable
          onPress={() => handleStep(-5)}
          disabled={disabled || currentVal <= 0}
          style={({pressed}) => [
            styles.stepBtn,
            (disabled || currentVal <= 0) && styles.stepBtnDisabled,
            pressed && {opacity: 0.7},
          ]}>
          <Icon name="remove" size={16} color={currentVal <= 0 ? colors.textMuted : colors.textPrimary} />
        </Pressable>

        {/* Thanh Track Slider */}
        <View
          style={styles.trackContainer}
          onLayout={e => {
            trackWidthRef.current = e.nativeEvent.layout.width;
          }}
          {...panResponder.panHandlers}>
          <View style={styles.trackBg} />
          <View style={[styles.trackFill, {width: `${currentVal}%`}]} />
          <View style={[styles.thumb, {left: `${Math.max(0, Math.min(96, currentVal - 4))}%`}]} />
        </View>

        {/* Nút tăng nhanh 5% */}
        <Pressable
          onPress={() => handleStep(5)}
          disabled={disabled || currentVal >= 100}
          style={({pressed}) => [
            styles.stepBtn,
            (disabled || currentVal >= 100) && styles.stepBtnDisabled,
            pressed && {opacity: 0.7},
          ]}>
          <Icon name="add" size={16} color={currentVal >= 100 ? colors.textMuted : colors.textPrimary} />
        </Pressable>
      </View>

      {/* Các nút bấm nhanh mức âm lượng phổ biến */}
      <View style={styles.presetsRow}>
        {PRESET_LEVELS.map(level => {
          const isSelected = currentVal === level;
          return (
            <Pressable
              key={level}
              onPress={() => handleCommit(level)}
              disabled={disabled}
              style={({pressed}) => [
                styles.presetPill,
                isSelected && styles.presetPillActive,
                pressed && {opacity: 0.8},
              ]}>
              <Text
                style={[
                  styles.presetText,
                  isSelected && styles.presetTextActive,
                  disabled && styles.textDisabled,
                ]}>
                {level}%{level === 50 ? ' (Chuẩn)' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadows.sm,
  },
  containerDisabled: {
    opacity: 0.6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    ...typography.label,
    color: colors.textPrimary,
  },
  badgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  badgeText: {
    ...typography.labelSmall,
    color: colors.primary,
    fontWeight: '700',
  },
  defaultTag: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textSecondary,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.cardMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBtnDisabled: {
    opacity: 0.4,
  },
  trackContainer: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e2e8f0',
    width: '100%',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    borderWidth: 2.5,
    borderColor: colors.primary,
    top: 7,
    ...shadows.sm,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
    marginTop: 2,
  },
  presetPill: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.cardMuted,
  },
  presetPillActive: {
    backgroundColor: colors.primary,
  },
  presetText: {
    ...typography.labelSmall,
    fontSize: 11,
    color: colors.textSecondary,
  },
  presetTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  textDisabled: {
    color: colors.textMuted,
  },
});
