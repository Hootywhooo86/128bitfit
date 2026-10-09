import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card, Label, MenuRow, Note, Screen } from '@/components/ui';
import { countRecentSets } from '@/db/muscle-queries';
import { useReadiness } from '@/lib/health/use-readiness';
import { GRADE_EMOJI, GRADE_LABEL } from '@/lib/readiness';
import { colors, fonts, themedStyles } from '@/lib/theme';
import { HEALTH_APP, HEALTH_UNAVAILABLE } from '@/lib/health/platform';

/**
 * Train → Readiness, from prototype/app-shell.html `train:readiness`.
 *
 * The same estimate as the Home card, with room for its reasons. Only shown
 * when the data is actually there — with no sleep reading there is no score.
 */
export default function ReadinessScreen() {
  const router = useRouter();
  const [recentSets, setRecentSets] = useState<number | null>(null);
  useEffect(() => {
    void countRecentSets(2).then(setRecentSets).catch(() => setRecentSets(null));
  }, []);
  const { state } = useReadiness(recentSets);

  return (
    <Screen section="Readiness" back>
      <Text style={s.hero}>Built from sleep and heart rate. Only shown when the data is actually there.</Text>

      {state.status === 'checking' ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : state.status === 'unavailable' ? (
        <Note>{HEALTH_UNAVAILABLE} There is nothing to score without it.</Note>
      ) : state.status === 'denied' ? (
        <>
          <Note>
            Needs {state.missing.join(' and ')} from {HEALTH_APP}. Nothing is scored without it.
          </Note>
          <View style={{ height: 10 }} />
          <MenuRow icon="◐" name={`Connect ${HEALTH_APP}`} onPress={() => router.push('/settings/health')} />
        </>
      ) : (
        <>
          {state.readiness.status === 'scored' ? (
            <Card style={s.scoreCard}>
              <Text style={s.score}>{state.readiness.score}</Text>
              <Text style={s.outOf}>OUT OF 100 · ESTIMATE</Text>
              <Text style={s.grade}>
                {GRADE_EMOJI[state.readiness.grade]} {GRADE_LABEL[state.readiness.grade]}
              </Text>
            </Card>
          ) : (
            <Note>No score today — still needs {state.readiness.missing.join(', ')}.</Note>
          )}

          <Label>WHAT MOVED IT</Label>
          {state.readiness.status === 'scored' && state.readiness.reasons.length > 0 ? (
            state.readiness.reasons.map((r) => (
              <Card key={r}>
                <Text style={s.reason}>{r}</Text>
              </Card>
            ))
          ) : (
            <Note>Nothing stood out.</Note>
          )}

          <Label>LAST NIGHT</Label>
          <Card>
            <Text style={s.reason}>
              {state.rest.status === 'scored'
                ? `${GRADE_EMOJI[state.rest.grade]} ${state.rest.note}`
                : 'No sleep recorded.'}
            </Text>
          </Card>
        </>
      )}

      <View style={{ height: 10 }} />
      <Note>
        It never tells you not to train. It suggests where to aim — ease off on a low day, push on a
        high one.
      </Note>
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    hero: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 12, fontFamily: fonts.body },
    center: { paddingVertical: 40, alignItems: 'center' },
    scoreCard: { alignItems: 'center', paddingVertical: 22 },
    score: { fontSize: 52, fontFamily: fonts.bodyBold, color: colors.text, letterSpacing: -2 },
    outOf: { fontFamily: fonts.pixel, fontSize: 6, color: colors.textDim, letterSpacing: 1, marginTop: 8 },
    grade: { fontSize: 14, color: colors.textMuted, marginTop: 12, fontFamily: fonts.bodySemi },
    reason: { color: colors.text, fontSize: 13.5, lineHeight: 19, fontFamily: fonts.body },
  })
);
