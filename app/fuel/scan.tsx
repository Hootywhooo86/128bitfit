import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { lookupBarcode } from '@/db/barcode-queries';
import { colors, spacing, themedStyles } from '@/lib/theme';

export default function ScanBarcodeScreen() {
  const router = useRouter();
  // Passed straight through rather than parsed: this screen never logs
  // anything itself, it only hands the barcode to a screen that does.
  const { day } = useLocalSearchParams<{ day?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const lock = useRef(false);

  const resolveBarcode = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || looking || lock.current) return;
      lock.current = true;
      setLooking(true);
      setError(null);
      try {
        const result = await lookupBarcode(code);
        if (result.status === 'hit') {
          router.replace({
            pathname: '/fuel/add',
            params: {
              foodId: result.food.id,
              source: result.source,
              // A scan started from a past day is still for that day.
              ...(day ? { day } : {}),
            },
          });
          return;
        }
        router.replace({
          pathname: '/fuel/custom',
          params: {
            barcode: result.barcode || code,
            message: result.message,
            ...(day ? { day } : {}),
          },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lookup failed');
        lock.current = false;
      } finally {
        setLooking(false);
      }
    },
    [looking, router, day]
  );

  const onBarcodeScanned = (scan: BarcodeScanningResult) => {
    if (lock.current || looking) return;
    void resolveBarcode(scan.data);
  };

  const onManualSubmit = () => {
    void resolveBarcode(manual);
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!permission.granted ? (
        <View style={styles.permCard}>
          <Text style={styles.title}>Camera permission</Text>
          <Text style={styles.muted}>
            128BIT FIT needs camera access to scan barcodes. You can also enter a barcode
            manually below.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => void requestPermission()}>
            <Text style={styles.primaryBtnText}>Allow camera</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
            }}
            onBarcodeScanned={looking ? undefined : onBarcodeScanned}
          />
          <View style={styles.overlay}>
            <View style={styles.frame} />
            <Text style={styles.overlayText}>
              {looking ? 'Looking up…' : 'Align barcode in the frame'}
            </Text>
            <Pressable style={styles.torchBtn} onPress={() => setTorch((v) => !v)}>
              <Text style={styles.torchText}>{torch ? 'Torch on' : 'Torch off'}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.manualCard}>
        <Text style={styles.section}>Manual barcode</Text>
        <TextInput
          style={styles.input}
          value={manual}
          onChangeText={setManual}
          placeholder="Enter barcode digits"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          autoCorrect={false}
          editable={!looking}
        />
        <Pressable
          style={[styles.primaryBtn, looking && { opacity: 0.5 }]}
          onPress={onManualSubmit}
          disabled={looking || !manual.trim()}
        >
          <Text style={styles.primaryBtnText}>{looking ? 'Looking up…' : 'Look up'}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.hint}>
          Lookup order: local USDA → cached Open Food Facts → live OFF → custom food.
        </Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permCard: { padding: spacing.lg, gap: spacing.sm },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.textMuted, lineHeight: 20 },
  cameraWrap: { height: 320, margin: spacing.md, borderRadius: 12, overflow: 'hidden' },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  frame: {
    width: '70%',
    height: 120,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 12,
  },
  overlayText: {
    color: colors.text,
    fontWeight: '700',
    marginTop: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  torchBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  torchText: { color: colors.text, fontWeight: '700' },
  manualCard: { padding: spacing.lg, gap: spacing.sm },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.chipActiveText, fontWeight: '900', fontSize: 16 },
  error: { color: colors.danger, marginTop: 4 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
}));
