import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CalorieProgress } from '@/components/CalorieProgress';
import { PixelAvatar } from '@/components/PixelAvatar';
import { StepsCard } from '@/components/StepsCard';
import { WaterProgress } from '@/components/WaterProgress';
import { WeekStrip } from '@/components/WeekStrip';
import { useDb } from '@/db/DatabaseProvider';
import { getDayFuelSummary } from '@/db/food-queries';
import { getAppSettings } from '@/db/settings-queries';
import type { AvatarConfig } from '@/lib/avatar';
import { formatWeight, getLatestWeightEntry } from '@/db/weight-queries';
import {
  getLastCompletedWorkoutSummary,
  getTrainingWeekStrip,
  type TrainingDayDot,
  type WorkoutSummary,
} from '@/db/workout-queries';
import type { WeightEntry } from '@/db/schema';
import { colors, spacing } from '@/lib/theme';

function formatWorkoutWhen(summary: WorkoutSummary): string {
  const d = summary.session.startedAt ? new Date(summary.session.startedAt) : null;
  if (!d) return 'Unknown date';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { ready } = useDb();
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('Athlete');
  const [calories, setCalories] = useState(0);
  const [calorieTarget, setCalorieTarget] = useState(2200);
  const [waterMl, setWaterMl] = useState(0);
  const [waterTarget, setWaterTarget] = useState(2500);
  const [lastWorkout, setLastWorkout] = useState<WorkoutSummary | null>(null);
  const [latestWeight, setLatestWeight] = useState<WeightEntry | null>(null);
  const [week, setWeek] = useState<TrainingDayDot[]>([]);
  const [avatar, setAvatar] = useState<AvatarConfig | null>(null);
  const [showAvatar, setShowAvatar] = useState(true);

  const refresh = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [settings, fuel, workout, weight, strip] = await Promise.all([
        getAppSettings(),
        getDayFuelSummary(new Date()),
        getLastCompletedWorkoutSummary(),
        getLatestWeightEntry(),
        getTrainingWeekStrip(new Date()),
      ]);
      setDisplayName(settings.displayName);
      setAvatar(settings.avatar);
      setShowAvatar(settings.showAvatarOnHome);
      setCalories(fuel.totals.calories);
      setCalorieTarget(fuel.goals.calorieTarget);
      setWaterMl(fuel.waterMl);
      setWaterTarget(fuel.goals.waterTargetMl);
      setLastWorkout(workout);
      setLatestWeight(weight);
      setWeek(strip);
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  if (!ready || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={styles.headerRow}>
        {showAvatar && avatar ? (
          <Pressable onPress={() => router.push('/settings/character')} style={styles.avatarWrap}>
            <PixelAvatar config={avatar} pose="idle" size={64} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>128BIT FIT</Text>
          <Text style={styles.sub}>Hey, {displayName}</Text>
        </View>
        <Pressable style={styles.gear} onPress={() => router.push('/settings')}>
          <Text style={styles.gearText}>Settings</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>Today</Text>
      <CalorieProgress consumed={calories} target={calorieTarget} compact />
      <View style={{ height: spacing.sm }} />
      <WaterProgress ml={waterMl} targetMl={waterTarget} />
      <View style={{ height: spacing.sm }} />
      <StepsCard />

      <Text style={styles.section}>Last workout</Text>
      {lastWorkout ? (
        <Pressable style={styles.card} onPress={() => router.push('/(tabs)/train')}>
          <Text style={styles.cardTitle}>{formatWorkoutWhen(lastWorkout)}</Text>
          <Text style={styles.stat}>
            {formatDuration(lastWorkout.durationMs)} · {lastWorkout.completedSets} sets ·{' '}
            {lastWorkout.exerciseCount} exercises
          </Text>
          <Text style={styles.hint} numberOfLines={2}>
            {lastWorkout.exercises.map((e) => e.name).join(' · ') || 'Workout complete'}
          </Text>
        </Pressable>
      ) : (
        <Pressable style={styles.cta} onPress={() => router.push('/(tabs)/train')}>
          <Text style={styles.ctaText}>No workouts yet — open Train →</Text>
        </Pressable>
      )}

      {week.length > 0 ? (
        <>
          <Text style={styles.section}>This week</Text>
          <WeekStrip days={week} />
        </>
      ) : null}

      <Text style={styles.section}>Weight</Text>
      <Pressable style={styles.card} onPress={() => router.push('/home/weight')}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Body weight</Text>
          <Text style={styles.linkish}>Log →</Text>
        </View>
        {latestWeight ? (
          <>
            <Text style={styles.stat}>{formatWeight(latestWeight)}</Text>
            <Text style={styles.hint}>
              Logged{' '}
              {new Date(latestWeight.loggedAt!).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
              {latestWeight.note ? ` · ${latestWeight.note}` : ''}
            </Text>
          </>
        ) : (
          <Text style={styles.hint}>No entries yet — tap to add your first weigh-in.</Text>
        )}
      </Pressable>

      <Pressable style={styles.link} onPress={() => router.push('/exercise')}>
        <Text style={styles.linkText}>Browse Exercise Library →</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  brand: {
    color: colors.accent,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
  },
  sub: { color: colors.textMuted, marginTop: 4 },
  gear: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  gearText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  avatarWrap: {
    marginRight: spacing.xs,
    padding: 4,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  section: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  cardTitle: { color: colors.text, fontWeight: '700' },
  stat: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  hint: { color: colors.textMuted, marginTop: 4, fontSize: 13, lineHeight: 18 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linkish: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  cta: {
    backgroundColor: colors.accentDim,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  ctaText: { color: colors.accent, fontWeight: '700', textAlign: 'center' },
  link: {
    marginTop: spacing.lg,
    backgroundColor: colors.accentDim,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  linkText: { color: colors.accent, fontWeight: '700', textAlign: 'center' },
});
