import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DateField } from '@/components/DateField';
import { Label, Note, Screen } from '@/components/ui';
import { deleteInjury, getInjury, saveInjury, setInjuryResolved } from '@/db/injury-queries';
import { INJURY_SEVERITIES, type Injury, type InjurySeverity } from '@/db/schema';
import { fromIsoDate, toIsoDate } from '@/lib/birthday';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

/** Add or edit one pain & injury entry. */
export default function InjuryEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [existing, setExisting] = useState<Injury | null>(null);
  const [area, setArea] = useState('');
  const [severity, setSeverity] = useState<InjurySeverity>('mild');
  const [notes, setNotes] = useState('');
  const [avoid, setAvoid] = useState('');
  const [started, setStarted] = useState<string | null>(toIsoDate(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void getInjury(id).then((i) => {
      if (!i) return setError('That entry no longer exists.');
      setExisting(i);
      setArea(i.area);
      setSeverity(i.severity);
      setNotes(i.notes ?? '');
      setAvoid(i.avoid ?? '');
      setStarted(toIsoDate(i.startedAt));
    });
  }, [id]);

  const run = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(() =>
      saveInjury(existing?.id ?? null, {
        area,
        severity,
        notes,
        avoid,
        startedAt: fromIsoDate(started) ?? new Date(),
      })
    );

  const remove = () =>
    Alert.alert('Delete this entry?', 'It is removed completely, not marked resolved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run(() => deleteInjury(existing!.id)) },
    ]);

  return (
    <Screen section={existing ? 'Edit entry' : 'New entry'} back>
      <Label>WHERE</Label>
      <TextInput
        style={s.input}
        value={area}
        onChangeText={setArea}
        placeholder="Left shoulder"
        placeholderTextColor={colors.textDim}
      />

      <Label>HOW BAD</Label>
      <View style={s.seg}>
        {INJURY_SEVERITIES.map((sev) => (
          <Pressable key={sev} style={[s.segBtn, severity === sev && s.segOn]} onPress={() => setSeverity(sev)}>
            <Text style={[s.segT, severity === sev && s.segTOn]}>{sev.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      <Label>SINCE</Label>
      <DateField value={started} onChange={setStarted} max={new Date()} min={new Date(2000, 0, 1)} />

      <Label>WHAT MAKES IT WORSE</Label>
      <TextInput
        style={[s.input, s.multi]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Pressing overhead, the bottom of a dip"
        placeholderTextColor={colors.textDim}
        multiline
      />

      <Label>STAYING OFF</Label>
      <TextInput
        style={s.input}
        value={avoid}
        onChangeText={setAvoid}
        placeholder="Overhead press, dips"
        placeholderTextColor={colors.textDim}
      />

      {error ? <Text style={s.err}>{error}</Text> : null}

      <Pressable style={[s.primary, (busy || !area.trim()) && { opacity: 0.5 }]} onPress={() => void save()} disabled={busy || !area.trim()}>
        <Text style={s.primaryT}>{busy ? 'SAVING…' : 'SAVE'}</Text>
      </Pressable>

      {existing ? (
        <>
          <Pressable
            style={s.secondary}
            onPress={() => void run(() => setInjuryResolved(existing.id, existing.resolvedAt == null))}
          >
            <Text style={s.secondaryT}>{existing.resolvedAt == null ? 'Mark resolved' : 'It is back — mark active'}</Text>
          </Pressable>
          <Pressable style={s.del} onPress={remove}>
            <Text style={s.delT}>Delete entry</Text>
          </Pressable>
        </>
      ) : null}

      <View style={{ height: 10 }} />
      <Note>Your words, kept on this phone. The coach sees active entries unless you turn that off.</Note>
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 16,
      fontFamily: fonts.body,
    },
    multi: { minHeight: 70, textAlignVertical: 'top' },
    seg: { flexDirection: 'row', gap: 6 },
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
    err: { color: colors.danger, marginTop: 12, fontFamily: fonts.body },
    primary: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
    primaryT: { fontFamily: fonts.pixel, fontSize: 10, color: colors.onAccent, letterSpacing: 1 },
    secondary: {
      marginTop: 10,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
    },
    secondaryT: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 13 },
    del: { paddingVertical: 14, alignSelf: 'center' },
    delT: { color: colors.danger, fontFamily: fonts.bodySemi, fontSize: 13 },
  })
);
