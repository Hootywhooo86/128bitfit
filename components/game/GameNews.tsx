import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  blipOn,
  gameOn,
  loadGame,
  recordGameNews,
  type GameNews as News,
  type GameView,
} from '@/db/game-queries';
import { useAccent } from '@/lib/accent';
import { playBlip } from '@/lib/game/blip';
import type { Look } from '@/lib/game/cosmetics';
import { TROPHIES } from '@/lib/game/trophies';
import { colors, fonts, spacing } from '@/lib/theme';
import { Hero } from './Hero';
import { TrophyIcon } from './TrophyIcon';

const KIND_LABEL = { outfit: 'Outfit', headband: 'Headgear', pet: 'Pet', title: 'Title' } as const;

/**
 * Checks for new levels and trophies whenever the screen it sits on comes into
 * view, and shows them: a LEVEL UP! banner to tap away, and a toast for
 * trophies that clears itself. Nothing at all when the game layer is off.
 *
 * Shown in the app only — never as a push notification. `onView` hands the
 * loaded game to the screen, so it can show a summary without loading twice.
 */
export function GameNews({ onView }: { onView?: (view: GameView | null) => void } = {}) {
  const router = useRouter();
  const accent = useAccent();
  const [news, setNews] = useState<News | null>(null);
  const [look, setLook] = useState<Look | null>(null);
  const [toast, setToast] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        try {
          if (!(await gameOn())) {
            if (live) onView?.(null);
            return;
          }
          const view = await loadGame();
          if (live) onView?.(view);
          const fresh = await recordGameNews(view);
          if (!live || (!fresh.levelUp && fresh.trophies.length === 0)) return;
          setLook(view.look);
          setNews(fresh);
          setToast(fresh.trophies.length > 0 && !fresh.levelUp);
          if (await blipOn()) void playBlip();
        } catch {
          // The game layer never gets in the way of the screen it sits on.
        }
      })();
      return () => {
        live = false;
      };
    }, [onView])
  );

  // The toast clears itself; the banner waits for a tap.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!news) return null;
  const first = TROPHIES.find((t) => t.id === news.trophies[0]);
  const more = news.trophies.length - 1;

  const closeBanner = () => {
    setToast(news.trophies.length > 0);
    setNews({ ...news, levelUp: null });
  };

  return (
    <>
      <Modal visible={news.levelUp != null} transparent animationType="fade" onRequestClose={closeBanner}>
        <Pressable style={s.scrim} onPress={closeBanner} accessibilityRole="button" accessibilityLabel="Close">
          <View style={[s.banner, { borderColor: accent }]}>
            <Text style={[s.levelUp, { color: accent }]}>LEVEL UP!</Text>
            <Text style={s.levelLine}>
              LV {news.levelUp?.from} → LV {news.levelUp?.to}
            </Text>
            {look ? (
              <View style={s.heroBox}>
                <Hero look={look} px={4} />
              </View>
            ) : null}
            {news.levelUp?.unlocked.length ? (
              <View style={s.unlocks}>
                <Text style={s.unlockHead}>NEW GEAR</Text>
                {news.levelUp.unlocked.map((c) => (
                  <Text key={`${c.kind}-${c.id}`} style={s.unlockItem}>
                    {KIND_LABEL[c.kind]}: {c.name}
                  </Text>
                ))}
              </View>
            ) : null}
            <Text style={s.tap}>Tap to continue</Text>
          </View>
        </Pressable>
      </Modal>

      {toast && first ? (
        <Pressable
          style={[s.toast, { borderColor: accent }]}
          onPress={() => {
            setToast(false);
            router.push('/game');
          }}
          accessibilityRole="button"
        >
          <TrophyIcon id={first.id} earned size={32} />
          <View style={{ flex: 1 }}>
            <Text style={[s.toastHead, { color: accent }]}>TROPHY UNLOCKED</Text>
            <Text style={s.toastName}>
              {first.name}
              {more > 0 ? ` +${more} more` : ''}
            </Text>
          </View>
          <Text style={s.toastArrow}>›</Text>
        </Pressable>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  banner: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderWidth: 2,
    padding: spacing.lg,
    alignItems: 'center',
  },
  levelUp: { fontFamily: fonts.pixelBold, fontSize: 28, letterSpacing: 2 },
  levelLine: { fontFamily: fonts.pixel, fontSize: 14, color: colors.text, marginTop: 6 },
  heroBox: { marginVertical: spacing.lg },
  unlocks: { alignSelf: 'stretch', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  unlockHead: { fontFamily: fonts.pixel, fontSize: 10, color: colors.textMuted, marginBottom: 6 },
  unlockItem: { fontFamily: fonts.body, fontSize: 14, color: colors.text, marginBottom: 2 },
  tap: { fontFamily: fonts.pixel, fontSize: 9, color: colors.textDim, marginTop: spacing.lg },
  toast: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    padding: spacing.md,
  },
  toastHead: { fontFamily: fonts.pixel, fontSize: 10, letterSpacing: 1 },
  toastName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, marginTop: 2 },
  toastArrow: { fontSize: 22, color: colors.textMuted },
});
