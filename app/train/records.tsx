import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card, Label, Note, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { listPersonalRecords, type ExerciseBest } from '@/db/workout-queries';
import { colors, fonts, spacing } from '@/lib/theme';

/**
 * Best lifts, from the prototype's `train:prs`.
 *
 * Two figures per exercise and they are not the same claim. The heaviest is a
 * measurement — that weight went up. The estimated one-rep max is Epley applied
 * to a set you did do, which is not a lift you have made, and it is labelled
 * every time it appears. Showing an estimate as a lift would be putting a
 * number on the bar that nobody put there.
 */
export default function RecordsScreen() {
  const { ready } = useDb();
  const [rows, setRows] = useState<ExerciseBest[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!ready) return;
    try {
      setRows(await listPersonalRecords());
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
      <Screen section="Records" back>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen section="Records" back>
      {rows.length === 0 ? (
        <>
          <Label>NO RECORDS YET</Label>
          <Note>
            Records come from completed sets with a weight and a rep count on them. Log a session
            and the first ones land here.
          </Note>
        </>
      ) : (
        <>
          <Label>{rows.length} EXERCISES</Label>
          <Note>
            The heaviest figure is what you lifted. The estimate is a formula applied to a set you
            did do — useful for comparing sets at different reps, and not a lift you have made.
          </Note>
          {rows.map((r) => {
            const h = r.record.heaviest;
            const e = r.record.bestEstimate;
            return (
              <Card key={r.exerciseId}>
                <Text style={s.name}>{r.name.toUpperCase()}</Text>
                {h ? (
                  <Text style={s.best}>
                    {fmt(h.weight)} {h.unit} × {h.reps}
                  </Text>
                ) : null}
                <Text style={s.meta}>
                  {e
                    ? `Best set ${fmt(e.weight)} ${e.unit} × ${e.reps} · estimated 1RM ${fmt(
                        e.oneRepMax
                      )} ${e.unit}`
                    : 'No estimate — every set was above twelve reps, where the formula stops meaning anything.'}
                </Text>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const fmt = (n: number | null) => {
  if (n == null) return '–';
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

const s = StyleSheet.create({
  center: { paddingVertical: 80, alignItems: 'center' },
  name: {
    color: colors.textMuted,
    fontFamily: fonts.pixel,
    fontSize: 8,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  best: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  meta: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 5 },
});
