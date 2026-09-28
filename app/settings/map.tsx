import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ToggleRow } from '@/components/ToggleRow';
import { Label, MenuRow, Note, Screen } from '@/components/ui';
import { getCardioSettings, setAutoPause, setCardioKeepAwake, setMapStyle, type CardioSettings } from '@/db/map-settings';
import { getAppSettings } from '@/db/settings-queries';
import { MAP_ATTRIBUTION, MAP_ROUTE_BLUE, MAP_STYLES, type MapStyleId } from '@/lib/map-style';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

/** Settings → Map: how the cardio map looks and behaves. */
export default function MapSettingsScreen() {
  const [cfg, setCfg] = useState<CardioSettings | null>(null);
  const [units, setUnits] = useState<'kg' | 'lb'>('lb');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getCardioSettings(), getAppSettings()]).then(([c, a]) => {
      setCfg(c);
      setUnits(a.units);
    });
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
                <View style={s.swRoute} />
                <View style={s.swDot} />
              </View>
              <Text style={[s.styleT, on && s.styleTOn]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Note>What the map opens with. The button on the map switches it for one session.</Note>

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
      <MenuRow
        icon="⇄"
        name="Distance unit"
        sub="Follows your weight unit in Settings"
        value={units === 'lb' ? 'Miles' : 'Kilometres'}
        href="/settings"
      />
      {error ? <Text style={s.err}>{error}</Text> : null}

      <Label>MAP DATA</Label>
      <Note>
        {MAP_ATTRIBUTION}. Free map data, no account or key. Your route is recorded on this phone and never uploaded;
        only the map tiles are downloaded.
      </Note>
    </Screen>
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
  })
);
