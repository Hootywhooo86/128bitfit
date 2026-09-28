import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Card, Label, Note, Screen } from '@/components/ui';
import {
  ExerciseNotEditableError,
  addExerciseToSession,
  createCustomExercise,
  setCustomExerciseImages,
  updateCustomExercise,
} from '@/db/workout-queries';
import { getExerciseById } from '@/db/queries';
import { stageNewExercise } from '@/lib/exercise-handoff';
import { identifyEquipment } from '@/lib/ai-exercise-client';
import {
  isLocalPhoto,
  keepExercisePhoto,
  pickPhotoFromGallery,
  preparePhoto,
  removeExercisePhoto,
} from '@/lib/exercise-photo';
import { MUSCLE_GROUPS, MUSCLE_LABELS, type MuscleGroup } from '@/lib/muscle-load';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

/**
 * Add an exercise, optionally by photographing the machine.
 *
 * The AI fills the form in; it does not save anything. A model looking at an
 * unfamiliar machine can be confidently wrong, and a wrongly-tagged exercise
 * would colour the muscle map with training that never happened — so every
 * field stays editable and the muscles are chips the user can toggle.
 *
 * Reachable from the library and, with a sessionId, from the middle of a
 * workout — which is where someone actually meets a machine they cannot name.
 * It used to be library-only, so the feature existed and could not be got at
 * from the one screen that needed it.
 */
export default function NewExerciseScreen() {
  const router = useRouter();
  // Set when this was opened from a live workout, so the finished exercise can
  // go straight into that session instead of only into the library.
  const { sessionId, returnTo, name: presetName, id: editId } = useLocalSearchParams<{
    sessionId?: string;
    returnTo?: string;
    name?: string;
    /** Editing an exercise you already made, rather than making a new one. */
    id?: string;
  }>();
  const editingId = editId ? decodeURIComponent(editId) : null;
  const sid = sessionId ? decodeURIComponent(sessionId) : '';
  // Set when a routine is half-built behind us and waiting for this exercise.
  const toRoutine = returnTo === 'routine';
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [identified, setIdentified] = useState(Boolean(presetName) || Boolean(editId));
  const [camOpen, setCamOpen] = useState(false);
  // The exercise's picture: a freshly prepared photo in the cache, or the one
  // it already has. `savedPhoto` is what is stored now, so an edit knows
  // whether the picture changed and which old file to clean up.
  const [photo, setPhoto] = useState<string | null>(null);
  const [savedPhoto, setSavedPhoto] = useState<string | null>(null);
  // Camera opened from the form just to take the picture, not to identify.
  const [photoOnly, setPhotoOnly] = useState(false);

  // Prefilled when the user searched for something the library does not have
  // and chose to make it — retyping what they just typed is the kind of small
  // insult that stops people using a feature.
  const [name, setName] = useState(presetName ? decodeURIComponent(presetName) : '');
  const [equipment, setEquipment] = useState('');
  const [instructions, setInstructions] = useState('');
  const [primary, setPrimary] = useState<MuscleGroup[]>([]);
  const [secondary, setSecondary] = useState<MuscleGroup[]>([]);

  // Fill the form from the exercise being corrected. Muscles are stored as the
  // app's own group names, so they map straight back onto the chips.
  useEffect(() => {
    if (!editingId) return;
    let alive = true;
    void (async () => {
      const row = await getExerciseById(editingId);
      if (!alive || !row) return;
      const parse = (raw: string | null): MuscleGroup[] => {
        try {
          const v = JSON.parse(raw ?? '[]');
          return Array.isArray(v) ? v.filter((m): m is MuscleGroup => MUSCLE_GROUPS.includes(m)) : [];
        } catch {
          return [];
        }
      };
      setName(row.name);
      setEquipment(row.equipment ?? '');
      try {
        const imgs = JSON.parse(row.images ?? '[]');
        const first = Array.isArray(imgs) && typeof imgs[0] === 'string' ? imgs[0] : null;
        if (isLocalPhoto(first)) {
          setPhoto(first);
          setSavedPhoto(first);
        }
      } catch {
        // No picture to show.
      }
      setPrimary(parse(row.primaryMuscles));
      setSecondary(parse(row.secondaryMuscles));
      try {
        const steps = JSON.parse(row.instructions ?? '[]');
        setInstructions(Array.isArray(steps) ? steps.join('\n') : '');
      } catch {
        setInstructions('');
      }
    })();
    return () => {
      alive = false;
    };
  }, [editingId]);

  /**
   * A photo from the camera or the gallery becomes the exercise's picture and,
   * unless the camera was opened just for the picture, goes to the AI to
   * identify the machine. With no AI, or an AI that could not tell, the photo
   * is still kept and the form opens to fill in by hand.
   */
  const takeInPhoto = async (sourceUri: string, identifyIt: boolean) => {
    setBusy(true);
    setError(null);
    setNote(null);
    setUnmapped([]);
    try {
      const prepared = await preparePhoto(sourceUri);
      setPhoto(prepared.uri);
      if (!identifyIt || !prepared.base64) {
        setIdentified(true);
        setCamOpen(false);
        setPhotoOnly(false);
        return;
      }
      const out = await identifyEquipment(prepared.base64);
      if (out.status !== 'ok') {
        // The photo is kept either way; say what went wrong and carry on.
        setNote(`${out.message} Your photo is kept as the exercise's picture.`);
        setIdentified(true);
        setCamOpen(false);
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

  const identify = async () => {
    if (busy || !camera.current) return;
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.8 });
      if (!shot?.uri) {
        setError('The camera did not return a photo. Try again.');
        return;
      }
      await takeInPhoto(shot.uri, !photoOnly);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not take the photo.');
    }
  };

  const fromGallery = async (identifyIt: boolean) => {
    if (busy) return;
    try {
      const uri = await pickPhotoFromGallery();
      if (uri) await takeInPhoto(uri, identifyIt);
    } catch (e) {
      setError(`Could not open that image: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /** Keeps the picture for `id` if it changed, and clears up the one it replaced. */
  const savePhotoFor = async (id: string) => {
    if (photo === savedPhoto) return;
    const kept = photo ? keepExercisePhoto(id, photo) : null;
    await setCustomExerciseImages(id, kept ? [kept] : []);
    removeExercisePhoto(savedPhoto);
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
      // Editing corrects the exercise in place, so every session and routine
      // already pointing at it picks up the fix. Creating a second one would
      // leave the wrong muscles on all the history.
      if (editingId) {
        await updateCustomExercise(editingId, {
          name,
          equipment: equipment.trim() || null,
          primaryMuscles: primary,
          secondaryMuscles: secondary,
          instructions: instructions
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean),
        });
        await savePhotoFor(editingId);
        if (router.canGoBack()) router.back();
        else router.replace('/exercise');
        return;
      }

      const id = await createCustomExercise({
        name,
        equipment: equipment.trim() || null,
        primaryMuscles: primary,
        secondaryMuscles: secondary,
        instructions: instructions
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      });
      await savePhotoFor(id);

      // Reached from a routine being built: hand the exercise back and return
      // to the draft, which is still mounted behind this screen. Routing
      // forward to the builder instead would mount a second, empty copy and
      // the half-built routine would be gone.
      if (toRoutine) {
        stageNewExercise(id);
        if (router.canGoBack()) router.back();
        else router.replace('/train/build-routine');
        return;
      }

      // Reached from a live workout: the point was to add this machine to the
      // session, so do that and go back to it. Dropping the user in the
      // library instead would make them find it again and lose their place.
      if (sid) {
        await addExerciseToSession(sid, id, { targetSets: 3, targetReps: 10 });
        const back = { pathname: '/train/active' as const, params: { id: sid } };
        // Pop back to the session rather than stacking a second copy of it.
        // Already saved and already added by this point, so a router that
        // cannot find it in the stack must not cost the user the exercise.
        try {
          router.dismissTo(back);
        } catch {
          router.replace(back);
        }
        return;
      }
      router.replace('/exercise');
    } catch (e) {
      // ExerciseNotEditableError already carries a sentence worth showing.
      Alert.alert(
        e instanceof ExerciseNotEditableError ? 'Cannot edit this one' : 'Save failed',
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen section={editingId ? 'Edit exercise' : 'New exercise'} back>
      {!identified ? (
        <>
          <Label>{photoOnly ? 'TAKE A PHOTO' : 'IDENTIFY FROM A PHOTO'}</Label>
          <Note>
            Point the camera at the machine and the AI fills this form in — what it is, the muscles
            it works, and how to use it. Check it before saving: it is an identification, not a
            fact, and a wrongly tagged exercise colours the wrong muscles.
          </Note>
          <View style={{ height: spacing.md }} />

          {!camOpen ? (
            <>
              <Pressable style={s.primary} onPress={() => setCamOpen(true)}>
                <Text style={s.primaryT}>PHOTOGRAPH EQUIPMENT</Text>
              </Pressable>
              <Pressable
                style={[s.secondary, { marginBottom: 10 }, busy && { opacity: 0.5 }]}
                onPress={() => void fromGallery(true)}
                disabled={busy}
              >
                <Text style={s.secondaryT}>{busy ? 'Reading the photo…' : 'Choose a photo from your gallery'}</Text>
              </Pressable>
            </>
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
                <Text style={s.primaryT}>
                  {busy ? (photoOnly ? 'SAVING PHOTO…' : 'IDENTIFYING…') : photoOnly ? 'TAKE PHOTO' : 'IDENTIFY'}
                </Text>
              </Pressable>
            </>
          )}

          <Pressable
            style={s.secondary}
            onPress={() => {
              setIdentified(true);
              setCamOpen(false);
              setPhotoOnly(false);
            }}
          >
            <Text style={s.secondaryT}>{photoOnly ? 'Back to the form' : 'Fill it in by hand'}</Text>
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

          <Label>PHOTO</Label>
          <Card>
            {photo ? (
              <Image source={{ uri: photo }} style={s.photo} resizeMode="cover" />
            ) : (
              <Text style={s.help}>
                Add a picture of the machine so you know it at a glance in your workouts and the
                library. It stays on this phone.
              </Text>
            )}
            <View style={s.photoRow}>
              <Pressable
                style={[s.photoBtn, busy && { opacity: 0.5 }]}
                disabled={busy}
                onPress={() => {
                  setPhotoOnly(true);
                  setCamOpen(true);
                  setIdentified(false);
                }}
              >
                <Text style={s.secondaryT}>{photo ? 'Retake' : 'Take photo'}</Text>
              </Pressable>
              <Pressable
                style={[s.photoBtn, busy && { opacity: 0.5 }]}
                disabled={busy}
                onPress={() => void fromGallery(false)}
              >
                <Text style={s.secondaryT}>{busy ? 'Reading…' : 'From gallery'}</Text>
              </Pressable>
              {photo ? (
                <Pressable style={s.photoBtn} onPress={() => setPhoto(null)}>
                  <Text style={[s.secondaryT, { color: colors.danger }]}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>

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

const s = themedStyles(() => StyleSheet.create({
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
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, marginBottom: 10, backgroundColor: colors.surfaceAlt },
  photoRow: { flexDirection: 'row', gap: 8 },
  photoBtn: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
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
}));
