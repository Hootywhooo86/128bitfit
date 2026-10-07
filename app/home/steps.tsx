import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { StepsCard } from '@/components/StepsCard';
import { Card, Label, Note, Screen } from '@/components/ui';
import { health } from '@/lib/health';
import { previousDay, today } from '@/lib/health/dates';
import { canOpenStepApp, openStepApp, stepAppName } from '@/lib/health/step-app';
import { agoText, stepHistory, type StepHistory } from '@/lib/health/step-history';
import type { NewestSteps } from '@/lib/health/types';
import { useTodaySteps } from '@/lib/health/use-health';
import { useHealthRefresh } from '@/lib/health/use-health-refresh';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

export { ErrorScreen as ErrorBoundary } from '@/components/ErrorScreen';

const DAYS = 10;

const dayLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
};

const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Steps: today, the last ten days, and how fresh the numbers are.
 *
 * The count can only be as current as the watch app's last sync into Health
 * Connect, so this says when that was and offers to open the app — opening
 * it is what makes it sync. Coming back re-reads straight away.
 */
export default function StepsScreen() {
  const { state } = useTodaySteps();
  const [history, setHistory] = useState<StepHistory | null>(null);
  const [newest, setNewest] = useState<NewestSteps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const end = today();
    let start = end;
    for (let i = 1; i < DAYS; i++) start = previousDay(start);
    try {
      const [days, fresh] = await Promise.all([
        health.readDays(start, end),
        // Freshness is a bonus; a failed read of it must not hide the steps.
        health.readNewestSteps().catch(() => null),
      ]);
      setHistory(stepHistory(days, end));
      setNewest(fresh);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setNow(Date.now());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );
  // Back from Google Health (or wherever): read again at once.
  useHealthRefresh(() => void load());

  const pull = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (state.status !== 'ready') {
    return (
      <Screen section="Steps" back>
        {state.status === 'checking' ? (
          <View style={s.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <StepsCard />
        )}
      </Screen>
    );
  }

  const source = newest?.source ?? null;
  const app = stepAppName(source);
  const sync = () => {
    if (!source) return;
    const res = openStepApp(source);
    if (!res.ok) Alert.alert(`Couldn't open ${app ?? 'it'}`, res.message);
  };

  return (
    <Screen section="Steps" back onRefresh={() => void pull()} refreshing={refreshing}>
      <Card>
        <Text style={s.label}>TODAY</Text>
        <Text style={s.hero}>{state.steps != null ? state.steps.toLocaleString() : '—'}</Text>
        <Text style={s.sub}>
          {newest
            ? `Last steps from ${app ?? source ?? 'your step app'}: ${timeLabel(newest.endMs)} — ${agoText(newest.endMs, now)}`
            : state.steps == null
              ? 'No steps recorded today yet.'
              : 'Up to date with Health Connect.'}
        </Text>
        {canOpenStepApp(source) ? (
          <>
            <Pressable style={s.btn} onPress={sync} accessibilityRole="button">
              <Text style={s.btnText}>SYNC {app!.toUpperCase()}</Text>
            </Pressable>
            <Text style={s.note}>
              Opens {app} so your watch syncs. Come back here and the count updates within a minute.
            </Text>
          </>
        ) : null}
      </Card>

      <Label>{`LAST ${DAYS} DAYS`}</Label>
      {error ? (
        <Note>{`Couldn't read the last ${DAYS} days: ${error}`}</Note>
      ) : !history ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <Card>
          {history.rows.map((r) => (
            <View key={r.date} style={s.row}>
              <Text style={s.day}>{r.today ? 'Today' : dayLabel(r.date)}</Text>
              <View style={s.track}>
                {r.fraction != null && r.fraction > 0 ? (
                  <View style={[s.bar, { width: `${Math.max(2, r.fraction * 100)}%` }]} />
                ) : null}
              </View>
              <Text style={[s.value, r.steps == null && s.none]}>
                {r.steps == null ? '—' : r.steps.toLocaleString()}
              </Text>
            </View>
          ))}
          <Text style={s.note}>
            {history.average != null
              ? `Average ${history.average.toLocaleString()} a day, over the ${history.averageDays} finished days with a reading. Today is still going, so it is left out.`
              : `An average shows once ${history.averageNeeds} finished days have a reading — ${history.averageNeeds - history.averageDays} more to go.`}{' '}
            A dash is a day with no reading, not a day of zero steps.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    center: { paddingVertical: 60, alignItems: 'center' },
    label: { fontFamily: fonts.pixel, fontSize: 10, color: colors.textMuted, letterSpacing: 1 },
    hero: { fontFamily: fonts.pixelBold, fontSize: 40, color: colors.text, marginVertical: 6 },
    sub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    btn: { backgroundColor: colors.accent, paddingVertical: 12, alignItems: 'center', marginTop: spacing.md },
    btnText: { fontFamily: fonts.pixel, fontSize: 12, color: colors.bg, letterSpacing: 1 },
    note: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
    day: { width: 92, fontFamily: fonts.body, fontSize: 13, color: colors.text },
    track: { flex: 1, height: 12, justifyContent: 'center' },
    // A thin bar with a rounded end, anchored at the left.
    bar: { height: 10, backgroundColor: colors.accent, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
    value: { width: 64, textAlign: 'right', fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
    none: { color: colors.textDim },
  })
);
