import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DayTotal } from '@/db/food-queries';
import {
  canGoEarlier,
  canGoLater,
  chipLabel,
  dayKey,
  describeFuelDay,
  fuelWindow,
} from '@/lib/fuel-day';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/** Fixed so the scroll position of a chip is arithmetic, not a measurement. */
const CHIP_W = 46;
const CHIP_GAP = 6;

/**
 * Which day you are looking at, and one tap to any of the last 30.
 *
 * Arrows alone would mean twenty taps to reach three weeks ago, so the strip
 * carries the whole window and the arrows are for nudging a day at a time.
 *
 * A chip shows the day's calories only when something was logged. A day nobody
 * logged shows a dash, never a 0 — the same distinction the rings make, for the
 * same reason: 0 claims you ate nothing, a dash says nobody wrote it down.
 */
export function DayStrip({
  day,
  onChange,
  totals,
  now = new Date(),
}: {
  day: Date;
  onChange: (d: Date) => void;
  /** Keyed by `dayKey`. A missing day means nothing was logged. */
  totals: Map<string, DayTotal>;
  now?: Date;
}) {
  const days = fuelWindow(now);
  const selected = dayKey(day);
  const index = days.findIndex((d) => dayKey(d) === selected);
  const scroller = useRef<ScrollView>(null);

  // Follow the selection however it moved — arrow, chip, or landing on a day
  // that is off-screen because the strip opens scrolled to the end.
  useEffect(() => {
    if (index < 0) return;
    const x = Math.max(0, index * (CHIP_W + CHIP_GAP) - CHIP_W * 2);
    scroller.current?.scrollTo({ x, animated: true });
  }, [index]);

  const step = (delta: number) => {
    const next = days[index + delta];
    if (next) onChange(next);
  };

  const earlier = canGoEarlier(day, now);
  const later = canGoLater(day, now);

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Pressable
          onPress={() => step(-1)}
          disabled={!earlier}
          hitSlop={10}
          style={[s.arrow, !earlier && s.arrowOff]}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
        >
          <Text style={[s.arrowT, !earlier && s.arrowTOff]}>‹</Text>
        </Pressable>

        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.strip}
          style={s.stripFlex}
        >
          {days.map((d) => {
          const key = dayKey(d);
          const total = totals.get(key);
          const on = key === selected;
          const { weekday, date } = chipLabel(d);
          return (
            <Pressable
              key={key}
              onPress={() => onChange(d)}
              style={[s.chip, on && s.chipOn]}
              accessibilityRole="button"
              accessibilityLabel={describeFuelDay(d, now)}
              accessibilityState={{ selected: on }}
            >
              <Text style={[s.chipDow, on && s.chipOnT]}>{weekday}</Text>
              <Text style={[s.chipDate, on && s.chipOnT]}>{date}</Text>
              <Text style={[s.chipKcal, on && s.chipOnT]}>
                {total ? Math.round(total.calories) : '–'}
              </Text>
            </Pressable>
          );
        })}
        </ScrollView>

        <Pressable
          onPress={() => step(1)}
          disabled={!later}
          hitSlop={10}
          style={[s.arrow, !later && s.arrowOff]}
          accessibilityRole="button"
          accessibilityLabel="Next day"
        >
          <Text style={[s.arrowT, !later && s.arrowTOff]}>›</Text>
        </Pressable>
      </View>

      {later ? (
        <Pressable onPress={() => onChange(days[days.length - 1])} hitSlop={8}>
          <Text style={s.today}>Back to today</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stripFlex: { flex: 1 },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  arrowOff: { opacity: 0.35 },
  arrowT: { color: colors.text, fontSize: 20, lineHeight: 22 },
  arrowTOff: { color: colors.textDim },
  strip: { gap: CHIP_GAP, paddingVertical: 2 },
  chip: {
    width: CHIP_W,
    paddingVertical: 7,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.track },
  chipDow: { fontSize: 9, color: colors.textDim, fontFamily: fonts.body, letterSpacing: 0.5 },
  chipDate: { fontSize: 15, color: colors.textMuted, fontFamily: fonts.bodySemi, marginTop: 1 },
  chipKcal: { fontSize: 9.5, color: colors.textDim, fontFamily: fonts.body, marginTop: 2 },
  chipOnT: { color: colors.text },

  today: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 12.5,
    textDecorationLine: 'underline',
    fontFamily: fonts.body,
    alignSelf: 'flex-end',
  },
});
