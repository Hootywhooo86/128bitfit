import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { insertCustomFood } from '@/db/barcode-queries';
import { logFoodFromCatalog } from '@/db/food-queries';
import { MEAL_TYPES, type MealType } from '@/db/schema';
import { defaultMealTypeForHour } from '@/lib/nutrition';
import { colors, spacing } from '@/lib/theme';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function CustomFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ barcode?: string; message?: string }>();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState(params.barcode ?? '');
  const [servingSize, setServingSize] = useState('1');
  const [servingUnit, setServingUnit] = useState('serving');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carb, setCarb] = useState('');
  const [fiber, setFiber] = useState('');
  const [sugars, setSugars] = useState('');
  const [satFat, setSatFat] = useState('');
  const [sodium, setSodium] = useState('');
  const [servings, setServings] = useState('1');
  const [mealType, setMealType] = useState<MealType>(
    defaultMealTypeForHour(new Date().getHours())
  );
  const [saving, setSaving] = useState(false);

  const servingsNum = useMemo(() => {
    const n = Number(servings);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [servings]);

  const save = async () => {
    if (saving) return;
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a food name.');
      return;
    }
    if (servingsNum <= 0) {
      Alert.alert('Servings', 'Enter a servings amount greater than zero.');
      return;
    }
    const cal = parseOptionalNumber(calories);
    if (cal == null) {
      Alert.alert(
        'Calories required',
        'Enter calories for this custom food. Missing values are not treated as zero.'
      );
      return;
    }

    setSaving(true);
    try {
      const food = await insertCustomFood({
        name: name.trim(),
        brand: brand.trim() || null,
        barcode: barcode.trim() || null,
        servingSize: parseOptionalNumber(servingSize) ?? 1,
        servingUnit: servingUnit.trim() || 'serving',
        nutritionBasis: 'per_serving',
        calories: cal,
        protein: parseOptionalNumber(protein),
        fat: parseOptionalNumber(fat),
        carb: parseOptionalNumber(carb),
        fiber: parseOptionalNumber(fiber),
        sugars: parseOptionalNumber(sugars),
        saturatedFat: parseOptionalNumber(satFat),
        sodium: parseOptionalNumber(sodium),
      });
      await logFoodFromCatalog(food, { servings: servingsNum, mealType });
      router.replace('/(tabs)/fuel');
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <Text style={styles.title}>Custom food</Text>
      {params.message ? <Text style={styles.muted}>{params.message}</Text> : null}
      <Text style={styles.muted}>
        No catalog match for this barcode. Add nutrition yourself — blank fields stay blank (not
        zero).
      </Text>

      <Field label="Name *" value={name} onChangeText={setName} />
      <Field label="Brand" value={brand} onChangeText={setBrand} />
      <Field
        label="Barcode"
        value={barcode}
        onChangeText={setBarcode}
        keyboardType="number-pad"
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field
            label="Serving size"
            value={servingSize}
            onChangeText={setServingSize}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Unit" value={servingUnit} onChangeText={setServingUnit} />
        </View>
      </View>

      <Text style={styles.section}>Nutrition (per serving)</Text>
      <Field
        label="Calories (kcal) *"
        value={calories}
        onChangeText={setCalories}
        keyboardType="decimal-pad"
      />
      <Field label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" />
      <Field label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" />
      <Field label="Carbs (g)" value={carb} onChangeText={setCarb} keyboardType="decimal-pad" />
      <Field label="Fiber (g)" value={fiber} onChangeText={setFiber} keyboardType="decimal-pad" />
      <Field label="Sugars (g)" value={sugars} onChangeText={setSugars} keyboardType="decimal-pad" />
      <Field
        label="Saturated fat (g)"
        value={satFat}
        onChangeText={setSatFat}
        keyboardType="decimal-pad"
      />
      <Field label="Sodium (mg)" value={sodium} onChangeText={setSodium} keyboardType="decimal-pad" />

      <Text style={styles.section}>Log</Text>
      <Field
        label="Servings"
        value={servings}
        onChangeText={setServings}
        keyboardType="decimal-pad"
      />
      <View style={styles.mealRow}>
        {MEAL_TYPES.map((m) => (
          <Pressable
            key={m}
            style={[styles.mealChip, mealType === m && styles.mealChipOn]}
            onPress={() => setMealType(m)}
          >
            <Text style={[styles.mealText, mealType === m && styles.mealTextOn]}>
              {MEAL_LABELS[m]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.saveBtn, saving && { opacity: 0.6 }]}
        onPress={() => void save()}
        disabled={saving}
      >
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save & log'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
}) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: spacing.sm },
  muted: { color: colors.textMuted, lineHeight: 20, marginBottom: spacing.md },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  mealChip: {
    backgroundColor: colors.chip,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mealChipOn: { backgroundColor: colors.chipActive, borderColor: colors.accent },
  mealText: { color: colors.text, fontSize: 13 },
  mealTextOn: { color: colors.chipActiveText, fontWeight: '700' },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveText: { color: colors.chipActiveText, fontWeight: '800', fontSize: 16 },
});
