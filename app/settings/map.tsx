import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ToggleRow } from '@/components/ToggleRow';
import { Label, Note, Screen } from '@/components/ui';
import {
  getCardioSettings,
  setAutoPause,
  setCardioKeepAwake,
  setDistanceUnit,
  setDotColour,
  setLineColour,
  setMapStyle,
  type CardioSettings,
} from '@/db/map-settings';
import { MAP_ATTRIBUTION, MAP_ROUTE_BLUE, MAP_STYLES, ROUTE_COLOURS, casingFor, type MapStyleId } from '@/lib/map-style';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

/** Settings → Map: how the cardio map looks and behaves. */
export default function MapSettingsScreen() {
  const [cfg, setCfg] = useState<CardioSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getCardioSettings().then(setCfg);
  }, []);

  const save = async (patch: Partial<CardioSettings>, write: () => Promise<void>) => {
    setCfg((c) => (c ? { ...c, ...patch } : c));
    try {
      setError(null);
      await write();
    } catch (e) {
      setError(`Could not save that: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Screen section="Map" back>
      <Label>MAP STYLE</Label>
      <View style={s.styles}>
        {MAP_STYLES.map((m) => {
          const on = cfg?.mapStyle === m.id;
          return (
            <Pressable
              key={m.id}
              style={[s.style, on && s.styleOn]}
              onPress={() => void save({ mapStyle: m.id }, () => setMapStyle(m.id as MapStyleId))}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <View style={[s.swatch, m.id === 'dark' ? s.swDark : s.swLight]}>
                <View style={[s.swRoute, { backgroundColor: cfg?.lineColour ?? MAP_ROUTE_BLUE }]} />
                <View
                  style={[
                    s.swDot,
                    {
                      backgroundColor: cfg?.dotColour ?? MAP_ROUTE_BLUE,
                      borderColor: casingFor(cfg?.dotColour ?? MAP_ROUTE_BLUE),
                    },
                  ]}
                />
              </View>
              <Text style={[s.styleT, on && s.styleTOn]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Note>What the map opens with. The button on the map switches it for one session.</Note>

      <Label>YOUR DOT</Label>
      <Swatches
        value={cfg?.dotColour ?? MAP_ROUTE_BLUE}
        onPick={(hex) => void save({ dotColour: hex }, () => setDotColour(hex))}
      />
      <Label>YOUR LINE</Label>
      <Swatches
        value={cfg?.lineColour ?? MAP_ROUTE_BLUE}
        onPick={(hex) => void save({ lineColour: hex }, () => setLineColour(hex))}
      />

      <Label>RECORDING</Label>
      <ToggleRow
        name="Auto-pause"
        sub="Stopping at a crossing does not count as moving time"
        value={cfg?.autoPause ?? true}
        disabled={!cfg}
        onChange={(v) => void save({ autoPause: v }, () => setAutoPause(v))}
      />
      <ToggleRow
        name="Keep screen on while recording"
        sub="Recording carries on with the screen off either way"
        value={cfg?.keepAwake ?? false}
        disabled={!cfg}
        onChange={(v) => void save({ keepAwake: v }, () => setCardioKeepAwake(v))}
      />

      <Label>DISTANCE</Label>
      <View style={s.units}>
        {(['km', 'mi'] as const).map((u) => {
          const on = cfg?.distanceUnit === u;
          return (
            <Pressable
              key={u}
              style={[s.unit, on && s.styleOn]}
              onPress={() => void save({ distanceUnit: u }, () => setDistanceUnit(u))}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Text style={[s.styleT, on && s.styleTOn]}>{u === 'km' ? 'Kilometres' : 'Miles'}</Text>
              <Text style={s.unitSub}>{u === 'km' ? 'Pace per km · km/h' : 'Pace per mile · mph'}</Text>
            </Pressable>
          );
        })}
      </View>
      <Note>Separate from your weight unit. Changing it re-reads every past session in the new unit.</Note>
      {error ? <Text style={s.err}>{error}</Text> : null}

      <Label>MAP DATA</Label>
      <Note>
        {MAP_ATTRIBUTION}. Free map data, no account or key. Your route is recorded on this phone and never uploaded;
        only the map tiles are downloaded.
      </Note>
    </Screen>
  );
}

/** The route colours, as tappable dots. The ticked one is in use. */
function Swatches({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  return (
    <View style={s.swatches}>
      {ROUTE_COLOURS.map((c) => {
        const on = c.hex.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={c.hex}
            onPress={() => onPick(c.hex)}
            style={[s.swatchBtn, on && s.swatchOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={c.name}
            hitSlop={4}
          >
            <View style={[s.swatchDot, { backgroundColor: c.hex }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    styles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
    style: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 10,
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
    },
    styleOn: { borderColor: colors.accent },
    swatch: { width: '100%', height: 70, borderRadius: 8, overflow: 'hidden', justifyContent: 'center' },
    swDark: { backgroundColor: '#1c1f24' },
    swLight: { backgroundColor: '#eeeae2' },
    swRoute: {
      position: 'absolute',
      left: '15%',
      right: '35%',
      top: '48%',
      height: 4,
      borderRadius: 2,
      backgroundColor: MAP_ROUTE_BLUE,
    },
    swDot: {
      position: 'absolute',
      right: '27%',
      top: '38%',
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: MAP_ROUTE_BLUE,
      borderWidth: 2,
      borderColor: '#ffffff',
    },
    styleT: { color: colors.textMuted, fontFamily: fonts.bodySemi },
    styleTOn: { color: colors.text },
    err: { color: colors.danger, marginTop: 6 },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.sm },
    swatchBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchOn: { borderColor: colors.text },
    swatchDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.borderBright },
    units: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
    unit: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 10,
      alignItems: 'center',
      backgroundColor: colors.surface,
      gap: 4,
    },
    unitSub: { color: colors.textDim, fontSize: 12, fontFamily: fonts.body },
  })
);
