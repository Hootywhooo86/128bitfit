import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { EnergyCard } from '@/components/EnergyCard';
import { HeartRateCard } from '@/components/HeartRateCard';
import { Card, CardHead, Note, Screen } from '@/components/ui';
import { saveManualCardio } from '@/db/cardio-queries';
import { dismissDetected, labelDetected } from '@/db/detected-queries';
import { sportById } from '@/lib/cardio';
import { LABEL_CHOICES, sourceName, sportForType, workoutTypeName } from '@/lib/detected-workouts';
import { useCardioEnergy } from '@/lib/health/use-cardio-energy';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

/**
 * One workout a watch or another app recorded: when, how long, heart rate
 * across it, and calories — measured when the recorder gave a figure, an
 * estimate from heart rate otherwise, and said which. From here it can be
 * added to your cardio, or hidden if it was not a workout at all.
 */
export default function DetectedWorkoutScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{
    id: string;
    type: string;
    title?: string;
    start: string;
    end: string;
    source?: string;
    dist?: string;
    unnamed?: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState(() => Number(p.type) || 0);
  const [title, setTitle] = useState<string | null>(p.title || null);
  // Open straight away when the watch didn't say what it was.
  const [picking, setPicking] = useState(p.unnamed === '1');
  const startMs = Number(p.start);
  const endMs = Number(p.end);
  const durationS = Math.max(0, Math.round((endMs - startMs) / 1000));
  const distanceM = p.dist ? Number(p.dist) : null;
  const sportId = sportForType(type);
  const source = sourceName(p.source || null);

  // The same calorie ladder as a cardio session: measured if the recorder
  // gave a figure, else from heart rate. For a type with no sport of its own
  // (yoga, HIIT…) the speed-based fallbacks would describe the wrong
  // activity, so without a measurement or heart rate it says it doesn't know.
  const energy = useCardioEnergy({
    sport: sportById(sportId ?? 'walk'),
    startedAt: startMs,
    endedAt: endMs,
    manual: false,
    movingS: durationS,
    distanceM,
    climbM: null,
  });
  const shownEnergy =
    !sportId && energy?.status === 'estimated' && !/bpm/.test(energy.basis)
      ? { status: 'unknown' as const, missing: ['heart rate or a calorie reading from your watch'] }
      : energy;

  const addToCardio = async () => {
    if (!sportId || busy) return;
    setBusy(true);
    try {
      const id = await saveManualCardio({
        sport: sportId,
        startedAt: startMs,
        durationS,
        distanceM,
        notes: `Recorded by ${source}`,
      });
      router.replace({ pathname: '/cardio/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Could not add it', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = async (next: number) => {
    try {
      await labelDetected(p.id, next);
      setType(next);
      setTitle(null);
      setPicking(false);
    } catch (e) {
      Alert.alert('Could not save that', e instanceof Error ? e.message : String(e));
    }
  };

  const hide = async () => {
    try {
      await dismissDetected(p.id);
      router.back();
    } catch (e) {
      Alert.alert('Could not hide it', e instanceof Error ? e.message : String(e));
    }
  };

  const start = new Date(startMs);
  return (
    <Screen section="Detected workout" back>
      <Text style={s.title}>{workoutTypeName(type, title)}</Text>
      <Text style={s.when}>
        {start.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })} ·{' '}
        {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {Math.round(durationS / 60)} min
        {distanceM != null && distanceM > 0 ? ` · ${(distanceM / 1000).toFixed(2)} km` : ''}
      </Text>
      <Text style={s.when}>Recorded by {source} through Health Connect.</Text>

      {picking ? (
        <Card>
          <CardHead title="WHAT WAS THIS?" />
          <Text style={s.note}>
            {p.unnamed === '1'
              ? `${source} recorded a workout but not what kind. Pick one so it's named and counted right.`
              : 'Pick what it really was.'}
          </Text>
          <View style={s.chips}>
            {LABEL_CHOICES.map((t) => (
              <Pressable key={t} style={[s.chip, t === type && s.chipOn]} onPress={() => void pick(t)}>
                <Text style={[s.chipT, t === type && s.chipTOn]}>{workoutTypeName(t)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.note}>
            Saved in 128BIT FIT. Health Connect only lets the app that recorded a workout change it, so{' '}
            {source} keeps its own name for it.
          </Text>
        </Card>
      ) : (
        <Pressable onPress={() => setPicking(true)} hitSlop={8}>
          <Text style={s.link}>Wrong type? Change it</Text>
        </Pressable>
      )}

      <HeartRateCard startedAt={startMs} endedAt={endMs} />
      <EnergyCard energy={shownEnergy} />

      {sportId ? (
        <Pressable style={[s.primary, busy && { opacity: 0.6 }]} onPress={() => void addToCardio()} disabled={busy}>
          <Text style={s.primaryT}>Add to my cardio</Text>
        </Pressable>
      ) : (
        <Card>
          <CardHead title="IN YOUR LOG" />
          <Text style={s.note}>
            This kind of workout can&apos;t be added to your cardio yet. It stays here with its heart
            rate and calories.
          </Text>
        </Card>
      )}
      <Pressable style={s.secondary} onPress={() => void hide()}>
        <Text style={s.secondaryT}>Not a workout — hide it</Text>
      </Pressable>
      <Note>Workouts you logged in 128BIT FIT are left out of this list, so nothing is counted twice.</Note>
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    title: { color: colors.text, fontSize: 24, fontFamily: fonts.bodyBold },
    when: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: spacing.sm, fontFamily: fonts.body },
    note: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, fontFamily: fonts.body },
    primary: {
      marginTop: spacing.md,
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryT: { color: colors.chipActiveText, fontFamily: fonts.bodyBold, fontSize: 15 },
    secondary: {
      marginTop: spacing.sm,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderBright,
      paddingVertical: 14,
      alignItems: 'center',
    },
    secondaryT: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 15 },
    link: { color: colors.accent, fontFamily: fonts.bodySemi, fontSize: 13, marginBottom: spacing.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: spacing.sm },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipOn: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
    chipT: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.bodySemi },
    chipTOn: { color: colors.text },
  })
);
