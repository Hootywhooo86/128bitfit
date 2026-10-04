import * as Brightness from 'expo-brightness';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { PhotoCapture } from '@/components/PhotoCapture';
import { Card, Label, MenuRow, Note, Screen } from '@/components/ui';
import { getSetting, setSetting } from '@/db/settings-queries';
import { EMPTY_PASS, barcodeSvg, parsePass as parse, passView, type GymPass } from '@/lib/gym-pass';
import { deletePhoto, keepPhoto } from '@/lib/photo-files';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

const KEY = 'gym_pass';

const SCAN_TYPES = [
  'qr',
  'code128',
  'code39',
  'code93',
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'pdf417',
  'aztec',
  'datamatrix',
  'itf14',
  'codabar',
] as const;

/**
 * Full brightness while the pass is on screen — desk scanners struggle with a
 * dim phone — and the previous level back the moment it is not: leaving the
 * screen, or the app going to the background. If the phone will not let the
 * app change brightness, the pass still shows; nothing else depends on it.
 */
function useFullBrightness(): boolean {
  const [failed, setFailed] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let previous: number | null = null;
      let raised = false;
      const raise = async () => {
        try {
          if (previous == null) previous = await Brightness.getBrightnessAsync();
          await Brightness.setBrightnessAsync(1);
          raised = true;
        } catch {
          setFailed(true);
        }
      };
      const restore = async () => {
        if (!raised) return;
        raised = false;
        try {
          if (previous != null) await Brightness.setBrightnessAsync(previous);
        } catch {
          // The system takes over its own brightness once the app is gone.
        }
      };
      void raise();
      const sub = AppState.addEventListener('change', (next) => {
        if (next === 'active') void raise();
        else void restore();
      });
      return () => {
        sub.remove();
        void restore();
      };
    }, [])
  );
  return failed;
}

/**
 * Train → Gym pass, from prototype/app-shell.html `train:gympass`.
 *
 * Scan the membership card once and the app redraws its barcode crisply —
 * easier for a desk scanner than a photo of a card. The photo stays: as a
 * choice, and as the fallback for a code the app cannot redraw exactly.
 * No gym-account sign-in: gyms have no public way in, and this app never
 * asks for another service's password.
 */
export default function GymPassScreen() {
  const [pass, setPass] = useState<GymPass | null>(null);
  const [camera, setCamera] = useState(false);
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const brightnessFailed = useFullBrightness();

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

  const onScanned = (scan: BarcodeScanningResult) => {
    if (!scanning || !pass) return;
    setScanning(false);
    const code = { value: scan.data, format: String(scan.type) };
    if (!barcodeSvg(code)) {
      setError(
        "Read the code, but can't redraw that kind exactly — keep the photo for the desk. The number is saved below."
      );
    }
    void save({
      ...pass,
      barcode: code,
      show: 'barcode',
      memberNumber: pass.memberNumber || scan.data.slice(0, 40),
    }).then(() => setNumber((n) => n || scan.data.slice(0, 40)));
  };

  const startScan = async () => {
    setError(null);
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setError('Camera access is off, so the card cannot be scanned. A photo or the number still works.');
        return;
      }
    }
    setScanning(true);
  };

  /** A screenshot of a gym app's pass, or a photo already on the phone. */
  const pickFromGallery = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      await onPhoto(res.assets[0].uri);
    } catch (e) {
      setError(`Could not open that image: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const remove = () => {
    if (!pass) return;
    Alert.alert('Remove gym pass?', 'Deletes the scanned code, the photo and the number from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deletePhoto(pass.photoUri);
          setNumber('');
          void save({ ...EMPTY_PASS });
        },
      },
    ]);
  };

  if (!pass) return <Screen section="Gym pass" back>{null}</Screen>;
  const hasAny = !!pass.photoUri || !!pass.memberNumber || !!pass.barcode;
  const view = passView(pass);
  const svg = view === 'barcode' && pass.barcode ? barcodeSvg(pass.barcode) : null;
  const canChoose = !!pass.photoUri && !!pass.barcode && !!barcodeSvg(pass.barcode);

  return (
    <Screen section="Gym pass" back>
      {view === 'barcode' && svg ? (
        <View style={s.passWrap}>
          <SvgXml xml={svg} width="100%" height={220} />
        </View>
      ) : view === 'photo' && pass.photoUri ? (
        <View style={s.passWrap}>
          <Image source={{ uri: pass.photoUri }} style={s.pass} resizeMode="contain" />
        </View>
      ) : (
        <Card>
          <Text style={s.help}>
            Scan the barcode on your membership card or in your gym&apos;s app, and it is here at the
            desk — no digging for the card. A photo of it works too.
          </Text>
        </Card>
      )}
      {pass.memberNumber ? <Text style={s.number}>{pass.memberNumber}</Text> : null}

      {canChoose ? (
        <View style={s.chooser}>
          {(['barcode', 'photo'] as const).map((k) => (
            <Pressable
              key={k}
              style={[s.choice, pass.show === k && s.choiceOn]}
              onPress={() => void save({ ...pass, show: k })}
              accessibilityRole="radio"
              accessibilityState={{ selected: pass.show === k }}
            >
              <Text style={[s.choiceT, pass.show === k && s.choiceTOn]}>{k === 'barcode' ? 'Scanned code' : 'Photo'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <MenuRow
        icon="▦"
        name={pass.barcode ? 'Scan the card again' : 'Scan my card'}
        sub="Point the camera at the barcode — it is redrawn sharp for the desk scanner"
        onPress={() => void startScan()}
      />
      <MenuRow
        icon="▣"
        name={pass.photoUri ? 'Retake photo' : 'Photograph the barcode'}
        sub="Fill the frame with the barcode, flat and in focus"
        onPress={() => setCamera(true)}
      />
      <MenuRow
        icon="▤"
        name="Choose from gallery"
        sub="A screenshot of your gym's app works too"
        onPress={() => void pickFromGallery()}
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
      {pass.barcode ? (
        <Pressable onPress={() => void save({ ...pass, barcode: null, show: 'photo' })} style={s.remove}>
          <Text style={s.removeT}>Forget the scanned code</Text>
        </Pressable>
      ) : null}
      <Note>
        {brightnessFailed
          ? "Kept on this phone only. This phone didn't let the app turn the screen up — raise the brightness yourself if the scanner struggles."
          : 'Kept on this phone only. The screen goes to full brightness while the pass is open and back when you leave.'}
      </Note>

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={s.scanWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...SCAN_TYPES] }}
            onBarcodeScanned={scanning ? onScanned : undefined}
          />
          <View style={s.scanOverlay} pointerEvents="box-none">
            <View style={s.scanFrame} pointerEvents="none" />
            <Text style={s.scanText}>Hold the card&apos;s barcode inside the frame</Text>
            <Pressable style={s.scanCancel} onPress={() => setScanning(false)}>
              <Text style={s.scanCancelT}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
    chooser: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    choice: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    choiceOn: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
    choiceT: { color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 13 },
    choiceTOn: { color: colors.text },
    scanWrap: { flex: 1, backgroundColor: '#000000' },
    scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 16 },
    scanFrame: { width: '80%', height: 180, borderWidth: 2, borderColor: '#ffffff', borderRadius: 12 },
    scanText: { color: '#ffffff', fontFamily: fonts.bodySemi, fontSize: 14 },
    scanCancel: { position: 'absolute', bottom: 48, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: '#000000aa' },
    scanCancelT: { color: '#ffffff', fontFamily: fonts.bodySemi, fontSize: 15 },
    removeT: { color: colors.danger, fontSize: 13, fontFamily: fonts.bodySemi },
  })
);
