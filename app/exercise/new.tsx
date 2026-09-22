import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Card, Label, Note, Screen } from '@/components/ui';
import { createCustomExercise } from '@/db/workout-queries';
import { identifyEquipment } from '@/lib/ai-exercise-client';
import { MUSCLE_GROUPS, MUSCLE_LABELS, type MuscleGroup } from '@/lib/muscle-load';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * Add an exercise, optionally by photographing the machine.
 *
 * The AI fills the form in; it does not save anything. A model looking at an
 * unfamiliar machine can be confidently wrong, and a wrongly-tagged exercise
 * would colour the muscle map with training that never happened — so every
 * field stays editable and the muscles are chips the user can toggle.
 */
export default function NewExerciseScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [identified, setIdentified] = useState(false);
  const [camOpen, setCamOpen] = useState(false);

  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState('');
  const [instructions, setInstructions] = useState('');
  const [primary, setPrimary] = useState<MuscleGroup[]>([]);
  const [secondary, setSecondary] = useState<MuscleGroup[]>([]);

  const identify = async () => {
    if (busy || !camera.current) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setUnmapped([]);
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.6, base64: true });
      if (!shot?.base64) {
        setError('The camera did not return a photo. Try again.');
        return;
      }
      const out = await identifyEquipment(shot.base64);
      if (out.status !== 'ok') {
        setError(out.message);
        return;
      }
      const e = out.exercise;
      setName(e.name);
      setEquipment(e.equipment ?? '');
      setInstructions(e.instructions.join('\n'));
      setPrimary(e.primaryMuscles);
      setSecondary(e.secondaryMuscles);
      setNote(e.note);
      setUnmapped(e.unmapped);
      setIdentified(true);
      setCamOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that photo.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (m: MuscleGroup, which: 'p' | 's') => {
    if (which === 'p') {
      setPrimary((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
      setSecondary((prev) => prev.filter((x) => x !== m));
    } else {
      setSecondary((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
      setPrimary((prev) => prev.filter((x) => x !== m));
    }
  };

  const save = async () => {
    if (busy) return;
    if (!name.trim()) {
      Alert.alert('Name needed', 'Give the exercise a name before saving it.');
      return;
    }
    setBusy(true);
    try {
      await createCustomExercise({
        name,
        equipment: equipment.trim() || null,
        primaryMuscles: primary,
        secondaryMuscles: secondary,
        instructions: instructions
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      });
      router.replace('/exercise');
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen section="New exercise" back>
      {!identified ? (
        <>
          <Label>IDENTIFY FROM A PHOTO</Label>
          <Note>
            Point the camera at the machine and the AI fills this form in — what it is, the muscles
            it works, and how to use it. Check it before saving: it is an identification, not a
            fact, and a wrongly tagged exercise colours the wrong muscles.
          </Note>
          <View style={{ height: spacing.md }} />

          {!camOpen ? (
            <Pressable style={s.primary} onPress={() => setCamOpen(true)}>
              <Text style={s.primaryT}>PHOTOGRAPH EQUIPMENT</Text>
            </Pressable>
          ) : !permission ? (
            <View style={s.center}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : !permission.granted ? (
            <Card>
              <Text style={s.help}>
                Identifying a machine needs the camera. The photo goes to your own AI provider and
                nowhere else.
              </Text>
              <Pressable style={s.primary} onPress={() => void requestPermission()}>
                <Text style={s.primaryT}>ALLOW CAMERA</Text>
              </Pressable>
            </Card>
          ) : (
            <>
              <View style={s.cam}>
                <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
              </View>
              <Pressable
                style={[s.primary, busy && { opacity: 0.5 }]}
                onPress={() => void identify()}
                disabled={busy}
              >
                <Text style={s.primaryT}>{busy ? 'IDENTIFYING…' : 'IDENTIFY'}</Text>
              </Pressable>
            </>
          )}

          <Pressable style={s.secondary} onPress={() => setIdentified(true)}>
            <Text style={s.secondaryT}>Fill it in by hand</Text>
          </Pressable>

          {error ? (
            <Card>
              <Text style={s.err}>{error}</Text>
            </Card>
          ) : null}
        </>
      ) : (
        <>
          {note || unmapped.length > 0 ? (
            <>
              <Label>WHAT THE AI SAID</Label>
              <Card>
                {note ? <Text style={s.help}>{note}</Text> : null}
                {unmapped.length > 0 ? (
                  <Text style={s.help}>
                    It also named {unmapped.join(', ')}, which this app has no muscle group for, so
                    {unmapped.length === 1 ? ' it was' : ' they were'} left off.
                  </Text>
                ) : null}
              </Card>
            </>
          ) : null}

          <Label>EXERCISE</Label>
          <Card>
            <Text style={s.fieldL}>NAME</Text>
            <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Seated Cable Row" placeholderTextColor={colors.textDim} />
            <Text style={s.fieldL}>EQUIPMENT</Text>
            <TextInput style={s.input} value={equipment} onChangeText={setEquipment} placeholder="cable machine" placeholderTextColor={colors.textDim} />
          </Card>

          <Label>TARGETS (RED ON THE MAP)</Label>
          <View style={s.chips}>
            {MUSCLE_GROUPS.map((m) => (
              <Pressable key={m} style={[s.chip, primary.includes(m) && s.chipOn]} onPress={() => toggle(m, 'p')}>
                <Text style={[s.chipT, primary.includes(m) && s.chipTOn]}>{MUSCLE_LABELS[m]}</Text>
              </Pressable>
            ))}
          </View>

          <Label>ASSISTS (YELLOW)</Label>
          <View style={s.chips}>
            {MUSCLE_GROUPS.map((m) => (
              <Pressable key={m} style={[s.chip, secondary.includes(m) && s.chipOn2]} onPress={() => toggle(m, 's')}>
                <Text style={[s.chipT, secondary.includes(m) && s.chipTOn]}>{MUSCLE_LABELS[m]}</Text>
              </Pressable>
            ))}
          </View>

          <Label>HOW TO DO IT</Label>
          <Card>
            <TextInput
              style={[s.input, s.multi]}
              value={instructions}
              onChangeText={setInstructions}
              placeholder={'One step per line'}
              placeholderTextColor={colors.textDim}
              multiline
            />
          </Card>

          <Pressable style={[s.primary, busy && { opacity: 0.5 }]} onPress={() => void save()} disabled={busy}>
            <Text style={s.primaryT}>{busy ? 'SAVING…' : 'SAVE EXERCISE'}</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 40, alignItems: 'center' },
  cam: { height: 320, borderRadius: radius.lg, overflow: 'hidden', marginBottom: 10 },
  help: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 8, fontFamily: fonts.body },
  err: { color: colors.danger, fontSize: 13, lineHeight: 19, fontFamily: fonts.body },
  fieldL: { fontFamily: fonts.pixel, fontSize: 7, color: colors.textDim, letterSpacing: 1, marginBottom: 5 },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginBottom: 12,
    fontFamily: fonts.body,
  },
  multi: { minHeight: 110, textAlignVertical: 'top', marginBottom: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: '#ff4d6d', borderColor: '#ff4d6d' },
  chipOn2: { backgroundColor: '#ffd95e', borderColor: '#ffd95e' },
  chipT: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body },
  chipTOn: { color: '#000', fontFamily: fonts.bodySemi },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  primaryT: { fontFamily: fonts.pixel, fontSize: 10, color: colors.onAccent, letterSpacing: 1 },
  secondary: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryT: { color: colors.text, fontSize: 13, fontFamily: fonts.bodySemi },
});
