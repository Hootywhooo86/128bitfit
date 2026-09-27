import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Label, Note, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { deleteSession, listSessions, type SessionListItem } from '@/db/workout-queries';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

/**
 * Every workout logged, newest first, and the only place they can be deleted.
 *
 * Discarded sessions are listed too: one the user abandoned is still theirs to
 * see and remove. Only completed ones feed the muscle map and the coach, which
 * the row says.
 */
export default function HistoryScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!ready) return;
    try {
      setSessions(await listSessions());
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const remove = (s: SessionListItem) => {
    const when = s.startedAt ? new Date(s.startedAt).toLocaleDateString() : 'this workout';
    Alert.alert(
      'Delete workout?',
      `${when} — ${s.completedSets} set${s.completedSets === 1 ? '' : 's'}. This removes the sets too, and cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteSession(s.id);
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
      <Screen section="History" back>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen section="History" back>
      {sessions.length === 0 ? (
        <>
          <Label>NO WORKOUTS YET</Label>
          <Note>
            Finished sessions land here. Nothing has been logged, so there is nothing to show —
            start one from Train.
          </Note>
        </>
      ) : (
        <>
          <Label>{sessions.length} WORKOUTS</Label>
          {sessions.map((item) => {
            const date = item.startedAt ? new Date(item.startedAt) : null;
            return (
              <Card key={item.id}>
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.date}>
                      {date
                        ? date.toLocaleDateString(undefined, {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })
                        : 'Undated'}
                      {item.status !== 'completed' ? (
                        <Text style={s.status}> · {item.status.replace('_', ' ')}</Text>
                      ) : null}
                    </Text>
                    <Text style={s.meta}>
                      {item.completedSets} set{item.completedSets === 1 ? '' : 's'} ·{' '}
                      {item.exerciseCount} exercise{item.exerciseCount === 1 ? '' : 's'}
                    </Text>
                    {item.names.length > 0 ? (
                      <Text style={s.names} numberOfLines={1}>
                        {item.names.join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable style={s.del} onPress={() => remove(item)} hitSlop={8}>
                    <Text style={s.delT}>Delete</Text>
                  </Pressable>
                </View>

                {item.status === 'completed' ? (
                  <Pressable
                    style={s.open}
                    onPress={() => router.push(`/train/summary?id=${encodeURIComponent(item.id)}`)}
                  >
                    <Text style={s.openT}>Open summary →</Text>
                  </Pressable>
                ) : null}
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const s = themedStyles(() => StyleSheet.create({
  center: { paddingVertical: 80, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  date: { color: colors.text, fontSize: 15, fontFamily: fonts.bodySemi },
  status: { color: colors.textDim, fontSize: 12.5, fontFamily: fonts.body },
  meta: { color: colors.textMuted, fontSize: 12.5, marginTop: 4, fontFamily: fonts.body },
  names: { color: colors.textDim, fontSize: 12, marginTop: 3, fontFamily: fonts.body },
  del: { paddingVertical: 4, paddingHorizontal: 6 },
  delT: { color: colors.danger, fontSize: 12.5, fontFamily: fonts.bodySemi },
  open: { marginTop: 10 },
  openT: { color: colors.accent, fontSize: 12.5, fontFamily: fonts.bodySemi },
}));
