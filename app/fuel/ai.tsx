import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Card, Label, Note, Screen } from '@/components/ui';
import { insertFoodLog, logFoodFromCatalog } from '@/db/food-queries';
import { insertCustomFood } from '@/db/barcode-queries';
import { describeIngredients, fallbackRecipeName, recipeTotals } from '@/lib/recipe';
import type { MealType } from '@/db/schema';
import { MAX_RECIPE_PHOTOS, estimateFood, type AiPhoto } from '@/lib/ai-food-client';
import { totalsOf, type AiFoodItem } from '@/lib/ai-food';
import { defaultMealTypeForHour } from '@/lib/nutrition';
import { MealSlot } from '@/components/MealSlot';
import { mealTimestamp, type MealDay } from '@/lib/meal-time';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * Log a meal by describing it, or by photographing it.
 *
 * Both routes end at the same editable list. Nothing is saved until the user
 * has looked at the numbers, because a model estimating "some cottage cheese"
 * or a portion size from a photo is guessing — CLAUDE.md forbids presenting
 * that as a measurement, so the screen says "estimate" and lets every figure
 * be corrected.
 */
export default function AiFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'describe' | 'photo' | 'recipe'>(
    params.mode === 'recipe' ? 'recipe' : 'describe'
  );
  const [shots, setShots] = useState<AiPhoto[]>([]);
  const [link, setLink] = useState('');
  const [servings, setServings] = useState('4');
  const [recipeName, setRecipeName] = useState('');
  /** How many of those servings you actually ate. */
  const [ate, setAte] = useState('1');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [items, setItems] = useState<AiFoodItem[] | null>(null);
  const [mealDay, setMealDay] = useState<MealDay>('today');
  const [mealType, setMealType] = useState<MealType>(
    defaultMealTypeForHour(new Date().getHours())
  );
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  const handle = (out: Awaited<ReturnType<typeof estimateFood>>) => {
    if (out.status === 'ok') {
      setItems(out.items);
      setNote(out.note);
      setMealType(out.mealType);
      setError(null);
      return;
    }
    setItems(null);
    setError(out.message);
  };

  const runDescribe = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      handle(await estimateFood({ kind: 'describe', text }));
    } finally {
      setBusy(false);
    }
  };

  const runPhoto = async () => {
    if (busy || !camera.current) return;
    setBusy(true);
    setError(null);
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.6, base64: true });
      if (!shot?.base64) {
        setError('The camera did not return a photo. Try again.');
        return;
      }
      handle(await estimateFood({ kind: 'photo', base64: shot.base64, mimeType: 'image/jpeg' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that photo.');
    } finally {
      setBusy(false);
    }
  };

  const addShot = async () => {
    if (busy || !camera.current || shots.length >= MAX_RECIPE_PHOTOS) return;
    setBusy(true);
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.55, base64: true });
      if (shot?.base64) setShots((prev) => [...prev, { base64: shot.base64!, mimeType: 'image/jpeg' }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not take that photo.');
    } finally {
      setBusy(false);
    }
  };

  const servingsNum = () => {
    const n = Number(servings);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
  };

  const ateNum = () => {
    const n = Number(ate);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  const runRecipePhotos = async () => {
    if (busy || shots.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      handle(await estimateFood({ kind: 'recipe-photos', photos: shots, servings: servingsNum() }));
    } finally {
      setBusy(false);
    }
  };

  const runRecipeLink = async () => {
    if (busy || !link.trim()) return;
    setBusy(true);
    setError(null);
    try {
      handle(await estimateFood({ kind: 'recipe-link', url: link, servings: servingsNum() }));
    } finally {
      setBusy(false);
    }
  };

  const edit = (i: number, patch: Partial<AiFoodItem>) => {
    setItems((prev) => prev && prev.map((it, n) => (n === i ? { ...it, ...patch } : it)));
  };

  /**
   * A recipe becomes one food you can log again, not a pile of ingredients in
   * today.
   *
   * Saved to the catalogue with its per-serving panel, then logged for however
   * many servings you actually ate. Next week it is in Custom → My recipes and
   * needs no camera at all.
   */
  const saveRecipe = async () => {
    if (!items || items.length === 0 || busy) return;
    setBusy(true);
    try {
      const totals = recipeTotals(items);
      const food = await insertCustomFood({
        name: recipeName.trim() || fallbackRecipeName(items),
        source: 'recipe',
        description: describeIngredients(items, servingsNum()),
        servingSize: 1,
        servingUnit: 'serving',
        nutritionBasis: 'per_serving',
        calories: totals.calories,
        protein: totals.protein,
        fat: totals.fat,
        carb: totals.carb,
      });
      await logFoodFromCatalog(food, {
        servings: ateNum(),
        mealType,
        loggedAt: mealTimestamp(mealType, mealDay),
        notes: 'AI estimate',
      });
      router.replace('/(tabs)/fuel');
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!items || items.length === 0 || busy) return;
    if (mode === 'recipe') return saveRecipe();
    setBusy(true);
    try {
      for (const it of items) {
        // A macro the model could not estimate is stored as null, not 0: the
        // column is nullable precisely so an unknown never reads as "none".
        await insertFoodLog({
          foodId: null,
          customName: `${it.name} (${it.portion})`,
          mealType,
          loggedAt: mealTimestamp(mealType, mealDay),
          servings: 1,
          calories: it.calories,
          protein: it.protein,
          fat: it.fat,
          carb: it.carb,
          notes: 'AI estimate',
        });
      }
      router.replace('/(tabs)/fuel');
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // In recipe mode the panel must be the numbers that get saved, rounded the
  // same way, or the card you keep disagrees with the card you were shown.
  const recipe = items && mode === 'recipe' ? recipeTotals(items) : null;
  const totals = recipe ?? (items ? totalsOf(items) : null);
  const missing = recipe
    ? (['protein', 'carb', 'fat'] as const).filter((k) => recipe.partial[k])
    : [];

  return (
    <Screen section="AI log" back>
      <View style={s.seg}>
        {(['describe', 'photo', 'recipe'] as const).map((m) => (
          <Pressable
            key={m}
            style={[s.segBtn, mode === m && s.segOn]}
            onPress={() => setMode(m)}
          >
            <Text style={[s.segT, mode === m && s.segTOn]}>{m.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'describe' ? (
        <Card>
          <Text style={s.help}>
            Write what you ate. Quantities help: “3 eggs, 2 slices of toast, 50 g cottage cheese”.
          </Text>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="3 eggs, 2 toast, 50g cottage cheese"
            placeholderTextColor={colors.textDim}
            multiline
            editable={!busy}
          />
          <Pressable
            style={[s.primary, (busy || !text.trim()) && { opacity: 0.5 }]}
            onPress={() => void runDescribe()}
            disabled={busy || !text.trim()}
          >
            <Text style={s.primaryT}>{busy ? 'ESTIMATING…' : 'ESTIMATE'}</Text>
          </Pressable>
        </Card>
      ) : mode === 'recipe' ? null : !permission ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : !permission.granted ? (
        <Card>
          <Text style={s.help}>
            Reading a plate needs the camera. The photo goes to your own AI provider and nowhere
            else.
          </Text>
          <Pressable style={s.primary} onPress={() => void requestPermission()}>
            <Text style={s.primaryT}>ALLOW CAMERA</Text>
          </Pressable>
        </Card>
      ) : (
        <>
          <View style={s.cam}>
            <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
          </View>
          <Pressable
            style={[s.primary, busy && { opacity: 0.5 }]}
            onPress={() => void runPhoto()}
            disabled={busy}
          >
            <Text style={s.primaryT}>{busy ? 'READING…' : 'CAPTURE MEAL'}</Text>
          </Pressable>
        </>
      )}

      {mode === 'recipe' ? (
        <>
          <Card>
            <Text style={s.help}>
              A recipe from photos — the page, the back of the packet, whatever shows the
              ingredients — or from a link. Up to {MAX_RECIPE_PHOTOS} photos, read as one recipe.
            </Text>
            <Text style={s.fieldL}>SERVINGS THE RECIPE MAKES</Text>
            <TextInput
              style={s.input2}
              value={servings}
              onChangeText={setServings}
              keyboardType="number-pad"
              placeholderTextColor={colors.textDim}
            />
            <Text style={s.help}>
              Ingredients come back per serving, so one serving is what gets logged.
            </Text>
          </Card>

          <Label>FROM A LINK</Label>
          <Card>
            <TextInput
              style={s.input2}
              value={link}
              onChangeText={setLink}
              placeholder="https://…"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Pressable
              style={[s.primary, (busy || !link.trim()) && { opacity: 0.5 }]}
              onPress={() => void runRecipeLink()}
              disabled={busy || !link.trim()}
            >
              <Text style={s.primaryT}>{busy ? 'READING…' : 'READ RECIPE'}</Text>
            </Pressable>
          </Card>

          <Label>FROM PHOTOS</Label>
          {!permission?.granted ? (
            <Card>
              <Text style={s.help}>Photographing a recipe needs the camera.</Text>
              <Pressable style={s.primary} onPress={() => void requestPermission()}>
                <Text style={s.primaryT}>ALLOW CAMERA</Text>
              </Pressable>
            </Card>
          ) : (
            <>
              <View style={s.cam}>
                <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
              </View>
              <Text style={s.count}>
                {shots.length} of {MAX_RECIPE_PHOTOS} captured
              </Text>
              <View style={s.row}>
                <Pressable
                  style={[s.secondary, { flex: 1 }, (busy || shots.length >= MAX_RECIPE_PHOTOS) && { opacity: 0.5 }]}
                  onPress={() => void addShot()}
                  disabled={busy || shots.length >= MAX_RECIPE_PHOTOS}
                >
                  <Text style={s.secondaryT}>
                    {shots.length >= MAX_RECIPE_PHOTOS ? 'ALL 5 TAKEN' : 'ADD PHOTO'}
                  </Text>
                </Pressable>
                {shots.length > 0 ? (
                  <Pressable style={[s.secondary, { flex: 1 }]} onPress={() => setShots([])}>
                    <Text style={s.secondaryT}>CLEAR</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                style={[s.primary, (busy || shots.length === 0) && { opacity: 0.5 }]}
                onPress={() => void runRecipePhotos()}
                disabled={busy || shots.length === 0}
              >
                <Text style={s.primaryT}>
                  {busy ? 'READING…' : `READ ${shots.length} PHOTO${shots.length === 1 ? '' : 'S'}`}
                </Text>
              </Pressable>
            </>
          )}
        </>
      ) : null}

      {error ? (
        <Card>
          <Text style={s.err}>{error}</Text>
          <Pressable style={s.secondary} onPress={() => router.replace('/fuel/custom')}>
            <Text style={s.secondaryT}>Add by hand</Text>
          </Pressable>
        </Card>
      ) : null}

      {items ? (
        <>
          <Label>ESTIMATE — CHECK IT</Label>
          <Note>
            These are a model&apos;s estimates, not measurements. Portion sizes especially. Correct
            anything that looks wrong before saving.
          </Note>
          {note ? <Text style={s.modelNote}>{note}</Text> : null}

          {items.map((it, i) => (
            <Card key={`${it.name}-${i}`}>
              <Text style={s.itemName}>{it.name}</Text>
              <Text style={s.itemPortion}>{it.portion}</Text>
              <View style={s.row}>
                {(
                  [
                    ['kcal', 'calories'],
                    ['P', 'protein'],
                    ['C', 'carb'],
                    ['F', 'fat'],
                  ] as const
                ).map(([label, key]) => (
                  <View key={key} style={s.field}>
                    <Text style={s.fieldL}>{label}</Text>
                    <TextInput
                      style={s.fieldI}
                      keyboardType="decimal-pad"
                      value={it[key] == null ? '' : String(it[key])}
                      placeholder="–"
                      placeholderTextColor={colors.textDim}
                      onChangeText={(v) => {
                        const n = v.trim() === '' ? null : Number(v);
                        if (key === 'calories') {
                          edit(i, { calories: Number.isFinite(n) && n != null ? n : 0 });
                        } else {
                          edit(i, { [key]: Number.isFinite(n as number) ? n : null } as Partial<AiFoodItem>);
                        }
                      }}
                    />
                  </View>
                ))}
              </View>
              <Pressable
                onPress={() => setItems(items.filter((_, n) => n !== i))}
                style={s.remove}
              >
                <Text style={s.removeT}>Remove</Text>
              </Pressable>
            </Card>
          ))}

          {totals ? (
            <>
              <Text style={s.totals}>
                {mode === 'recipe' ? 'Per serving' : 'Total'} {totals.calories} kcal · P{' '}
                {totals.protein ?? '–'} · C {totals.carb ?? '–'} · F {totals.fat ?? '–'}
              </Text>
              {missing.length > 0 ? (
                <Text style={s.help}>
                  {missing.join(', ')} {missing.length === 1 ? 'is' : 'are'} at least this much —
                  an ingredient had no figure for it. Edit any row above to fill it in.
                </Text>
              ) : null}
            </>
          ) : null}

          {/*
            A recipe is saved as one food and logged by the serving, so it needs
            a name to find it under and a count of how many you actually ate.
            Without this the ingredients went into today as separate lines and
            nothing was kept.
          */}
          {mode === 'recipe' ? (
            <>
              <Label>SAVE IT AS</Label>
              <TextInput
                style={s.input}
                value={recipeName}
                onChangeText={setRecipeName}
                placeholder={fallbackRecipeName(items ?? [])}
                placeholderTextColor={colors.textMuted}
              />
              <Text style={s.help}>
                Kept in Custom → My recipes with the panel above, per serving. Logging it again
                needs no camera.
              </Text>

              <Label>HOW MANY SERVINGS DID YOU EAT?</Label>
              <TextInput
                style={s.input}
                value={ate}
                onChangeText={setAte}
                keyboardType="decimal-pad"
                placeholder="1"
                placeholderTextColor={colors.textMuted}
              />
            </>
          ) : null}

          <Label>MEAL</Label>
          <View style={s.meals}>
            <MealSlot
              mealType={mealType}
              onChangeMeal={setMealType}
              day={mealDay}
              onChangeDay={setMealDay}
            />
          </View>

          <Pressable
            style={[s.primary, busy && { opacity: 0.5 }]}
            onPress={() => void save()}
            disabled={busy}
          >
            <Text style={s.primaryT}>{busy ? 'SAVING…' : `LOG ${items.length} ITEM${items.length === 1 ? '' : 'S'}`}</Text>
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 60, alignItems: 'center' },
  seg: { flexDirection: 'row', gap: 4, marginBottom: 12 },
  segBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  segOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  segT: { fontFamily: fonts.pixel, fontSize: 8, color: colors.textMuted, letterSpacing: 1 },
  segTOn: { color: colors.onAccent },
  help: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 10, fontFamily: fonts.body },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.text,
    fontSize: 16,
    minHeight: 84,
    textAlignVertical: 'top',
    fontFamily: fonts.body,
  },
  cam: { height: 300, borderRadius: radius.lg, overflow: 'hidden', marginBottom: 10 },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  primaryT: { fontFamily: fonts.pixel, fontSize: 10, color: colors.onAccent, letterSpacing: 1 },
  secondary: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryT: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 13 },
  err: { color: colors.danger, fontSize: 13, lineHeight: 19, fontFamily: fonts.body },
  modelNote: { color: colors.textDim, fontSize: 12, lineHeight: 18, marginBottom: 10, fontFamily: fonts.body },
  itemName: { color: colors.text, fontSize: 15, fontFamily: fonts.bodySemi },
  itemPortion: { color: colors.textDim, fontSize: 12, marginTop: 3, marginBottom: 10, fontFamily: fonts.body },
  row: { flexDirection: 'row', gap: 6 },
  count: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginBottom: 8, fontFamily: fonts.body },
  input2: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginBottom: 10,
    fontFamily: fonts.body,
  },
  field: { flex: 1 },
  fieldL: { fontFamily: fonts.pixel, fontSize: 7, color: colors.textDim, letterSpacing: 1, marginBottom: 4 },
  fieldI: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 9,
    paddingHorizontal: 8,
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.body,
  },
  remove: { alignSelf: 'flex-start', marginTop: 10 },
  removeT: { color: colors.textDim, fontSize: 12, fontFamily: fonts.bodySemi },
  totals: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 6, fontFamily: fonts.bodySemi },
  meals: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  mealChip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  mealOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  mealT: { fontFamily: fonts.pixel, fontSize: 7, color: colors.textMuted, letterSpacing: 0.5 },
  mealTOn: { color: colors.onAccent },
});
