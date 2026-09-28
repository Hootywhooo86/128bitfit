import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card, CardHead, Stat3 } from '@/components/ui';
import { formatDistance, type DistanceUnit } from '@/lib/cardio';
import { isEmptyWeek, type WeekTotals, type WeeklyRecap } from '@/lib/weekly-recap';
import { colors, fonts, themedStyles } from '@/lib/theme';

function formatVolume(v: number): string {
  return v >= 10_000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toLocaleString();
}

function describe(t: WeekTotals, weightUnit: string, distanceUnit: DistanceUnit): string {
  const parts = [`${t.workouts} workout${t.workouts === 1 ? '' : 's'}`];
  if (t.volume != null) parts.push(`${formatVolume(t.volume)} ${weightUnit}`);
  if (t.cardioSessions > 0) parts.push(`${formatDistance(t.cardioM, distanceUnit)} ${distanceUnit} cardio`);
  return parts.join(' · ');
}

/**
 * Monday to now, from what was logged. Nothing at all for a brand-new user —
 * Home's one job then is the next step, not a card of dashes.
 */
export function WeeklyRecapCard({
  recap,
  weightUnit,
  distanceUnit,
}: {
  recap: WeeklyRecap | null;
  weightUnit: 'kg' | 'lb';
  distanceUnit: DistanceUnit;
}) {
  if (!recap) return null;
  const { thisWeek: t, lastWeek } = recap;
  if (isEmptyWeek(t) && !lastWeek) return null;

  const since = recap.weekStart.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Card>
      <CardHead title="WEEK SO FAR" note={`since ${since}`} />
      {isEmptyWeek(t) ? (
        <Text style={s.line}>Nothing logged since Monday yet.</Text>
      ) : (
        <>
          <Stat3
            items={[
              { value: String(t.workouts), label: 'WORKOUTS' },
              { value: t.volume != null ? formatVolume(t.volume) : null, label: `${weightUnit.toUpperCase()} LIFTED` },
              {
                value: t.cardioSessions > 0 ? formatDistance(t.cardioM, distanceUnit) : null,
                label: `${distanceUnit.toUpperCase()} CARDIO`,
              },
            ]}
          />
          {t.foodDays > 0 && t.proteinDays != null ? (
            <Text style={s.line}>
              Protein target hit on {t.proteinDays} of the {t.foodDays} day{t.foodDays === 1 ? '' : 's'} you logged food.
            </Text>
          ) : null}
        </>
      )}
      {lastWeek ? <Text style={s.dim}>Last week: {describe(lastWeek, weightUnit, distanceUnit)}</Text> : null}
    </Card>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    line: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, fontFamily: fonts.body, marginTop: 10 },
    dim: { color: colors.textDim, fontSize: 12, lineHeight: 17, fontFamily: fonts.body, marginTop: 8 },
  })
);
