import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CalorieRing } from '@/components/CalorieRing';
import { DayStrip } from '@/components/DayStrip';
import { Card, MacroBar, MenuRow, Note, QuickActions, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import {
  getDayFuelSummary,
  listDayTotals,
  type DayFuelSummary,
  type DayTotal,
} from '@/db/food-queries';
import { MEAL_TYPES, type MealType } from '@/db/schema';
import {
  clampFuelDay,
  dayKey,
  describeFuelDay,
  fuelWindow,
  startOfDay,
} from '@/lib/fuel-day';
import { formatKcal } from '@/lib/nutrition';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/** A macro nobody recorded shows as a dash, never as 0. */
const g = (v: number | null | undefined) => (v == null ? '–' : Math.round(v));

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'BREAKFAST',
  lunch: 'LUNCH',
  dinner: 'DINNER',
  snack: 'SNACKS',
};

/**
 * Fuel, laid out as prototype/app-shell.html: the ring with macro bars beside
 * it, the row of capture actions, then one card per meal.
 *
 * An unlogged day shows the target in an empty ring, never a filled zero — a
 * day nobody logged is not a day of eating nothing.
 *
 * The day strip at the top reaches back 30 days. Everything below it reads the
 * selected day rather than `new Date()`, and every capture action is handed
 * that day too — a screen showing last Tuesday with an Add button that logs to
 * today would be worse than not letting you look back at all.
 */
export default function FuelScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  // Tagged with the day it describes. Without the tag a day switch renders
  // the previous day's numbers under the new day's header for a frame — brief,
  // but a wrong number presented as that day's is still a wrong number.
  const [summary, setSummary] = useState<{ key: string; data: DayFuelSummary } | null>(null);
  const [totals, setTotals] = useState<Map<string, DayTotal>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!ready) return;
    try {
      setError(null);
      // Clamped on every read, not only when a day is picked: the selection
      // can fall outside the window while the screen is open — a phone left on
      // Fuel long enough for the day to age past 30, or a clock that moved
      // backwards and put the selection in the future.
      const showing = clampFuelDay(day);
      if (dayKey(showing) !== dayKey(day)) setDay(showing);
      const [next, windowTotals] = await Promise.all([
        getDayFuelSummary(showing),
        listDayTotals(fuelWindow()),
      ]);
      setSummary({ key: dayKey(showing), data: next });
      setTotals(windowTotals);
    } catch (e) {
      // Spinning forever would be the app pretending it is still working.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ready, day]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  if (error && !loading) {
    return (
      <Screen section={describeFuelDay(day)} onRefresh={() => void refresh()}>
        <Note>Could not read that day: {error}. Pull down to try again.</Note>
      </Screen>
    );
  }

  if (!ready || loading || !summary || summary.key !== dayKey(day)) {
    return (
      <Screen section={describeFuelDay(day)}>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const { goals, totals: dayTotals, partial, byMeal, logs } = summary.data;
  const logged = logs.length > 0;
  // Only ever sent as a date, never a time: the add screens decide the hour
  // from the meal slot, and a time here would override that.
  const dayParam = dayKey(day);
  const isToday = dayParam === dayKey(new Date());

  return (
    <Screen section={describeFuelDay(day)}>
      <DayStrip day={day} onChange={setDay} totals={totals} />

      <Card>
        <View style={s.ringrow}>
          <CalorieRing consumed={logged ? dayTotals.calories : null} target={goals.calorieTarget} />
          <View style={s.macros}>
            <MacroBar label="Protein" value={logged ? dayTotals.protein : null} target={goals.proteinTarget} tone="p" partial={partial.protein} />
            <MacroBar label="Carbs" value={logged ? dayTotals.carb : null} target={goals.carbTarget} tone="c" partial={partial.carb} />
            <MacroBar label="Fat" value={logged ? dayTotals.fat : null} target={goals.fatTarget} tone="f" partial={partial.fat} />
          </View>
        </View>
      </Card>

      <QuickActions
        items={[
          // AI first: describing a meal or photographing it is the fastest way
          // in for anything the catalog does not have.
          { icon: '✦', label: 'AI', onPress: () => router.push(`/fuel/ai?day=${dayParam}`) },
          { icon: '▣', label: 'SCAN', onPress: () => router.push(`/fuel/scan?day=${dayParam}`) },
          { icon: '⌕', label: 'SEARCH', onPress: () => router.push(`/fuel/add?day=${dayParam}`) },
          { icon: '◉', label: 'LABEL', onPress: () => router.push(`/fuel/label?day=${dayParam}`) },
          { icon: '✎', label: 'CUSTOM', onPress: () => router.push(`/fuel/custom-hub?day=${dayParam}`) },
        ]}
      />

      {MEAL_TYPES.map((meal) => {
        const items = byMeal[meal];
        const kcal = items.reduce((n, l) => n + (l.calories ?? 0), 0);
        return (
          <View key={meal} style={s.meal}>
            <View style={s.mh}>
              <Text style={s.mhN}>{MEAL_LABELS[meal]}</Text>
              <Text style={s.mhK}>{items.length > 0 ? formatKcal(kcal) : ''}</Text>
            </View>

            {items.length === 0 ? (
              <Text style={s.empty}>Nothing logged</Text>
            ) : (
              items.map((log) => (
                <Pressable
                  key={log.id}
                  style={s.item}
                  onPress={() => router.push(`/fuel/edit/${encodeURIComponent(log.id)}`)}
                >
                  {log.photoUri ? (
                    <Image source={{ uri: log.photoUri }} style={s.thumb} resizeMode="cover" />
                  ) : null}
                  <View style={s.itemN}>
                    <Text style={s.itemName} numberOfLines={1}>
                      {log.displayName}
                    </Text>
                    <Text style={s.itemSub}>
                      {/* A dash is "nobody knows", which is not the same as 0 g. */}
                      {log.servings}× · P{g(log.protein)} C{g(log.carb)} F{g(log.fat)}
                    </Text>
                  </View>
                  <Text style={s.itemK}>{Math.round(log.calories ?? 0)}</Text>
                </Pressable>
              ))
            )}

            <Pressable
              style={s.addf}
              onPress={() => router.push(`/fuel/add?meal=${meal}&day=${dayParam}`)}
            >
              <Text style={s.addfT}>+ Add food</Text>
            </Pressable>
          </View>
        );
      })}

      {/*
        The whole day, not just the three big numbers. Sits at the bottom
        because it is the thing you look at after logging, not before.
      */}
      <MenuRow
        icon="▥"
        name="Detailed nutrition"
        sub={`Every vitamin and mineral ${
          isToday ? 'today' : `on ${describeFuelDay(day)}`
        }, and the 7- and 30-day averages`}
        onPress={() => router.push(`/fuel/detail?day=${dayParam}`)}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 80, alignItems: 'center' },
  ringrow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  macros: { flex: 1, minWidth: 0 },

  meal: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginBottom: 10,
    overflow: 'hidden',
  },
  mh: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
  },
  mhN: { fontFamily: fonts.pixel, fontSize: 9, letterSpacing: 1, color: colors.text },
  mhK: { fontSize: 13, color: colors.textMuted, fontFamily: fonts.bodySemi },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  thumb: { width: 34, height: 34, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  itemN: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, color: colors.text, fontFamily: fonts.body },
  itemSub: { fontSize: 11, color: colors.textDim, marginTop: 3, fontFamily: fonts.body },
  itemK: { fontSize: 13, color: colors.textMuted, fontFamily: fonts.bodySemi },
  addf: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
  },
  addfT: { color: colors.textDim, fontSize: 13, fontFamily: fonts.bodySemi },
  empty: {
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    fontSize: 13,
    color: colors.textDim,
    fontFamily: fonts.body,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
