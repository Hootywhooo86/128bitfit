import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PixelSpinner } from '@/components/fx/PixelSpinner';
import { Card, Label, Note, Screen } from '@/components/ui';
import { getAiRuntimeConfig } from '@/db/ai-settings';
import { getDefaultRestSeconds } from '@/db/rest-settings';
import { getSetting, setSetting } from '@/db/settings-store';
import { createRoutine, startRoutineWorkout } from '@/db/workout-queries';
import { AiKeyStoreError, getGeminiKey, setGeminiKey } from '@/lib/ai-secure';
import { pickWorkout, type PickOutcome } from '@/lib/workout-pick-client';
import { COUNTS, EQUIPMENT, SPLITS, type EquipmentId, type SplitId } from '@/lib/workout-pick';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

const KEY_SPLIT = 'pick_split';
const KEY_COUNT = 'pick_count';
const KEY_EQUIPMENT = 'pick_equipment';

/**
 * Train → Pick today's workout.
 *
 * Choose a split, how many exercises and what equipment; Gemini picks the
 * session from the exercise library (falling back to the coach's provider,
 * then to the app's own rules). Review it, then Start: it is saved as a
 * routine and opened with last time's weights pre-filled, like any other.
 */
export default function PickWorkoutScreen() {
  const router = useRouter();
  const [split, setSplit] = useState<SplitId>('push');
  const [count, setCount] = useState<number>(6);
  const [equipment, setEquipment] = useState<EquipmentId>('gym');
  const [result, setResult] = useState<PickOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [geminiReady, setGeminiReady] = useState<boolean | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, c, e, cfg, gk] = await Promise.all([
        getSetting(KEY_SPLIT),
        getSetting(KEY_COUNT),
        getSetting(KEY_EQUIPMENT),
        getAiRuntimeConfig(),
        getGeminiKey(),
      ]);
      if (!alive) return;
      if (s && SPLITS.some((x) => x.id === s)) setSplit(s as SplitId);
      if (c && COUNTS.includes(Number(c) as (typeof COUNTS)[number])) setCount(Number(c));
      if (e && EQUIPMENT.some((x) => x.id === e)) setEquipment(e as EquipmentId);
      setGeminiReady(!!gk || (cfg.provider === 'gemini' && !!cfg.apiKey));
    })();
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, []);

  const choose = <T,>(key: string, set: (v: T) => void) => (v: T) => {
    set(v);
    setResult(null);
    void setSetting(key, String(v));
  };

  const pick = async () => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      setResult(await pickWorkout({ split, count, equipment }, ctrl.signal));
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setResult({ status: 'empty', message: `Could not pick a workout: ${e instanceof Error ? e.message : String(e)}` });
      }
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (result?.status !== 'ok' || starting) return;
    setStarting(true);
    try {
      const rest = await getDefaultRestSeconds();
      const label = SPLITS.find((x) => x.id === split)?.label ?? 'Workout';
      const routineId = await createRoutine({
        name: `${label} · ${new Date().toLocaleDateString()}`,
        exercises: result.picks.map((p) => ({
          exerciseId: p.exerciseId,
          targetSets: p.sets,
          targetReps: p.reps,
          restSeconds: rest,
          notes: null,
        })),
      });
      const sessionId = await startRoutineWorkout(routineId);
      router.replace({ pathname: '/train/active', params: { id: sessionId } });
    } catch (e) {
      Alert.alert('Could not start it', e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const saveKey = async () => {
    try {
      await setGeminiKey(keyDraft);
      setKeyDraft('');
      setGeminiReady(!!(await getGeminiKey()));
    } catch (e) {
      Alert.alert(
        'Key not saved',
        e instanceof AiKeyStoreError ? e.message : e instanceof Error ? e.message : String(e)
      );
    }
  };

  const splitMeta = SPLITS.find((x) => x.id === split);

  return (
    <Screen section="Pick a workout" back>
      <Label>SPLIT</Label>
      <View style={s.chips}>
        {SPLITS.map((x) => (
          <Chip key={x.id} on={split === x.id} label={x.label} onPress={() => choose(KEY_SPLIT, setSplit)(x.id)} />
        ))}
      </View>
      {splitMeta ? <Text style={s.hint}>{splitMeta.hint}</Text> : null}

      <Label>EXERCISES</Label>
      <View style={s.chips}>
        {COUNTS.map((n) => (
          <Chip key={n} on={count === n} label={String(n)} onPress={() => choose(KEY_COUNT, setCount)(n)} wide />
        ))}
      </View>

      <Label>EQUIPMENT</Label>
      <View style={s.chips}>
        {EQUIPMENT.map((x) => (
          <Chip key={x.id} on={equipment === x.id} label={x.label} onPress={() => choose(KEY_EQUIPMENT, setEquipment)(x.id)} />
        ))}
      </View>

      <Pressable style={[s.primary, busy && s.dim]} onPress={() => void pick()} accessibilityRole="button">
        {busy ? <PixelSpinner color={colors.onAccent} /> : <Text style={s.primaryT}>{result ? 'PICK AGAIN' : 'PICK MY WORKOUT'}</Text>}
      </Pressable>
      {busy ? <Text style={s.hint}>Asking {geminiReady ? 'Gemini' : 'your coach'}…</Text> : null}

      {result?.status === 'empty' ? <Note>{result.message}</Note> : null}

      {result?.status === 'ok' ? (
        <>
          <Label>
            {result.source.kind === 'ai' ? `PICKED BY ${result.source.provider.toUpperCase()}` : 'PICKED OFFLINE'}
          </Label>
          {result.why ? <Text style={s.why}>{result.why}</Text> : null}
          {result.picks.map((p, i) => (
            <Card key={p.exerciseId}>
              <Text style={s.name}>
                {i + 1}. {p.name}
              </Text>
              <Text style={s.meta}>
                {p.sets} × {p.reps}
              </Text>
            </Card>
          ))}
          {result.source.kind === 'offline' ? <Note>{result.source.reason}</Note> : null}
          {result.note ? <Note>{result.note}</Note> : null}
          <Pressable style={[s.primary, starting && s.dim]} onPress={() => void start()} accessibilityRole="button">
            <Text style={s.primaryT}>{starting ? 'STARTING…' : 'START WORKOUT'}</Text>
          </Pressable>
          <Note>Sets and reps are a starting point. Last time&apos;s weights fill in as usual.</Note>
        </>
      ) : null}

      {geminiReady === false ? (
        <Card>
          <Text style={s.keyHead}>Gemini picks first</Text>
          <Text style={s.keyText}>
            Add a free Google AI Studio key (aistudio.google.com) and Gemini picks your workouts. Your coach keeps
            whichever provider you chose. The key stays on this phone and goes straight to Google.
          </Text>
          <TextInput
            style={s.keyInput}
            value={keyDraft}
            onChangeText={setKeyDraft}
            placeholder="Paste Gemini key"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Pressable style={[s.secondary, !keyDraft.trim() && s.dim]} onPress={() => void saveKey()} disabled={!keyDraft.trim()}>
            <Text style={s.secondaryT}>SAVE GEMINI KEY</Text>
          </Pressable>
        </Card>
      ) : null}
    </Screen>
  );
}

function Chip({ on, label, onPress, wide }: { on: boolean; label: string; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable
      style={[s.chip, wide && s.chipWide, on && s.chipOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[s.chipT, on && s.chipTOn]}>{label}</Text>
    </Pressable>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipWide: { minWidth: 56, alignItems: 'center' },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipT: { fontFamily: fonts.pixel, fontSize: 9, letterSpacing: 1, color: colors.textMuted },
    chipTOn: { color: colors.onAccent },
    hint: { color: colors.textDim, fontSize: 12.5, fontFamily: fonts.body, marginBottom: spacing.md },
    primary: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    primaryT: { fontFamily: fonts.pixel, fontSize: 11, letterSpacing: 1.5, color: colors.onAccent },
    dim: { opacity: 0.5 },
    why: { color: colors.text, fontSize: 14, lineHeight: 20, fontFamily: fonts.body, marginBottom: spacing.sm },
    name: { color: colors.text, fontSize: 15, fontFamily: fonts.bodySemi },
    meta: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.body, marginTop: 4 },
    keyHead: { color: colors.text, fontSize: 15, fontFamily: fonts.bodySemi },
    keyText: { color: colors.textMuted, fontSize: 13, lineHeight: 19, fontFamily: fonts.body, marginTop: 6 },
    keyInput: {
      marginTop: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      color: colors.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: fonts.body,
    },
    secondary: {
      marginTop: spacing.sm,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: 11,
      alignItems: 'center',
    },
    secondaryT: { fontFamily: fonts.pixel, fontSize: 10, letterSpacing: 1, color: colors.accent },
  })
);
