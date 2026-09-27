import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BigStepper } from '@/components/BigStepper';
import { Note, Screen } from '@/components/ui';
import { getAppSettings, type WeightUnit } from '@/db/settings-queries';
import { STEP, warmupSets } from '@/lib/plates';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

/** Train → Warm-up sets, from prototype/app-shell.html `train:warmup`. */
export default function WarmupScreen() {
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const [working, setWorking] = useState(185);

  useEffect(() => {
    void getAppSettings().then((a) => {
      setUnit(a.units);
      if (a.units === 'kg') setWorking(100);
    });
  }, []);

  return (
    <Screen section="Warm-up sets" back>
      <BigStepper value={working} label="WORKING WEIGHT" step={STEP[unit]} min={STEP[unit]} onChange={setWorking} />
      {warmupSets(working, unit).map((w, i) => (
        <View key={i} style={s.row}>
          <Text style={s.ic}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.n}>
              {w.weight} {unit} × {w.reps === 'work' ? 'working sets' : w.reps}
            </Text>
            <Text style={s.sub}>
              {Math.round(w.pct * 100)}% of working weight{w.reps === 'work' ? '' : ' · rest 60s'}
            </Text>
          </View>
          {w.reps === 'work' ? <Text style={s.go}>GO</Text> : null}
        </View>
      ))}
      <View style={{ height: spacing.sm }} />
      <Note>
        Four ramps, roughly 40 / 60 / 75 / 87%. Enough to prime the movement without eating into the
        sets that matter. Never lighter than the empty bar.
      </Note>
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingVertical: 15,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    ic: { width: 26, textAlign: 'center', fontSize: 15, color: colors.textMuted, fontFamily: fonts.bodySemi },
    n: { fontSize: 15, fontFamily: fonts.bodySemi, color: colors.text },
    sub: { fontSize: 12.5, color: colors.textDim, marginTop: 4, fontFamily: fonts.body },
    go: { color: colors.accent, fontFamily: fonts.pixel, fontSize: 9, letterSpacing: 1 },
  })
);
