import { useState } from 'react';
import {
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type SessionExerciseWithMeta } from '@/db/workout-queries';
import type { WorkoutSet } from '@/db/schema';
import { type WeightUnit } from '@/db/settings-queries';
import { exerciseImageSource } from '@/lib/exercise-images';
import { isUserExercise } from '@/lib/exercise-sources';
import { equipmentGroup } from '@/lib/equipment-groups';
import { plateHint } from '@/lib/plates';
import { describeLastPerformance } from '@/lib/set-prefill';
import { formatLoadDistance, loadDistance, type TrackMode } from '@/lib/track-mode';
import { colors } from '@/lib/theme';
import type { SetPatch, SetValues } from './types';
import { activeWorkoutStyles as styles } from './active-styles';
import { SetRow } from './SetRow';

export function ExerciseCard({
  se,
  index,
  total,
  units,
  isCurrent,
  onSetCurrent,
  onHow,
  onAddPhoto,
  onMove,
  onPlates,
  supersetLabel,
  onSwap,
  onOptions,
  onSaveNote,
  onAddSet,
  onAddWarmupSet,
  onAddDropSet,
  onAddRestPause,
  onRemoveLastSet,
  onComplete,
  onUncomplete,
  onSave,
  onTrack,
  prSets,
}: {
  prSets: ReadonlySet<string>;
  se: SessionExerciseWithMeta;
  index: number;
  total: number;
  units: WeightUnit;
  isCurrent: boolean;
  onSetCurrent: () => void;
  onHow: () => void;
  /** Your own exercise with no picture: open it to take or pick one. */
  onAddPhoto: () => void;
  onMove: (by: -1 | 1) => void;
  onPlates: (weight: number) => void;
  /** "A1", "A2"… when this exercise is in a superset. */
  supersetLabel: string | null;
  onSwap: () => void;
  onOptions: () => void;
  onSaveNote: (note: string) => void;
  onAddSet: () => void;
  onAddWarmupSet: () => void;
  onAddDropSet: () => void;
  onAddRestPause: () => void;
  onRemoveLastSet: () => void;
  onComplete: (set: WorkoutSet, values: SetValues) => void;
  onUncomplete: (set: WorkoutSet) => void;
  onSave: (setId: string, patch: SetPatch) => void;
  onTrack: (mode: TrackMode) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(se.notes ?? '');
  const [imageFailed, setImageFailed] = useState(false);
  const completedSets = se.sets.filter((s) => s.completed).length;
  const totalSets = se.sets.length;
  const allDone = completedSets === totalSets && totalSets > 0;
  const stateChip = allDone ? 'DONE' : isCurrent ? 'CURRENT' : `${completedSets}/${totalSets}`;
  const lastLine = describeLastPerformance(se.lastPerformance);
  const lastDate = se.lastPerformance?.performedAt
    ? new Date(se.lastPerformance.performedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })
    : null;
  const primaryMuscle = se.primaryMuscles?.[0] ?? '';
  const initials = se.exerciseName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const imageSource = imageFailed ? null : exerciseImageSource(se.image);
  // One you made, with no picture yet: offer to add one rather than show a
  // grey tile with its initials.
  const canAddPhoto = !imageSource && isUserExercise(se.category);
  // Barbell lifts: what to load for the next set still to do. One line,
  // read-only, so logging a set is exactly as fast as before.
  const nextSet = se.sets.find((st) => !st.completed);
  const plateWeight = nextSet?.weight ?? null;
  const plateLine =
    equipmentGroup(se.equipment) === 'barbell' && nextSet ? plateHint(plateWeight, units) : null;
  const caption = [primaryMuscle.toUpperCase(), se.equipment?.toUpperCase()].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, isCurrent && styles.cardCurrent]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardCounter}>
          EXERCISE {index + 1} / {total}
        </Text>
        {/* Re-order when the machine you wanted is taken. */}
        <View style={styles.moveRow}>
          <Pressable
            style={[styles.moveBtn, index === 0 && styles.moveBtnOff]}
            onPress={() => onMove(-1)}
            disabled={index === 0}
            hitSlop={6}
            accessibilityLabel="Move exercise up"
          >
            <Text style={styles.moveBtnText}>↑</Text>
          </Pressable>
          <Pressable
            style={[styles.moveBtn, index === total - 1 && styles.moveBtnOff]}
            onPress={() => onMove(1)}
            disabled={index === total - 1}
            hitSlop={6}
            accessibilityLabel="Move exercise down"
          >
            <Text style={styles.moveBtnText}>↓</Text>
          </Pressable>
        </View>
        <Text style={[styles.stateChip, (isCurrent || allDone) && styles.stateChipCurrent]}>{stateChip}</Text>
      </View>

      <View style={styles.exTile}>
        <View style={styles.exThumb}>
          {imageSource ? (
            <Image source={imageSource} style={styles.exThumbImg} resizeMode="cover" onError={() => setImageFailed(true)} />
          ) : (
            <Text style={styles.exThumbText}>{initials}</Text>
          )}
        </View>
        <Text style={styles.exName}>{se.exerciseName}</Text>
      </View>

      <View style={styles.chipRow}>
        {supersetLabel ? <Text style={[styles.chip, styles.supersetChip]}>SUPERSET {supersetLabel}</Text> : null}
        {primaryMuscle ? <Text style={styles.chip}>{primaryMuscle.toUpperCase()}</Text> : null}
        {se.equipment ? <Text style={styles.chip}>{se.equipment.toUpperCase()}</Text> : null}
        {se.best ? (
          <Text style={styles.chip}>
            Best {se.best.weight} {se.best.unit}
          </Text>
        ) : null}
      </View>

      <View style={styles.buttonRow}>
        <Pressable style={styles.outlineBtn} onPress={onSwap}>
          <Text style={styles.outlineBtnText}>⇄ Swap</Text>
        </Pressable>
        <Pressable style={styles.outlineBtn} onPress={onHow}>
          <Text style={styles.outlineBtnText}>? How</Text>
        </Pressable>
        <Pressable style={styles.outlineBtn} onPress={onOptions}>
          <Text style={styles.outlineBtnText}>⚙ Options</Text>
        </Pressable>
        {isCurrent ? (
          <View style={styles.accentBtn}>
            <Text style={styles.accentBtnText}>● Current</Text>
          </View>
        ) : (
          <Pressable style={styles.outlineBtn} onPress={onSetCurrent}>
            <Text style={styles.outlineBtnText}>Set current</Text>
          </Pressable>
        )}
      </View>

      {/* The library's own picture of the movement, on the exercise in hand. */}
      {isCurrent ? (
        <Pressable style={styles.photoPanel} onPress={canAddPhoto ? onAddPhoto : onHow}>
          {imageSource ? (
            <Image
              source={imageSource}
              style={styles.photoImage}
              resizeMode="contain"
              onError={() => setImageFailed(true)}
            />
          ) : canAddPhoto ? (
            <View style={[styles.photoPlaceholder, styles.photoAdd]}>
              <Text style={styles.photoAddIcon}>＋</Text>
            </View>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoInitials}>{initials}</Text>
            </View>
          )}
          {caption ? <Text style={styles.photoCaption}>{caption}</Text> : null}
          <Text style={styles.photoHint}>
            {canAddPhoto ? 'Add a photo of this machine — camera or gallery' : 'Tap for how to do it'}
          </Text>
        </Pressable>
      ) : null}

      <Text style={styles.lastLine}>
        {lastLine ? `Last time${lastDate ? ` (${lastDate})` : ''}: ${lastLine}` : 'First time — no previous sets'}
      </Text>

      {se.notes && !noteOpen ? (
        <Pressable onPress={() => setNoteOpen(true)}>
          <Text style={styles.noteText}>✎ {se.notes}</Text>
        </Pressable>
      ) : null}
      {noteOpen ? (
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Seat height 4, pause at the bottom…"
          placeholderTextColor={colors.textDim}
          autoFocus
          multiline
          onBlur={() => {
            setNoteOpen(false);
            if (note.trim() !== (se.notes ?? '')) onSaveNote(note);
          }}
        />
      ) : null}

      {/* Weight x reps or weight x distance, for any exercise; remembered. */}
      <View style={styles.trackRow}>
        {(['reps', 'distance'] as const).map((m) => (
          <Pressable
            key={m}
            style={[styles.trackChip, se.track === m && styles.trackChipOn]}
            onPress={() => se.track !== m && onTrack(m)}
            hitSlop={4}
          >
            <Text style={[styles.trackChipText, se.track === m && styles.trackChipTextOn]}>
              {m === 'reps' ? 'Weight × reps' : 'Weight × distance'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.setHeader}>
        {/* Same columns as the rows below, and shrink-to-fit so a large
            system font cannot run SET into WEIGHT. */}
        <Text style={[styles.col, styles.colSet, styles.headText]} numberOfLines={1} adjustsFontSizeToFit>
          SET
        </Text>
        <Text style={[styles.col, styles.colNum, styles.headText]} numberOfLines={1} adjustsFontSizeToFit>
          WEIGHT ({units.toUpperCase()})
        </Text>
        <Text style={[styles.col, styles.colNum, styles.headText]} numberOfLines={1} adjustsFontSizeToFit>
          {se.track === 'distance' ? 'METRES' : 'REPS'}
        </Text>
        <View style={styles.colDone} />
      </View>

      {se.sets.map((set, setIdx) => {
        const workingBefore = se.sets
          .slice(0, setIdx)
          .filter((s) => !s.isWarmup && s.setType === 'normal').length;
        const label = set.isWarmup
          ? 'W'
          : set.setType === 'drop'
            ? 'D'
            : set.setType === 'rp'
              ? 'RP'
              : String(workingBefore + 1);
        return (
          <SetRow
            key={set.id}
            set={set}
            label={label}
            step={units === 'kg' ? 2.5 : 5}
            units={units}
            track={se.track}
            onComplete={(values) => onComplete(set, values)}
            onUncomplete={() => onUncomplete(set)}
            onSave={onSave}
            isPr={prSets.has(set.id)}
          />
        );
      })}

      {se.track === 'distance' ? (
        <Text style={styles.loadLine}>{loadDistanceLine(se, units)}</Text>
      ) : null}

      {plateLine ? (
        <Pressable onPress={() => onPlates(plateWeight!)} hitSlop={6} style={styles.plateHint}>
          <Text style={styles.plateHintText}>{plateLine} ›</Text>
        </Pressable>
      ) : null}

      <View style={styles.actionGrid}>
        <Pressable style={styles.dashedBtn} onPress={() => setNoteOpen(true)}>
          <Text style={styles.dashedBtnText}>{se.notes ? '✎ Edit note' : '+ Note'}</Text>
        </Pressable>
        <Pressable style={styles.dashedBtn} onPress={onAddWarmupSet}>
          <Text style={styles.dashedBtnText}>+ Warm-up set</Text>
        </Pressable>
        <Pressable style={styles.dashedBtn} onPress={onAddSet}>
          <Text style={styles.dashedBtnText}>+ Add set</Text>
        </Pressable>
        <Pressable style={styles.dashedBtn} onPress={onAddDropSet}>
          <Text style={styles.dashedBtnText}>+ Drop set</Text>
        </Pressable>
        <Pressable style={styles.dashedBtn} onPress={onAddRestPause}>
          <Text style={styles.dashedBtnText}>+ Rest-pause</Text>
        </Pressable>
        <Pressable
          style={[styles.dashedBtn, totalSets === 0 && { opacity: 0.4 }]}
          onPress={onRemoveLastSet}
          disabled={totalSets === 0}
        >
          <Text style={styles.dashedBtnText}>− Remove set</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** "Load × distance 10,800 lb·m · last time 9,600 lb·m", or what is still needed. */
function loadDistanceLine(se: SessionExerciseWithMeta, units: WeightUnit): string {
  const today = loadDistance(se.sets);
  const last = se.lastPerformance
    ? loadDistance(se.lastPerformance.sets.map((s) => ({ ...s, distanceM: s.distanceM ?? null, completed: true })))
    : null;
  const parts = [
    today != null ? `Load × distance ${formatLoadDistance(today, units)}` : 'Load × distance: tick a set with weight and metres',
  ];
  if (last != null) parts.push(`last time ${formatLoadDistance(last, units)}`);
  return parts.join(' · ');
}
