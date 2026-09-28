import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AddSelectedBar, ExerciseBrowser } from '@/components/ExerciseBrowser';
import type { Exercise } from '@/db/schema';
import { addExerciseToSession, swapSessionExercise } from '@/db/workout-queries';
import { toggleById } from '@/lib/exercise-meta';
import { colors, spacing, themedStyles } from '@/lib/theme';

/**
 * The exercise library, as a picker for a live workout.
 *
 * Adding: tap as many as you like, in the order you mean to do them, then add
 * them together. Swapping replaces one exercise, so there a tap is the pick.
 */
export default function AddExerciseScreen() {
  // `swap` is a session exercise to replace rather than add alongside.
  const { sessionId, swap } = useLocalSearchParams<{ sessionId: string; swap?: string }>();
  const router = useRouter();
  const [picked, setPicked] = useState<Exercise[]>([]);
  const [busy, setBusy] = useState(false);
  // Coming back from creating a custom exercise: it is new, so the list has to
  // be re-read or the thing just made is missing from it.
  const [visits, setVisits] = useState(0);
  useFocusEffect(useCallback(() => setVisits((n) => n + 1), []));

  const sid = sessionId ? decodeURIComponent(sessionId) : '';
  const makeOwn = () => router.push(`/exercise/new?sessionId=${encodeURIComponent(sid)}`);

  const onSwap = async (exercise: Exercise) => {
    if (!sid || !swap || busy) return;
    setBusy(true);
    try {
      await swapSessionExercise(swap, exercise.id);
      router.back();
    } catch (e) {
      Alert.alert('Could not swap it', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onAddAll = async () => {
    if (!sid || busy || picked.length === 0) return;
    setBusy(true);
    let added = 0;
    try {
      // One at a time, so they land in the workout in the order they were tapped.
      for (const exercise of picked) {
        await addExerciseToSession(sid, exercise.id, { targetSets: 3, targetReps: 10 });
        added++;
      }
      router.back();
    } catch (e) {
      // Say how far it got: the first few are already in the workout.
      setPicked((prev) => prev.slice(added));
      Alert.alert(
        'Could not add them all',
        `${added > 0 ? `${added} added. ` : ''}${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: swap ? 'Swap exercise' : 'Add exercises' }} />
      <View style={styles.container}>
        <ExerciseBrowser
          mode={swap ? 'single' : 'multi'}
          selectedIds={picked.map((e) => e.id)}
          onPress={swap ? onSwap : (e) => setPicked((prev) => toggleById(prev, e))}
          reloadKey={visits}
          header={
            <Pressable style={styles.newBtn} onPress={makeOwn}>
              <Text style={styles.newBtnText}>+ Not in the list — photograph the machine</Text>
            </Pressable>
          }
          emptyAction={() => (
            // A dead end with no way out is the worst version of this screen:
            // the reason to search is that you are standing in front of
            // something and want to log it.
            <Pressable style={styles.emptyBtn} onPress={makeOwn}>
              <Text style={styles.emptyBtnText}>Make your own →</Text>
            </Pressable>
          )}
        />
        {swap ? null : <AddSelectedBar count={picked.length} busy={busy} onPress={onAddAll} />}
      </View>
    </>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  newBtn: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderBright,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  newBtnText: { color: colors.text, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  emptyBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  emptyBtnText: { color: colors.onAccent, fontWeight: '800', fontSize: 13 },
}));
