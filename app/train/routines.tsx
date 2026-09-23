import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Label, Note, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import {
  deleteRoutine,
  listRoutinesWithDetail,
  type RoutineListItem,
} from '@/db/workout-queries';
import { colors, fonts, spacing } from '@/lib/theme';

/**
 * The routines you have, and the only place they can be deleted.
 *
 * Train lists them to start one, which meant a tap on a routine ran it and
 * there was nowhere to get rid of one — an imported backup drops thirteen in
 * at once and none of them could go. Deleting is deliberately not a long-press
 * on that list: a hidden gesture on a row whose normal tap starts a workout is
 * both undiscoverable and the wrong thing to fire by accident.
 *
 * Mirrors app/train/history.tsx, which is where sessions are deleted, so the
 * two halves of "get rid of a workout" work the same way.
 */
export default function RoutinesScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const [routines, setRoutines] = useState<RoutineListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!ready) return;
    try {
      setRoutines(await listRoutinesWithDetail());
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const remove = (r: RoutineListItem) => {
    Alert.alert(
      'Delete routine?',
      `${r.name} — ${r.exerciseCount} exercise${r.exerciseCount === 1 ? '' : 's'}. Workouts you already logged from it are kept; only the plan goes.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteRoutine(r.id);
                await refresh();
              } catch (e) {
                Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
              }
            })();
          },
        },
      ]
    );
  };

  if (!ready || loading) {
    return (
      <Screen section="Routines" back>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen section="Routines" back>
      {routines.length === 0 ? (
        <>
          <Label>NO ROUTINES</Label>
          <Note>
            Nothing to run and nothing to delete. Build one from Train, import a backup from
            Settings, or start a freestyle session and pick as you go.
          </Note>
        </>
      ) : (
        <>
          <Label>{routines.length} ROUTINES</Label>
          <Note>
            Deleting a routine removes the plan only. Sessions you logged from it stay in your
            history and on the muscle map — they happened.
          </Note>
          {routines.map((r) => (
            <Card key={r.id}>
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{r.name}</Text>
                  <Text style={s.meta}>
                    {r.exerciseCount} exercise{r.exerciseCount === 1 ? '' : 's'}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </Text>
                  {r.names.length > 0 ? (
                    <Text style={s.names} numberOfLines={1}>
                      {r.names.join(' · ')}
                      {r.exerciseCount > r.names.length ? ' …' : ''}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  style={s.edit}
                  onPress={() => router.push(`/train/build-routine?id=${encodeURIComponent(r.id)}`)}
                  hitSlop={8}
                >
                  <Text style={s.editT}>Edit</Text>
                </Pressable>
                <Pressable style={s.del} onPress={() => remove(r)} hitSlop={8}>
                  <Text style={s.delT}>Delete</Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </>
      )}

      <Pressable style={s.back} onPress={() => router.replace('/(tabs)/train')}>
        <Text style={s.backT}>Back to Train →</Text>
      </Pressable>
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 80, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  name: { color: colors.text, fontSize: 15, fontFamily: fonts.bodySemi },
  meta: { color: colors.textMuted, fontSize: 12.5, marginTop: 4, fontFamily: fonts.body },
  names: { color: colors.textDim, fontSize: 12, marginTop: 3, fontFamily: fonts.body },
  edit: { paddingVertical: 4, paddingHorizontal: 6 },
  editT: { color: colors.accent, fontSize: 12.5, fontFamily: fonts.bodySemi },
  del: { paddingVertical: 4, paddingHorizontal: 6 },
  delT: { color: colors.danger, fontSize: 12.5, fontFamily: fonts.bodySemi },
  back: { marginTop: spacing.lg, alignItems: 'center' },
  backT: { color: colors.accent, fontSize: 12.5, fontFamily: fonts.bodySemi },
});
