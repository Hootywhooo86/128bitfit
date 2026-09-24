import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Label, MenuRow, Note, Screen } from '@/components/ui';
import { listUserFoods } from '@/db/barcode-queries';
import { useDb } from '@/db/DatabaseProvider';
import { logFoodFromCatalog } from '@/db/food-queries';
import type { Food } from '@/db/schema';
import { parseDayKey } from '@/lib/fuel-day';
import { mealTimestamp } from '@/lib/meal-time';
import {
  defaultMealTypeForHour,
  formatOptionalGrams,
  formatOptionalKcal,
  optionalNutrientsPerServing,
} from '@/lib/nutrition';
import { colors, fonts, spacing } from '@/lib/theme';

/**
 * Everything the user made, in one place.
 *
 * CUSTOM used to open the blank custom-food form directly, so a saved recipe
 * or a food you added last month had nowhere to be seen — the only way back to
 * one was to remember its name and search for it among nine thousand others.
 *
 * Recipes and custom foods are separated because they are used differently: a
 * recipe is logged by the serving and its panel is per serving, a custom food
 * is a single item. They are the same table, told apart by `source`.
 */
export default function CustomHubScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string }>();
  const mealDay = parseDayKey(params.day) ?? 'today';
  const dayQuery = params.day ? `&day=${params.day}` : '';
  const [recipes, setRecipes] = useState<Food[]>([]);
  const [customs, setCustoms] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!ready) return;
    try {
      const [r, c] = await Promise.all([listUserFoods('recipe'), listUserFoods('custom')]);
      setRecipes(r);
      setCustoms(c);
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  /** One tap logs one serving into the right meal for the time of day. */
  const logOne = async (food: Food) => {
    if (logging) return;
    setLogging(food.id);
    try {
      // The slot comes from the clock even on a past day — there is nothing
      // better to go on, and it keeps a late-night tap from landing tomorrow.
      // The day comes from wherever Fuel was, so one tap on a day you have
      // navigated back to logs onto that day rather than onto today.
      const meal = defaultMealTypeForHour(new Date().getHours());
      await logFoodFromCatalog(food, {
        servings: 1,
        mealType: meal,
        loggedAt: mealTimestamp(meal, mealDay),
      });
      router.replace('/(tabs)/fuel');
    } catch (e) {
      Alert.alert('Could not log it', e instanceof Error ? e.message : String(e));
    } finally {
      setLogging(null);
    }
  };

  if (!ready || loading) {
    return (
      <Screen section="Custom" back>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen section="Custom" back onRefresh={() => void refresh()}>
      <Label>MAKE SOMETHING</Label>
      <MenuRow
        icon="✦"
        name="New recipe"
        sub="Photograph it or paste a link — saved per serving"
        onPress={() => router.push(`/fuel/ai?mode=recipe${dayQuery}`)}
      />
      <MenuRow
        icon="✎"
        name="New custom food"
        sub="One item the catalogue does not have"
        onPress={() => router.push(params.day ? `/fuel/custom?day=${params.day}` : '/fuel/custom')}
      />

      <Label>MY RECIPES</Label>
      {recipes.length === 0 ? (
        <Note>
          Nothing yet. A recipe is saved once and logged by the serving after that — no camera
          the second time.
        </Note>
      ) : (
        recipes.map((f) => <FoodRow key={f.id} food={f} busy={logging === f.id} onLog={logOne} />)
      )}

      <Label>MY FOODS</Label>
      {customs.length === 0 ? (
        <Note>Foods you add by hand or from a barcode miss land here.</Note>
      ) : (
        customs.map((f) => <FoodRow key={f.id} food={f} busy={logging === f.id} onLog={logOne} />)
      )}
    </Screen>
  );
}

function FoodRow({
  food,
  busy,
  onLog,
}: {
  food: Food;
  busy: boolean;
  onLog: (f: Food) => void;
}) {
  // Optional figures, not the summing ones: a food whose protein was never
  // entered must not read "P 0" — that claims a measurement nobody took.
  const per = optionalNutrientsPerServing(food);
  const unit = food.servingUnit ?? 'serving';
  const macros = (['protein', 'carb', 'fat'] as const)
    .filter((k) => per[k] != null)
    .map((k) => `${k[0].toUpperCase()} ${formatOptionalGrams(per[k])}`)
    .join(' · ');
  return (
    <Card>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{food.name}</Text>
          <Text style={s.meta}>
            {per.calories == null
              ? 'No calories saved'
              : `${formatOptionalKcal(per.calories)} kcal per ${unit}`}
            {macros ? ` · ${macros}` : ''}
          </Text>
        </View>
        <Pressable style={[s.log, busy && { opacity: 0.5 }]} onPress={() => onLog(food)}>
          <Text style={s.logT}>{busy ? '…' : 'Log 1'}</Text>
        </Pressable>
      </View>
      {food.description ? (
        <Text style={s.desc} numberOfLines={3}>
          {food.description}
        </Text>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 80, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { color: colors.text, fontSize: 15, fontFamily: fonts.bodySemi },
  meta: { color: colors.textMuted, fontSize: 12.5, marginTop: 3, fontFamily: fonts.body },
  desc: { color: colors.textDim, fontSize: 11.5, lineHeight: 16, marginTop: 8, fontFamily: fonts.body },
  log: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderBright,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  logT: { color: colors.text, fontSize: 12.5, fontFamily: fonts.bodySemi },
});
