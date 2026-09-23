import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MEAL_TYPES, type MealType } from '@/db/schema';
import { describeMealTime, mealTimestamp, type MealDay } from '@/lib/meal-time';
import { colors, fonts, spacing } from '@/lib/theme';

const LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/**
 * Which meal, and when it actually happened.
 *
 * The slot alone used to decide nothing about the time — food was stamped with
 * the moment you pressed save. Enter the day at bedtime and breakfast, lunch
 * and dinner all landed at 22:00; enter it after midnight and the lot went to
 * the wrong day. Picking the slot now sets a sensible time, and the line
 * underneath says which, so it is never a silent guess.
 */
export function MealSlot({
  mealType,
  onChangeMeal,
  day,
  onChangeDay,
  now = new Date(),
}: {
  mealType: MealType;
  onChangeMeal: (m: MealType) => void;
  day: MealDay;
  onChangeDay: (d: MealDay) => void;
  now?: Date;
}) {
  const at = mealTimestamp(mealType, day, now);
  return (
    <View>
      <View style={s.row}>
        {MEAL_TYPES.map((m) => (
          <Pressable
            key={m}
            onPress={() => onChangeMeal(m)}
            style={[s.chip, mealType === m && s.chipOn]}
          >
            <Text style={[s.chipT, mealType === m && s.chipTOn]}>{LABELS[m]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.whenRow}>
        <Text style={s.when}>Logging as {describeMealTime(at, now)}</Text>
        <Pressable
          onPress={() => onChangeDay(day === 'today' ? 'yesterday' : 'today')}
          hitSlop={10}
        >
          <Text style={s.toggle}>{day === 'today' ? 'A day earlier' : 'Back to today'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.track },
  chipT: { color: colors.textMuted, fontSize: 12.5, fontFamily: fonts.body },
  chipTOn: { color: colors.text, fontFamily: fonts.bodySemi },
  whenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  when: { color: colors.textMuted, fontSize: 12.5, fontFamily: fonts.body, flexShrink: 1 },
  toggle: { color: colors.textMuted, fontSize: 12.5, textDecorationLine: 'underline' },
});
