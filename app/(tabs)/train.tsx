import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useDb } from '@/db/DatabaseProvider';
import { ensureStarterRoutines } from '@/db/seed-routines';
import {
  discardSession,
  getInProgressSession,
  listRoutines,
  startFreestyleWorkout,
  startRoutineWorkout,
} from '@/db/workout-queries';
import type { Routine, WorkoutSession } from '@/db/schema';
import { colors, spacing } from '@/lib/theme';

export default function TrainScreen() {
  const router = useRouter();
  const { ready, exerciseCount } = useDb();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [inProgress, setInProgress] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      await ensureStarterRoutines();
      const [r, session] = await Promise.all([listRoutines(), getInProgressSession()]);
      setRoutines(r);
      setInProgress(session);
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const startFreestyle = async () => {
    if (busy) return;
    if (inProgress) {
      Alert.alert(
        'Workout in progress',
        'Resume the current workout or discard it before starting a new one.'
      );
      return;
    }
    setBusy(true);
    try {
      const id = await startFreestyleWorkout();
      router.push(`/train/active?id=${encodeURIComponent(id)}`);
    } finally {
      setBusy(false);
    }
  };

  const startRoutine = async (routineId: string) => {
    if (busy) return;
    if (inProgress) {
      Alert.alert(
        'Workout in progress',
        'Resume the current workout or discard it before starting a new one.'
      );
      return;
    }
    setBusy(true);
    try {
      const id = await startRoutineWorkout(routineId);
      router.push(`/train/active?id=${encodeURIComponent(id)}`);
    } finally {
      setBusy(false);
    }
  };

  const onDiscard = () => {
    if (!inProgress) return;
    Alert.alert('Discard workout?', 'Sets already logged will be kept but marked discarded.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardSession(inProgress.id);
          setInProgress(null);
        },
      },
    ]);
  };

  if (!ready || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <Text style={styles.title}>Train</Text>
      <Text style={styles.muted}>
        Log sets offline. Library: {exerciseCount} exercises.
      </Text>

      {inProgress ? (
        <View style={styles.resumeBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.resumeTitle}>Workout in progress</Text>
            <Text style={styles.resumeMeta}>
              Started{' '}
              {inProgress.startedAt
                ? new Date(inProgress.startedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </Text>
          </View>
          <Pressable
            style={styles.resumeBtn}
            onPress={() => router.push(`/train/active?id=${encodeURIComponent(inProgress.id)}`)}
          >
            <Text style={styles.resumeBtnText}>Resume</Text>
          </Pressable>
          <Pressable style={styles.discardBtn} onPress={onDiscard}>
            <Text style={styles.discardBtnText}>Discard</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.section}>Start workout</Text>
      <Pressable style={styles.primaryBtn} onPress={startFreestyle} disabled={busy}>
        <Text style={styles.primaryBtnText}>Freestyle</Text>
        <Text style={styles.primaryBtnSub}>Pick exercises as you go</Text>
      </Pressable>

      <Text style={styles.section}>Starter routines</Text>
      {routines.length === 0 ? (
        // User-facing copy, not internal wording: "seeded" means nothing to a
        // new user, and the library is the one thing that ships populated.
        <Text style={styles.muted}>
          No routines yet. Start a freestyle session, or browse the exercise library — it
          ships with the app and works offline.
        </Text>
      ) : (
        routines.map((r) => (
          <Pressable
            key={r.id}
            style={styles.routineCard}
            onPress={() => startRoutine(r.id)}
            disabled={busy}
          >
            <Text style={styles.routineName}>{r.name}</Text>
            {r.notes ? <Text style={styles.routineNotes}>{r.notes}</Text> : null}
          </Pressable>
        ))
      )}

      <Pressable style={styles.linkBtn} onPress={() => router.push('/exercise')}>
        <Text style={styles.linkBtnText}>Browse Exercise Library</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  muted: { color: colors.textMuted, lineHeight: 20, marginTop: 4, marginBottom: spacing.md },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  resumeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  resumeTitle: { color: colors.accent, fontWeight: '800' },
  resumeMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  resumeBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resumeBtnText: { color: colors.chipActiveText, fontWeight: '800' },
  discardBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  discardBtnText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  primaryBtn: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
    marginBottom: spacing.sm,
  },
  primaryBtnText: { color: colors.accent, fontWeight: '800', fontSize: 17 },
  primaryBtnSub: { color: colors.textMuted, marginTop: 4, fontSize: 13 },
  routineCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  routineName: { color: colors.text, fontWeight: '700', fontSize: 16 },
  routineNotes: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  linkBtn: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  linkBtnText: { color: colors.text, fontWeight: '700', textAlign: 'center' },
});
