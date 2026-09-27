import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Label, Note, Screen, Stat3 } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { getWeekPlan } from '@/db/schedule-settings';
import { listRoutines } from '@/db/workout-queries';
import type { Routine } from '@/db/schema';
import { EMPTY_WEEK, WEEKDAYS, sessionsPerWeek, weekdayIndex, type WeekPlan } from '@/lib/schedule';
import { colors, fonts, radius, themedStyles } from '@/lib/theme';

/** Train → Schedule, from prototype/app-shell.html `train:schedule`. */
export default function ScheduleScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const [plan, setPlan] = useState<WeekPlan>(EMPTY_WEEK);
  const [routines, setRoutines] = useState<Routine[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void Promise.all([getWeekPlan(), listRoutines()]).then(([p, r]) => {
        setPlan(p);
        setRoutines(r);
      });
    }, [ready])
  );

  const byId = new Map(routines.map((r) => [r.id, r]));
  const ids = new Set(byId.keys());
  const today = weekdayIndex(new Date());

  return (
    <Screen section="Schedule" back>
      <Label>WEEKLY PATTERN</Label>
      <Card style={{ padding: 4 }}>
        {WEEKDAYS.map((d, i) => {
          const p = plan[i];
          const name = p === 'rest' ? 'Rest' : p && byId.get(p) ? byId.get(p)!.name : 'Not planned';
          const dim = p !== 'rest' && !(p && byId.has(p));
          return (
            <Pressable
              key={d}
              style={({ pressed }) => [s.day, i === today && s.today, pressed && s.pressed]}
              onPress={() => router.push({ pathname: '/train/assign', params: { day: String(i) } })}
            >
              <Text style={[s.dow, i === today && s.dowToday]}>{d}</Text>
              <Text style={[s.name, (dim || p === 'rest') && s.nameDim]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={s.chev}>›</Text>
            </Pressable>
          );
        })}
      </Card>
      <Note>
        Tied to weekdays: whatever is planned for today shows on the Train tab. Miss a day and it
        stays missed — the plan does not shuffle itself.
      </Note>
      <Label>PLANNED</Label>
      <Stat3
        items={[
          { value: String(sessionsPerWeek(plan, ids)), label: 'PER WEEK' },
          { value: String(plan.filter((p) => p === 'rest').length), label: 'REST DAYS' },
          { value: String(routines.length), label: 'ROUTINES' },
        ]}
      />
      {routines.length === 0 ? (
        <View style={{ marginTop: 12 }}>
          <Note>No routines yet. Build one first, then give it a day.</Note>
        </View>
      ) : null}
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    day: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 11, borderRadius: radius.md },
    today: { backgroundColor: colors.surfaceAlt },
    pressed: { backgroundColor: colors.track },
    dow: { fontFamily: fonts.pixel, fontSize: 9, width: 34, color: colors.textDim },
    dowToday: { color: colors.accent },
    name: { flex: 1, fontSize: 14.5, fontFamily: fonts.bodySemi, color: colors.text },
    nameDim: { color: colors.textDim },
    chev: { color: colors.textDim, fontSize: 16 },
  })
);
