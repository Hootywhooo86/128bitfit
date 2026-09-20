import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CalorieProgress } from '@/components/CalorieProgress';
import { useDb } from '@/db/DatabaseProvider';
import {
  addWater,
  deleteFoodLog,
  getDayFuelSummary,
  type DayFuelSummary,
  type FoodLogWithName,
} from '@/db/food-queries';
import { MEAL_TYPES, type MealType } from '@/db/schema';
import { formatGrams, formatKcal } from '@/lib/nutrition';
import { colors, spacing } from '@/lib/theme';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export default function FuelScreen() {
  const router = useRouter();
  const { ready } = useDb();
  const [summary, setSummary] = useState<DayFuelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyWater, setBusyWater] = useState(false);

  const refresh = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const s = await getDayFuelSummary(new Date());
      setSummary(s);
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onAddWater = async (ml: number) => {
    if (busyWater) return;
    setBusyWater(true);
    try {
      await addWater(ml);
      await refresh();
    } finally {
      setBusyWater(false);
    }
  };

  const onRemoveLog = (log: FoodLogWithName) => {
    Alert.alert('Remove food?', `Remove ${log.displayName} from today's log?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteFoodLog(log.id);
          await refresh();
        },
      },
    ]);
  };

  if (!ready || (loading && !summary)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!summary) return null;

  const { goals, totals, waterMl, byMeal } = summary;
  const waterPct =
    goals.waterTargetMl > 0 ? Math.min(1, waterMl / goals.waterTargetMl) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Fuel</Text>
          <Text style={styles.muted}>Today</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.scanBtn} onPress={() => router.push('/fuel/scan')}>
            <Text style={styles.scanBtnText}>Scan barcode</Text>
          </Pressable>
          <Pressable style={styles.addBtn} onPress={() => router.push('/fuel/add')}>
            <Text style={styles.addBtnText}>+ Add food</Text>
          </Pressable>
        </View>
      </View>

      <CalorieProgress consumed={totals.calories} target={goals.calorieTarget} />

      <View style={styles.macroRow}>
        <MacroChip label="Protein" value={formatGrams(totals.protein)} target={`${goals.proteinTarget}g`} />
        <MacroChip label="Fat" value={formatGrams(totals.fat)} target={`${goals.fatTarget}g`} />
        <MacroChip label="Carbs" value={formatGrams(totals.carb)} target={`${goals.carbTarget}g`} />
      </View>

      <Text style={styles.section}>Water</Text>
      <View style={styles.waterCard}>
        <Text style={styles.waterTotal}>
          {waterMl} / {goals.waterTargetMl} ml
        </Text>
        <View style={styles.waterTrack}>
          <View style={[styles.waterFill, { width: `${Math.round(waterPct * 100)}%` }]} />
        </View>
        <View style={styles.waterBtns}>
          <Pressable style={styles.waterBtn} onPress={() => onAddWater(250)} disabled={busyWater}>
            <Text style={styles.waterBtnText}>+250 ml</Text>
          </Pressable>
          <Pressable style={styles.waterBtn} onPress={() => onAddWater(500)} disabled={busyWater}>
            <Text style={styles.waterBtnText}>+500 ml</Text>
          </Pressable>
        </View>
      </View>

      {MEAL_TYPES.map((meal) => (
        <View key={meal}>
          <Text style={styles.section}>{MEAL_LABELS[meal]}</Text>
          {byMeal[meal].length === 0 ? (
            <Text style={styles.emptyMeal}>Nothing logged</Text>
          ) : (
            byMeal[meal].map((log) => (
              <Pressable
                key={log.id}
                style={styles.logRow}
                onPress={() => router.push(`/fuel/edit/${encodeURIComponent(log.id)}`)}
                onLongPress={() => onRemoveLog(log)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.logName}>{log.displayName}</Text>
                  <Text style={styles.logMeta}>
                    {log.servings}× · P {formatGrams(log.protein)} · C {formatGrams(log.carb)} · F{' '}
                    {formatGrams(log.fat)}
                  </Text>
                </View>
                <Text style={styles.logCal}>{formatKcal(log.calories)}</Text>
              </Pressable>
            ))
          )}
        </View>
      ))}
    </ScrollView>
  );
}

function MacroChip({
  label,
  value,
  target,
}: {
  label: string;
  value: string;
  target: string;
}) {
  return (
    <View style={styles.macroChip}>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>{value}</Text>
      <Text style={styles.macroTarget}>/ {target}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  muted: { color: colors.textMuted, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanBtn: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scanBtnText: { color: colors.text, fontWeight: '700' },
  addBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addBtnText: { color: colors.chipActiveText, fontWeight: '800' },
  macroRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  macroChip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  macroLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  macroValue: { color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 2 },
  macroTarget: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  waterCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  waterTotal: { color: colors.text, fontWeight: '700', fontSize: 16 },
  waterTrack: {
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    overflow: 'hidden',
  },
  waterFill: { height: '100%', backgroundColor: '#4db8ff', borderRadius: 4 },
  waterBtns: { flexDirection: 'row', gap: 8 },
  waterBtn: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  waterBtnText: { color: colors.text, fontWeight: '700' },
  emptyMeal: { color: colors.textMuted, fontSize: 13, marginBottom: 4 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  logName: { color: colors.text, fontWeight: '700' },
  logMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  logCal: { color: colors.accent, fontWeight: '800', marginLeft: 8 },
});
