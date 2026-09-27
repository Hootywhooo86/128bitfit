import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Label, Note, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { getAverageNutrition, getDayNutrition } from '@/db/nutrition-queries';
import {
  NUTRIENT_GROUPS,
  formatNutrient,
  nutrientLevel,
  percentOfDv,
  type DayNutrients,
  type NutrientLevel,
} from '@/lib/micronutrients';
import { describeFuelDay, parseDayKey } from '@/lib/fuel-day';
import { colors, fonts, muscleHeat, spacing, themedStyles } from '@/lib/theme';

type Window = 'day' | 'week' | 'month';
/**
 * The day button is labelled with the day it is actually showing. Reached from
 * a past day in Fuel it would otherwise say TODAY over last Tuesday's iron.
 *
 * The averages are always the last 7 and 30 days ending now, whichever day is
 * selected — an average that slid backwards with the day picker would be a
 * different statistic wearing the same label.
 */
const windowsFor = (dayLabel: string): { id: Window; label: string }[] => [
  { id: 'day', label: dayLabel.toUpperCase() },
  { id: 'week', label: '7-DAY AVG' },
  { id: 'month', label: '30-DAY AVG' },
];

/**
 * Everything today, not just the three big numbers.
 *
 * The honest part is what it refuses to show. A nutrient nothing recorded is
 * a dash, never a zero and never 0% — "you ate no iron" and "nobody measured
 * iron" are different facts, and only one of them is worth acting on.
 */
export default function DetailedNutritionScreen() {
  const { ready } = useDb();
  const params = useLocalSearchParams<{ day?: string }>();
  // A fresh Date per render would make `load` a new function every time and
  // re-query in a loop, so the fallback is pinned for the life of the screen.
  const day = useMemo(() => parseDayKey(params.day) ?? new Date(), [params.day]);
  const dayLabel = describeFuelDay(day);
  // "on yesterday" is not English; "on Mon 22 Sep" is.
  const whenPhrase =
    dayLabel === 'Today' ? 'today yet' : dayLabel === 'Yesterday' ? 'yesterday' : `on ${dayLabel}`;
  const [view, setView] = useState<Window>('day');
  const [data, setData] = useState<DayNutrients | null>(null);
  const [daysWithFood, setDaysWithFood] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      if (view === 'day') {
        setData(await getDayNutrition(day));
        setDaysWithFood(null);
      } else {
        const avg = await getAverageNutrition(view === 'week' ? 7 : 30);
        setData(avg);
        setDaysWithFood(avg.daysWithFood);
      }
    } finally {
      setLoading(false);
    }
  }, [ready, view, day]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen section="Detailed nutrition" back onRefresh={() => void load()}>
      <View style={s.seg}>
        {windowsFor(dayLabel).map((v) => (
          <Pressable
            key={v.id}
            style={[s.segBtn, view === v.id && s.segOn]}
            onPress={() => setView(v.id)}
          >
            <Text style={[s.segT, view === v.id && s.segTOn]}>{v.label}</Text>
          </Pressable>
        ))}
      </View>

      {!ready || loading || !data ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : data.itemCount === 0 ? (
        <Note>
          {view === 'day'
            ? `Nothing logged ${whenPhrase}. Log a meal and the full breakdown appears here.`
            : `Nothing logged in the last ${view === 'week' ? 7 : 30} days.`}
        </Note>
      ) : (
        <>
          {daysWithFood != null ? (
            <Note>
              Averaged over the {daysWithFood} day{daysWithFood === 1 ? '' : 's'} you logged food,
              not the whole window — a day with nothing logged is a day with no data, not a day of
              fasting.
            </Note>
          ) : null}

          {data.itemsWithoutData > 0 ? (
            <Note>
              {data.itemsWithoutData} of {data.itemCount} item
              {data.itemCount === 1 ? '' : 's'} came from a description or a photo rather than the
              food database, so {data.itemsWithoutData === 1 ? 'it carries' : 'they carry'} calories
              and macros but no vitamins or minerals. Everything below is a floor, not a total.
            </Note>
          ) : null}

          {NUTRIENT_GROUPS.map((group) => (
            <React.Fragment key={group.group}>
              <Label>{group.group}</Label>
              <Card>
                {group.rows.map((row) => {
                  const t = data.totals.get(row.key);
                  const value = t?.value ?? null;
                  const pct = percentOfDv(value, row.dv);
                  const level = nutrientLevel(value, row.dv);
                  return (
                    <View key={row.key} style={s.row}>
                      <View style={s.rowHead}>
                        <Text style={s.rowName}>
                          {row.label}
                          {t?.partial ? ' *' : ''}
                        </Text>
                        <Text style={[s.rowVal, levelText[level]]}>
                          {formatNutrient(value, row.unit)}
                          <Text style={s.rowPct}>{pct == null ? '' : ` · ${pct}%`}</Text>
                        </Text>
                      </View>
                      <View style={s.track}>
                        {pct == null ? null : (
                          <View
                            style={[s.fill, { width: `${Math.min(100, pct)}%` }, levelFill[level]]}
                          />
                        )}
                      </View>
                    </View>
                  );
                })}
              </Card>
            </React.Fragment>
          ))}

          <Note>
            A dash means nothing recorded it, not that you had none of it. A star means only some of
            what you logged carried that nutrient, so the figure is a floor.
          </Note>
          <Note>
            Percentages are against general adult reference intakes (FDA Daily Values), not a
            prescription and not adjusted for your body or training. Whole foods from USDA carry
            micronutrients; most barcoded products do not.
          </Note>
        </>
      )}
    </Screen>
  );
}

const levelText: Record<NutrientLevel, { color: string }> = {
  unknown: { color: colors.textDim },
  low: { color: muscleHeat.light },
  ok: { color: colors.text },
  high: { color: muscleHeat.medium },
};

const levelFill = themedStyles((): Record<NutrientLevel, { backgroundColor: string }> => ({
  unknown: { backgroundColor: colors.border },
  low: { backgroundColor: muscleHeat.light },
  ok: { backgroundColor: colors.accent },
  high: { backgroundColor: muscleHeat.medium },
}));

const s = themedStyles(() => StyleSheet.create({
  center: { paddingVertical: 60, alignItems: 'center' },
  seg: { flexDirection: 'row', gap: 6, marginBottom: spacing.sm },
  segBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  segOn: { borderColor: colors.accent, backgroundColor: colors.track },
  segT: { color: colors.textMuted, fontSize: 10.5, fontFamily: fonts.bodySemi, letterSpacing: 0.4 },
  segTOn: { color: colors.text },
  row: { marginBottom: 13 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  rowName: { color: colors.textMuted, fontSize: 13.5, fontFamily: fonts.body },
  rowVal: { fontSize: 13.5, fontFamily: fonts.bodySemi },
  rowPct: { color: colors.textDim, fontFamily: fonts.body },
  track: { height: 6, backgroundColor: colors.track, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
}));
