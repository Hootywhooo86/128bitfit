import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  getFoodById,
  listRecentFoods,
  logFoodAgain,
  logFoodFromCatalog,
  searchFoods,
  type RecentFood,
} from '@/db/food-queries';
import { MEAL_TYPES, type Food, type MealType } from '@/db/schema';
import { MealSlot } from '@/components/MealSlot';
import { mealTimestamp, type MealDay } from '@/lib/meal-time';
import { parseDayKey } from '@/lib/fuel-day';
import {
  defaultMealTypeForHour,
  formatGrams,
  formatKcal,
  formatOptionalGrams,
  formatOptionalKcal,
  isCaloriesMissing,
  nutrientsForServings,
  nutrientsPerServing,
  parseNutrients,
  scaleLoggedPortion,
} from '@/lib/nutrition';
import { OFF_LICENSE_NOTE } from '@/lib/open-food-facts';
import { colors, spacing, themedStyles } from '@/lib/theme';
import { Screen } from '@/components/ui';

type RecentItem = RecentFood;

export default function AddFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string; foodId?: string; day?: string }>();
  const initialMeal = (MEAL_TYPES as readonly string[]).includes(params.meal ?? '')
    ? (params.meal as MealType)
    : defaultMealTypeForHour(new Date().getHours());

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Food | null>(null);
  const [servings, setServings] = useState('1');
  const [mealType, setMealType] = useState<MealType>(initialMeal);
  // Which day the meal belongs to — the day Fuel was showing when this opened,
  // so adding food while looking back at last Tuesday lands on last Tuesday.
  // Absent or malformed means today.
  const [mealDay, setMealDay] = useState<MealDay>(() => parseDayKey(params.day) ?? 'today');
  const [saving, setSaving] = useState(false);
  // A recent meal with no food behind it (described to or photographed for
  // the AI), being logged again from its last log.
  const [again, setAgain] = useState<RecentItem | null>(null);
  const [portions, setPortions] = useState('1');

  useEffect(() => {
    void listRecentFoods(15).then(setRecent);
  }, []);

  useEffect(() => {
    const id = typeof params.foodId === 'string' ? params.foodId : null;
    if (!id) return;
    void getFoodById(id).then((food) => {
      if (food) {
        setSelected(food);
        setServings('1');
      }
    });
  }, [params.foodId]);

  const runSearch = useCallback(async () => {
    const q = search.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const rows = await searchFoods(q, 40);
      setResults(rows);
    } finally {
      setSearching(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(runSearch, 200);
    return () => clearTimeout(t);
  }, [runSearch]);

  const servingsNum = useMemo(() => {
    const n = Number(servings);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [servings]);

  const preview = useMemo(() => {
    if (!selected) return null;
    return nutrientsForServings(selected, servingsNum);
  }, [selected, servingsNum]);

  const pickFood = (food: Food) => {
    setSelected(food);
    setServings('1');
  };

  const pickRecent = async (item: RecentItem) => {
    // A food from the database opens as usual, per serving of that food.
    const food = item.foodId ? await getFoodById(item.foodId) : null;
    if (food) {
      pickFood(food);
      return;
    }
    // Anything else — an AI meal, or a food since deleted — is logged again
    // from what was logged last time. These rows used to be disabled, so
    // tapping them did nothing at all.
    setAgain(item);
    setPortions('1');
  };

  const portionsNum = useMemo(() => {
    const n = Number(portions);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [portions]);

  const saveAgain = async () => {
    if (!again || saving || portionsNum <= 0) return;
    setSaving(true);
    try {
      await logFoodAgain(again.logId, {
        portions: portionsNum,
        mealType,
        loggedAt: mealTimestamp(mealType, mealDay),
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not log it', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!selected || saving || servingsNum <= 0) return;
    if (isCaloriesMissing(selected)) return;
    setSaving(true);
    try {
      await logFoodFromCatalog(selected, {
        servings: servingsNum,
        mealType,
        loggedAt: mealTimestamp(mealType, mealDay),
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (again) {
    const portion = scaleLoggedPortion(again, portionsNum);
    const lastAmount = `${Math.round(again.servings * 100) / 100} ${again.servingUnit ?? (again.servings === 1 ? 'serving' : 'servings')}`;
    return (
      <Screen section="Add food" back>
        <Pressable onPress={() => setAgain(null)} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Back to search</Text>
        </Pressable>
        <Text style={styles.title}>{again.name}</Text>
        <Text style={styles.muted}>
          Last time: {formatKcal(again.calories)} kcal · {lastAmount}
        </Text>

        <Text style={styles.section}>Portions</Text>
        <View style={styles.servingRow}>
          <Pressable
            style={styles.stepBtn}
            onPress={() =>
              setPortions(String(Math.max(0.25, Math.round((portionsNum - 0.25) * 100) / 100)))
            }
          >
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <TextInput
            style={styles.servingsInput}
            value={portions}
            onChangeText={setPortions}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <Pressable
            style={styles.stepBtn}
            onPress={() => setPortions(String(Math.round((portionsNum + 0.25) * 100) / 100))}
          >
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.rowMeta}>1 is the same amount as last time.</Text>

        <Text style={styles.section}>Meal</Text>
        <MealSlot mealType={mealType} onChangeMeal={setMealType} day={mealDay} onChangeDay={setMealDay} />

        <View style={styles.previewCard}>
          <Text style={styles.previewCal}>{formatKcal(portion.calories)} kcal</Text>
          <Text style={styles.previewMacros}>
            P {formatOptionalGrams(portion.protein)} · C {formatOptionalGrams(portion.carb)} · F{' '}
            {formatOptionalGrams(portion.fat)}
          </Text>
        </View>

        <Pressable
          style={[styles.saveBtn, (saving || portionsNum <= 0) && styles.saveBtnDisabled]}
          onPress={() => void saveAgain()}
          disabled={saving || portionsNum <= 0}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Log food'}</Text>
        </Pressable>
      </Screen>
    );
  }

  if (selected) {
    const per = nutrientsPerServing(selected);
    const unitLabel = selected.servingUnit
      ? `${selected.servingSize ?? ''} ${selected.servingUnit}`.trim()
      : 'serving';
    return (
      <Screen section="Add food" back>
        <Pressable onPress={() => setSelected(null)} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Back to search</Text>
        </Pressable>
        <Text style={styles.title}>{selected.name}</Text>
        <Text style={styles.muted}>
          {formatKcal(per.calories)} kcal per {unitLabel}
          {selected.nutritionBasis === 'per_100g' ? ' (from per 100g)' : ''}
        </Text>
        {selected.brand ? <Text style={styles.muted}>{selected.brand}</Text> : null}
        {selected.source === 'open_food_facts' ? (
          <Text style={styles.license}>{OFF_LICENSE_NOTE}</Text>
        ) : null}
        {isCaloriesMissing(selected) ? (
          <Text style={styles.warn}>
            Calories are missing for this product — logging is blocked until you use a custom food
            with calories filled in.
          </Text>
        ) : null}

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
        <MealSlot
          mealType={mealType}
          onChangeMeal={setMealType}
          day={mealDay}
          onChangeDay={setMealDay}
        />

        {preview ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewCal}>{formatKcal(preview.calories)} kcal</Text>
            <Text style={styles.previewMacros}>
              P {formatGrams(preview.protein)} · C {formatGrams(preview.carb)} · F{' '}
              {formatGrams(preview.fat)}
            </Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.saveBtn, (saving || servingsNum <= 0 || isCaloriesMissing(selected)) && styles.saveBtnDisabled]}
          onPress={save}
          disabled={saving || servingsNum <= 0}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Log food'}</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    // Wrapped in Screen like every other screen. Without it this branch drew
    // from the very top of the display, so the search field sat under the
    // status bar with its placeholder behind the clock — the stack header is
    // off app-wide and nothing else was reserving the inset.
    <Screen section="Add food" back scroll={false}>
      <TextInput
        style={styles.search}
        placeholder="Search foods…"
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        autoFocus
        clearButtonMode="while-editing"
      />

      {!search.trim() ? (
        <View style={{ flex: 1 }}>
          <Text style={styles.section}>Recent</Text>
          {recent.length === 0 ? (
            <Text style={styles.muted}>No recent foods yet. Search the offline database.</Text>
          ) : (
            <FlatList
              data={recent}
              keyExtractor={(item) => item.key}
              contentContainerStyle={{ paddingBottom: 40 }}
              // The search box opens the keyboard, and by default the first
              // tap on a row only closes it — the row looked dead.
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.row}
                  onPress={() => void pickRecent(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.name}</Text>
                    <Text style={styles.rowMeta}>
                      Last time {formatKcal(item.calories)} kcal
                      {item.servingUnit ? ` · ${item.servingUnit}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              )}
            />
          )}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <Text style={styles.count}>
            {searching ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'}`}
          </Text>
          {searching && results.length === 0 ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 40 }}
              // The search box opens the keyboard, and by default the first
              // tap on a row only closes it — the row looked dead.
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const per = nutrientsPerServing(item);
                const unit =
                  item.servingUnit != null
                    ? `${item.servingSize ?? ''} ${item.servingUnit}`.trim()
                    : 'serving';
                return (
                  <Pressable style={styles.row} onPress={() => pickFood(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{item.name}</Text>
                      <Text style={styles.rowMeta}>
                        {formatKcal(per.calories)} kcal / {unit}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                !searching ? (
                  <Text style={styles.empty}>No foods match. Try another name.</Text>
                ) : null
              }
            />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  muted: { color: colors.textMuted, lineHeight: 20 },
  license: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  warn: { color: colors.danger, fontSize: 13, lineHeight: 18, marginTop: 8 },
  count: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  chevron: { color: colors.accent, fontSize: 22, marginLeft: 8 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  backLink: { marginBottom: spacing.sm },
  backLinkText: { color: colors.accent, fontWeight: '700' },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
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
}));
