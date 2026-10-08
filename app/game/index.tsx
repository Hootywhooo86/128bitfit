import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { GameNews } from '@/components/game/GameNews';
import { Hero } from '@/components/game/Hero';
import { TrophyIcon } from '@/components/game/TrophyIcon';
import { Bar, Card, Label, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { gameOn, loadGame, saveLook, type GameView } from '@/db/game-queries';
import { COSMETICS, cosmetic, type CosmeticKind } from '@/lib/game/cosmetics';
import { TROPHIES } from '@/lib/game/trophies';
import {
  MAX_XP_MINUTES_PER_CARDIO,
  MAX_XP_SETS_PER_SESSION,
  XP_PER_CARDIO_MINUTE,
  XP_PER_LOGGED_DAY,
  XP_PER_SET,
} from '@/lib/game/xp';
import { HARD_QUEST_XP, QUEST_XP } from '@/lib/game/quests';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

export { ErrorScreen as ErrorBoundary } from '@/components/ErrorScreen';

const KINDS: { kind: CosmeticKind; label: string }[] = [
  { kind: 'title', label: 'TITLE' },
  { kind: 'outfit', label: 'OUTFIT' },
  { kind: 'headband', label: 'HEADGEAR' },
  { kind: 'pet', label: 'PET' },
];

const shortDate = (d: Date) => d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The game: your hero, level, stats, this week's quests, trophies and the
 * wardrobe. Everything on it comes from what you logged; nothing is seeded.
 */
export default function GameScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const [view, setView] = useState<GameView | null>(null);
  const [on, setOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      let live = true;
      void (async () => {
        try {
          const enabled = await gameOn();
          const next = enabled ? await loadGame() : null;
          if (!live) return;
          setOn(enabled);
          setView(next);
          setError(null);
        } catch (e) {
          if (live) setError(e instanceof Error ? e.message : String(e));
        }
      })();
      return () => {
        live = false;
      };
    }, [ready])
  );

  if (error) {
    return (
      <Screen section="Trophies" back>
        <Text style={s.muted}>Could not load the game: {error}</Text>
      </Screen>
    );
  }

  if (!on) {
    return (
      <Screen section="Trophies" back>
        <Text style={s.muted}>
          The game layer is off, so there is nothing to show here. Your workouts are all still
          logged — turn it back on in Settings and everything you have earned comes back.
        </Text>
        <Pressable style={s.btn} onPress={() => router.push('/settings')}>
          <Text style={s.btnText}>Open Settings</Text>
        </Pressable>
      </Screen>
    );
  }

  if (!view) {
    return (
      <Screen section="Trophies" back>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const { progress, stats, trophies, quests, monthly, look } = view;
  const now = new Date();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
  const earnedCount = trophies.filter((t) => t.earnedAt).length;
  const title = cosmetic('title', look.title)?.name ?? 'NOVICE';

  const equip = (kind: CosmeticKind, id: string) => {
    const next = { ...look, [kind]: id };
    setView({ ...view, look: next });
    void saveLook(next).catch(() => undefined);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen section="Trophies" back>
        <Card>
          <View style={s.heroRow}>
            <View style={s.heroBox}>
              <Hero look={look} px={4} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{title}</Text>
              <Text style={s.level}>LV {progress.level}</Text>
              <Bar pct={progress.span ? (progress.into / progress.span) * 100 : 100} height={8} />
              <Text style={s.xpLine}>
                {progress.span
                  ? `${progress.into.toLocaleString()} / ${progress.span.toLocaleString()} XP to LV ${progress.level + 1}`
                  : `MAX LEVEL · ${progress.xp.toLocaleString()} XP`}
              </Text>
            </View>
          </View>
        </Card>

        <Label>STATS</Label>
        <Card>
          {stats.map((st) => (
            <View key={st.id} style={s.statRow}>
              <Text style={s.statId}>{st.id}</Text>
              <Text style={[s.statValue, st.value == null && s.unknown]}>{st.value ?? '???'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.statName}>{st.name}</Text>
                <Text style={s.statNote}>{st.note}</Text>
              </View>
            </View>
          ))}
        </Card>

        <Label>THIS WEEK&apos;S QUESTS</Label>
        <Card>
          {quests.map((q) => (
            <View key={q.id} style={s.quest}>
              <View style={s.questHead}>
                <Text style={[s.questTitle, q.complete && s.questDone]}>
                  {q.complete ? '✓ ' : ''}
                  {q.title}
                </Text>
                <Text style={s.questCount}>
                  {q.done} / {q.target}
                </Text>
              </View>
              <Bar pct={(q.done / q.target) * 100} height={6} />
            </View>
          ))}
          <Text style={s.statNote}>
            Three new quests every Monday, drawn from 100 and sized from your last four weeks. +
            {QUEST_XP} XP each. Miss one and nothing happens.
          </Text>
        </Card>

        <Label>{`MONTHLY · HARD · ${daysLeft} DAY${daysLeft === 1 ? '' : 'S'} LEFT`}</Label>
        <Card>
          <View style={s.questHead}>
            <Text style={[s.questTitle, monthly.complete && s.questDone]}>
              {monthly.complete ? '✓ ' : ''}
              {monthly.title}
            </Text>
            <Text style={s.questCount}>
              {monthly.done.toLocaleString()} / {monthly.target.toLocaleString()}
            </Text>
          </View>
          <Bar pct={(monthly.done / monthly.target) * 100} height={8} />
          <Text style={s.statNote}>
            About a third past your usual month. +{HARD_QUEST_XP} XP. A new one on the 1st; miss it
            and nothing happens.
          </Text>
        </Card>

        <Label>{`TROPHIES · ${earnedCount} / ${TROPHIES.length}`}</Label>
        <View style={s.grid}>
          {trophies.map((t) => {
            const def = TROPHIES.find((d) => d.id === t.id)!;
            const at = view.unlockedAt[t.id] ?? t.earnedAt;
            return (
              <View key={t.id} style={s.trophy}>
                <TrophyIcon id={t.id} earned={t.earnedAt != null} size={48} />
                <Text style={[s.trophyName, !t.earnedAt && s.locked]}>{def.name}</Text>
                <Text style={s.trophyNote}>{at ? shortDate(at) : (t.progress ?? def.how)}</Text>
                {!at && t.progress ? <Text style={s.trophyNote}>{def.how}</Text> : null}
              </View>
            );
          })}
        </View>

        <Label>WARDROBE</Label>
        <Card>
          {KINDS.map(({ kind, label }) => (
            <View key={kind} style={s.kind}>
              <Text style={s.kindLabel}>{label}</Text>
              <View style={s.chips}>
                {COSMETICS.filter((c) => c.kind === kind).map((c) => {
                  const unlocked = c.level <= progress.level;
                  const worn = look[kind] === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      style={[s.chip, worn && s.chipOn, !unlocked && s.chipLocked]}
                      onPress={unlocked ? () => equip(kind, c.id) : undefined}
                      disabled={!unlocked}
                      accessibilityState={{ selected: worn, disabled: !unlocked }}
                    >
                      <Text style={[s.chipText, worn && s.chipTextOn]}>
                        {unlocked ? c.name : `LV ${c.level}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          <Text style={s.statNote}>Every item is free and earned by training. Nothing here is for sale.</Text>
        </Card>

        <Label>HOW XP WORKS</Label>
        <Text style={s.muted}>
          {XP_PER_SET} XP per working set (up to {MAX_XP_SETS_PER_SESSION} a session) ·{' '}
          {XP_PER_CARDIO_MINUTE} XP per cardio minute (up to {MAX_XP_MINUTES_PER_CARDIO / 60} hours a
          session) · {XP_PER_LOGGED_DAY} XP for each day you log food, whatever you ate · {QUEST_XP} XP
          per weekly quest · {HARD_QUEST_XP} XP for the monthly HARD one.
        </Text>
        <Text style={s.muted}>
          No leaderboards. No daily streaks — consistency is counted in weeks, and rest days cost
          nothing. Nothing here rewards eating less, losing weight or fasting.
        </Text>
      </Screen>
      <GameNews />
    </View>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    center: { paddingVertical: 80, alignItems: 'center' },
    muted: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
    btn: { backgroundColor: colors.accent, paddingVertical: 12, alignItems: 'center', marginTop: spacing.md },
    btnText: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 15 },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
    heroBox: { backgroundColor: colors.surface, padding: spacing.md },
    title: { fontFamily: fonts.pixel, fontSize: 11, color: colors.accent, letterSpacing: 1 },
    level: { fontFamily: fonts.pixelBold, fontSize: 26, color: colors.text, marginVertical: 4 },
    xpLine: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 6 },
    statRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8 },
    statId: { fontFamily: fonts.pixel, fontSize: 11, color: colors.textMuted, width: 34 },
    statValue: { fontFamily: fonts.pixelBold, fontSize: 20, color: colors.text, width: 48, textAlign: 'right' },
    unknown: { color: colors.textDim },
    statName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
    statNote: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 2 },
    quest: { marginBottom: spacing.md },
    questHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, gap: spacing.md },
    questTitle: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
    questDone: { color: colors.accent },
    questCount: { fontFamily: fonts.pixel, fontSize: 11, color: colors.textMuted },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    trophy: {
      width: '30%',
      flexGrow: 1,
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      paddingVertical: spacing.md,
      paddingHorizontal: 6,
    },
    trophyName: { fontFamily: fonts.pixel, fontSize: 9, color: colors.text, textAlign: 'center', marginTop: 8 },
    locked: { color: colors.textDim },
    trophyNote: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
    kind: { marginBottom: spacing.md },
    kindLabel: { fontFamily: fonts.pixel, fontSize: 10, color: colors.textMuted, marginBottom: 6 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { borderWidth: 1, borderColor: colors.border, paddingVertical: 6, paddingHorizontal: 10 },
    chipOn: { borderColor: colors.accent },
    chipLocked: { opacity: 0.45 },
    chipText: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
    chipTextOn: { color: colors.accent },
  })
);
