import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DateField } from '@/components/DateField';
import { useDb } from '@/db/DatabaseProvider';
import { previewCalorieTarget, updateAppSettings } from '@/db/settings-queries';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addWeightEntry } from '@/db/weight-queries';
import {
  ageFromBirthday,
  suggestCalorieTarget,
  suggestProteinTarget,
  suggestWaterTargetMl,
  toMetric,
  type SexOption,
} from '@/lib/body';
import { explainFloor } from '@/lib/calorie-floor';
import { colors, spacing } from '@/lib/theme';

const STEPS = ['Basics', 'Goals', 'Done'] as const;
type Step = (typeof STEPS)[number];

const SEX_OPTIONS: { id: SexOption; label: string }[] = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'other', label: 'Other' },
  { id: 'prefer_not', label: 'Prefer not' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready } = useDb();
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [units, setUnits] = useState<'lb' | 'kg'>('lb');
  const [sex, setSex] = useState<SexOption | null>(null);
  const [birthday, setBirthday] = useState(''); // YYYY-MM-DD
  const [heightCm, setHeightCm] = useState('');
  const [weight, setWeight] = useState('');
  const [calorieTarget, setCalorieTarget] = useState('2200');
  const [proteinTarget, setProteinTarget] = useState('150');
  const [waterTarget, setWaterTarget] = useState('2500');
  const [goalsSeeded, setGoalsSeeded] = useState(false);

  const weightNum = Number(weight);
  const heightNum = Number(heightCm);
  const metric = useMemo(
    () =>
      toMetric({
        heightCm: Number.isFinite(heightNum) && heightNum > 0 ? heightNum : null,
        weightValue: Number.isFinite(weightNum) && weightNum > 0 ? weightNum : null,
        units,
      }),
    [heightNum, weightNum, units]
  );

  const applySuggestedGoals = () => {
    const age = ageFromBirthday(birthday.trim() || null);
    const cal = suggestCalorieTarget({
      sex,
      age,
      weightKg: metric.kg,
      heightCm: metric.cm,
    });
    const pro = suggestProteinTarget(metric.kg);
    const water = suggestWaterTargetMl(metric.kg);
    setCalorieTarget(String(cal));
    setProteinTarget(String(pro));
    setWaterTarget(String(water));
    setGoalsSeeded(true);
  };

  const seedGoalsIfNeeded = () => {
    if (goalsSeeded) return;
    applySuggestedGoals();
  };

  const goNext = () => {
    // Goals are suggested from the basics, so seed them on the way in.
    if (step === 'Basics') seedGoalsIfNeeded();
    if (stepIdx < STEPS.length - 1) setStepIdx((i) => i + 1);
  };

  const goBack = () => {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  };

  const finish = async () => {
    if (saving || !ready) return;
    setSaving(true);
    try {
      // Log the weigh-in first: the calorie floor reads the latest weight to
      // compute BMR, so saving goals before this would floor against a profile
      // with no weight in it.
      if (Number.isFinite(weightNum) && weightNum > 0) {
        await addWeightEntry({ value: weightNum, unit: units, note: 'Onboarding' });
      }

      await updateAppSettings({
        displayName: displayName.trim() || 'Athlete',
        units,
        sex,
        birthday: birthday.trim() || null,
        heightCm: Number.isFinite(heightNum) && heightNum > 0 ? heightNum : null,
        calorieTarget: Number(calorieTarget) || 2200,
        proteinTarget: Number(proteinTarget) || 150,
        waterTargetMl: Number(waterTarget) || 2500,
        onboardingComplete: true,
      });
      // Weight is logged above, so the floor now sees a full profile. Say so
      // rather than quietly storing a different number than was typed.
      const floorCheck = await previewCalorieTarget(Number(calorieTarget) || 2200);
      if (floorCheck.clamped) {
        Alert.alert('Calorie target adjusted', explainFloor(floorCheck), [
          { text: 'OK', onPress: () => router.replace('/(tabs)') },
        ]);
        return;
      }
      router.replace('/(tabs)');
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        // Onboarding has no top bar of its own and the stack header is off, so
        // nothing else reserves the status bar. Without this the brand line
        // renders behind the clock — the first thing a new user ever sees.
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>128BIT FIT</Text>
        <Text style={styles.title}>Welcome</Text>
        <View style={styles.stepRow}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.stepDot, i <= stepIdx && styles.stepDotOn]}>
              <Text style={[styles.stepDotText, i <= stepIdx && styles.stepDotTextOn]}>
                {i + 1}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.stepLabel}>{step}</Text>

        {step === 'Basics' && (
          <View>
            <Text style={styles.label}>Display name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Athlete"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Units</Text>
            <View style={styles.row}>
              {(['lb', 'kg'] as const).map((u) => (
                <Pressable
                  key={u}
                  style={[styles.chip, units === u && styles.chipOn]}
                  onPress={() => setUnits(u)}
                >
                  <Text style={[styles.chipText, units === u && styles.chipTextOn]}>{u}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Sex (optional)</Text>
            <View style={styles.wrapRow}>
              {SEX_OPTIONS.map((o) => (
                <Pressable
                  key={o.id}
                  style={[styles.chip, sex === o.id && styles.chipOn]}
                  onPress={() => setSex(o.id)}
                >
                  <Text style={[styles.chipText, sex === o.id && styles.chipTextOn]}>
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Birthday (optional)</Text>
            <DateField value={birthday || null} onChange={(iso) => setBirthday(iso ?? '')} />

            <Text style={styles.label}>Height (cm, optional)</Text>
            <TextInput
              style={styles.input}
              value={heightCm}
              onChangeText={setHeightCm}
              keyboardType="numeric"
              placeholder="170"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.label}>Weight ({units}, optional)</Text>
            <TextInput
              style={styles.input}
              value={weight}
              onChangeText={setWeight}
              keyboardType="numeric"
              placeholder={units === 'lb' ? '160' : '72'}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.hint}>
              Height, weight, age & sex feed Mifflin–St Jeor calorie defaults on the next goals
              step.
            </Text>
          </View>
        )}

        {step === 'Goals' && (
          <View>
            <Text style={styles.hint}>
              Suggested from your basics when available. Edit freely — you can change these later
              in Settings.
            </Text>
            <Text style={styles.label}>Calorie target (kcal)</Text>
            <TextInput
              style={styles.input}
              value={calorieTarget}
              onChangeText={setCalorieTarget}
              keyboardType="numeric"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.label}>Protein target (g)</Text>
            <TextInput
              style={styles.input}
              value={proteinTarget}
              onChangeText={setProteinTarget}
              keyboardType="numeric"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.label}>Water target (ml)</Text>
            <TextInput
              style={styles.input}
              value={waterTarget}
              onChangeText={setWaterTarget}
              keyboardType="numeric"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable
              style={styles.secondary}
              onPress={applySuggestedGoals}
            >
              <Text style={styles.secondaryText}>Recalculate suggestions</Text>
            </Pressable>
          </View>
        )}

        {step === 'Done' && (
          <View style={styles.doneCard}>
            <Text style={styles.doneTitle}>You&apos;re set, {displayName.trim() || 'Athlete'}!</Text>
            <Text style={styles.hint}>
              {calorieTarget} kcal · {proteinTarget} g protein · {waterTarget} ml water
            </Text>
            <Text style={styles.hint}>
              Nothing is filled in yet — that is deliberate. Log a session and the muscle map
              starts colouring in.
            </Text>
          </View>
        )}

        <View style={styles.navRow}>
          {stepIdx > 0 ? (
            <Pressable style={styles.backBtn} onPress={goBack}>
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {step === 'Done' ? (
            <Pressable
              style={[styles.nextBtn, saving && { opacity: 0.6 }]}
              onPress={() => void finish()}
            >
              <Text style={styles.nextText}>{saving ? 'Saving…' : 'Start training'}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.nextBtn} onPress={goNext}>
              <Text style={styles.nextText}>Continue</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: spacing.md,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 4 },
  stepRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stepDotOn: { borderColor: colors.accent, backgroundColor: colors.track },
  stepDotText: { color: colors.textMuted, fontWeight: '800', fontSize: 12 },
  stepDotTextOn: { color: colors.accent },
  stepLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: spacing.sm,
  },
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
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.track },
  chipText: { color: colors.textMuted, fontWeight: '700' },
  chipTextOn: { color: colors.accent },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  secondary: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryText: { color: colors.accent, fontWeight: '700' },
  doneCard: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  doneTitle: { color: colors.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  navRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  backBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  backText: { color: colors.text, fontWeight: '700' },
  nextBtn: {
    flex: 1.4,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  nextText: { color: colors.chipActiveText, fontWeight: '900', fontSize: 16 },
  muted: { color: colors.textMuted },
});
