import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

/** `.mrow` with a switch — the prototype's `tgl` rows. */
export function ToggleRow({
  name,
  sub,
  value,
  onChange,
  disabled,
}: {
  name: string;
  sub?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[s.row, disabled && { opacity: 0.5 }]}
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.n}>{name}</Text>
        {sub ? <Text style={s.s}>{sub}</Text> : null}
      </View>
      <View style={[s.sw, value && s.swOn]}>
        <View style={[s.knob, value && s.knobOn]} />
      </View>
    </Pressable>
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
    n: { fontSize: 15, fontFamily: fonts.bodySemi, color: colors.text },
    s: { fontSize: 12.5, color: colors.textDim, marginTop: 4, lineHeight: 18, fontFamily: fonts.body },
    sw: {
      width: 46,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.track,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      padding: 2,
    },
    swOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textMuted },
    knobOn: { backgroundColor: colors.onAccent, alignSelf: 'flex-end' },
  })
);
