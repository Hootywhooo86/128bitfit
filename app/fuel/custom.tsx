import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PhotoCapture } from '@/components/PhotoCapture';
import { insertCustomFood, newCustomFoodId } from '@/db/barcode-queries';
import { logFoodFromCatalog } from '@/db/food-queries';
import type { MealType } from '@/db/schema';
import { buildFoodSubmission } from '@/lib/community-food';
import { saveFoodPhoto } from '@/lib/food-photo-store';
import { defaultMealTypeForHour } from '@/lib/nutrition';
import { MealSlot } from '@/components/MealSlot';
import { mealTimestamp, type MealDay } from '@/lib/meal-time';
import { parseDayKey } from '@/lib/fuel-day';
import type { LabelReading } from '@/lib/nutrition-label';
import { colors, spacing, themedStyles } from '@/lib/theme';
import { Screen } from '@/components/ui';

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * A number read off a label becomes the field's starting text. A field the
 * label did not state stays empty — an unread row must not arrive here as a 0,
 * which would claim the label said zero.
 */
function prefill(v: number | undefined): string {
  if (v == null) return '';
  // Labels state whole-ish numbers; trim float noise from unit conversion.
  return String(Math.round(v * 1000) / 1000);
}

function readingFromParams(raw: string | undefined): LabelReading | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LabelReading;
    return parsed && typeof parsed === 'object' && parsed.fields ? parsed : null;
  } catch {
    return null;
  }
}

export default function CustomFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    barcode?: string;
    message?: string;
    fromLabel?: string;
    photoUri?: string;
    /** Read off the front of the pack. A guess, and editable — never saved as read. */
    nameGuess?: string;
    reading?: string;
    /** The day Fuel was showing, carried through the scan and label flows. */
    day?: string;
  }>();
  const reading = useMemo(() => readingFromParams(params.reading), [params.reading]);
  const f = reading?.fields ?? {};

  const [name, setName] = useState(params.nameGuess?.trim() ?? '');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState(params.barcode ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(params.photoUri ?? null);
  const [servingSize, setServingSize] = useState(
    reading?.servingSize != null ? prefill(reading.servingSize) : '1'
  );
  const [servingUnit, setServingUnit] = useState(reading?.servingUnit ?? 'serving');
  const [calories, setCalories] = useState(prefill(f.calories));
  const [protein, setProtein] = useState(prefill(f.protein));
  const [fat, setFat] = useState(prefill(f.fat));
  const [carb, setCarb] = useState(prefill(f.carb));
  const [fiber, setFiber] = useState(prefill(f.fiber));
  const [sugars, setSugars] = useState(prefill(f.sugars));
  const [satFat, setSatFat] = useState(prefill(f.saturatedFat));
  const [sodium, setSodium] = useState(prefill(f.sodium));
  const [servings, setServings] = useState('1');
  const [mealType, setMealType] = useState<MealType>(
    defaultMealTypeForHour(new Date().getHours())
  );
  const [mealDay, setMealDay] = useState<MealDay>(() => parseDayKey(params.day) ?? 'today');
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

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
      // The id is minted first so the photo can be filed under it before the
      // row exists: a row pointing at a photo that failed to copy is worse
      // than a food with no photo.
      const id = newCustomFoodId();
      let storedPhoto: string | null = null;
      if (photoUri) {
        try {
          storedPhoto = await saveFoodPhoto(id, photoUri);
        } catch (e) {
          // Saving the food matters more than keeping the picture. Say so
          // rather than failing the whole save or dropping it silently.
          Alert.alert(
            'Photo not saved',
            `The food will be saved without it. ${e instanceof Error ? e.message : ''}`.trim()
          );
        }
      }

      const food = await insertCustomFood({
        photoUri: storedPhoto,
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
        transFat: reading?.fields.transFat ?? null,
        cholesterol: reading?.fields.cholesterol ?? null,
        addedSugars: reading?.fields.addedSugars ?? null,
      }, id);
      await logFoodFromCatalog(food, {
        servings: servingsNum,
        mealType,
        loggedAt: mealTimestamp(mealType, mealDay),
      });

      // Offering it to the shared database is opt-in, per food, and nothing
      // leaves the phone until the user submits the issue GitHub opens.
      Alert.alert(
        'Share this food?',
        'Offer these nutrition facts to the shared food database. It opens a pre-filled GitHub issue you submit yourself — your logs and settings are never included.',
        [
          { text: 'No thanks', style: 'cancel', onPress: () => router.replace('/(tabs)/fuel') },
          {
            text: 'Share',
            onPress: () => {
              void Linking.openURL(buildFoodSubmission(food).url);
              router.replace('/(tabs)/fuel');
            },
          },
        ]
      );
      return;
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen section="Custom food" back>
      <Text style={styles.title}>Custom food</Text>
      {params.message ? <Text style={styles.muted}>{params.message}</Text> : null}

      {reading ? (
        <View style={styles.readBanner}>
          <Text style={styles.readTitle}>Read from the label — check it</Text>
          <Text style={styles.muted}>
            {Object.keys(reading.fields).length} value
            {Object.keys(reading.fields).length === 1 ? '' : 's'} came off the photo. A camera
            misreads, so nothing is saved until you have looked at these numbers.
          </Text>
          {reading.unread.length > 0 ? (
            <Text style={styles.muted}>
              {reading.unread.length} row{reading.unread.length === 1 ? ' was' : 's were'} not
              legible and {reading.unread.length === 1 ? 'was' : 'were'} left blank rather than
              guessed at.
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.muted}>
          {params.barcode
            ? 'No catalog match for this barcode. Add nutrition yourself — blank fields stay blank (not zero).'
            : 'Add a food the catalog does not have. Blank fields stay blank (not zero).'}
        </Text>
      )}

      <Text style={styles.section}>Photo</Text>
      {photoUri ? (
        <View style={styles.photoRow}>
          <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
          <Pressable style={styles.secondaryBtn} onPress={() => setPhotoUri(null)}>
            <Text style={styles.secondaryBtnText}>Remove photo</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.secondaryBtn} onPress={() => setCameraOpen(true)}>
          <Text style={styles.secondaryBtnText}>Take a photo</Text>
        </Pressable>
      )}

      <Field label="Name *" value={name} onChangeText={setName} />
      {params.nameGuess?.trim() ? (
        <Text style={styles.guessNote}>
          Name read off the package photo. Check it — the camera gets this wrong often enough
          that it is worth a glance.
        </Text>
      ) : null}
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
        <MealSlot
          mealType={mealType}
          onChangeMeal={setMealType}
          day={mealDay}
          onChangeDay={setMealDay}
        />
      </View>

      <PhotoCapture
        visible={cameraOpen}
        onCapture={(uri) => {
          setPhotoUri(uri);
          setCameraOpen(false);
        }}
        onCancel={() => setCameraOpen(false)}
      />

      <Pressable
        style={[styles.saveBtn, saving && { opacity: 0.6 }]}
        onPress={() => void save()}
        disabled={saving}
      >
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save & log'}</Text>
      </Pressable>
    </Screen>
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

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  readBanner: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    gap: 6,
    marginBottom: spacing.md,
  },
  readTitle: { color: colors.text, fontWeight: '800' },
  photoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.md },
  guessNote: {
    color: colors.textMuted,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: -6,
    marginBottom: spacing.sm,
  },
  photo: {
    width: 84,
    height: 84,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  secondaryBtnText: { color: colors.text, fontWeight: '700' },
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
}));
