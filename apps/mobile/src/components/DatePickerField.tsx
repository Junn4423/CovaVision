import React, {useMemo, useState} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {colors} from '../theme';
import {spacing, border} from '../designSystem';
import {Icon} from './Icon';

type DatePickerFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
};

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONTH_LABELS = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

function parseIsoDate(value: string): Date {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return new Date();
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month
    || parsed.getDate() !== day
  ) {
    return new Date();
  }
  return parsed;
}

function formatIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDisplayDate(value: string): string {
  const date = parseIsoDate(value);
  const day = `${date.getDate()}`.padStart(2, '0');
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function buildCalendarDays(monthCursor: Date) {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlankCount = (firstDay.getDay() + 6) % 7;
  const days: Array<Date | null> = [];

  for (let index = 0; index < leadingBlankCount; index += 1) {
    days.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(year, month, day));
  }
  while (days.length % 7 !== 0) {
    days.push(null);
  }
  return days;
}

export function DatePickerField({
  value,
  onChange,
  label = 'Chọn ngày',
  disabled = false,
}: DatePickerFieldProps) {
  const selectedDate = useMemo(() => parseIsoDate(value), [value]);
  const [visible, setVisible] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => (
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  ));

  const days = useMemo(() => buildCalendarDays(monthCursor), [monthCursor]);
  const selectedIso = formatIsoDate(selectedDate);

  function openPicker() {
    if (disabled) {
      return;
    }
    setMonthCursor(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setVisible(true);
  }

  function moveMonth(offset: number) {
    setMonthCursor(current => new Date(
      current.getFullYear(),
      current.getMonth() + offset,
      1,
    ));
  }

  function selectDate(date: Date) {
    onChange(formatIsoDate(date));
    setVisible(false);
  }

  function selectToday() {
    selectDate(new Date());
  }

  return (
    <>
      <Pressable
        onPress={openPicker}
        disabled={disabled}
        style={({pressed}) => [
          styles.field,
          pressed && !disabled ? styles.fieldPressed : null,
          disabled ? styles.fieldDisabled : null,
        ]}>
        <View style={styles.fieldTextWrap}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <Text style={styles.fieldValue}>{formatDisplayDate(value)}</Text>
        </View>
        <Icon name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.modalCard}>
            <View style={styles.headerRow}>
              <Pressable onPress={() => moveMonth(-1)} style={styles.navButton}>
                <Icon name="chevron-left" size={22} color={colors.infoText} />
              </Pressable>
              <View style={styles.headerTitleWrap}>
                <Text style={styles.headerTitle}>
                  {MONTH_LABELS[monthCursor.getMonth()]} {monthCursor.getFullYear()}
                </Text>
                <Text style={styles.headerSubtitle}>{formatDisplayDate(selectedIso)}</Text>
              </View>
              <Pressable onPress={() => moveMonth(1)} style={styles.navButton}>
                <Icon name="chevron-right" size={22} color={colors.infoText} />
              </Pressable>
            </View>

            <View style={styles.weekdayGrid}>
              {WEEKDAY_LABELS.map(day => (
                <Text key={day} style={styles.weekdayText}>{day}</Text>
              ))}
            </View>

            <View style={styles.dayGrid}>
              {days.map((date, index) => {
                if (!date) {
                  return <View key={`blank-${index}`} style={styles.dayCell} />;
                }

                const iso = formatIsoDate(date);
                const isSelected = iso === selectedIso;
                const isToday = iso === formatIsoDate(new Date());
                return (
                  <Pressable
                    key={iso}
                    onPress={() => selectDate(date)}
                    style={[
                      styles.dayCell,
                      isToday ? styles.dayToday : null,
                      isSelected ? styles.daySelected : null,
                    ]}>
                    <Text
                      style={[
                        styles.dayText,
                        isToday ? styles.dayTextToday : null,
                        isSelected ? styles.dayTextSelected : null,
                      ]}>
                      {date.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.footerRow}>
              <Pressable onPress={selectToday} style={styles.todayButton}>
                <Text style={styles.todayButtonText}>Hôm nay</Text>
              </Pressable>
              <Pressable onPress={() => setVisible(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Đóng</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
    borderRadius: border.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm + 2,
  },
  fieldPressed: {
    borderColor: colors.primary,
  },
  fieldDisabled: {
    opacity: 0.55,
  },
  fieldTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  fieldValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: border.radius.lg,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#ffffff',
    padding: spacing.md,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm + 2,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: border.radius.md,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayGrid: {
    flexDirection: 'row',
  },
  weekdayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: {
    backgroundColor: '#e0f2fe',
  },
  daySelected: {
    backgroundColor: colors.primary,
  },
  dayText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  dayTextToday: {
    color: '#0369a1',
  },
  dayTextSelected: {
    color: '#ffffff',
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  todayButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: border.radius.md,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButtonText: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '800',
  },
  closeButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: border.radius.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
});
