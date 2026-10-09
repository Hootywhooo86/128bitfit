import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SportPicker } from '@/components/SportPicker';
import { Label, MenuRow, Note, Screen } from '@/components/ui';
import { saveManualCardio } from '@/db/cardio-queries';
import { getCardioSettings, setLastSport } from '@/db/map-settings';
import { mirrorWorkout } from '@/lib/health/mirror';
import { METRES_PER, sportById, type DistanceUnit } from '@/lib/cardio';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

/**
 * Log a treadmill run or an indoor ride by hand: time and, if the machine
 * showed one, distance. No route, so no map — and no pretend one.
 */
export default function ManualCardioScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sport?: string }>();
  const [sport, setSport] = useState(sportById(params.sport ?? 'treadmill'));
  const [picking, setPicking] = useState(false);
  const [unit, setUnit] = useState<DistanceUnit>('km');
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getCardioSettings().then((c) => setUnit(c.distanceUnit));
  }, []);

  const mins = Number(minutes.replace(',', '.'));
  const dist = distance.trim() ? Number(distance.replace(',', '.')) : null;
  const validMins = Number.isFinite(mins) && mins > 0 && mins <= 24 * 60;
  const validDist = dist == null || (Number.isFinite(dist) && dist > 0 && dist < 1000);

  const save = async () => {
    if (!validMins) {
      Alert.alert('How long was it?', 'Enter the minutes, e.g. 30.');
      return;
    }
    if (!validDist) {
      Alert.alert('That distance does not look right', `Enter it in ${unit}, or leave it empty.`);
      return;
    }
    setSaving(true);
    try {
      const durationS = Math.round(mins * 60);
      const endedAt = Date.now();
      const startedAt = endedAt - durationS * 1000;
      const id = await saveManualCardio({
        sport: sport.id,
        startedAt,
        durationS,
        distanceM: dist == null ? null : dist * METRES_PER[unit],
      });
      await setLastSport(sport.id);
      mirrorWorkout({
        id,
        startedAt,
        endedAt,
        title: sport.label,
        exerciseType: sport.healthType,
      });
      router.replace({ pathname: '/cardio/[id]', params: { id, fresh: '1' } });
    } catch (e) {
      Alert.alert('Could not save it', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen section="Log cardio" back>
      <Label>SPORT</Label>
      <MenuRow icon={sport.badge} name={sport.label} sub="Tap to change" onPress={() => setPicking(true)} />
      {sport.gps ? (
        <Note>This sport can record a route with GPS. Logging it here saves the time and distance only.</Note>
      ) : null}

      <Label>TIME</Label>
      <View style={s.field}>
        <TextInput
          style={s.input}
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="decimal-pad"
          placeholder="30"
          placeholderTextColor={colors.textDim}
        />
        <Text style={s.unit}>minutes</Text>
      </View>

      <Label>DISTANCE (OPTIONAL)</Label>
      <View style={s.field}>
        <TextInput
          style={s.input}
          value={distance}
          onChangeText={setDistance}
          keyboardType="decimal-pad"
          placeholder="Leave empty if you don't know"
          placeholderTextColor={colors.textDim}
        />
        <Text style={s.unit}>{unit}</Text>
      </View>

      <Pressable style={[s.save, (saving || !validMins) && { opacity: 0.5 }]} onPress={() => void save()} disabled={saving}>
        <Text style={s.saveT}>{saving ? 'SAVING…' : 'SAVE'}</Text>
      </Pressable>

      <SportPicker
        visible={picking}
        selected={sport.id}
        onClose={() => setPicking(false)}
        onPick={(sp) => {
          setPicking(false);
          setSport(sp);
        }}
      />
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    input: { flex: 1, color: colors.text, fontSize: 18, paddingVertical: 12, fontFamily: fonts.body },
    unit: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.body },
    save: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginTop: spacing.md },
    saveT: { fontFamily: fonts.pixel, fontSize: 8, color: colors.onAccent, letterSpacing: 0.7 },
  })
);
