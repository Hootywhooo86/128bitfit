import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, themedStyles } from '@/lib/theme';

/** `.bigstep` from the prototype: − big number + */
export function BigStepper({
  value,
  label,
  step,
  min = 0,
  onChange,
}: {
  value: number;
  label: string;
  step: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  const fmt = Number.isInteger(value) ? String(value) : value.toFixed(value * 10 === Math.round(value * 10) ? 1 : 2);
  return (
    <View style={s.row}>
      <Pressable
        style={({ pressed }) => [s.btn, pressed && s.btnOn]}
        onPress={() => onChange(Math.max(min, value - step))}
        accessibilityLabel={`Minus ${step}`}
      >
        {({ pressed }) => <Text style={[s.btnT, pressed && s.btnTOn]}>−</Text>}
      </Pressable>
      <View style={s.val}>
        <Text style={s.num}>{fmt}</Text>
        <Text style={s.lbl}>{label}</Text>
      </View>
      <Pressable
        style={({ pressed }) => [s.btn, pressed && s.btnOn]}
        onPress={() => onChange(value + step)}
        accessibilityLabel={`Plus ${step}`}
      >
        {({ pressed }) => <Text style={[s.btnT, pressed && s.btnTOn]}>+</Text>}
      </Pressable>
    </View>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    btn: {
      width: 64,
      height: 64,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    btnT: { color: colors.text, fontSize: 28, lineHeight: 32 },
    btnTOn: { color: colors.onAccent },
    val: { flex: 1, alignItems: 'center' },
    num: { color: colors.text, fontSize: 40, fontFamily: fonts.bodyBold, letterSpacing: -1.5 },
    lbl: { fontFamily: fonts.pixel, fontSize: 8, color: colors.textDim, letterSpacing: 1.5, marginTop: 2 },
  })
);
