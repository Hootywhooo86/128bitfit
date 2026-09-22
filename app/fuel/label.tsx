import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { describeReading, parseNutritionLabel, type LabelField } from '@/lib/nutrition-label';
import { ocrAvailable, readTextFromImage } from '@/lib/ocr';
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

export default function ScanLabelScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const camera = useRef<CameraView>(null);

  const available = ocrAvailable();

  const capture = async () => {
    if (busy || !camera.current) return;
    setBusy(true);
    setError(null);
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.8, skipProcessing: true });
      if (!shot?.uri) {
        setError('The camera did not return a photo. Try again.');
        return;
      }

      const ocr = await readTextFromImage(shot.uri);
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
          photoUri: shot.uri,
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

  return (
    <Screen section="Scan label" back scroll={false}>
      <View style={styles.cameraWrap}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} />
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.frame} />
        </View>
      </View>

      <View style={styles.pad}>
        <Text style={styles.section}>Nutrition facts</Text>
        <Text style={styles.muted}>
          Fill the frame with the panel, straight on. Every number it reads goes into a form for
          you to check before anything is saved.
        </Text>

        <Pressable
          style={[styles.primaryBtn, busy && { opacity: 0.5 }]}
          onPress={() => void capture()}
          disabled={busy}
        >
          <Text style={styles.primaryBtnText}>{busy ? 'Reading…' : 'Capture label'}</Text>
        </Pressable>

        <View style={styles.row}>
          <Pressable style={styles.secondaryBtn} onPress={() => setTorch((v) => !v)}>
            <Text style={styles.secondaryBtnText}>{torch ? 'Torch on' : 'Torch off'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/fuel/custom')}>
            <Text style={styles.secondaryBtnText}>Add by hand</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.hint}>
          Reads the panel on this phone — no signal needed and the photo is not uploaded. It reads
          {' '}
          {Object.values(FIELD_LABELS).length} rows when they are legible; anything it cannot read
          is left blank for you rather than guessed at.
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
