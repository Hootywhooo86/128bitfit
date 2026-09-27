import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, themedStyles } from '@/lib/theme';

/**
 * Camera sheet for photographing a food.
 *
 * A modal rather than a route on purpose: handing a photo back from a pushed
 * screen means either setting params on a screen that is mid-transition or
 * replacing the form, and replacing the form throws away everything already
 * typed into it. A callback has neither problem.
 *
 * Nothing is written anywhere here — the caller gets a cache URI and decides.
 */
export function PhotoCapture({
  visible,
  onCapture,
  onCancel,
}: {
  visible: boolean;
  onCapture: (uri: string) => void;
  onCancel: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<CameraView>(null);

  const capture = async () => {
    if (busy || !camera.current) return;
    setBusy(true);
    setError(null);
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.7, skipProcessing: true });
      if (!shot?.uri) {
        setError('The camera did not return a photo. Try again.');
        return;
      }
      onCapture(shot.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not take that photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        {!permission ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : !permission.granted ? (
          <View style={styles.pad}>
            <Text style={styles.title}>Camera permission</Text>
            <Text style={styles.muted}>
              Photographing a food needs the camera. The picture stays on this phone and is not
              uploaded anywhere.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={() => void requestPermission()}>
              <Text style={styles.primaryBtnText}>Allow camera</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={onCancel}>
              <Text style={styles.secondaryBtnText}>Skip the photo</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.cameraWrap}>
              <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
            </View>
            <View style={styles.pad}>
              <Text style={styles.muted}>
                A picture of the packet makes a custom food easy to recognise in the list later.
              </Text>
              <Pressable
                style={[styles.primaryBtn, busy && { opacity: 0.5 }]}
                onPress={() => void capture()}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>{busy ? 'Working…' : 'Take photo'}</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={onCancel}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pad: { padding: spacing.lg, gap: spacing.sm },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.textMuted, lineHeight: 20 },
  cameraWrap: { flex: 1, margin: spacing.md, borderRadius: 12, overflow: 'hidden' },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.chipActiveText, fontWeight: '900', fontSize: 16 },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.text, fontWeight: '700' },
  error: { color: colors.danger, lineHeight: 20 },
}));
