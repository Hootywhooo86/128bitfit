import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  deleteFoodLog,
  getFoodById,
  getFoodLogById,
  updateFoodLog,
} from '@/db/food-queries';
import { MEAL_TYPES, type Food, type FoodLog, type MealType } from '@/db/schema';
import { formatGrams, formatKcal, formatOptionalGrams, nutrientsForServings, nutrientsPerServing } from '@/lib/nutrition';
import { colors, spacing, themedStyles } from '@/lib/theme';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export default function EditFoodLogScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const logId = id ? decodeURIComponent(id) : '';

  const [log, setLog] = useState<FoodLog | null>(null);
  const [food, setFood] = useState<Food | null>(null);
  const [loading, setLoading] = useState(true);
  const [servings, setServings] = useState('1');
  const [mealType, setMealType] = useState<MealType>('snack');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!logId) return;
    setLoading(true);
    try {
      const row = await getFoodLogById(logId);
      setLog(row);
      if (row) {
        setServings(String(row.servings ?? 1));
        setMealType(((row.mealType as MealType) || 'snack') as MealType);
        if (row.foodId) {
          setFood(await getFoodById(row.foodId));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [logId]);

  useEffect(() => {
    void load();
  }, [load]);

  const servingsNum = useMemo(() => {
    const n = Number(servings);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [servings]);

  const preview = useMemo(() => {
    if (food) return nutrientsForServings(food, servingsNum);
    // Scaling an unknown macro leaves it unknown: two servings of a food whose
    // fat nobody recorded still has no fat figure, not 0 g.
    const scaled = (v: number | null | undefined, scale: number) =>
      v == null ? null : v * scale;
    if (!log || !log.servings || log.servings <= 0) {
      return {
        calories: log?.calories ?? 0,
        protein: log?.protein ?? null,
        fat: log?.fat ?? null,
        carb: log?.carb ?? null,
      };
    }
    const scale = servingsNum / log.servings;
    return {
      calories: (log.calories ?? 0) * scale,
      protein: scaled(log.protein, scale),
      fat: scaled(log.fat, scale),
      carb: scaled(log.carb, scale),
    };
  }, [food, log, servingsNum]);

  const save = async () => {
    if (!log || saving || servingsNum <= 0) return;
    setSaving(true);
    try {
      await updateFoodLog(log.id, {
        mealType,
        servings: servingsNum,
        calories: preview.calories,
        protein: preview.protein,
        fat: preview.fat,
        carb: preview.carb,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!log) return;
    Alert.alert('Remove food?', 'This log entry will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteFoodLog(log.id);
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!log) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Log entry not found.</Text>
      </View>
    );
  }

  const name = log.customName || food?.name || 'Food';
  const per = food ? nutrientsPerServing(food) : null;
  const unitLabel = log.servingUnit
    ? `${log.servingSize ?? ''} ${log.servingUnit}`.trim()
    : 'serving';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <Text style={styles.title}>{name}</Text>
      {per ? (
        <Text style={styles.muted}>
          {formatKcal(per.calories)} kcal per {unitLabel}
        </Text>
      ) : (
        <Text style={styles.muted}>Logged macros (scaled with servings)</Text>
      )}

      <Text style={styles.section}>Servings</Text>
      <View style={styles.servingRow}>
        <Pressable
          style={styles.stepBtn}
          onPress={() =>
            setServings(String(Math.max(0.25, Math.round((servingsNum - 0.25) * 100) / 100)))
          }
        >
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <TextInput
          style={styles.servingsInput}
          value={servings}
          onChangeText={setServings}
          keyboardType="decimal-pad"
          selectTextOnFocus
        />
        <Pressable
          style={styles.stepBtn}
          onPress={() => setServings(String(Math.round((servingsNum + 0.25) * 100) / 100))}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>Meal</Text>
      <View style={styles.mealRow}>
        {MEAL_TYPES.map((m) => (
          <Pressable
            key={m}
            style={[styles.mealChip, mealType === m && styles.mealChipActive]}
            onPress={() => setMealType(m)}
          >
            <Text style={[styles.mealChipText, mealType === m && styles.mealChipTextActive]}>
              {MEAL_LABELS[m]}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.previewCard}>
        <Text style={styles.previewCal}>{formatKcal(preview.calories)} kcal</Text>
        <Text style={styles.previewMacros}>
          P {formatOptionalGrams(preview.protein)} · C {formatOptionalGrams(preview.carb)} · F{' '}
          {formatOptionalGrams(preview.fat)}
        </Text>
      </View>

      <Pressable
        style={[styles.saveBtn, (saving || servingsNum <= 0) && styles.saveBtnDisabled]}
        onPress={save}
        disabled={saving || servingsNum <= 0}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
      </Pressable>

      <Pressable style={styles.removeBtn} onPress={remove}>
        <Text style={styles.removeBtnText}>Remove from log</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  muted: { color: colors.textMuted, marginTop: 4, marginBottom: spacing.md },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  servingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: colors.text, fontSize: 22, fontWeight: '700' },
  servingsInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mealChip: {
    backgroundColor: colors.chip,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mealChipActive: { backgroundColor: colors.chipActive, borderColor: colors.accent },
  mealChipText: { color: colors.text, fontSize: 13 },
  mealChipTextActive: { color: colors.chipActiveText, fontWeight: '700' },
  previewCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewCal: { color: colors.accent, fontSize: 28, fontWeight: '900' },
  previewMacros: { color: colors.textMuted, marginTop: 4 },
  saveBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: colors.chipActiveText, fontWeight: '800', fontSize: 16 },
  removeBtn: {
    marginTop: spacing.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  removeBtnText: { color: colors.danger, fontWeight: '700' },
}));
