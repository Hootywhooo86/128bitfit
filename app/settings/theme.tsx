import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bar, Card, Label, Note, Screen, SessionCard } from '@/components/ui';
import { saveAccent } from '@/db/accent-settings';
import { ACCENTS, useAccent } from '@/lib/accent';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

/**
 * Settings → Theme colour, from prototype/app-shell.html `settings:theme`.
 *
 * Every colour is free. The prototype locked eleven of them behind a
 * subscription; the accent shipped free, and CLAUDE.md says nothing free
 * becomes paid later.
 */
export default function ThemeScreen() {
  const accent = useAccent();
  const [error, setError] = useState<string | null>(null);
  const [seg, setSeg] = useState(0);

  const pick = async (hex: string) => {
    try {
      setError(null);
      await saveAccent(hex);
    } catch (e) {
      setError(`Could not save that colour: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Screen section="Theme colour" back>
      <Text style={s.hero}>One accent colour, used everywhere the app highlights something.</Text>

      <View style={s.swatches}>
        {ACCENTS.map((a) => {
          const on = a.hex === accent;
          return (
            <Pressable
              key={a.hex}
              style={[s.swatch, on && s.swatchOn]}
              onPress={() => void pick(a.hex)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={a.name}
            >
              <View style={[s.dot, { backgroundColor: a.hex }]} />
              <Text style={[s.name, on && s.nameOn]}>{a.name}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={s.err}>{error}</Text> : null}

      <Label>PREVIEW</Label>
      <SessionCard
        title="PUSH DAY A"
        sub="This is what the accent looks like on a primary card"
        action="START WORKOUT"
        onPress={() => undefined}
      />
      <Card>
        <View style={s.seg}>
          {['SELECTED', 'UNSELECTED'].map((t, i) => (
            <Pressable key={t} style={[s.segBtn, seg === i && s.segOn]} onPress={() => setSeg(i)}>
              <Text style={[s.segT, seg === i && s.segTOn]}>{seg === i ? 'SELECTED' : 'UNSELECTED'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ marginTop: spacing.md }}>
          <Bar pct={62} />
        </View>
      </Card>

      <Note>
        The muscle map keeps its own colours — yellow through red always means training load,
        never decoration — and over-target stays red. That stays true whatever accent you pick,
        which is also why there is no red here.
      </Note>
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    hero: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing.md, fontFamily: fonts.body },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    swatch: {
      width: '31.5%',
      flexGrow: 1,
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
    },
    swatchOn: { borderColor: colors.accent },
    dot: { width: 26, height: 26, borderRadius: 13 },
    name: { fontFamily: fonts.pixel, fontSize: 8, letterSpacing: 1, color: colors.textMuted },
    nameOn: { color: colors.text },
    err: { color: colors.danger, marginTop: 10, fontFamily: fonts.body, fontSize: 13 },
    seg: { flexDirection: 'row', gap: 6 },
    segBtn: {
      flex: 1,
      paddingVertical: 11,
      alignItems: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
    },
    segOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    segT: { fontFamily: fonts.pixel, fontSize: 8, letterSpacing: 1, color: colors.textMuted },
    segTOn: { color: colors.onAccent },
  })
);
