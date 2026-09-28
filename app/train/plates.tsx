import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BigStepper } from '@/components/BigStepper';
import { Card, Note, Screen } from '@/components/ui';
import { getAppSettings, type WeightUnit } from '@/db/settings-queries';
import { BARS, PLATES, STEP, countPlates, platesFor } from '@/lib/plates';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

/**
 * Plate colours from the prototype. They tell plate sizes apart and nothing
 * else — no red, which in this app means over target or heavy load.
 */
const PLATE_COLOUR = ['#5aa9ff', '#ff8552', '#4be0c8', '#a3e635', '#ffcc3d', '#c9c9c9', '#8c8c8c'];
const PLATE_HEIGHT = [78, 70, 60, 44, 34, 24, 20];

/** Train → Plate calculator, from prototype/app-shell.html `train:plates`. */
export default function PlatesScreen() {
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const [target, setTarget] = useState(185);
  const [bar, setBar] = useState(45);
  // Opened from a set in a live workout: start at that set's weight.
  const params = useLocalSearchParams<{ target?: string }>();

  useEffect(() => {
    void getAppSettings().then((a) => {
      setUnit(a.units);
      if (a.units === 'kg') {
        setTarget(100);
        setBar(20);
      }
      const t = Number(params.target);
      if (Number.isFinite(t) && t > 0) setTarget(t);
    });
  }, [params.target]);

  const plates = PLATES[unit];
  const r = platesFor(target, bar, plates);
  const colourOf = (p: number) => PLATE_COLOUR[plates.indexOf(p)] ?? colors.textMuted;
  const heightOf = (p: number) => PLATE_HEIGHT[plates.indexOf(p)] ?? 20;

  return (
    <Screen section="Plate calculator" back>
      <BigStepper value={target} label={`TARGET ${unit.toUpperCase()}`} step={STEP[unit]} onChange={setTarget} />

      <View style={s.seg}>
        {BARS[unit].map((b) => (
          <Pressable key={b} style={[s.segBtn, bar === b && s.segOn]} onPress={() => setBar(b)}>
            <Text style={[s.segT, bar === b && s.segTOn]}>{b ? `${b} BAR` : 'NO BAR'}</Text>
          </Pressable>
        ))}
      </View>

      <Card style={s.viz}>
        <View style={s.barLine} />
        {r.status === 'ok' && r.perSide.length > 0 ? (
          <View style={s.stack}>
            {r.perSide.map((p, i) => (
              <View key={i} style={[s.plate, { height: heightOf(p), backgroundColor: colourOf(p) }]} />
            ))}
          </View>
        ) : (
          <Text style={s.barOnly}>{r.status === 'ok' ? 'Bar only' : ''}</Text>
        )}
      </Card>

      {r.status === 'below-bar' ? (
        <Note>Below the bar weight. Pick a lighter bar or raise the target.</Note>
      ) : (
        <>
          <View style={s.legend}>
            {r.perSide.length === 0 ? (
              <Text style={s.legendEmpty}>No plates needed</Text>
            ) : (
              countPlates(r.perSide).map(({ plate, count }) => (
                <View key={plate} style={s.legendItem}>
                  <Text style={[s.legendN, { color: colourOf(plate) }]}>{count}×</Text>
                  <Text style={s.legendL}>
                    {plate} {unit}
                  </Text>
                </View>
              ))
            )}
          </View>
          <Card style={{ alignItems: 'center' }}>
            <Text style={s.perL}>Per side</Text>
            <Text style={s.per}>
              {r.perSideWeight} {unit}
            </Text>
            <Text style={[s.exact, r.shortPerSide > 0 && s.short]}>
              {r.shortPerSide > 0
                ? `${r.shortPerSide} ${unit} short per side — nearest you can load is ${r.loaded} ${unit}`
                : 'Loads exactly'}
            </Text>
          </Card>
        </>
      )}

      <Note>
        Plates: {plates.join(', ')} {unit}. Change weight units in Settings if your gym runs the
        other system.
      </Note>
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    seg: { flexDirection: 'row', gap: 6, marginBottom: 10 },
    segBtn: {
      flex: 1,
      paddingVertical: 11,
      alignItems: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    segOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    segT: { fontFamily: fonts.pixel, fontSize: 8, letterSpacing: 1, color: colors.textMuted },
    segTOn: { color: colors.onAccent },
    viz: { height: 110, justifyContent: 'center', overflow: 'hidden' },
    barLine: { position: 'absolute', left: 0, right: 0, height: 8, backgroundColor: colors.borderBright, top: 50 },
    stack: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 30 },
    plate: { width: 14, borderRadius: 3 },
    barOnly: { color: colors.textDim, fontSize: 12, marginLeft: 30, fontFamily: fonts.body },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: 10 },
    legendItem: {
      flexGrow: 1,
      minWidth: '28%',
      alignItems: 'center',
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
    },
    legendN: { fontSize: 20, fontFamily: fonts.bodyBold },
    legendL: { fontSize: 11.5, color: colors.textMuted, fontFamily: fonts.body, marginTop: 2 },
    legendEmpty: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 },
    perL: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.body },
    per: { color: colors.text, fontSize: 24, fontFamily: fonts.bodyBold, marginTop: 6 },
    exact: { color: colors.textDim, fontSize: 12.5, marginTop: 8, textAlign: 'center', fontFamily: fonts.body },
    short: { color: colors.textMuted },
  })
);
