import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { NumberBox } from '@/components/NumberBox';
import { PixelTrophy } from '@/components/PixelTrophy';
import type { WorkoutSet } from '@/db/schema';
import { type WeightUnit } from '@/db/settings-queries';
import { type TrackMode } from '@/lib/track-mode';
import type { SetPatch, SetValues } from './types';
import { activeWorkoutStyles as styles } from './active-styles';

function parseNum(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const show = (n: number | null | undefined) => (n == null ? '' : String(n));

export function SetRow({
  set,
  label,
  step,
  units,
  onComplete,
  onUncomplete,
  onSave,
  isPr,
  track,
}: {
  isPr: boolean;
  track: TrackMode;
  set: WorkoutSet;
  label: string;
  step: number;
  units: WeightUnit;
  onComplete: (values: SetValues) => void;
  onUncomplete: () => void;
  onSave: (setId: string, patch: SetPatch) => void;
}) {
  const [weight, setWeight] = useState(show(set.weight));
  // The second number: reps, or metres for a carry or sled.
  const byDistance = track === 'distance';
  const repsSource = byDistance ? set.distanceM : set.reps;
  const [reps, setReps] = useState(show(repsSource));

  // A reload that changes the stored numbers (a swap re-seeds them) must show
  // through; typing does not trigger it because it only fires on a new value.
  // Adjusted during render rather than in an effect, so the row never draws
  // one frame with the old number.
  const [shownWeightFor, setShownWeightFor] = useState(set.weight);
  if (shownWeightFor !== set.weight) {
    setShownWeightFor(set.weight);
    setWeight(show(set.weight));
  }
  // Same triggers as before: either stored number, or the track mode.
  const repsKey = `${byDistance}:${set.reps}:${set.distanceM}`;
  const [shownRepsFor, setShownRepsFor] = useState(repsKey);
  if (shownRepsFor !== repsKey) {
    setShownRepsFor(repsKey);
    setReps(show(repsSource));
  }

  const saveWeight = (next: number | null) => {
    setWeight(show(next));
    onSave(set.id, { weight: next, weightUnit: units });
  };
  const saveReps = (next: number | null) => {
    setReps(show(next));
    onSave(set.id, byDistance ? { distanceM: next } : { reps: next });
  };
  // Metres step by 5; reps by 1.
  const secondStep = byDistance ? 5 : 1;
  const round = (n: number) => Math.round(n * 100) / 100;

  return (
    <View style={[styles.setRow, set.isWarmup && styles.warmupRow, set.completed && styles.doneRow]}>
      <Text style={[styles.col, styles.colSet, styles.setLabel, set.isWarmup && styles.warmText]} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
      <View style={[styles.col, styles.colNum, styles.numGroup]}>
        <Pressable
          style={styles.stepBtn}
          hitSlop={4}
          onPress={() => {
            const n = parseNum(weight);
            if (n != null) saveWeight(round(Math.max(0, n - step)));
          }}
        >
          <Text style={styles.stepperBtn}>−</Text>
        </Pressable>
        <NumberBox
          style={styles.numInput}
          value={weight}
          onChangeText={setWeight}
          onDone={(text) => saveWeight(parseNum(text))}
          decimal
        />
        <Pressable
          style={styles.stepBtn}
          hitSlop={4}
          onPress={() => saveWeight(round((parseNum(weight) ?? 0) + step))}
        >
          <Text style={styles.stepperBtn}>+</Text>
        </Pressable>
      </View>
      <View style={[styles.col, styles.colNum, styles.numGroup]}>
        <Pressable
          style={styles.stepBtn}
          hitSlop={4}
          onPress={() => {
            const n = parseNum(reps);
            if (n != null) saveReps(Math.max(0, n - secondStep));
          }}
        >
          <Text style={styles.stepperBtn}>−</Text>
        </Pressable>
        <NumberBox
          style={styles.numInput}
          value={reps}
          onChangeText={setReps}
          onDone={(text) => saveReps(parseNum(text))}
          decimal={byDistance}
        />
        <Pressable style={styles.stepBtn} hitSlop={4} onPress={() => saveReps((parseNum(reps) ?? 0) + secondStep)}>
          <Text style={styles.stepperBtn}>+</Text>
        </Pressable>
      </View>
      <Pressable
        style={[styles.tickCircle, set.completed && styles.tickOn]}
        hitSlop={6}
        accessibilityLabel={set.completed ? 'Un-tick set' : 'Log set'}
        onPress={() =>
          set.completed
            ? onUncomplete()
            : onComplete(
                byDistance
                  ? { weight: parseNum(weight), reps: null, distanceM: parseNum(reps) }
                  : { weight: parseNum(weight), reps: parseNum(reps), distanceM: null }
              )
        }
      >
        <Text style={[styles.tickText, set.completed && styles.tickTextOn]}>✓</Text>
        {isPr && set.completed ? (
          <View style={styles.prBadge} pointerEvents="none">
            <PixelTrophy size={16} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
