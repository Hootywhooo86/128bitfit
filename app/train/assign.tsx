import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { MenuRow, Note, Screen } from '@/components/ui';
import { getWeekPlan, setDayPlan } from '@/db/schedule-settings';
import { listRoutinesWithDetail, type RoutineListItem } from '@/db/workout-queries';
import { WEEKDAYS, type DayPlan } from '@/lib/schedule';

const FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Train → Schedule → a day, from prototype/app-shell.html `train:assign`. */
export default function AssignDayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string }>();
  const day = Math.min(6, Math.max(0, Number(params.day) || 0));
  const [current, setCurrent] = useState<DayPlan>(null);
  const [routines, setRoutines] = useState<RoutineListItem[] | null>(null);

  useEffect(() => {
    void Promise.all([getWeekPlan(), listRoutinesWithDetail()]).then(([p, r]) => {
      setCurrent(p[day]);
      setRoutines(r);
    });
  }, [day]);

  const pick = async (plan: DayPlan) => {
    try {
      await setDayPlan(day, plan);
      router.back();
    } catch (e) {
      Alert.alert('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen section={`Schedule · ${WEEKDAYS[day]}`} back>
      <Note>What are you training on {FULL[day]}s?</Note>
      <View style={{ height: 12 }} />
      {(routines ?? []).map((r) => (
        <MenuRow
          key={r.id}
          name={r.name}
          sub={`${r.exerciseCount} exercise${r.exerciseCount === 1 ? '' : 's'}${r.names.length ? ` · ${r.names.join(', ')}` : ''}`}
          value={current === r.id ? '✓' : undefined}
          onPress={() => void pick(r.id)}
        />
      ))}
      <MenuRow name="Rest day" sub="No session" value={current === 'rest' ? '✓' : undefined} onPress={() => void pick('rest')} />
      <MenuRow name="Not planned" sub="Leave the day open" value={current == null ? '✓' : undefined} onPress={() => void pick(null)} />
      {routines && routines.length === 0 ? (
        <Note>No routines yet — build one in Train → Workout builder, then come back.</Note>
      ) : null}
    </Screen>
  );
}
