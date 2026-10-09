import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Bar, Card } from '@/components/ui';
import { fastProgress, formatElapsed } from '@/lib/fasting';
import { useFast } from '@/lib/fasting-store';
import { colors, fonts } from '@/lib/theme';

/** The running fast, at the top of Fuel. Renders nothing when there is none. */
export function FastingCard() {
  const { fast } = useFast();
  const router = useRouter();
  const now = useNow(fast != null);

  if (!fast) return null;
  const p = fastProgress(fast, now);

  return (
    <Card onPress={() => router.push('/fuel/fasting')}>
      <View style={s.top}>
        <Text style={s.lbl}>FASTING · {fast.hours}H</Text>
        <Text style={s.sub}>{p.complete ? 'Window complete' : `${formatElapsed(p.remainingMs)} to go`}</Text>
      </View>
      <Text style={s.clock}>{formatElapsed(p.elapsedMs)}</Text>
      <Bar pct={p.pct} height={8} />
    </Card>
  );
}

/** A clock that ticks once a second while `on`. */
export function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const tick = () => setNow(Date.now());
    // Catch up at once on turning on, then every second.
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [on]);
  return now;
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  lbl: { fontFamily: fonts.pixel, fontSize: 6, letterSpacing: 0.7, color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, fontFamily: fonts.body },
  clock: {
    fontSize: 34,
    fontFamily: fonts.bodyBold,
    color: colors.text,
    letterSpacing: -1.5,
    marginTop: 6,
    marginBottom: 10,
    fontVariant: ['tabular-nums'],
  },
});
