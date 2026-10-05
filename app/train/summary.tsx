import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  getInProgressSession,
  getWorkoutSummary,
  personalRecordsIn,
  repeatWorkout,
  type SessionPr,
  type WorkoutSummary,
} from '@/db/workout-queries';
import { PixelTrophy } from '@/components/PixelTrophy';
import { HeartRateCard } from '@/components/HeartRateCard';
import { offerBreakdown } from '@/lib/ai-breakdown';
import { colors, spacing, themedStyles } from '@/lib/theme';
import { GameNews } from '@/components/game/GameNews';

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function WorkoutSummaryScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const router = useRouter();
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [prs, setPrs] = useState<SessionPr[]>([]);
  const [loading, setLoading] = useState(true);

  // The session's own window, so heart rate is the workout's and not the day's.
  const window = React.useMemo(() => {
    const started = summary?.session.startedAt;
    const ended = summary?.session.endedAt;
    if (!started || !ended) return null;
    return { startedAt: new Date(started).getTime(), endedAt: new Date(ended).getTime() };
  }, [summary?.session.startedAt, summary?.session.endedAt]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const sid = decodeURIComponent(id);
      const s = await getWorkoutSummary(sid);
      setSummary(s);
      setLoading(false);
      // Straight after Finish, not when opened again from history.
      if (s && fresh === '1') void offerBreakdown(router);
      // After the summary renders: a record is worth waiting a beat for, and
      // the session is already saved either way.
      setPrs(await personalRecordsIn(sid).catch(() => []));
    })();
  }, [id, fresh, router]);

  const repeat = async () => {
    if (!summary) return;
    try {
      const running = await getInProgressSession();
      if (running) {
        Alert.alert('A workout is already running', 'Finish or discard it first, then repeat this one.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open it', onPress: () => router.replace({ pathname: '/train/active', params: { id: running.id } }) },
        ]);
        return;
      }
      const newId = await repeatWorkout(summary.session.id);
      router.replace({ pathname: '/train/active', params: { id: newId } });
    } catch (e) {
      Alert.alert('Could not start', e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Summary not found.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Workout complete', headerBackVisible: false }} />
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
        <Text style={styles.hero}>Nice work</Text>
        <Text style={styles.muted}>Session saved offline.</Text>

        <View style={styles.stats}>
          <Stat label="Duration" value={formatDuration(summary.durationMs)} />
          <Stat label="Exercises" value={String(summary.exerciseCount)} />
          <Stat
            label="Sets"
            value={`${summary.completedSets}/${summary.totalSets}`}
          />
        </View>

        <PrCard prs={prs} />

        {window ? <HeartRateCard startedAt={window.startedAt} endedAt={window.endedAt} /> : null}

        <Text style={styles.section}>Exercises</Text>
        {summary.exercises.map((ex, i) => (
          <View key={`${ex.name}-${i}`} style={styles.row}>
            <Text style={styles.rowTitle}>{ex.name}</Text>
            <Text style={styles.rowMeta}>{ex.setCount} sets</Text>
          </View>
        ))}

        <Pressable style={styles.btn} onPress={() => router.replace('/(tabs)/train')}>
          <Text style={styles.btnText}>Back to Train</Text>
        </Pressable>
        {summary.session.status === 'completed' && summary.exercises.length > 0 ? (
          <Pressable style={styles.btnGhost} onPress={() => void repeat()}>
            <Text style={styles.btnGhostText}>Repeat this workout</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <GameNews />
    </>
  );
}

/**
 * The records set in this session.
 *
 * Nothing at all when there were none — a card saying "no personal records
 * today" on an ordinary session would turn every workout into a small failure,
 * and most workouts are not records. That is the point of one.
 */
function PrCard({ prs }: { prs: SessionPr[] }) {
  if (prs.length === 0) return null;

  return (
    <View style={styles.pr}>
      <View style={styles.prTop}>
        <PixelTrophy size={32} />
        <Text style={styles.prHead}>
          {prs.length} PERSONAL RECORD{prs.length === 1 ? '' : 'S'}
        </Text>
      </View>
      {prs.map((pr) => (
        <View key={pr.exerciseId} style={styles.prRow}>
          <Text style={styles.prName}>{pr.exerciseName}</Text>
          <Text style={styles.prNote}>{pr.note}</Text>
        </View>
      ))}
      {prs.some((p) => p.kinds.includes('estimate') && !p.kinds.includes('weight')) ? (
        <Text style={styles.prFoot}>
          An estimated one-rep max is a formula applied to a set you did do, not a lift you have
          made. It is here because it is the fairest way to compare sets at different reps.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Energy burned, with its provenance attached.
 *
 * A measured figure and an estimate are never rendered the same way: the
 * estimate carries the word "estimate" and the reason it might be wrong. That
 * distinction is the whole reason this card exists rather than a fourth number
 * in the stat row, where it would read as measured like the other three.
 */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  hero: { color: colors.accent, fontSize: 28, fontWeight: '800' },
  muted: { color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg },
  stats: { flexDirection: 'row', gap: 8, marginBottom: spacing.lg },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { color: colors.text, fontWeight: '800', fontSize: 18 },
  pr: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderBright,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  prTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  prHead: { color: colors.text, fontSize: 12, letterSpacing: 1, fontWeight: '800' },
  prRow: { gap: 2 },
  prName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  prNote: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18 },
  prFoot: { color: colors.textDim, fontSize: 11.5, lineHeight: 16 },
  statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTitle: { color: colors.text, fontWeight: '700', flex: 1, marginRight: 8 },
  rowMeta: { color: colors.textMuted, fontSize: 12 },
  btn: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
  },
  btnText: { color: colors.chipActiveText, fontWeight: '800', textAlign: 'center', fontSize: 16 },
  btnGhost: {
    marginTop: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderBright,
    paddingVertical: 14,
  },
  btnGhostText: { color: colors.text, fontWeight: '700', textAlign: 'center', fontSize: 15 },
}));
