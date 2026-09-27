import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PhotoCapture } from '@/components/PhotoCapture';
import { Card, Label, MenuRow, Note, Screen } from '@/components/ui';
import { getSetting, setSetting } from '@/db/settings-queries';
import { deletePhoto, keepPhoto } from '@/lib/photo-files';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

const KEY = 'gym_pass';
type GymPass = { photoUri: string | null; memberNumber: string };

function parse(raw: string | null): GymPass {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return {
      photoUri: typeof v?.photoUri === 'string' ? v.photoUri : null,
      memberNumber: typeof v?.memberNumber === 'string' ? v.memberNumber : '',
    };
  } catch {
    return { photoUri: null, memberNumber: '' };
  }
}

/**
 * Train → Gym pass, from prototype/app-shell.html `train:gympass`.
 *
 * A photo of the membership barcode rather than a redrawn one: the desk
 * scanner reads a photo of a screen fine, and a photo works for every
 * barcode format without the app having to get each encoding right.
 */
export default function GymPassScreen() {
  const [pass, setPass] = useState<GymPass | null>(null);
  const [camera, setCamera] = useState(false);
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getSetting(KEY).then((raw) => {
      const p = parse(raw);
      setPass(p);
      setNumber(p.memberNumber);
    });
  }, []);

  const save = async (next: GymPass) => {
    try {
      await setSetting(KEY, JSON.stringify(next));
      setPass(next);
      setError(null);
    } catch (e) {
      setError(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onPhoto = async (uri: string) => {
    setCamera(false);
    if (!pass) return;
    try {
      const kept = keepPhoto('gym-pass', `pass-${Date.now()}`, uri);
      deletePhoto(pass.photoUri);
      await save({ ...pass, photoUri: kept });
    } catch (e) {
      setError(`Could not keep the photo: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const remove = () => {
    if (!pass) return;
    Alert.alert('Remove gym pass?', 'Deletes the photo and number from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deletePhoto(pass.photoUri);
          setNumber('');
          void save({ photoUri: null, memberNumber: '' });
        },
      },
    ]);
  };

  if (!pass) return <Screen section="Gym pass" back>{null}</Screen>;
  const hasAny = !!pass.photoUri || !!pass.memberNumber;

  return (
    <Screen section="Gym pass" back>
      {pass.photoUri ? (
        <View style={s.passWrap}>
          <Image source={{ uri: pass.photoUri }} style={s.pass} resizeMode="contain" />
        </View>
      ) : (
        <Card>
          <Text style={s.help}>
            Photograph the barcode on your membership card or gym app, and it is here at the desk —
            no digging for the card.
          </Text>
        </Card>
      )}
      {pass.memberNumber ? <Text style={s.number}>{pass.memberNumber}</Text> : null}

      <MenuRow
        icon="▣"
        name={pass.photoUri ? 'Retake photo' : 'Photograph the barcode'}
        sub="Fill the frame with the barcode, flat and in focus"
        onPress={() => setCamera(true)}
      />

      <Label>MEMBER NUMBER</Label>
      <TextInput
        style={s.input}
        value={number}
        onChangeText={setNumber}
        onEndEditing={() => {
          if (number.trim() !== pass.memberNumber) void save({ ...pass, memberNumber: number.trim() });
        }}
        placeholder="Optional — typed in case the desk asks"
        placeholderTextColor={colors.textDim}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {error ? <Text style={s.err}>{error}</Text> : null}
      {hasAny ? (
        <Pressable onPress={remove} style={s.remove}>
          <Text style={s.removeT}>Remove gym pass</Text>
        </Pressable>
      ) : null}
      <Note>Kept on this phone only. Turn the screen brightness up if the scanner struggles.</Note>

      <PhotoCapture
        visible={camera}
        onCapture={(uri) => void onPhoto(uri)}
        onCancel={() => setCamera(false)}
        subject="your gym pass"
        hint="Hold the phone flat over the barcode so every bar is sharp."
      />
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    passWrap: { backgroundColor: '#ffffff', borderRadius: radius.lg, padding: 10, marginBottom: 10 },
    pass: { width: '100%', height: 220 },
    number: {
      color: colors.text,
      fontSize: 26,
      fontFamily: fonts.bodyBold,
      letterSpacing: 2,
      textAlign: 'center',
      marginBottom: 14,
      fontVariant: ['tabular-nums'],
    },
    help: { color: colors.textMuted, fontSize: 13, lineHeight: 19, fontFamily: fonts.body },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 16,
      marginBottom: 10,
      fontFamily: fonts.body,
    },
    err: { color: colors.danger, fontSize: 13, marginBottom: 10, fontFamily: fonts.body },
    remove: { paddingVertical: 12, alignSelf: 'flex-start' },
    removeT: { color: colors.danger, fontSize: 13, fontFamily: fonts.bodySemi },
  })
);
