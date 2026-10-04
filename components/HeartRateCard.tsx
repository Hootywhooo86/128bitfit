import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { health } from '@/lib/health';
import { heartRateStillSyncing, summariseHeartRate, type HeartRateSummary } from '@/lib/heart-rate';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';
import { HEALTH_APP } from '@/lib/health/platform';

const CHART_H = 120;

/**
 * Average heart rate and a graph of it across the session, from whatever
 * recorded it into Health Connect (a watch, usually).
 *
 * No samples means no graph and a sentence saying so. A flat line or a zero
 * would claim a measurement that was never taken.
 */
export function HeartRateCard({ startedAt, endedAt }: { startedAt: number; endedAt: number | null }) {
  const [hr, setHr] = useState<HeartRateSummary | null | undefined>(undefined);
  /** When the last reading Health Connect has for this session was taken. */
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    if (!endedAt) {
      setHr(null);
      return;
    }
    setChecking(true);
    try {
      const samples = await health.readHeartRateSeries(startedAt, endedAt);
      setHr(summariseHeartRate(samples, startedAt, endedAt));
      setLastAt(samples.length ? samples[samples.length - 1].t : null);
    } catch {
      setHr(null);
    } finally {
      setChecking(false);
    }
  }, [startedAt, endedAt]);

  // On every visit, not once: a watch hands its readings to Health Connect in
  // batches, often minutes after the workout ends, so a summary opened straight
  // after Finish can be missing its last stretch. Coming back fills it in.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (hr === undefined) return null;

  if (hr === null) {
    return (
      <View style={s.card}>
        <Text style={s.label}>HEART RATE</Text>
        <Text style={s.note}>
          No heart rate recorded for this session. Wear a watch that syncs to {HEALTH_APP} and it
          shows up here.
        </Text>
      </View>
    );
  }

  const minutes = Math.max(1, Math.round(((endedAt ?? startedAt) - startedAt) / 60000));
  const lo = Math.max(0, hr.min - 5);
  const hi = hr.max + 5;
  const y = (bpm: number) => CHART_H - ((bpm - lo) / Math.max(1, hi - lo)) * CHART_H;
  const x = (i: number) => (hr.points.length <= 1 ? width / 2 : (i / (hr.points.length - 1)) * width);

  // One polyline per unbroken run, so a gap in the recording stays a gap.
  const runs: string[] = [];
  let run: string[] = [];
  hr.points.forEach((p, i) => {
    if (p.bpm == null) {
      if (run.length) runs.push(run.join(' '));
      run = [];
    } else {
      run.push(`${x(i)},${y(p.bpm)}`);
    }
  });
  if (run.length) runs.push(run.join(' '));

  return (
    <View style={s.card}>
      <Text style={s.label}>HEART RATE</Text>
      <View style={s.stats}>
        <View>
          <Text style={s.big}>{hr.avg}</Text>
          <Text style={s.small}>avg bpm</Text>
        </View>
        <View>
          <Text style={s.big}>{hr.max}</Text>
          <Text style={s.small}>max bpm</Text>
        </View>
      </View>
      <View style={s.chart} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={CHART_H}>
            <Line x1={0} x2={width} y1={y(hr.avg)} y2={y(hr.avg)} stroke={colors.borderBright} strokeDasharray="4 4" />
            {runs.map((pts, i) =>
              pts.includes(' ') ? (
                <Polyline key={i} points={pts} fill="none" stroke={colors.accent} strokeWidth={2.5} strokeLinejoin="round" />
              ) : (
                <Polyline key={i} points={`${pts} ${pts}`} fill="none" stroke={colors.accent} strokeWidth={4} strokeLinecap="round" />
              )
            )}
          </Svg>
        ) : null}
      </View>
      <View style={s.axis}>
        <Text style={s.small}>0 min</Text>
        <Text style={s.small}>{minutes} min</Text>
      </View>
      {lastAt != null && endedAt != null && heartRateStillSyncing(lastAt, endedAt) ? (
        <Pressable onPress={() => void load()} disabled={checking}>
          <Text style={s.warn}>
            {checking
              ? 'Checking…'
              : `No heart rate after ${new Date(lastAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} yet — your watch may still be syncing. Tap to check again.`}
          </Text>
        </Pressable>
      ) : null}
      <Text style={s.note}>Recorded by your watch through {HEALTH_APP}. Dashed line: average.</Text>
    </View>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    label: { fontFamily: fonts.pixel, fontSize: 9, color: colors.textMuted, letterSpacing: 1, marginBottom: 8 },
    stats: { flexDirection: 'row', gap: 32, marginBottom: 10 },
    big: { color: colors.text, fontSize: 26, fontFamily: fonts.bodyBold },
    small: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body },
    chart: { height: CHART_H },
    axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    warn: { color: colors.text, fontSize: 12.5, lineHeight: 18, marginTop: 10, fontFamily: fonts.bodySemi },
    note: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 8, fontFamily: fonts.body },
  })
);
