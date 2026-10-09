import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PhotoCapture } from '@/components/PhotoCapture';
import { Label, Note, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { addProgressPhoto, listProgressPhotos, removeProgressPhoto } from '@/db/photo-queries';
import { PHOTO_POSES, type PhotoPose, type ProgressPhoto } from '@/db/schema';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

const POSE_LABEL: Record<PhotoPose, string> = { front: 'Front', side: 'Side', back: 'Back' };
const fmt = (d: Date) => d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Train → Progress photos, from prototype/app-shell.html `train:photos`.
 *
 * Stored on this phone only: never uploaded, never synced, never sent to an
 * AI provider.
 */
export default function ProgressPhotosScreen() {
  const { ready } = useDb();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [shooting, setShooting] = useState<PhotoPose | null>(null);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [compare, setCompare] = useState<PhotoPose>('front');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!ready) return;
    try {
      setPhotos(await listProgressPhotos());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onCapture = async (uri: string) => {
    const pose = shooting;
    setShooting(null);
    if (!pose) return;
    try {
      await addProgressPhoto(pose, uri);
      await refresh();
    } catch (e) {
      setError(`Could not keep that photo: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const remove = (p: ProgressPhoto) =>
    Alert.alert('Delete this photo?', 'The file is deleted from the phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setViewing(null);
          await removeProgressPhoto(p).catch((e) => setError(String(e)));
          await refresh();
        },
      },
    ]);

  const latest = (pose: PhotoPose) => photos.find((p) => p.pose === pose) ?? null;
  const ofPose = photos.filter((p) => p.pose === compare);
  const first = ofPose[ofPose.length - 1];
  const last = ofPose[0];

  // Newest first, grouped by calendar day.
  const days: { day: string; items: ProgressPhoto[] }[] = [];
  for (const p of photos) {
    const d = fmt(p.takenAt);
    const g = days[days.length - 1];
    if (g && g.day === d) g.items.push(p);
    else days.push({ day: d, items: [p] });
  }

  return (
    <Screen section="Progress photos" back>
      <Text style={s.hero}>Stored on this phone only. Never uploaded, never synced, never sent to any AI.</Text>

      <Label>LATEST</Label>
      <View style={s.tiles}>
        {PHOTO_POSES.map((pose) => {
          const p = latest(pose);
          return (
            <Pressable key={pose} style={s.tile} onPress={() => setShooting(pose)}>
              {p ? (
                <>
                  <Image source={{ uri: p.uri }} style={s.tileImg} resizeMode="cover" />
                  <Text style={s.tileTag}>{POSE_LABEL[pose].toUpperCase()} · NEW +</Text>
                </>
              ) : (
                <Text style={s.add}>+ {POSE_LABEL[pose]}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={s.err}>{error}</Text> : null}

      {photos.length > 0 ? (
        <>
          <Label>FIRST VS LATEST</Label>
          <View style={s.seg}>
            {PHOTO_POSES.map((pose) => (
              <Pressable key={pose} style={[s.segBtn, compare === pose && s.segOn]} onPress={() => setCompare(pose)}>
                <Text style={[s.segT, compare === pose && s.segTOn]}>{pose.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          {ofPose.length >= 2 ? (
            <View style={s.compare}>
              {[first, last].map((p) => (
                <Pressable key={p.id} style={{ flex: 1 }} onPress={() => setViewing(p)}>
                  <Image source={{ uri: p.uri }} style={s.compareImg} resizeMode="cover" />
                  <Text style={s.date}>{fmt(p.takenAt)}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Note>
              {ofPose.length === 0 ? 'Two' : 'One more'} {compare} photo{ofPose.length === 0 ? 's' : ''} and they
              show side by side here.
            </Note>
          )}
        </>
      ) : null}

      {days.length > 0 ? (
        <>
          <Label>HISTORY</Label>
          {days.map((g) => (
            <View key={g.day} style={{ marginBottom: 12 }}>
              <Text style={s.day}>{g.day}</Text>
              <View style={s.row}>
                {g.items.map((p) => (
                  <Pressable key={p.id} onPress={() => setViewing(p)}>
                    <Image source={{ uri: p.uri }} style={s.thumb} resizeMode="cover" />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </>
      ) : null}

      <Note>
        The scale lies for weeks at a time — water, food volume, sleep. Photos every fortnight are the
        honest record. Same light, same spot, same pose makes them comparable.
      </Note>

      <PhotoCapture
        visible={shooting != null}
        onCapture={(uri) => void onCapture(uri)}
        onCancel={() => setShooting(null)}
        subject="your progress"
        hint={shooting ? `${POSE_LABEL[shooting]} view. Same light and distance as last time.` : ''}
      />

      <Modal visible={viewing != null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={s.viewer}>
          {viewing ? (
            <>
              <Image source={{ uri: viewing.uri }} style={s.full} resizeMode="contain" />
              <Text style={s.viewerT}>
                {POSE_LABEL[viewing.pose]} · {fmt(viewing.takenAt)}
              </Text>
              <View style={s.viewerRow}>
                <Pressable style={s.viewerBtn} onPress={() => setViewing(null)}>
                  <Text style={s.viewerBtnT}>Close</Text>
                </Pressable>
                <Pressable style={s.viewerBtn} onPress={() => remove(viewing)}>
                  <Text style={[s.viewerBtnT, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    hero: { color: colors.textMuted, fontSize: 13, lineHeight: 19, fontFamily: fonts.body },
    tiles: { flexDirection: 'row', gap: 8 },
    tile: {
      flex: 1,
      aspectRatio: 0.75,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.borderBright,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    tileImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    tileTag: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      textAlign: 'center',
      paddingVertical: 5,
      backgroundColor: 'rgba(0,0,0,0.65)',
      color: colors.text,
      fontFamily: fonts.pixel,
      fontSize: 6,
      letterSpacing: 0.7,
    },
    add: { color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 13 },
    err: { color: colors.danger, marginTop: 10, fontFamily: fonts.body },
    seg: { flexDirection: 'row', gap: 6, marginBottom: 10 },
    segBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    segOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    segT: { fontFamily: fonts.pixel, fontSize: 6, letterSpacing: 0.7, color: colors.textMuted },
    segTOn: { color: colors.onAccent },
    compare: { flexDirection: 'row', gap: 8 },
    compareImg: { width: '100%', aspectRatio: 0.75, borderRadius: radius.md, backgroundColor: colors.surface },
    date: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 6, fontFamily: fonts.body },
    day: { color: colors.textMuted, fontSize: 12.5, marginBottom: 6, fontFamily: fonts.bodySemi },
    row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    thumb: { width: 72, height: 96, borderRadius: radius.sm, backgroundColor: colors.surface },
    viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', padding: spacing.md, justifyContent: 'center' },
    full: { width: '100%', height: '75%' },
    viewerT: { color: colors.text, textAlign: 'center', marginTop: 10, fontFamily: fonts.bodySemi },
    viewerRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    viewerBtn: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    viewerBtnT: { color: colors.text, fontFamily: fonts.bodySemi },
  })
);
