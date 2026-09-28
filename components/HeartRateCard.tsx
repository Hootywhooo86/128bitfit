import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { health } from '@/lib/health';
import { summariseHeartRate, type HeartRateSummary } from '@/lib/heart-rate';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

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
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!endedAt) {
      setHr(null);
      return;
    }
    let alive = true;
    health
      .readHeartRateSeries(startedAt, endedAt)
      .then((samples) => alive && setHr(summariseHeartRate(samples, startedAt, endedAt)))
      .catch(() => alive && setHr(null));
    return () => {
      alive = false;
    };
  }, [startedAt, endedAt]);

  if (hr === undefined) return null;

  if (hr === null) {
    return (
      <View style={s.card}>
        <Text style={s.label}>HEART RATE</Text>
        <Text style={s.note}>
          No heart rate recorded for this session. Wear a watch that syncs to Health Connect and it
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
      <Text style={s.note}>Recorded by your watch through Health Connect. Dashed line: average.</Text>
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
    note: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 8, fontFamily: fonts.body },
  })
);
