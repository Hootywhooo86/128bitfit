import React, { useEffect, useState } from 'react';
import { InteractionManager, StyleSheet, Text, View } from 'react-native';
import { PixelMuscleMap } from '@/components/PixelMuscleMap';
import { getSessionMuscleTally } from '@/db/muscle-queries';
import type { MuscleTally } from '@/lib/muscle-load';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

/**
 * The muscle map for one workout, at the bottom of the workout screens. It
 * re-reads whenever `version` changes, so ticking a set fills it in.
 *
 * Nothing is drawn until the screen has settled: the first figure takes a
 * moment to build, and opening a workout to log a set must never wait on it.
 */
export function WorkoutMuscleCard({ sessionId, version }: { sessionId: string; version: string }) {
  const [tally, setTally] = useState<MuscleTally | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const task = InteractionManager.runAfterInteractions(() => {
      getSessionMuscleTally(sessionId)
        .then((t) => {
          if (!alive) return;
          setTally(t);
          setFailed(false);
        })
        .catch(() => alive && setFailed(true));
    });
    return () => {
      alive = false;
      task.cancel();
    };
  }, [sessionId, version]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>MUSCLES THIS WORKOUT</Text>
      {failed ? (
        <Text style={styles.error}>Could not read this workout&apos;s sets for the muscle map.</Text>
      ) : tally ? (
        <PixelMuscleMap tally={tally} empty="Tick a set and the muscles it works fill in here." />
      ) : null}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    title: { fontFamily: fonts.pixel, fontSize: 10, color: colors.textMuted, letterSpacing: 1.5 },
    error: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.body },
  })
);
