import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BigStepper } from '@/components/BigStepper';
import { ToggleRow } from '@/components/ToggleRow';
import { Label, Note, Screen } from '@/components/ui';
import {
  REST_MAX_SECONDS,
  REST_MIN_SECONDS,
  getRestPrefs,
  updateRestPrefs,
  type RestPrefs,
} from '@/db/rest-settings';
import { REST_SOUNDS } from '@/lib/rest-sounds';
import { testRestAlert } from '@/lib/rest-timer-notifications';
import { colors, fonts, radius, themedStyles } from '@/lib/theme';

/** Train → Rest timer, from prototype/app-shell.html `train:timer`. */
export default function RestTimerSettingsScreen() {
  const [prefs, setPrefs] = useState<RestPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testNote, setTestNote] = useState<string | null>(null);

  useEffect(() => {
    void getRestPrefs()
      .then(setPrefs)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const patch = async (p: Partial<RestPrefs>) => {
    if (!prefs) return;
    setPrefs({ ...prefs, ...p });
    try {
      setPrefs(await updateRestPrefs(p));
      setError(null);
    } catch (e) {
      setError(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
      setPrefs(prefs);
    }
  };

  if (!prefs) {
    return (
      <Screen section="Rest timer" back>
        {error ? <Note>{error}</Note> : <ActivityIndicator color={colors.accent} />}
      </Screen>
    );
  }

  const mins = Math.floor(prefs.defaultSeconds / 60);
  const secs = prefs.defaultSeconds % 60;

  return (
    <Screen section="Rest timer" back>
      <Label>DEFAULT LENGTH</Label>
      <BigStepper
        value={prefs.defaultSeconds}
        label="SECONDS"
        step={15}
        min={REST_MIN_SECONDS}
        onChange={(v) => void patch({ defaultSeconds: Math.min(REST_MAX_SECONDS, v) })}
      />
      <Text style={s.help}>
        {mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`} · 15-second steps. Used
        for exercises added during a workout and new rows in the builder — a routine&apos;s own rest
        still wins.
      </Text>

      <Label>ALERT</Label>
      <ToggleRow
        name="Lock-screen notification"
        sub="Fires with the phone in your pocket. Off means the countdown only shows in the app."
        value={prefs.lockScreen}
        onChange={(v) => void patch({ lockScreen: v })}
      />
      <Text style={[s.sub, !prefs.lockScreen && { opacity: 0.5 }]}>SOUND</Text>
      <View style={[s.sounds, !prefs.lockScreen && { opacity: 0.5 }]}>
        {REST_SOUNDS.map((snd) => (
          <Pressable
            key={snd.id}
            disabled={!prefs.lockScreen}
            style={[s.chip, prefs.sound === snd.id && s.chipOn]}
            onPress={() => void patch({ sound: snd.id })}
          >
            <Text style={[s.chipT, prefs.sound === snd.id && s.chipTOn]}>{snd.label}</Text>
          </Pressable>
        ))}
      </View>
      <ToggleRow
        name="Vibration"
        value={prefs.vibrate}
        disabled={!prefs.lockScreen}
        onChange={(v) => void patch({ vibrate: v })}
      />
      <Pressable
        style={[s.test, !prefs.lockScreen && { opacity: 0.5 }]}
        disabled={!prefs.lockScreen}
        onPress={() => {
          setTestNote('Playing in two seconds…');
          void testRestAlert(prefs.sound, prefs.vibrate)
            .then((msg) => setTestNote(msg ?? 'Sent — that is your end-of-rest alert.'))
            .catch((e) => setTestNote(`Could not play it: ${e instanceof Error ? e.message : String(e)}`));
        }}
      >
        <Text style={s.testT}>Test the alert</Text>
      </Pressable>
      {testNote ? <Text style={s.help}>{testNote}</Text> : null}
      {error ? <Text style={s.err}>{error}</Text> : null}
      <View style={{ height: 6 }} />
      <Note>
        Sound follows the phone&apos;s notification volume. Silent or Do Not Disturb can still mute
        it.
      </Note>
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    help: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, textAlign: 'center', fontFamily: fonts.body },
    err: { color: colors.danger, fontSize: 13, marginTop: 6, fontFamily: fonts.body },
    sub: { fontFamily: fonts.pixel, fontSize: 8, color: colors.textDim, letterSpacing: 1.5, marginTop: 6, marginBottom: 8 },
    sounds: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipT: { color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 13 },
    chipTOn: { color: colors.onAccent },
    test: {
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      marginTop: 4,
      marginBottom: 8,
    },
    testT: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 13 },
  })
);
