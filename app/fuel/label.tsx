import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { describeReading, parseNutritionLabel, type LabelField } from '@/lib/nutrition-label';
import { ocrAvailable, readTextFromImage } from '@/lib/ocr';
import { guessProductName } from '@/lib/package-label';
import { Screen } from '@/components/ui';
import { colors, spacing } from '@/lib/theme';

const FIELD_LABELS: Record<LabelField, string> = {
  calories: 'Calories',
  protein: 'Protein',
  fat: 'Fat',
  saturatedFat: 'Saturated fat',
  transFat: 'Trans fat',
  cholesterol: 'Cholesterol',
  sodium: 'Sodium',
  carb: 'Carbs',
  fiber: 'Fibre',
  sugars: 'Sugars',
  addedSugars: 'Added sugars',
};

/**
 * Two shots, in the order you would pick the box up in.
 *
 * The front of the pack becomes the food's photo and gives the name; the panel
 * gives the numbers. Before this there was one shot, and it was the panel — so
 * every custom food's picture in the catalogue was a photo of a nutrition
 * table, which is useless for recognising it in a list later.
 *
 * The package step is skippable. Someone who only wants the numbers should not
 * have to take a photo they do not care about to get to them.
 */
type Step = 'package' | 'label';

export default function ScanLabelScreen() {
  const router = useRouter();
  // Passed through untouched — the custom-food form is what actually logs.
  const { day } = useLocalSearchParams<{ day?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [step, setStep] = useState<Step>('package');
  const [packageUri, setPackageUri] = useState<string | null>(null);
  const [nameGuess, setNameGuess] = useState<string | null>(null);
  const camera = useRef<CameraView>(null);

  const available = ocrAvailable();

  const shoot = async (): Promise<string | null> => {
    const shot = await camera.current?.takePictureAsync({ quality: 0.8, skipProcessing: true });
    if (!shot?.uri) {
      setError('The camera did not return a photo. Try again.');
      return null;
    }
    return shot.uri;
  };

  /**
   * The front of the pack.
   *
   * A failed read here is not a failed step: the photo is still worth keeping
   * as the food's picture even when no name comes out of it, so this moves on
   * either way and lets the form's Name field stay empty.
   */
  const capturePackage = async () => {
    if (busy || !camera.current) return;
    setBusy(true);
    setError(null);
    try {
      const uri = await shoot();
      if (!uri) return;
      setPackageUri(uri);

      const ocr = await readTextFromImage(uri);
      setNameGuess(ocr.status === 'ok' ? guessProductName(ocr.text) : null);
      setStep('label');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that photo.');
    } finally {
      setBusy(false);
    }
  };

  /** Straight to the panel, leaving the food without a picture of its own. */
  const skipPackage = () => {
    setPackageUri(null);
    setNameGuess(null);
    setError(null);
    setStep('label');
  };

  const retakePackage = () => {
    setPackageUri(null);
    setNameGuess(null);
    setError(null);
    setStep('package');
  };

  const captureLabel = async () => {
    if (busy || !camera.current) return;
    setBusy(true);
    setError(null);
    try {
      const uri = await shoot();
      if (!uri) return;

      const ocr = await readTextFromImage(uri);
      if (ocr.status !== 'ok') {
        setError(ocr.message);
        return;
      }

      const reading = parseNutritionLabel(ocr.text);
      const { read } = describeReading(reading);
      if (read === 0) {
        setError(
          'That photo had text in it but no nutrition rows. Fill the panel in the frame and try again.'
        );
        return;
      }

      // Everything read goes to the form for confirmation. Nothing is saved
      // from a photo without the user seeing the numbers first.
      router.replace({
        pathname: '/fuel/custom',
        params: {
          fromLabel: '1',
          // A label photographed while looking at a past day is for that day.
          ...(day ? { day } : {}),
          // The pack shot when there is one; the panel otherwise, so skipping
          // the first step leaves the food with a picture rather than none.
          photoUri: packageUri ?? uri,
          nameGuess: nameGuess ?? '',
          reading: JSON.stringify(reading),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that photo.');
    } finally {
      setBusy(false);
    }
  };

  if (!available) {
    return (
      <Screen section="Scan label" back>
        <Text style={styles.title}>Scan nutrition label</Text>
        <Text style={styles.muted}>
          This build cannot read text from photos, so there is nothing to scan. Add the food by
          hand instead — the form is the same one the scan fills in.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.replace('/fuel/custom')}>
          <Text style={styles.primaryBtnText}>Add by hand</Text>
        </Pressable>
      </Screen>
    );
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <Screen section="Scan label" back>
        <Text style={styles.title}>Camera permission</Text>
        <Text style={styles.muted}>
          Reading a nutrition label needs the camera. The photo is processed on this phone and is
          not uploaded anywhere.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={() => void requestPermission()}>
          <Text style={styles.primaryBtnText}>Allow camera</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/fuel/custom')}>
          <Text style={styles.secondaryBtnText}>Add by hand instead</Text>
        </Pressable>
      </Screen>
    );
  }

  const onPackage = step === 'package';

  return (
    <Screen section="Scan label" back scroll={false}>
      <View style={styles.cameraWrap}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} />
        <View style={styles.overlay} pointerEvents="none">
          {/* A pack is wider than it is tall; a nutrition panel is the reverse. */}
          <View style={[styles.frame, onPackage && styles.framePackage]} />
        </View>
      </View>

      <View style={styles.pad}>
        <View style={styles.stepRow}>
          <Text style={styles.section}>
            {onPackage ? 'Step 1 of 2 · Front of pack' : 'Step 2 of 2 · Nutrition facts'}
          </Text>
          <View style={styles.dots}>
            <View style={[styles.dot, styles.dotOn]} />
            <View style={[styles.dot, !onPackage && styles.dotOn]} />
          </View>
        </View>

        <Text style={styles.muted}>
          {onPackage
            ? 'Photograph the front of the package. This becomes the food’s picture, and the name is read off it so you do not have to type it.'
            : 'Now the nutrition panel, straight on and filling the frame. Every number it reads goes into a form for you to check before anything is saved.'}
        </Text>

        {!onPackage && packageUri ? (
          <View style={styles.doneRow}>
            <Image source={{ uri: packageUri }} style={styles.thumb} resizeMode="cover" />
            <View style={{ flex: 1 }}>
              <Text style={styles.doneName}>{nameGuess ?? 'No name read'}</Text>
              <Text style={styles.doneNote}>
                {nameGuess
                  ? 'Read off the pack — check it on the next screen.'
                  : 'The photo is kept; type the name on the next screen.'}
              </Text>
            </View>
            <Pressable onPress={retakePackage} hitSlop={8}>
              <Text style={styles.retake}>Retake</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          style={[styles.primaryBtn, busy && { opacity: 0.5 }]}
          onPress={() => void (onPackage ? capturePackage() : captureLabel())}
          disabled={busy}
        >
          <Text style={styles.primaryBtnText}>
            {busy ? 'Reading…' : onPackage ? 'Capture package' : 'Capture label'}
          </Text>
        </Pressable>

        <View style={styles.row}>
          <Pressable style={styles.secondaryBtn} onPress={() => setTorch((v) => !v)}>
            <Text style={styles.secondaryBtnText}>{torch ? 'Torch on' : 'Torch off'}</Text>
          </Pressable>
          {onPackage ? (
            <Pressable style={styles.secondaryBtn} onPress={skipPackage}>
              <Text style={styles.secondaryBtnText}>Skip, label only</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/fuel/custom')}>
              <Text style={styles.secondaryBtnText}>Add by hand</Text>
            </Pressable>
          )}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.hint}>
          {onPackage
            ? 'Both photos are read on this phone and neither is uploaded. The name is a guess from the artwork — it lands in an editable field, never saved as read.'
            : `Reads the panel on this phone — no signal needed and the photo is not uploaded. It reads ${Object.values(FIELD_LABELS).length} rows when they are legible; anything it cannot read is left blank for you rather than guessed at.`}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  pad: { padding: spacing.lg, gap: spacing.sm },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.textMuted, lineHeight: 20 },
  cameraWrap: { height: 360, margin: spacing.md, borderRadius: 12, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: '78%',
    height: '78%',
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 12,
  },
  // A pack is held wider than it is tall; a nutrition panel is the reverse.
  framePackage: { width: '88%', height: '62%' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: 5 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotOn: { backgroundColor: colors.accent },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.sm,
  },
  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.track },
  doneName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  doneNote: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  retake: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.chipActiveText, fontWeight: '900', fontSize: 16 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.text, fontWeight: '700' },
  error: { color: colors.danger, marginTop: 4, lineHeight: 20 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});
