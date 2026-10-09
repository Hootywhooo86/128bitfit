import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ColorSlider } from '@/components/ColorSlider';
import { Bar, Card, Label, Note, Screen, SessionCard } from '@/components/ui';
import { getCustomAccent, saveAccent } from '@/db/accent-settings';
import { ACCENTS, accentProblem, hexToHsv, hsvToHex, isPreset, onAccentFor, parseHex, useAccent } from '@/lib/accent';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

/**
 * Settings → Theme colour, from prototype/app-shell.html `settings:theme`.
 *
 * Every colour is free. The prototype locked eleven of them behind a
 * subscription; the accent shipped free, and CLAUDE.md says nothing free
 * becomes paid later. That includes CUSTOM: any colour by its code, or by
 * dragging, except red (kept for load and over-target) and anything too dark
 * to read on black — lib/accent.ts says why in one sentence each.
 */
export default function ThemeScreen() {
  const accent = useAccent();
  const [error, setError] = useState<string | null>(null);
  const [seg, setSeg] = useState(0);
  const [custom, setCustom] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv('#7af0c3'));
  const [code, setCode] = useState('#7af0c3');

  useEffect(() => {
    void getCustomAccent().then((c) => {
      const start = c ?? (isPreset(accent) ? null : accent);
      setCustom(start);
      if (start) {
        setHsv(hexToHsv(start));
        setCode(start);
      }
    });
    // Once, on open: later changes come from this screen itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draft = parseHex(code);
  const problem = draft ? accentProblem(draft) : null;
  const customOn = !isPreset(accent);

  const fromSliders = (next: { h: number; s: number; v: number }) => {
    setHsv(next);
    setCode(hsvToHex(next.h, next.s, next.v));
  };
  const fromCode = (text: string) => {
    setCode(text);
    const hex = parseHex(text);
    if (hex) setHsv(hexToHsv(hex));
  };
  const saveCustom = async () => {
    if (!draft || problem) return;
    await pick(draft);
    setCustom(draft);
    setPicking(false);
  };

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
        <Pressable
          style={[s.swatch, (customOn || picking) && s.swatchOn]}
          onPress={() => setPicking((p) => !p)}
          accessibilityRole="button"
          accessibilityLabel="Custom colour"
          accessibilityState={{ selected: customOn, expanded: picking }}
        >
          <View style={[s.dot, custom ? { backgroundColor: custom } : s.dotEmpty]}>
            {custom ? null : <Text style={s.plus}>+</Text>}
          </View>
          <Text style={[s.name, customOn && s.nameOn]}>CUSTOM</Text>
        </Pressable>
      </View>
      {error ? <Text style={s.err}>{error}</Text> : null}

      {picking ? (
        <Card>
          <Text style={s.pickTitle}>Any colour, by its code or by dragging</Text>
          <View style={s.codeRow}>
            <View style={[s.bigDot, { backgroundColor: draft ?? colors.surfaceAlt }]} />
            <TextInput
              style={s.code}
              value={code}
              onChangeText={fromCode}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={7}
              placeholder="#7af0c3"
              placeholderTextColor={colors.textDim}
              accessibilityLabel="Colour code"
            />
          </View>
          <Text style={s.sliderLabel}>COLOUR</Text>
          <ColorSlider
            label="Colour"
            value={hsv.h / 360}
            stops={['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000']}
            onChange={(v) => fromSliders({ ...hsv, h: Math.min(359.9, v * 360) })}
          />
          <Text style={s.sliderLabel}>STRENGTH</Text>
          <ColorSlider
            label="Strength"
            value={hsv.s}
            stops={[hsvToHex(hsv.h, 0, hsv.v), hsvToHex(hsv.h, 1, hsv.v)]}
            onChange={(v) => fromSliders({ ...hsv, s: v })}
          />
          <Text style={s.sliderLabel}>BRIGHTNESS</Text>
          <ColorSlider
            label="Brightness"
            value={hsv.v}
            stops={['#000000', hsvToHex(hsv.h, hsv.s, 1)]}
            onChange={(v) => fromSliders({ ...hsv, v })}
          />

          {/* What the colour will look like, before saving it. */}
          {draft && !problem ? (
            <View style={[s.previewBtn, { backgroundColor: draft }]}>
              <Text style={[s.previewBtnT, { color: onAccentFor(draft) }]}>START WORKOUT</Text>
            </View>
          ) : null}
          {!draft ? (
            <Text style={s.err}>That is not a colour code. Use six digits like #7af0c3.</Text>
          ) : problem ? (
            <Text style={s.err}>{problem}</Text>
          ) : null}

          <Pressable
            style={[s.save, (!draft || !!problem) && { opacity: 0.4 }]}
            onPress={() => void saveCustom()}
            disabled={!draft || !!problem}
          >
            <Text style={s.saveT}>Use this colour</Text>
          </Pressable>
        </Card>
      ) : null}

      <Label>PREVIEW</Label>
      {/* A picture of a card, not a button: taps pass through rather than
          landing on a "START WORKOUT" that does nothing. */}
      <View pointerEvents="none">
        <SessionCard
          title="PUSH DAY A"
          sub="Preview: this is what the accent looks like on a primary card"
          action="START WORKOUT"
          onPress={() => undefined}
        />
      </View>
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
    name: { fontFamily: fonts.pixel, fontSize: 6, letterSpacing: 0.7, color: colors.textMuted },
    nameOn: { color: colors.text },
    dotEmpty: { borderWidth: 1, borderColor: colors.borderBright, alignItems: 'center', justifyContent: 'center' },
    plus: { color: colors.textMuted, fontSize: 16, lineHeight: 18, fontFamily: fonts.bodySemi },
    pickTitle: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 14, marginBottom: spacing.sm },
    codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.sm },
    bigDot: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    code: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.bodySemi,
      fontSize: 18,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surfaceAlt,
    },
    sliderLabel: { fontFamily: fonts.pixel, fontSize: 6, letterSpacing: 0.7, color: colors.textMuted, marginTop: 6 },
    previewBtn: { marginTop: spacing.md, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
    previewBtnT: { fontFamily: fonts.pixel, fontSize: 7, letterSpacing: 1.4 },
    save: {
      marginTop: spacing.md,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.borderBright,
    },
    saveT: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 15 },
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
    segT: { fontFamily: fonts.pixel, fontSize: 6, letterSpacing: 0.7, color: colors.textMuted },
    segTOn: { color: colors.onAccent },
  })
);
