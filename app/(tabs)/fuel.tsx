import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CalorieRing } from '@/components/CalorieRing';
import { Card, MacroBar, QuickActions, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { getDayFuelSummary, type DayFuelSummary } from '@/db/food-queries';
import { MEAL_TYPES, type MealType } from '@/db/schema';
import { formatKcal } from '@/lib/nutrition';
import { colors, fonts, radius, spacing } from '@/lib/theme';

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
 */
export default function FuelScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const [summary, setSummary] = useState<DayFuelSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!ready) return;
    try {
      setSummary(await getDayFuelSummary(new Date()));
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  if (!ready || loading || !summary) {
    return (
      <Screen section="Today">
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const { goals, totals, byMeal, logs } = summary;
  const logged = logs.length > 0;

  return (
    <Screen section="Today">
      <Card>
        <View style={s.ringrow}>
          <CalorieRing consumed={logged ? totals.calories : null} target={goals.calorieTarget} />
          <View style={s.macros}>
            <MacroBar label="Protein" value={logged ? totals.protein : null} target={goals.proteinTarget} tone="p" />
            <MacroBar label="Carbs" value={logged ? totals.carb : null} target={goals.carbTarget} tone="c" />
            <MacroBar label="Fat" value={logged ? totals.fat : null} target={goals.fatTarget} tone="f" />
          </View>
        </View>
      </Card>

      <QuickActions
        items={[
          { icon: '◉', label: 'PHOTO', onPress: () => router.push('/fuel/label') },
          { icon: '▣', label: 'SCAN', onPress: () => router.push('/fuel/scan') },
          { icon: '⌕', label: 'SEARCH', onPress: () => router.push('/fuel/add') },
          { icon: '↺', label: 'RECENT', onPress: () => router.push('/fuel/add') },
          { icon: '✎', label: 'CUSTOM', onPress: () => router.push('/fuel/custom') },
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
                      {log.servings}× · P{Math.round(log.protein ?? 0)} C{Math.round(log.carb ?? 0)} F
                      {Math.round(log.fat ?? 0)}
                    </Text>
                  </View>
                  <Text style={s.itemK}>{Math.round(log.calories ?? 0)}</Text>
                </Pressable>
              ))
            )}

            <Pressable style={s.addf} onPress={() => router.push('/fuel/add')}>
              <Text style={s.addfT}>+ Add food</Text>
            </Pressable>
          </View>
        );
      })}
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
