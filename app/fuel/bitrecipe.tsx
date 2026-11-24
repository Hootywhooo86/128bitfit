import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card, Label, Note, Screen } from '@/components/ui';
import { PixelSpinner } from '@/components/fx/PixelSpinner';
import { insertCustomFood } from '@/db/barcode-queries';
import { getBitrecipeState, markBitrecipeAdded, matchIngredient } from '@/db/bitrecipe-queries';
import { estimateFood } from '@/lib/ai-food-client';
import {
  applyAiLines,
  buildRecipe,
  describeBuilt,
  lineSourceLabel,
  lineState,
  linesNeedingAi,
  toLine,
  type Basis,
  type Line,
} from '@/lib/bitrecipe/build';
import type { BitRecipe } from '@/lib/bitrecipe/source';
import { colors, fonts, radius, themedStyles } from '@/lib/theme';

export { ErrorScreen as ErrorBoundary } from '@/components/ErrorScreen';

/**
 * Adding one bitrecipe recipe to My recipes.
 *
 * Every ingredient is looked up in the bundled USDA foods first — offline,
 * free, measured. Only the lines that are not there, or that have no weight
 * ("2 chicken breasts"), go to the user's AI, and those are labelled as
 * estimates on this screen and in the saved food's description. Nothing is
 * saved until every counted line has figures and the user has seen them.
 */
export default function BitrecipeAddScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [recipe, setRecipe] = useState<BitRecipe | null | undefined>(undefined);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [name, setName] = useState('');
  const [servings, setServings] = useState('');
  const [basis, setBasis] = useState<Basis>('per_serving');
  const [weight, setWeight] = useState('');
  const [busy, setBusy] = useState<'ai' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const state = await getBitrecipeState();
      const r = state.recipes.find((x) => x.id === params.id) ?? null;
      if (!live) return;
      setRecipe(r);
      if (!r) return;
      setName(r.title);
      setServings(String(r.servings));
      const base = r.ingredients.map(toLine).filter((l): l is Line => l != null);
      const matched = await Promise.all(
        base.map(async (l) => (l.amount.negligible ? l : { ...l, match: await matchIngredient(l.item) }))
      );
      if (live) setLines(matched);
    })().catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [params.id]);

  const servingsNum = Number(servings.replace(',', '.'));
  const weightNum = weight.trim() ? Number(weight.replace(',', '.')) : null;
  const built = useMemo(
    () =>
      lines
        ? buildRecipe(
            lines,
            Number.isFinite(servingsNum) ? servingsNum : 0,
            basis,
            weightNum != null && Number.isFinite(weightNum) ? weightNum : null
          )
        : null,
    [lines, servingsNum, basis, weightNum]
  );

  const update = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev && prev.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  const runAi = async () => {
    if (!lines || busy) return;
    const asked = linesNeedingAi(lines);
    if (asked.length === 0) return;
    setBusy('ai');
    setError(null);
    setNote(null);
    try {
      const out = await estimateFood({
        kind: 'recipe-lines',
        lines: asked.map((i) => lines[i].text),
        servings: servingsNum > 0 ? servingsNum : recipe?.servings ?? 1,
      });
      if (out.status !== 'ok') {
        setError(out.message);
        return;
      }
      const next = applyAiLines(
        lines,
        asked,
        out.items.map((it) => ({
          line: it.line ?? null,
          grams: it.grams ?? null,
          calories: it.calories,
          protein: it.protein,
          fat: it.fat,
          carb: it.carb,
        }))
      );
      setLines(next);
      const still = linesNeedingAi(next).length;
      setNote(
        still > 0
          ? `The AI answered for ${asked.length - still} of ${asked.length}. Try again, or leave the rest out.`
          : out.note
      );
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!recipe || !lines || !built?.ready || !built.panel || busy) return;
    setBusy('save');
    try {
      const n = servingsNum;
      const p = built.panel;
      const per100 = basis === 'per_100g';
      const totalWeight = weightNum ?? built.ingredientGrams ?? 0;
      const food = await insertCustomFood({
        name: name.trim() || recipe.title,
        source: 'recipe',
        description: describeBuilt(lines, n),
        // Per 100 g still logs by the serving with one tap: a serving is the
        // finished weight split evenly, and the detail screen takes grams.
        servingSize: per100 ? Math.max(1, Math.round(totalWeight / n)) : 1,
        servingUnit: per100 ? 'g' : 'serving',
        nutritionBasis: per100 ? 'per_100g' : 'per_serving',
        calories: p.calories,
        protein: p.protein,
        fat: p.fat,
        carb: p.carb,
      });
      await markBitrecipeAdded(recipe.id, food.id, recipe.modified);
      router.back();
    } catch (e) {
      Alert.alert('Could not add it', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (recipe === undefined || (recipe && !lines && !error)) {
    return (
      <Screen section="bitrecipe" back>
        <View style={s.center}>
          <PixelSpinner color={colors.accent} />
        </View>
      </Screen>
    );
  }

  if (!recipe) {
    return (
      <Screen section="bitrecipe" back>
        <Note>This recipe is no longer in your bitrecipe cookbook. Pull down on Custom to refresh the list.</Note>
      </Screen>
    );
  }

  const list = lines ?? [];
  const counted = list.filter((l) => !l.excluded && lineState(l) !== 'negligible');
  const fromDb = counted.filter((l) => lineState(l) === 'database').length;
  const waiting = built?.waiting ?? 0;

  return (
    <Screen section="bitrecipe" back>
      <Text style={s.title}>{recipe.title}</Text>
      {list.length === 0 ? (
        <Note>bitrecipe has no ingredients saved for this recipe, so there is nothing to count. Add them in bitrecipe, then come back.</Note>
      ) : (
        <Text style={s.help}>
          {fromDb} of {counted.length} ingredient{counted.length === 1 ? '' : 's'} found in the food database
          {waiting > 0 ? ` — ${waiting} need${waiting === 1 ? 's' : ''} an AI estimate.` : '.'}
        </Text>
      )}

      <Label>INGREDIENTS</Label>
      {list.map((l, i) => {
        const st = lineState(l);
        const estimated = st === 'ai' || st === 'database-ai-weight';
        return (
          <Card key={i}>
            <Text style={[s.line, l.excluded && s.struck]}>{l.text}</Text>
            <Text style={[s.src, st === 'database' && s.srcDb, st === 'needs-ai' && s.srcWait]}>
              {lineSourceLabel(l)}
              {estimated ? ' · estimate' : ''}
            </Text>
            <View style={s.actions}>
              {l.match && !l.excluded ? (
                <Pressable onPress={() => update(i, { skipMatch: !l.skipMatch })} hitSlop={6}>
                  <Text style={s.act}>{l.skipMatch ? 'Use the database food' : 'Wrong food? Use AI instead'}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => update(i, { excluded: !l.excluded })} hitSlop={6}>
                <Text style={s.act}>{l.excluded ? 'Put back' : 'Leave out'}</Text>
              </Pressable>
            </View>
          </Card>
        );
      })}

      {waiting > 0 ? (
        <Pressable style={[s.secondary, busy && { opacity: 0.5 }]} onPress={() => void runAi()} disabled={!!busy}>
          <Text style={s.secondaryT}>
            {busy === 'ai' ? 'Estimating…' : `Estimate the ${waiting} missing with AI`}
          </Text>
        </Pressable>
      ) : null}
      {error ? <Text style={s.err}>{error}</Text> : null}
      {note ? <Text style={s.help}>{note}</Text> : null}

      <Label>SAVE IT AS</Label>
      <TextInput style={s.input} value={name} onChangeText={setName} placeholderTextColor={colors.textMuted} />

      <Label>MAKES HOW MANY SERVINGS?</Label>
      <TextInput
        style={s.input}
        value={servings}
        onChangeText={setServings}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.textMuted}
      />

      <Label>NUTRITION</Label>
      <View style={s.seg}>
        {(
          [
            ['per_serving', 'PER SERVING'],
            ['per_100g', 'PER 100 G'],
          ] as const
        ).map(([b, label]) => (
          <Pressable key={b} style={[s.segBtn, basis === b && s.segOn]} onPress={() => setBasis(b)}>
            <Text style={[s.segT, basis === b && s.segTOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {basis === 'per_100g' ? (
        <>
          <TextInput
            style={s.input}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            placeholder={
              built?.ingredientGrams != null ? `${built.ingredientGrams} g (ingredients, raw)` : 'Finished weight, g'
            }
            placeholderTextColor={colors.textMuted}
          />
          <Text style={s.help}>
            Weigh the finished dish for the truest figure — cooking loses water, so the raw ingredients
            weigh more than what ends up in the pot. Then log it by the gram.
          </Text>
        </>
      ) : null}

      {built?.panel ? (
        <>
          <Text style={s.totals}>
            {basis === 'per_serving' ? 'Per serving' : 'Per 100 g'} {built.panel.calories} kcal · P{' '}
            {built.panel.protein ?? '–'} · C {built.panel.carb ?? '–'} · F {built.panel.fat ?? '–'}
          </Text>
          {(['protein', 'carb', 'fat'] as const).some((k) => built.panel!.partial[k]) ? (
            <Text style={s.help}>
              {(['protein', 'carb', 'fat'] as const).filter((k) => built.panel!.partial[k]).join(', ')} is at
              least this much — an ingredient had no figure for it.
            </Text>
          ) : null}
          <Text style={s.help}>
            {built.estimated
              ? 'Includes AI estimates, marked above. The rest is USDA data.'
              : 'Every figure is from the USDA food database.'}
          </Text>
        </>
      ) : built?.panelProblem && list.length > 0 ? (
        <Text style={s.help}>{built.panelProblem}</Text>
      ) : null}

      <Pressable
        style={[s.primary, (!built?.ready || !!busy) && { opacity: 0.5 }]}
        onPress={() => void save()}
        disabled={!built?.ready || !!busy}
      >
        <Text style={s.primaryT}>{busy === 'save' ? 'SAVING…' : 'ADD TO MY RECIPES'}</Text>
      </Pressable>
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    center: { paddingVertical: 80, alignItems: 'center' },
    title: { color: colors.text, fontSize: 20, fontFamily: fonts.bodySemi, marginBottom: 6 },
    help: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 10, fontFamily: fonts.body },
    err: { color: colors.danger, fontSize: 13, lineHeight: 19, marginBottom: 10, fontFamily: fonts.body },
    line: { color: colors.text, fontSize: 14.5, fontFamily: fonts.bodySemi },
    struck: { color: colors.textDim, textDecorationLine: 'line-through' },
    src: { color: colors.textDim, fontSize: 12, marginTop: 4, fontFamily: fonts.body },
    srcDb: { color: colors.textMuted },
    srcWait: { color: colors.text },
    actions: { flexDirection: 'row', gap: 16, marginTop: 8 },
    act: { color: colors.accent, fontSize: 12, fontFamily: fonts.bodySemi },
    input: {
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
    seg: { flexDirection: 'row', gap: 4, marginBottom: 10 },
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
    totals: { color: colors.text, fontSize: 14, textAlign: 'center', marginVertical: 8, fontFamily: fonts.bodySemi },
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
      marginTop: 4,
      marginBottom: 10,
    },
    secondaryT: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 13 },
  })
);
